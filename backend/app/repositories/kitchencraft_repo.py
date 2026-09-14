"""Filesystem persistence for KitchenCraft — one JSON file per user.

This module is the ONLY code in the app that touches KitchenCraft's files. All
writes go through the shared atomic writer, and every read-modify-write is held
under the target file's lock, so a concurrent request can neither read a torn
document nor overwrite a change it never saw (NFR-1).

The per-user filename is derived from the authenticated username (passed down
from the router, never from request input) and is validated as a bare filename,
so a crafted username cannot escape the `users/` directory (FR-2, NFR-5).

The shipped ingredient-category seed also lives behind this module: it is a
committed, read-only file in the image rather than data under `DATA_DIR`, on the
Hotaru seed precedent.

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
from app.schemas.kitchencraft import KitchencraftDoc, ShoppingList

_APP_DIR = "kitchencraft"
_CURRENT_SCHEMA_VERSION = 1

# Ships in the image (committed, read-only at runtime), NOT under DATA_DIR.
_SEED_PATH = (
    Path(__file__).resolve().parent.parent / "kitchencraft_seed" / ("ingredient_categories.json")
)


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


def _shopping_path(username: str) -> Path:
    """The user's shopping list — a separate document under its own lock.

    Deliberately not a field on the collection document: that one is read whole
    on every page load, while this is written repeatedly mid-shop. Sharing a
    file would mean rewriting every recipe to tick one item (Story 3.1).
    """
    _validate_username(username)
    return settings.data_dir / _APP_DIR / "shopping" / f"{username}.json"


def migrate(raw: dict[str, object]) -> dict[str, object]:
    """Upgrade a raw document to the current schema. v1 is a pass-through.

    Kept as the single home for future `schema_version` bumps so `read_doc`
    never has to grow version branches inline. An unknown *future* version is
    rejected rather than silently coerced — a body is the irreplaceable asset
    here (NFR-3) and guessing at a newer shape risks dropping fields on write.
    """
    version = raw.get("schema_version", _CURRENT_SCHEMA_VERSION)
    if version != _CURRENT_SCHEMA_VERSION:
        raise ValueError(f"Unsupported kitchencraft schema_version: {version!r}")
    return raw


def read_seed_categories() -> list[str]:
    """The shipped starter vocabulary of ingredient categories (UX-DR19).

    Read-only and shared by every user, so the typeahead and the pantry filter
    both do useful work against a user's very first recipe.
    """
    raw = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    version = raw.get("schema_version")
    if version != _CURRENT_SCHEMA_VERSION:
        raise ValueError(f"Unsupported ingredient_categories schema_version: {version!r}")
    return list(raw["categories"])


def read_doc(username: str) -> KitchencraftDoc:
    """Read a user's document, or an empty one if they have no file yet."""
    path = _user_path(username)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return KitchencraftDoc(schema_version=_CURRENT_SCHEMA_VERSION)

    data = migrate(json.loads(raw))
    return KitchencraftDoc.model_validate(data)


def write_doc(username: str, doc: KitchencraftDoc) -> None:
    """Persist a user's document atomically, creating `users/` on first write."""
    path = _user_path(username)
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(path, doc.model_dump(mode="json"))


@contextmanager
def doc_transaction(username: str) -> Iterator[KitchencraftDoc]:
    """Read-modify-write a user's document under that file's lock.

    The lock spans the whole block, so a concurrent request cannot read the same
    stale document and overwrite the change made here. Locking only the write
    would not help — both writers would already hold stale reads.

    The document is written when the block exits cleanly. If the block raises —
    a validation `ValueError`, a missing-recipe `FileNotFoundError` — nothing is
    written, so a rejected request leaves no partial mutation behind.
    """
    with key_lock(str(_user_path(username))):
        doc = read_doc(username)
        yield doc
        write_doc(username, doc)


# -- The shopping list --------------------------------------------------------
# A second document, same rules: validated username, atomic write, lock held
# across the whole read-modify-write.


def read_shopping_list(username: str) -> ShoppingList:
    """Read a user's shopping list, or an empty one if they have no file yet."""
    path = _shopping_path(username)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ShoppingList(schema_version=_CURRENT_SCHEMA_VERSION)

    data = migrate(json.loads(raw))
    return ShoppingList.model_validate(data)


def write_shopping_list(username: str, shopping_list: ShoppingList) -> None:
    """Persist a shopping list atomically, creating `shopping/` on first write."""
    path = _shopping_path(username)
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(path, shopping_list.model_dump(mode="json"))


@contextmanager
def shopping_transaction(username: str) -> Iterator[ShoppingList]:
    """Read-modify-write a user's shopping list under that file's lock.

    Its own lock, keyed on its own path, so ticking an item never contends with
    saving a recipe.
    """
    with key_lock(str(_shopping_path(username))):
        shopping_list = read_shopping_list(username)
        yield shopping_list
        write_shopping_list(username, shopping_list)
