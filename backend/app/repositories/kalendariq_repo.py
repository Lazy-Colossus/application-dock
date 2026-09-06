"""Filesystem persistence for Kalendariq — one JSON file per calendar.

This module is the ONLY code in the app that touches the filesystem. All writes
go through the shared atomic writer, and every read-modify-write runs inside
`calendar_transaction`, which holds the platform per-file lock across the whole
sequence (Story 1.8).

**Storage is shared, not per-user.** Every other app in the dock keys its files
by the authenticated username; Kalendariq's group shares one login, so a file is
selected by calendar id and nothing else. The id round-trips through the URL
path, so it is validated as a bare filename before it ever reaches a path.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
import secrets
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.kalendariq import Calendar

_APP_DIR = "kalendariq"
_LEGACY_APP_DIR = "kdh"
_CALENDARS_DIR = "calendars"
CURRENT_SCHEMA_VERSION = 1


def _validate_calendar_id(calendar_id: str) -> str:
    """Ensure `calendar_id` is a safe bare filename, never a path."""
    if not calendar_id or not calendar_id.strip():
        raise ValueError("calendar id must be non-empty")
    if calendar_id != calendar_id.strip():
        raise ValueError("calendar id must not have surrounding whitespace")
    if "/" in calendar_id or "\\" in calendar_id or calendar_id in {".", ".."}:
        raise ValueError(f"unsafe calendar id: {calendar_id!r}")
    return calendar_id


def _calendars_dir() -> Path:
    _migrate_legacy_app_dir()
    return settings.data_dir / _APP_DIR / _CALENDARS_DIR


def _migrate_legacy_app_dir() -> None:
    """Move data written under the app's former name, `kdh`, to `_APP_DIR`.

    In code rather than a deploy step because production data lives in a Docker
    volume that no one hand-edits. Idempotent, and it declines to act when both
    directories exist — that means someone has already written under the new
    name, and merging two trees is not something a rename should guess at.
    """
    legacy = settings.data_dir / _LEGACY_APP_DIR
    if not legacy.is_dir():
        return
    current = settings.data_dir / _APP_DIR
    if current.exists():
        return
    legacy.rename(current)


def _calendar_path(calendar_id: str) -> Path:
    return _calendars_dir() / f"{_validate_calendar_id(calendar_id)}.json"


def migrate(raw: dict[str, object]) -> dict[str, object]:
    """Upgrade a raw document to the current schema. v1 is a pass-through.

    Kept as the single home for future `schema_version` bumps so `read_calendar`
    never has to grow version branches inline.
    """
    return raw


def read_calendar(calendar_id: str) -> Calendar:
    """Read one calendar. Raises FileNotFoundError if it does not exist."""
    raw = _calendar_path(calendar_id).read_text(encoding="utf-8")
    return Calendar.model_validate(migrate(json.loads(raw)))


def write_calendar(calendar: Calendar) -> None:
    """Persist a calendar atomically, creating `calendars/` on first write."""
    atomic_write_json(_calendar_path(calendar.id), calendar.model_dump(mode="json"))


def delete_calendar(calendar_id: str) -> None:
    """Remove a calendar's file. Raises FileNotFoundError if it does not exist."""
    _calendar_path(calendar_id).unlink()


def list_calendars() -> list[Calendar]:
    """Every stored calendar, newest first.

    A directory scan, deliberately: an index file would be a second write on
    every calendar creation and would become the contention point that the
    per-file locking exists to avoid (NFR-2). Same precedent as archery's
    session listing.
    """
    directory = _calendars_dir()
    if not directory.is_dir():
        return []

    calendars: list[Calendar] = []
    for path in directory.glob("*.json"):
        raw = path.read_text(encoding="utf-8")
        calendars.append(Calendar.model_validate(migrate(json.loads(raw))))

    # The id is a tiebreaker, not decoration: `created_at` has second precision,
    # so two calendars made in the same second compare equal, and a stable sort
    # would then fall back to whatever order `glob` happened to yield — which
    # varies by filesystem. Ordering within one second is arbitrary either way;
    # this at least makes it the same arbitrary order everywhere.
    return sorted(calendars, key=lambda c: (c.created_at, c.id), reverse=True)


def find_by_share_token(token: str) -> Calendar:
    """The calendar whose invitee link carries `token`.

    A scan, like `list_calendars`: an index keyed by token would be a second
    file to keep in step and a contention point the per-file locking exists to
    avoid. Compared with `compare_digest` because this token IS the credential —
    a plain `==` leaks its prefix through timing, and the scan makes the
    comparison count once per calendar rather than once.
    """
    if not token:
        raise FileNotFoundError("no share token")
    for calendar in list_calendars():
        if calendar.share_token and secrets.compare_digest(calendar.share_token, token):
            return calendar
    raise FileNotFoundError("no calendar for share token")


@contextmanager
def calendar_transaction(calendar_id: str) -> Iterator[Calendar]:
    """Read-modify-write one calendar under that file's lock (Story 1.8).

    The lock spans the whole block, so a concurrent voter cannot read the same
    stale calendar and overwrite the change made here — the case this app hits
    routinely, with six people clicking days on the same evening. Nothing is
    written if the block raises, so a rejected request leaves no partial write.
    """
    with key_lock(str(_calendar_path(calendar_id))):
        calendar = read_calendar(calendar_id)
        yield calendar
        write_calendar(calendar)
