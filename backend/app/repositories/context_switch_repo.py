"""Filesystem persistence for Context-Switch — one JSON file per user.

This module is the ONLY code in the app that touches the filesystem. All writes
use the atomic write-then-rename helper. The per-user filename is derived from
the authenticated username (passed down from the router); it is validated as a
bare filename so a crafted username can never escape the `users/` directory.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.context_switch import ContextSwitchDoc

_APP_DIR = "context-switch"
_CURRENT_SCHEMA_VERSION = 1


def _validate_username(username: str) -> str:
    """Ensure `username` is a safe bare filename, never a path.

    Rejects empty/whitespace names and anything containing a path separator or
    a parent reference, so the on-disk path can never escape `users/`.
    """
    if not username or not username.strip():
        raise ValueError("username must be non-empty")
    if username != username.strip():
        raise ValueError("username must not have surrounding whitespace")
    if "/" in username or "\\" in username or username in {".", ".."}:
        raise ValueError(f"unsafe username: {username!r}")
    return username


def _user_path(username: str) -> Path:
    _validate_username(username)
    return settings.data_dir / _APP_DIR / "users" / f"{username}.json"


def migrate(raw: dict[str, object]) -> dict[str, object]:
    """Upgrade a raw document to the current schema. v1 is a pass-through.

    Kept as the single home for future `schema_version` bumps so `read_doc`
    never has to grow version branches inline.
    """
    return raw


def read_doc(username: str) -> ContextSwitchDoc:
    """Read a user's document, or an empty one if they have no file yet."""
    path = _user_path(username)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ContextSwitchDoc(schema_version=_CURRENT_SCHEMA_VERSION, lists=[])

    data = migrate(json.loads(raw))
    return ContextSwitchDoc.model_validate(data)


def write_doc(username: str, doc: ContextSwitchDoc) -> None:
    """Persist a user's document atomically, creating `users/` on first write."""
    path = _user_path(username)
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(path, doc.model_dump(mode="json"))


@contextmanager
def doc_transaction(username: str) -> Iterator[ContextSwitchDoc]:
    """Read-modify-write a user's document under that file's lock.

    The lock spans the whole block, so a concurrent request cannot read the same
    stale document and overwrite the change made here (Story 1.8). Locking only
    the write would not help — both writers would already hold stale reads.

    The document is written when the block exits cleanly. If the block raises —
    a validation `ValueError`, a missing-entity `FileNotFoundError` — nothing is
    written, so a rejected request leaves no partial mutation behind.
    """
    with key_lock(str(_user_path(username))):
        doc = read_doc(username)
        yield doc
        write_doc(username, doc)
