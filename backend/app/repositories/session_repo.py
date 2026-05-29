"""Filesystem persistence for archery sessions.

This module is the ONLY code that touches the filesystem (per
`docs/architecture/source-tree.md`). All writes use the atomic
write-then-rename pattern so partial writes are never visible.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
import logging
import os
import re
from pathlib import Path

from app.core.config import settings
from app.schemas.session import SessionData

# Per-session in-progress files: `_ip_{label}.json` (Story 6.1). The leading
# underscore keeps them out of `list_sessions()` (finalised history). Multiple
# may exist at once. The legacy single `_in_progress.json` is migrated on read.
_IP_PREFIX = "_ip_"
_LEGACY_IN_PROGRESS_FILENAME = "_in_progress.json"

# Recurring players list (Story 8.2). Underscore-prefixed → excluded from history.
_RECURRING_PLAYERS_FILENAME = "_recurring_players.json"

# Session filenames: YYYY-MM-DD.json or YYYY-MM-DD-N.json where N>=2.
# The unsuffixed form is conceptually session #1 of that day; subsequent
# sessions on the same day get -2, -3, etc. So in "newest first" order, a
# higher suffix beats a lower one within the same date.
_SESSION_LABEL_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:-(\d+))?$")

logger = logging.getLogger(__name__)


def _atomic_write_json(path: Path, payload: dict[str, object] | list[str]) -> None:
    # `os.replace` is atomic on POSIX (best-effort on Windows). If the process
    # is killed between writing .tmp and the rename, the previous file at
    # `path` (if any) remains intact and uncorrupted.
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    os.replace(tmp, path)


def write_session(path: Path, session: SessionData) -> None:
    """Write a session to an arbitrary path atomically.

    Path-agnostic so callers (Story 2.5 finalise, Story 3.1 auto-save)
    can decide the destination.
    """
    _atomic_write_json(path, session.model_dump(mode="json"))


def read_session(label: str) -> SessionData:
    """Read a finalised session by its label.

    Raises FileNotFoundError if no file matches; ValueError if the file
    exists but fails schema validation.
    """
    path = settings.data_dir / f"{label}.json"
    if not path.exists():
        raise FileNotFoundError(label)
    raw = json.loads(path.read_text())
    return SessionData.model_validate(raw)


def list_sessions() -> list[SessionData]:
    """List all finalised sessions, newest first.

    Sort order: date descending; within the same date, higher suffix wins
    (e.g. `2026-05-21-3` > `2026-05-21-2` > `2026-05-21`). Files whose names
    don't match the session-label pattern are ignored silently — they're not
    sessions. Files whose names match but whose contents fail to parse are
    skipped with a warning so one corrupt file can't break history loading.

    Always excludes `_in_progress.json` and any other `_`-prefixed file.
    """
    candidates: list[tuple[Path, str, int]] = []
    for path in settings.data_dir.glob("*.json"):
        if path.name.startswith("_"):
            continue
        match = _SESSION_LABEL_RE.match(path.stem)
        if not match:
            continue
        date_str = match.group(1)
        suffix = int(match.group(2)) if match.group(2) else 1
        candidates.append((path, date_str, suffix))

    candidates.sort(key=lambda c: (c[1], c[2]), reverse=True)

    sessions: list[SessionData] = []
    for path, _date_str, _suffix in candidates:
        try:
            raw = json.loads(path.read_text())
            sessions.append(SessionData.model_validate(raw))
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("skipping malformed session file %s: %s", path.name, exc)
    return sessions


def _ip_path(label: str) -> Path:
    return settings.data_dir / f"{_IP_PREFIX}{label}.json"


def _migrate_legacy_in_progress() -> None:
    """Migrate a pre-Story-6.1 `_in_progress.json` to `_ip_{label}.json`.

    Idempotent and cheap (existence check). Older sessions lack `name`/`date`;
    backfill them from the label so the file validates under the new schema.
    """
    legacy = settings.data_dir / _LEGACY_IN_PROGRESS_FILENAME
    if not legacy.exists():
        return
    try:
        raw = json.loads(legacy.read_text())
        raw.setdefault("name", raw.get("label", ""))
        raw.setdefault("date", str(raw.get("label", ""))[:10])
        session = SessionData.model_validate(raw)
        write_in_progress(session)
    except (json.JSONDecodeError, ValueError) as exc:
        logger.warning("could not migrate legacy in-progress file: %s", exc)
        return
    legacy.unlink(missing_ok=True)


def write_in_progress(session: SessionData) -> None:
    """Write one in-progress session file (`_ip_{label}.json`) atomically.

    Coerces status to 'in_progress' regardless of incoming value — this file
    represents an active session by definition.
    """
    payload = session.model_dump(mode="json")
    payload["status"] = "in_progress"
    _atomic_write_json(_ip_path(session.label), payload)


def read_in_progress(label: str) -> SessionData | None:
    """Return the in-progress session for `label` if it exists, else None."""
    _migrate_legacy_in_progress()
    path = _ip_path(label)
    if not path.exists():
        return None
    raw = json.loads(path.read_text())
    return SessionData.model_validate(raw)


def list_in_progress() -> list[SessionData]:
    """List all in-progress sessions, newest first (by date, then suffix).

    Malformed files are skipped with a warning so one bad file can't break
    the home screen.
    """
    _migrate_legacy_in_progress()
    candidates: list[tuple[Path, str, int]] = []
    for path in settings.data_dir.glob(f"{_IP_PREFIX}*.json"):
        label = path.name[len(_IP_PREFIX) : -len(".json")]
        match = _SESSION_LABEL_RE.match(label)
        if not match:
            continue
        suffix = int(match.group(2)) if match.group(2) else 1
        candidates.append((path, match.group(1), suffix))

    candidates.sort(key=lambda c: (c[1], c[2]), reverse=True)

    sessions: list[SessionData] = []
    for path, _date_str, _suffix in candidates:
        try:
            raw = json.loads(path.read_text())
            sessions.append(SessionData.model_validate(raw))
        except (json.JSONDecodeError, ValueError) as exc:
            logger.warning("skipping malformed in-progress file %s: %s", path.name, exc)
    return sessions


def delete_in_progress(label: str) -> None:
    """Remove one in-progress file. Idempotent — no-op if absent."""
    _ip_path(label).unlink(missing_ok=True)


def list_session_labels() -> set[str]:
    """All finalised session labels (file stems matching the label pattern)."""
    return {
        path.stem
        for path in settings.data_dir.glob("*.json")
        if not path.name.startswith("_") and _SESSION_LABEL_RE.match(path.stem)
    }


def list_in_progress_labels() -> set[str]:
    """All in-progress session labels (derived from `_ip_{label}.json` names)."""
    labels: set[str] = set()
    for path in settings.data_dir.glob(f"{_IP_PREFIX}*.json"):
        label = path.name[len(_IP_PREFIX) : -len(".json")]
        if _SESSION_LABEL_RE.match(label):
            labels.add(label)
    return labels


# ── Recurring players (Story 8.2) ────────────────────────────────────────────


def read_recurring_players() -> list[str]:
    """Return the recurring-players list, or [] if the file is absent/corrupt."""
    path = settings.data_dir / _RECURRING_PLAYERS_FILENAME
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
    except json.JSONDecodeError as exc:
        logger.warning("malformed recurring players file, treating as empty: %s", exc)
        return []
    if not isinstance(data, list):
        return []
    return [str(name) for name in data]


def write_recurring_players(names: list[str]) -> None:
    """Persist the recurring-players list atomically."""
    _atomic_write_json(settings.data_dir / _RECURRING_PLAYERS_FILENAME, names)
