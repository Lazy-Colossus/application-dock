"""Filesystem persistence for Listies — one JSON file per user.

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
from app.schemas.listies import ListiesDoc, SharedSheetDoc

_APP_DIR = "listies"
_CURRENT_SCHEMA_VERSION = 1


def _safe_filename(value: str, what: str) -> str:
    """Ensure `value` is a safe bare filename, never a path.

    Used for both the per-user filename and a shared sheet's id, so a crafted
    value can never escape its directory.
    """
    if not value or not value.strip():
        raise ValueError(f"{what} must be non-empty")
    if value != value.strip():
        raise ValueError(f"{what} must not have surrounding whitespace")
    if "/" in value or "\\" in value or value in {".", ".."}:
        raise ValueError(f"unsafe {what}: {value!r}")
    return value


def _validate_username(username: str) -> str:
    return _safe_filename(username, "username")


def _user_path(username: str) -> Path:
    _validate_username(username)
    return settings.data_dir / _APP_DIR / "users" / f"{username}.json"


def _shared_path(sheet_id: str) -> Path:
    _safe_filename(sheet_id, "sheet_id")
    return settings.data_dir / _APP_DIR / "shared" / f"{sheet_id}.json"


def migrate(raw: dict[str, object]) -> dict[str, object]:
    """Upgrade a raw document to the current schema. v1 is a pass-through.

    Kept as the single home for future `schema_version` bumps so `read_doc`
    never has to grow version branches inline.
    """
    return raw


def read_doc(username: str) -> ListiesDoc:
    """Read a user's document, or an empty one if they have no file yet."""
    path = _user_path(username)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ListiesDoc(schema_version=_CURRENT_SCHEMA_VERSION, sheets=[])

    data = migrate(json.loads(raw))
    return ListiesDoc.model_validate(data)


def write_doc(username: str, doc: ListiesDoc) -> None:
    """Persist a user's document atomically, creating `users/` on first write."""
    path = _user_path(username)
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(path, doc.model_dump(mode="json"))


@contextmanager
def doc_transaction(username: str) -> Iterator[ListiesDoc]:
    """Read-modify-write a user's document under that file's lock (Story 1.8).

    The lock spans the whole block, so a concurrent request cannot read the same
    stale document and overwrite the change made here. Nothing is written if the
    block raises, so a rejected request leaves no partial mutation behind.
    """
    with key_lock(str(_user_path(username))):
        doc = read_doc(username)
        yield doc
        write_doc(username, doc)


# ── shared sheets (Story 5.1) ───────────────────────────────────────────────────


def _shared_dir() -> Path:
    return settings.data_dir / _APP_DIR / "shared"


def read_shared(sheet_id: str) -> SharedSheetDoc | None:
    """Read a shared sheet's document, or `None` if it is not a shared sheet."""
    path = _shared_path(sheet_id)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    return SharedSheetDoc.model_validate(json.loads(raw))


def write_shared(doc: SharedSheetDoc) -> None:
    """Persist a shared sheet atomically, creating `shared/` on first write."""
    path = _shared_path(doc.sheet.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(path, doc.model_dump(mode="json"))


def delete_shared(sheet_id: str) -> None:
    """Remove a shared sheet's file; a missing file is not an error."""
    _shared_path(sheet_id).unlink(missing_ok=True)


def list_shared_for(username: str) -> list[SharedSheetDoc]:
    """Every shared sheet `username` is a member of, owner included."""
    directory = _shared_dir()
    if not directory.is_dir():
        return []
    docs: list[SharedSheetDoc] = []
    for path in sorted(directory.glob("*.json")):
        doc = SharedSheetDoc.model_validate(json.loads(path.read_text(encoding="utf-8")))
        if username in doc.members:
            docs.append(doc)
    return docs


@contextmanager
def shared_transaction(sheet_id: str) -> Iterator[SharedSheetDoc]:
    """Read-modify-write a shared sheet under its file's lock (Story 1.8).

    Mirrors `doc_transaction`: the lock spans the block and nothing is written
    if the block raises. Raises `FileNotFoundError` if the sheet is not shared.
    """
    with key_lock(str(_shared_path(sheet_id))):
        doc = read_shared(sheet_id)
        if doc is None:
            raise FileNotFoundError(f"shared sheet not found: {sheet_id}")
        yield doc
        write_shared(doc)
