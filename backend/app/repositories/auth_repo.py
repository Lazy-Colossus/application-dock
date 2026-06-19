"""Filesystem persistence for auth credentials.

Stores user records in `{data_dir}/_auth.json` as a JSON array.
Legacy single-object format is transparently migrated to list on first read.
All writes use the atomic write-then-rename pattern under a module-level lock.
"""

from __future__ import annotations

import json
import os
import threading
from pathlib import Path

from pydantic import BaseModel

from app.core.config import settings

_AUTH_FILENAME = "_auth.json"

# Protects all read-modify-write operations so concurrent requests
# (FastAPI runs sync handlers in a threadpool) cannot race each other.
_auth_lock = threading.Lock()


class UserRecord(BaseModel):
    username: str
    password_hash: str


def _auth_path() -> Path:
    return settings.data_dir / _AUTH_FILENAME


def _atomic_write_json(path: Path, payload: dict[str, object] | list[object]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    os.replace(tmp, path)


def read_users() -> list[UserRecord]:
    """Return all stored user records. Migrates old single-object format on first read."""
    path = _auth_path()
    try:
        raw = json.loads(path.read_text())
    except FileNotFoundError:
        return []

    if isinstance(raw, dict):
        # Migrate legacy single-object format → list format
        records = [raw]
        _atomic_write_json(path, records)
        raw = records

    return [UserRecord.model_validate(entry) for entry in raw]


def write_users(records: list[UserRecord]) -> None:
    """Atomically persist the full user list."""
    with _auth_lock:
        _atomic_write_json(_auth_path(), [r.model_dump() for r in records])


def read_user(username: str) -> UserRecord | None:
    """Return the record for the given username, or None if not found."""
    return next((r for r in read_users() if r.username == username), None)


def write_user(record: UserRecord) -> None:
    """Persist one user record under lock, replacing an existing entry or appending.

    Preserves all other user accounts — used by setup_auth.py and change_password.
    """
    with _auth_lock:
        current = read_users()
        updated = [record if r.username == record.username else r for r in current]
        if not any(r.username == record.username for r in current):
            updated.append(record)
        _atomic_write_json(_auth_path(), [r.model_dump() for r in updated])


def add_user_if_not_exists(record: UserRecord) -> bool:
    """Atomically check for duplicate then append. Returns False if username is taken."""
    with _auth_lock:
        users = read_users()
        if any(r.username == record.username for r in users):
            return False
        users.append(record)
        _atomic_write_json(_auth_path(), [r.model_dump() for r in users])
        return True
