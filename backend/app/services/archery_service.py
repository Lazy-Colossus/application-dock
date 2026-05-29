"""Business logic for archery session management.

Layering: this module calls repositories and raises stdlib exceptions.
Routers translate exceptions to HTTP responses — no HTTPException here.
"""

from __future__ import annotations

from datetime import UTC, date, datetime

from app.core.config import settings
from app.repositories import session_repo
from app.schemas.session import (
    TARGET_NUMBER_MAX,
    TARGET_NUMBER_MIN,
    InProgressSummary,
    SessionData,
    SessionSummary,
    TargetScores,
)


def generate_session_label(today: date | None = None) -> str:
    """Return the first non-colliding label for a new session on `today`.

    Convention:
      - First session of the day: YYYY-MM-DD
      - Subsequent:               YYYY-MM-DD-2, YYYY-MM-DD-3, …

    Collisions are checked against BOTH finalised labels and all in-progress
    labels, so concurrent same-day sessions get distinct labels (Story 6.1).
    """
    if today is None:
        today = datetime.now(UTC).date()

    base = today.isoformat()
    taken = session_repo.list_session_labels() | session_repo.list_in_progress_labels()

    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


def _pick_finalise_label(base: str, prefer: str) -> str:
    """Return the preferred label if free among finalised files, else next suffix.

    Unlike generate_session_label, this only considers already-finalised labels
    as collisions — the in-progress file being finalised is expected to exist.
    """
    finalised = session_repo.list_session_labels()
    if prefer not in finalised:
        return prefer
    n = 2
    while f"{base}-{n}" in finalised:
        n += 1
    return f"{base}-{n}"


def _materialise_targets(session: SessionData) -> list[TargetScores]:
    """Build the full 1..18 target list with all unentered shots set to 0.

    Story 7.1: finalising fills every missing target/archer/shot with 0 so the
    finalised file satisfies the strict finalised schema.
    """
    existing = {t.number: t for t in session.targets}
    materialised: list[TargetScores] = []
    for number in range(TARGET_NUMBER_MIN, TARGET_NUMBER_MAX + 1):
        prior = existing.get(number)
        scores: dict[str, list[int]] = {}
        for archer in session.archers:
            shots = prior.scores.get(archer) if prior else None
            first = shots[0] if shots else None
            second = shots[1] if shots else None
            scores[archer] = [first or 0, second or 0]
        materialised.append(TargetScores(number=number, scores=scores, confirmed=True))
    return materialised


def finalise_in_progress(label: str) -> SessionData:
    """Finalise one in-progress session to a permanent file.

    Unentered targets and shots are written as 0 (Story 7.1). Other in-progress
    sessions are untouched.

    Raises:
        FileNotFoundError: if no in-progress session exists for `label`.
    """
    current = session_repo.read_in_progress(label)
    if current is None:
        raise FileNotFoundError(label)

    base = current.label[:10]  # YYYY-MM-DD prefix
    final_label = _pick_finalise_label(base, current.label)

    finalised = current.model_copy(
        update={
            "status": "finalised",
            "label": final_label,
            "targets": _materialise_targets(current),
        }
    )
    session_repo.write_session(settings.data_dir / f"{final_label}.json", finalised)
    session_repo.delete_in_progress(label)
    return finalised


def get_in_progress(label: str) -> SessionData | None:
    return session_repo.read_in_progress(label)


def list_in_progress_summaries() -> list[InProgressSummary]:
    """Lightweight rows for the home screen / resume picker, newest first."""
    return [
        InProgressSummary(
            label=s.label,
            name=s.name,
            date=s.date,
            confirmed_targets=len(s.targets),
        )
        for s in session_repo.list_in_progress()
    ]


def discard_in_progress(label: str) -> None:
    session_repo.delete_in_progress(label)


def update_in_progress(session: SessionData) -> SessionData:
    """Persist an updated in-progress session (e.g. after scoring a target).

    Raises:
        FileNotFoundError: if no in-progress session exists for the label.
    """
    if session_repo.read_in_progress(session.label) is None:
        raise FileNotFoundError(session.label)

    updated = session.model_copy(update={"status": "in_progress"})
    session_repo.write_in_progress(updated)
    return updated


def create_session(archers: list[str], name: str | None = None) -> SessionData:
    """Create a new in-progress session and persist it.

    Multiple concurrent in-progress sessions are allowed (Story 6.1). `name`
    defaults to the label (the date) when omitted or blank.
    """
    label = generate_session_label()
    now = datetime.now(UTC)
    created = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    resolved_name = (name or "").strip() or label

    session = SessionData(
        label=label,
        name=resolved_name,
        date=now.date().isoformat(),
        created=created,
        status="in_progress",
        archers=archers,
        targets=[],
    )
    session_repo.write_in_progress(session)
    return session


# ── History helpers ────────────────────────────────────────────────────────


def _archer_total(s: SessionData, archer: str) -> int:
    """Sum both shots across all targets for one archer.

    Missing archers, missing targets, and unentered (null) shots all count as 0
    so totals work for in-progress sessions too (Story 7.1).
    """
    total = 0
    for t in s.targets:
        shots = t.scores.get(archer)
        if shots:
            total += (shots[0] or 0) + (shots[1] or 0)
    return total


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
        name=s.name,
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


# ── Recurring players (Story 8.2) ────────────────────────────────────────────


def list_recurring_players() -> list[str]:
    return session_repo.read_recurring_players()


def add_recurring_player(name: str) -> list[str]:
    """Add a player to the recurring list (trimmed, de-duplicated).

    Raises:
        ValueError: if the name is empty after trimming.
    """
    trimmed = name.strip()
    if not trimmed:
        raise ValueError("player name must be non-empty")
    players = session_repo.read_recurring_players()
    if trimmed not in players:
        players.append(trimmed)
        session_repo.write_recurring_players(players)
    return players


def remove_recurring_player(name: str) -> list[str]:
    """Remove a player from the recurring list. Idempotent."""
    players = session_repo.read_recurring_players()
    if name in players:
        players = [p for p in players if p != name]
        session_repo.write_recurring_players(players)
    return players
