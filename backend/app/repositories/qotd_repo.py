"""Filesystem persistence for Question of the Day — one JSON file per month.

This module is the ONLY code in the app that touches the filesystem. All writes
go through the shared atomic writer, and every read-modify-write runs inside
`day_transaction`, which holds the platform per-file lock across the whole
sequence (Story 1.8) — so the handful of people answering at once never erase
each other's answers.

**Bucketed by month, not by day.** Days live inside a `Month` document at
`DATA_DIR/qotd/months/{YYYY-MM}.json`. With a tiny group, a write lock at month
granularity is ample — a few short read-modify-writes a day — and a month per
file keeps the folder small and legible for anyone opening it by hand (the
reason this beats a file per day, which grew ~365 files a year). Callers still
work a **day** at a time: the public API (`read_day`, `write_day`, `list_days`,
`day_transaction`, `day_exists`) is day-granular; only the on-disk layout is
monthly.

**Storage is keyed by date, not by username.** The whole dock shares the day: a
file (and the day within it) is selected by the date alone, and the username
only decides *which* slot in a day's `answers` a write lands in. The date
round-trips through the URL (Story 3.3), so it is validated as a canonical
`YYYY-MM-DD` before it derives any path.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
import re
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import date
from pathlib import Path

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.qotd import Day, Month

_APP_DIR = "qotd"
_MONTHS_DIR = "months"
CURRENT_SCHEMA_VERSION = 1

_DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")


def _validate_date(value: str) -> str:
    """Ensure `value` is a canonical `YYYY-MM-DD`, safe to derive a path from.

    The date arrives untrusted from the URL (Story 3.3), so anything that is not
    exactly four-two-two digits with hyphen separators is rejected before it can
    derive a path — separators (`/`, `\\`), `..`, non-padded or out-of-range
    components all fail here rather than reaching the filesystem. A
    `date.fromisoformat` round-trip is the belt to the regex's braces: it rejects
    an impossible date like `2026-13-40` that still matches the shape.
    """
    if not _DATE_RE.fullmatch(value):
        raise ValueError(f"unsafe date: {value!r}")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"unsafe date: {value!r}") from exc
    if parsed.isoformat() != value:
        raise ValueError(f"unsafe date: {value!r}")
    return value


def _month_key(day: str) -> str:
    """The `YYYY-MM` bucket for a validated `YYYY-MM-DD` date."""
    return _validate_date(day)[:7]


def _months_dir() -> Path:
    return settings.data_dir / _APP_DIR / _MONTHS_DIR


def _month_path(day: str) -> Path:
    return _months_dir() / f"{_month_key(day)}.json"


def migrate(raw: dict[str, object]) -> dict[str, object]:
    """Upgrade a raw month document to the current schema. v1 is a pass-through.

    The single home for future `schema_version` bumps, so `read_month` never
    grows version branches inline.
    """
    return raw


def read_month(day: str) -> Month:
    """Read the month containing `day`, or a fresh empty `Month` if none exists."""
    path = _month_path(day)
    if not path.exists():
        return Month(schema_version=CURRENT_SCHEMA_VERSION, month=_month_key(day))
    raw = path.read_text(encoding="utf-8")
    return Month.model_validate(migrate(json.loads(raw)))


def _write_month(month: Month) -> None:
    """Persist a month atomically, creating `months/` on first write."""
    atomic_write_json(_months_dir() / f"{month.month}.json", month.model_dump(mode="json"))


def read_day(day: str) -> Day:
    """Read one day's record, or a fresh empty `Day` if none exists yet.

    A date nobody has answered has no entry in its month; returning an empty
    `Day` rather than raising lets a first visitor and a first answerer share one
    code path.
    """
    stored = read_month(day).days.get(day)
    if stored is not None:
        return stored
    return Day(schema_version=CURRENT_SCHEMA_VERSION, date=day)


def write_day(document: Day) -> None:
    """Persist a single day, merged into its month file under that file's lock.

    A read-modify-write on the month, so writing one day never drops the others
    already recorded that month. The lock keys on the month file (reentrant), so
    this is safe to call on its own and composes with `day_transaction`.
    """
    with key_lock(str(_month_path(document.date))):
        month = read_month(document.date)
        month.days[document.date] = document
        _write_month(month)


def day_exists(day: str) -> bool:
    """Whether an entry has ever been stored for `day`.

    `read_day` returns an empty `Day` for an unseen date, which is what the write
    path wants; a *reader* of a past day needs to tell "never surfaced" (404)
    from "surfaced, nobody answered" (empty answers). Validates the date first.
    """
    return day in read_month(day).days


def list_days() -> list[Day]:
    """Every stored day across all months, newest first.

    A directory scan of `months/*.json`, deliberately: an index would be a second
    file every answer write must touch — the contention point the per-file
    locking exists to avoid (NFR-2/AR-2). Non-JSON entries are ignored. Dates are
    `YYYY-MM-DD`, so a lexical sort descending is chronological newest-first.
    """
    directory = _months_dir()
    if not directory.is_dir():
        return []

    days: list[Day] = []
    for path in directory.glob("*.json"):
        raw = path.read_text(encoding="utf-8")
        month = Month.model_validate(migrate(json.loads(raw)))
        days.extend(month.days.values())

    return sorted(days, key=lambda d: d.date, reverse=True)


@contextmanager
def day_transaction(day: str) -> Iterator[Day]:
    """Read-modify-write one day under its month file's lock (Story 1.8).

    The lock spans the whole block, so two people answering the same question at
    the same moment cannot both read the same day and overwrite each other.
    Nothing is written if the block raises, so a rejected answer leaves no
    partial write. The lock keys on the *month* file: writes within a month
    serialize (cheap at this scale), writes to different months run concurrently.
    """
    path = _month_path(day)
    with key_lock(str(path)):
        month = read_month(day)
        document = month.days.get(day)
        if document is None:
            document = Day(schema_version=CURRENT_SCHEMA_VERSION, date=day)
        yield document
        month.days[day] = document
        _write_month(month)
