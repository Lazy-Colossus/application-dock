"""Filesystem persistence for KitchenCraft — one shared collection, one shared list.

This module is the ONLY code in the app that touches KitchenCraft's files. All
writes go through the shared atomic writer, and every read-modify-write is held
under the target file's lock, so a concurrent request can neither read a torn
document nor overwrite a change it never saw (NFR-1).

KitchenCraft is a household app: every signed-in user reads and writes the same
recipes (`recipes.json`) and the same shopping list (`shopping.json`). It began
with one file per user under `users/` and `shopping/`; until the shared file
exists, a read merges those legacy files, and the first write persists the
merge. The legacy files are never written again, so they stay as a backup.

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

# The two documents version independently: the collection reached v2 when
# ingredients became amount + unit + free text, and the shopping list was
# untouched by that change.
_RECIPES_SCHEMA_VERSION = 3
_SHOPPING_SCHEMA_VERSION = 1

# Ships in the image (committed, read-only at runtime), NOT under DATA_DIR.
_SEED_PATH = Path(__file__).resolve().parent.parent / "kitchencraft_seed" / "units.json"


def _recipes_path() -> Path:
    return settings.data_dir / _APP_DIR / "recipes.json"


def _shopping_path() -> Path:
    """The shopping list — a separate document under its own lock.

    Deliberately not a field on the collection document: that one is read whole
    on every page load, while this is written repeatedly mid-shop. Sharing a
    file would mean rewriting every recipe to tick one item (Story 3.1).
    """
    return settings.data_dir / _APP_DIR / "shopping.json"


def _legacy_docs(subdir: str, expected: int) -> list[tuple[str, dict[str, object]]]:
    """Each pre-sharing per-user file under `subdir`, migrated, as (owner, doc).

    In filename order, so the merge is the same on every read until it is
    persisted.
    """
    directory = settings.data_dir / _APP_DIR / subdir
    if not directory.is_dir():
        return []
    return [
        (path.stem, migrate(json.loads(path.read_text(encoding="utf-8")), expected))
        for path in sorted(directory.glob("*.json"))
    ]


def _merge(key: str, docs: list[tuple[str, dict[str, object]]]) -> list[dict[str, object]]:
    """Concatenate every owner's `key` list, keeping every entry.

    Ids are random, so two owners sharing one is all but impossible — but a
    merge that silently dropped a recipe body would break NFR-3, so a clash is
    re-keyed with its owner instead.
    """
    merged: list[dict[str, object]] = []
    seen: set[object] = set()
    for owner, doc in docs:
        for entry in doc.get(key, []) or []:
            if entry.get("id") in seen:
                entry = {**entry, "id": f"{entry['id']}-{owner}"}
            seen.add(entry.get("id"))
            merged.append(entry)
    return merged


def _migrate_v1_ingredients(raw: dict[str, object]) -> dict[str, object]:
    """v1 -> v2: two-level ingredient tags become amount + unit + free text.

    A v1 tag was a `category` from a shared vocabulary plus an optional
    `specific`, and it *displayed* as the specific where there was one and the
    bare category where there was not. The migration keeps exactly what was on
    screen — `text = specific or category` — so no recipe reads differently
    after the upgrade than it did before it.

    The category itself is dropped, which is lossy by decision: the shared
    vocabulary, the pantry filter and the coining ceremony were removed with it.
    Amount and unit start empty; there was nowhere for them to have come from.
    """
    for recipe in raw.get("recipes", []):
        if not isinstance(recipe, dict):
            continue
        migrated = []
        for tag in recipe.get("ingredients", []) or []:
            if not isinstance(tag, dict):
                continue
            if "text" in tag:  # already v2
                migrated.append(tag)
                continue
            text = (tag.get("specific") or tag.get("category") or "").strip()
            if text:
                migrated.append({"amount": None, "unit": None, "text": text})
        recipe["ingredients"] = migrated
        # Provenance keys named the category; nothing points at them now.
        recipe["unconfirmed"] = [
            key
            for key in (recipe.get("unconfirmed") or [])
            if not str(key).startswith("ingredient:")
        ]
    # The user's coined categories have no home in v2.
    raw.pop("categories", None)
    raw["schema_version"] = 2
    return raw


# Lunch folds into dinner, the nearest divider; snack and other have no near
# neighbour, so they go back to unset rather than being filed somewhere wrong.
_V3_MEAL_TYPES: dict[str, str | None] = {"lunch": "dinner", "snack": None, "other": None}


def _migrate_v2_meal_types(raw: dict[str, object]) -> dict[str, object]:
    """v2 -> v3: the meal types narrow to the three the folder has dividers for.

    A value the pass clears loses its provenance mark with it: there is nothing
    left to confirm. A value it moves keeps its mark, since whoever set `lunch`
    — the cook or the enrichment pass — is still who stands behind `dinner`.
    """
    for recipe in raw.get("recipes", []):
        if not isinstance(recipe, dict) or recipe.get("meal_type") not in _V3_MEAL_TYPES:
            continue
        recipe["meal_type"] = _V3_MEAL_TYPES[recipe["meal_type"]]
        if recipe["meal_type"] is None:
            recipe["unconfirmed"] = [
                key for key in (recipe.get("unconfirmed") or []) if key != "meal_type"
            ]
    raw["schema_version"] = 3
    return raw


def migrate(raw: dict[str, object], expected: int = _RECIPES_SCHEMA_VERSION) -> dict[str, object]:
    """Upgrade a raw document to `expected`.

    The single home for `schema_version` bumps, so the readers never grow
    version branches inline. An unknown *future* version is rejected rather than
    silently coerced — a body is the irreplaceable asset here (NFR-3) and
    guessing at a newer shape risks dropping fields on write.
    """
    version = raw.get("schema_version", expected)
    if version == expected:
        return raw
    if expected == _RECIPES_SCHEMA_VERSION and version in (1, 2):
        # Each step hands the next a document at its own version, so a v1 file
        # walks the whole chain.
        if version == 1:
            raw = _migrate_v1_ingredients(raw)
        return _migrate_v2_meal_types(raw)
    raise ValueError(f"Unsupported kitchencraft schema_version: {version!r}")


def read_seed_units() -> list[str]:
    """The shipped starter list of units.

    Read-only and shared by every user, so the unit field offers something
    useful against a user's very first recipe. Not a closed set: a unit typed
    that is not in here is accepted and joins the collection's vocabulary.
    """
    raw = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    version = raw.get("schema_version")
    if version != 1:
        raise ValueError(f"Unsupported units schema_version: {version!r}")
    return list(raw["units"])


def read_doc() -> KitchencraftDoc:
    """Read the shared collection, merging the legacy per-user files if it is new."""
    try:
        raw = _recipes_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        legacy = _legacy_docs("users", _RECIPES_SCHEMA_VERSION)
        return KitchencraftDoc.model_validate(
            {"schema_version": _RECIPES_SCHEMA_VERSION, "recipes": _merge("recipes", legacy)}
        )

    data = migrate(json.loads(raw))
    return KitchencraftDoc.model_validate(data)


def write_doc(doc: KitchencraftDoc) -> None:
    """Persist the collection atomically, creating the app directory on first write."""
    path = _recipes_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(path, doc.model_dump(mode="json"))


@contextmanager
def doc_transaction() -> Iterator[KitchencraftDoc]:
    """Read-modify-write the collection under its file's lock.

    The lock spans the whole block, so a concurrent request cannot read the same
    stale document and overwrite the change made here. Locking only the write
    would not help — both writers would already hold stale reads. With every
    user on one file, this is what keeps two cooks saving at once from losing
    each other's change.

    The document is written when the block exits cleanly. If the block raises —
    a validation `ValueError`, a missing-recipe `FileNotFoundError` — nothing is
    written, so a rejected request leaves no partial mutation behind.
    """
    with key_lock(str(_recipes_path())):
        doc = read_doc()
        yield doc
        write_doc(doc)


# -- The shopping list --------------------------------------------------------
# A second document, same rules: atomic write, lock held across the whole
# read-modify-write.


def read_shopping_list() -> ShoppingList:
    """Read the shared list, merging the legacy per-user lists if it is new."""
    try:
        raw = _shopping_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        legacy = _legacy_docs("shopping", _SHOPPING_SCHEMA_VERSION)
        return ShoppingList.model_validate(
            {"schema_version": _SHOPPING_SCHEMA_VERSION, "items": _merge("items", legacy)}
        )

    data = migrate(json.loads(raw), _SHOPPING_SCHEMA_VERSION)
    return ShoppingList.model_validate(data)


def write_shopping_list(shopping_list: ShoppingList) -> None:
    """Persist the shopping list atomically, creating the app directory on first write."""
    path = _shopping_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    atomic_write_json(path, shopping_list.model_dump(mode="json"))


@contextmanager
def shopping_transaction() -> Iterator[ShoppingList]:
    """Read-modify-write the shopping list under that file's lock.

    Its own lock, keyed on its own path, so ticking an item never contends with
    saving a recipe.
    """
    with key_lock(str(_shopping_path())):
        shopping_list = read_shopping_list()
        yield shopping_list
        write_shopping_list(shopping_list)
