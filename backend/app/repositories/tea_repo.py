"""Filesystem persistence for the Tea Cabinet — one JSON document per user.

This module is the ONLY code in the app that touches the filesystem for tea,
including the read of the shipped seed catalogue. All writes go through the
atomic write-then-rename helper.

A user's teas and the catalogue nodes they added live in the same document
because they are edited together: adding "Bai Ji Guan" to the tree while
creating the tea that prompted it is one user action, and one atomic write
(AR-1).

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
import os
import tempfile
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.tea import CatalogueNode, TeaDoc

_APP_DIR = "tea"
_CURRENT_SCHEMA_VERSION = 1
_SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "tea_catalogue.json"


def _validate_username(username: str) -> str:
    """Ensure `username` is a safe bare filename, never a path.

    Mirrors `context_switch_repo`: rejects separators and anything that could
    be read as a parent reference, so the on-disk path can never escape
    `users/`.
    """
    if not username or not username.strip():
        raise ValueError("username must not be empty")
    if username != username.strip():
        raise ValueError("username must not have surrounding whitespace")
    if "/" in username or "\\" in username or ".." in username:
        raise ValueError(f"unsafe username: {username!r}")
    return username


def _user_path(username: str) -> Path:
    _validate_username(username)
    return settings.data_dir / _APP_DIR / "users" / f"{username}.json"


def migrate(raw: dict[str, object]) -> dict[str, object]:
    """Upgrade a raw document to the current schema. v1 is a pass-through."""
    return raw


def read_doc(username: str) -> TeaDoc:
    """Read a user's cabinet, or an empty one if they have no file yet."""
    path = _user_path(username)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return TeaDoc(schema_version=_CURRENT_SCHEMA_VERSION)

    return TeaDoc.model_validate(migrate(json.loads(raw)))


def write_doc(username: str, doc: TeaDoc) -> None:
    """Persist a user's cabinet atomically, creating `users/` on first write."""
    atomic_write_json(_user_path(username), doc.model_dump(mode="json"))


@contextmanager
def doc_transaction(username: str) -> Iterator[TeaDoc]:
    """Read-modify-write a user's cabinet under that file's lock.

    The lock spans the whole block, so a concurrent request cannot read the
    same stale document and overwrite the change made here (NFR-2). If the
    block raises, nothing is written — a rejected request leaves no partial
    mutation behind.
    """
    with key_lock(str(_user_path(username))):
        doc = read_doc(username)
        yield doc
        write_doc(username, doc)


def _images_dir(username: str) -> Path:
    _validate_username(username)
    return settings.data_dir / _APP_DIR / "images" / username


def find_image(username: str, tea_id: str) -> Path | None:
    """The one stored image file for `tea_id`, whatever its extension."""
    directory = _images_dir(username)
    if not directory.is_dir():
        return None
    matches = sorted(directory.glob(f"{tea_id}.*"))
    return matches[0] if matches else None


def save_image(username: str, tea_id: str, content: bytes, extension: str) -> Path:
    """Store `content` as `tea_id`'s image, atomically and replacing any prior upload."""
    delete_image(username, tea_id)
    directory = _images_dir(username)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{tea_id}.{extension}"

    fd, tmp_name = tempfile.mkstemp(dir=directory, prefix=f"{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return path


def delete_image(username: str, tea_id: str) -> None:
    """Remove `tea_id`'s stored image, if any. Harmless when none exists."""
    existing = find_image(username, tea_id)
    if existing is not None:
        existing.unlink(missing_ok=True)


@lru_cache(maxsize=1)
def read_seed_catalogue() -> tuple[CatalogueNode, ...]:
    """The shipped catalogue tree, read once.

    It is immutable and ships with the image, so it is cached for the life of
    the process. A tuple rather than a list so a caller cannot mutate the
    cached value out from under everyone else.
    """
    raw = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    return tuple(CatalogueNode.model_validate(node) for node in raw)
