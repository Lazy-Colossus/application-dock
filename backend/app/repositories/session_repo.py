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

_IN_PROGRESS_FILENAME = "_in_progress.json"

# Session filenames: YYYY-MM-DD.json or YYYY-MM-DD-N.json where N>=2.
# The unsuffixed form is conceptually session #1 of that day; subsequent
# sessions on the same day get -2, -3, etc. So in "newest first" order, a
# higher suffix beats a lower one within the same date.
_SESSION_LABEL_RE = re.compile(r"^(\d{4}-\d{2}-\d{2})(?:-(\d+))?$")

logger = logging.getLogger(__name__)


def _atomic_write_json(path: Path, payload: dict[str, object]) -> None:
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


def write_in_progress(session: SessionData) -> None:
    """Write the single in-progress session file atomically.

    Coerces status to 'in_progress' regardless of incoming value — this
    file represents an active session by definition. Story 3.1's
    `update_in_progress` service applies the same coercion.
    """
    payload = session.model_dump(mode="json")
    payload["status"] = "in_progress"
    _atomic_write_json(settings.data_dir / _IN_PROGRESS_FILENAME, payload)


def read_in_progress() -> SessionData | None:
    """Return the in-progress session if one exists, else None.

    None is the expected outcome when no session is active. Routers
    translate this to 404 (Story 3.2).
    """
    path = settings.data_dir / _IN_PROGRESS_FILENAME
    if not path.exists():
        return None
    raw = json.loads(path.read_text())
    return SessionData.model_validate(raw)


def delete_in_progress() -> None:
    """Remove the in-progress file. Idempotent — no-op if absent."""
    (settings.data_dir / _IN_PROGRESS_FILENAME).unlink(missing_ok=True)
