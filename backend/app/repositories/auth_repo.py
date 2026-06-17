"""Filesystem persistence for auth credentials.

Stores a single user record in `{data_dir}/_auth.json`.
All writes use the atomic write-then-rename pattern.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from pydantic import BaseModel

from app.core.config import settings

_AUTH_FILENAME = "_auth.json"


class UserRecord(BaseModel):
    username: str
    password_hash: str


def _auth_path() -> Path:
    return settings.data_dir / _AUTH_FILENAME


def _atomic_write_json(path: Path, payload: dict[str, object]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2))
    os.replace(tmp, path)


def read_user() -> UserRecord | None:
    """Return the stored user record, or None if the auth file does not exist."""
    path = _auth_path()
    if not path.exists():
        return None
    raw = json.loads(path.read_text())
    return UserRecord.model_validate(raw)


def write_user(record: UserRecord) -> None:
    """Persist the user record atomically."""
    _atomic_write_json(_auth_path(), record.model_dump())
