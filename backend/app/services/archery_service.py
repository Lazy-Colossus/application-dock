"""Business logic for archery session management.

Layering: this module calls repositories and raises stdlib exceptions.
Routers translate exceptions to HTTP responses — no HTTPException here.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

from app.core.config import settings
from app.repositories import session_repo
from app.schemas.session import SessionData, SessionSummary

_IN_PROGRESS_FILENAME = "_in_progress.json"


def generate_session_label(today: date | None = None) -> str:
    """Return the first non-colliding label for a new session on `today`.

    Convention:
      - First session of the day: YYYY-MM-DD
      - Subsequent:               YYYY-MM-DD-2, YYYY-MM-DD-3, …

    Collision check covers both finalised .json files and the current
    _in_progress.json label (so an in-progress session on the same day
    is counted).
    """
    if today is None:
        today = datetime.now(UTC).date()

    base = today.isoformat()
    data_dir: Path = settings.data_dir

    # Collect all labels that already exist.
    taken: set[str] = set()

    # Finalised session files: YYYY-MM-DD.json or YYYY-MM-DD-N.json
    for p in data_dir.glob(f"{base}*.json"):
        stem = p.stem
        taken.add(stem)

    # In-progress session label (if any)
    in_progress_path = data_dir / _IN_PROGRESS_FILENAME
    if in_progress_path.exists():
        try:
            raw = json.loads(in_progress_path.read_text(encoding="utf-8"))
            label = raw.get("label", "")
            if label.startswith(base):
                taken.add(label)
        except (json.JSONDecodeError, OSError):
            pass

    # Find first non-colliding label
    if base not in taken:
        return base
    n = 2
    while True:
        candidate = f"{base}-{n}"
        if candidate not in taken:
            return candidate
        n += 1


def _pick_finalise_label(base: str, prefer: str) -> str:
    """Return the preferred label if its .json file is free, else the next suffix.

    Unlike generate_session_label, this intentionally ignores _in_progress.json
    because we are replacing it; only already-finalised files are collisions.
    """
    data_dir: Path = settings.data_dir
    if not (data_dir / f"{prefer}.json").exists():
        return prefer
    n = 2
    while True:
        candidate = f"{base}-{n}"
        if not (data_dir / f"{candidate}.json").exists():
            return candidate
        n += 1


def finalise_in_progress() -> SessionData:
    """Finalise the active in-progress session to a permanent file.

    Raises:
        FileNotFoundError: if no in-progress session exists.
    """
    current = session_repo.read_in_progress()
    if current is None:
        raise FileNotFoundError("no in-progress session")

    original_label = current.label
    base = original_label[:10]  # YYYY-MM-DD prefix
    label = _pick_finalise_label(base, original_label)

    finalised = current.model_copy(update={"status": "finalised", "label": label})
    session_repo.write_session(settings.data_dir / f"{label}.json", finalised)
    session_repo.delete_in_progress()
    return finalised


def get_in_progress() -> SessionData | None:
    return session_repo.read_in_progress()


def discard_in_progress() -> None:
    session_repo.delete_in_progress()


def update_in_progress(session: SessionData) -> SessionData:
    """Persist an updated in-progress session (e.g. after scoring a target).

    Raises:
        FileNotFoundError: if no in-progress session exists.
    """
    if session_repo.read_in_progress() is None:
        raise FileNotFoundError("no in-progress session")

    updated = session.model_copy(update={"status": "in_progress"})
    session_repo.write_in_progress(updated)
    return updated


def create_session(archers: list[str]) -> SessionData:
    """Create a new in-progress session and persist it.

    Raises:
        RuntimeError: if an in-progress session already exists.
    """
    in_progress_path = settings.data_dir / _IN_PROGRESS_FILENAME
    if in_progress_path.exists():
        raise RuntimeError("session already in progress")

    label = generate_session_label()
    created = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")

    session = SessionData(
        label=label,
        created=created,
        status="in_progress",
        archers=archers,
        targets=[],
    )
    session_repo.write_in_progress(session)
    return session


# ── History helpers ────────────────────────────────────────────────────────


def _archer_total(s: SessionData, archer: str) -> int:
    """Sum both shots across all targets for one archer. Missing archers → 0."""
    return sum(
        t.scores.get(archer, [0, 0])[0] + t.scores.get(archer, [0, 0])[1] for t in s.targets
    )


def _summarise(s: SessionData) -> SessionSummary:
    """Collapse a full session into a list-row summary.

    Tie-break: alphabetical by archer name, case-insensitive (casefold), so
    "Alice" beats "Bob" when they share the top total. PO decision 2026-05-28.
    """
    totals = [(a, _archer_total(s, a)) for a in s.archers]
    totals.sort(key=lambda x: (-x[1], x[0].casefold()))
    winner_name, winner_score = totals[0] if totals else ("", 0)
    return SessionSummary(
        label=s.label,
        archer_count=len(s.archers),
        winner=winner_name,
        winning_score=winner_score,
    )


def list_history() -> list[SessionSummary]:
    """Return summaries for all finalised sessions, newest first."""
    sessions = session_repo.list_sessions()
    return [_summarise(s) for s in sessions]


def read_finalised(label: str) -> SessionData:
    """Return the full SessionData for a finalised session.

    Raises:
        FileNotFoundError: if the label does not exist OR the session is not finalised.
    """
    s = session_repo.read_session(label)
    if s.status != "finalised":
        raise FileNotFoundError(label)
    return s
