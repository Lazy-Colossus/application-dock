"""Business logic for KitchenCraft recipe collections.

Operates on the one shared collection and shopping list (loaded/saved via
`kitchencraft_repo`); every signed-in user sees and edits the same recipes.
Raises stdlib exceptions only (`ValueError` for invalid input,
`FileNotFoundError` for a missing recipe) — routers translate these to HTTP.

Two rules in here are the app's whole character, and both are load-bearing:

- **The body is trimmed at the ends and never otherwise touched** (FR-5, NFR-3).
  No normalisation, no list detection, no re-wrapping. An update that does not
  mention the body leaves the stored bytes alone.
- **Vocabulary converges on one casing** (FR-9). A value that matches an
  existing tag or category case-insensitively resolves to the casing already in
  use, so `Chicken` and `chicken` can never coexist as two values.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from app.repositories import kitchencraft_repo as repo
from app.schemas.kitchencraft import (
    Ingredient,
    KitchencraftDoc,
    Recipe,
    ShoppingItem,
    ShoppingList,
    Vocabulary,
)

# Fields whose provenance mark is tracked by name (Architecture Gap 3).
_MARKED_FIELDS = ("meal_type", "total_time_minutes", "servings", "source")


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    """Mint a stable recipe id like `r-ab12cd34`.

    Bulk enrichment addresses recipes by this id and never by name (FR-20), so
    it has to survive a rename — which is why it is minted rather than derived
    from anything the user can edit.
    """
    return f"r-{uuid.uuid4().hex[:8]}"


# -- Normalisation ------------------------------------------------------------


def _resolve_casing(value: str, known: list[str]) -> str:
    """Return `value` in the casing already used by the collection, if any.

    The first casing to enter the vocabulary wins; every later variant folds
    onto it. A genuinely new value keeps the casing it was typed in (FR-9).
    """
    stripped = value.strip()
    folded = stripped.casefold()
    for existing in known:
        if existing.casefold() == folded:
            return existing
    return stripped


def _clean_tags(values: list[str], known: list[str]) -> list[str]:
    """Normalise a recipe's tags: trimmed, case-folded onto the vocabulary, unique.

    Order is the order the user gave, which is the order the chips read back in.
    """
    out: list[str] = []
    seen: set[str] = set()
    for raw in values:
        tag = _resolve_casing(raw, known + out)
        if not tag:
            continue
        if tag.casefold() in seen:
            continue
        seen.add(tag.casefold())
        out.append(tag)
    return out


def _clean_ingredients(values: list[Ingredient], known: list[str]) -> list[Ingredient]:
    """Normalise ingredients: text trimmed and case-folded, amount and unit tidied.

    The text is free text the cook wrote about this one recipe, so beyond
    trimming and folding onto a casing they have already used, it is kept
    exactly as typed — there is no shared vocabulary to match it against any
    more, and nothing parses it.

    A blank amount or unit is stored as absent, never as an empty string, so the
    reading view can apply the absence rule without a second emptiness test.

    The same ingredient may legitimately appear twice with different amounts
    (`100 g butter` for the pastry, `20 g butter` for the pan); only entries
    identical in all three parts are dropped.
    """
    out: list[Ingredient] = []
    seen: set[tuple[str, str, str]] = set()
    for raw in values:
        text = _resolve_casing(raw.text, known + [i.text for i in out])
        if not text:
            raise ValueError("An ingredient needs a name")
        amount = (raw.amount or "").strip() or None
        unit = (raw.unit or "").strip() or None
        key = (text.casefold(), (amount or "").casefold(), (unit or "").casefold())
        if key in seen:
            continue
        seen.add(key)
        out.append(Ingredient(amount=amount, unit=unit, text=text))
    return out


def _positive_int(value: Any, field: str) -> int:
    """Coerce and check a positive whole number, or raise with the field named."""
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{field} must be a whole number")
    if value < 1:
        raise ValueError(f"{field} must be a positive whole number")
    return value


def _rating(value: Any) -> int:
    """Check a 1-5 star rating, or raise (Story 2.7).

    Bounded rather than merely positive, so the stored value can never exceed
    what the five-star control is able to display. `bool` is excluded for the
    same reason as `_positive_int`: `True` is an `int` in Python and would
    otherwise pass as one star.
    """
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError("rating must be a whole number")
    if not 1 <= value <= 5:
        raise ValueError("rating must be between 1 and 5")
    return value


# -- Vocabulary ---------------------------------------------------------------


def _tag_vocabulary(doc: KitchencraftDoc) -> list[str]:
    """Every tag anywhere in the collection, in first-seen order.

    Derived on read rather than indexed: at personal scale the walk is free, and
    an index is one more thing that can fall out of step with the recipes.
    """
    out: list[str] = []
    seen: set[str] = set()
    for recipe in doc.recipes:
        for tag in recipe.tags:
            if tag.casefold() not in seen:
                seen.add(tag.casefold())
                out.append(tag)
    return out


def _ingredient_vocabulary(doc: KitchencraftDoc) -> list[str]:
    """Every ingredient text anywhere in the collection, in first-seen order.

    The collection's own history, not a curated vocabulary — v2 has none. It exists so
    the field can still suggest what this cook has typed before, which is what
    keeps `Feta` and `feta` from becoming two things.
    """
    out: list[str] = []
    seen: set[str] = set()
    for recipe in doc.recipes:
        for ingredient in recipe.ingredients:
            if ingredient.text.casefold() not in seen:
                seen.add(ingredient.text.casefold())
                out.append(ingredient.text)
    return out


def _unit_vocabulary(doc: KitchencraftDoc) -> list[str]:
    """The shipped units, plus any coined in the collection, in that order.

    The seed comes first so the field offers the common case before anything is
    typed. Unioned on read for the same reason as the tags: no separate index to
    keep honest.
    """
    out: list[str] = []
    seen: set[str] = set()
    used = [i.unit for r in doc.recipes for i in r.ingredients if i.unit]
    for unit in repo.read_seed_units() + used:
        if unit.casefold() not in seen:
            seen.add(unit.casefold())
            out.append(unit)
    return out


def get_vocabulary() -> Vocabulary:
    """What each typeahead may offer, kept strictly apart (FR-8)."""
    doc = repo.read_doc()
    return Vocabulary(
        tags=_tag_vocabulary(doc),
        ingredients=_ingredient_vocabulary(doc),
        units=_unit_vocabulary(doc),
    )


# -- Reads --------------------------------------------------------------------


def _collection_order(doc: KitchencraftDoc) -> list[Recipe]:
    """Favourites first, creation date descending within each group (FR-10, FR-13).

    One ordering for the whole app; there is no alternative sort in v1, so the
    list, the favourites-only view and every filtered result read the same way.
    """
    # Two passes rather than one composite key: the date leg is descending and
    # the favourite leg ascending, and Python's sort is stable, so the second
    # pass lifts the favourites without disturbing the date order inside either
    # group.
    # The index breaks ties, so two recipes captured in the same microsecond
    # still come back newest-first rather than in whatever order they happen to
    # sit in the file.
    indexed = list(enumerate(doc.recipes))
    by_date = [
        r for _, r in sorted(indexed, key=lambda pair: (pair[1].created_at, pair[0]), reverse=True)
    ]
    return sorted(by_date, key=lambda r: not r.favourite)


def list_recipes() -> list[Recipe]:
    """The whole collection, in collection order.

    Bodies included: search and filtering run client-side over the loaded
    collection (NFR-6), and the body is what full-text search matches (FR-11).
    """
    return _collection_order(repo.read_doc())


def _find(doc: KitchencraftDoc, recipe_id: str) -> Recipe:
    for recipe in doc.recipes:
        if recipe.id == recipe_id:
            return recipe
    raise FileNotFoundError(f"recipe {recipe_id} not found")


def get_recipe(recipe_id: str) -> Recipe:
    """One recipe. Raises FileNotFoundError if the id is unknown."""
    return _find(repo.read_doc(), recipe_id)


# -- Writes -------------------------------------------------------------------


def create_recipe(
    *,
    name: str,
    body: str,
    rating: int | None = None,
    meal_type: str | None = None,
    total_time_minutes: int | None = None,
    servings: int | None = None,
    source: str | None = None,
    tags: list[str] | None = None,
    ingredients: list[Ingredient] | None = None,
) -> Recipe:
    """Save a new recipe. Only a name and a body are required (FR-3).

    Raises ValueError naming the empty field, and nothing else can reject a
    save — no optional field is allowed to stand between a paste and a saved
    recipe.
    """
    clean_name = name.strip()
    clean_body = body.strip()
    if not clean_name:
        raise ValueError("name must not be empty")
    if not clean_body:
        raise ValueError("body must not be empty")

    if total_time_minutes is not None:
        total_time_minutes = _positive_int(total_time_minutes, "total_time_minutes")
    if servings is not None:
        servings = _positive_int(servings, "servings")
    if rating is not None:
        rating = _rating(rating)

    now = _now_iso()
    with repo.doc_transaction() as doc:
        recipe = Recipe(
            id=_new_id(),
            name=clean_name,
            body=clean_body,
            created_at=now,
            updated_at=now,
            rating=rating,
            meal_type=meal_type,  # type: ignore[arg-type]  # Literal, validated by the schema
            total_time_minutes=total_time_minutes,
            servings=servings,
            source=(source or "").strip() or None,
            tags=_clean_tags(tags or [], _tag_vocabulary(doc)),
            ingredients=_clean_ingredients(ingredients or [], _ingredient_vocabulary(doc)),
        )
        doc.recipes.append(recipe)
    return recipe


def _drop_marks(recipe: Recipe, changed: set[str]) -> None:
    """Retire the provenance marks an update has invalidated.

    A mark says "the app guessed this". It drops the moment the user's own value
    lands on top of it, and it also drops when the value it described is gone —
    a mark for a tag that is no longer on the recipe describes nothing.
    """
    live_tags = {f"tag:{t}" for t in recipe.tags}
    live_ingredients = {f"ingredient:{i.text}" for i in recipe.ingredients}
    recipe.unconfirmed = [
        key
        for key in recipe.unconfirmed
        if key not in changed
        and (not key.startswith("tag:") or key in live_tags)
        and (not key.startswith("ingredient:") or key in live_ingredients)
    ]


def update_recipe(recipe_id: str, changes: dict[str, Any]) -> Recipe:
    """Apply only the fields `changes` actually carries.

    A key present with `None` clears that field; an absent key leaves it alone,
    which is what keeps the four optional fields independently settable and
    clearable (FR-6). Crucially, an update that does not mention `body` never
    rewrites it (FR-5, NFR-3).

    Raises FileNotFoundError for an unknown id, ValueError for invalid input.
    """
    with repo.doc_transaction() as doc:
        recipe = _find(doc, recipe_id)
        before = recipe.model_copy(deep=True)

        if "name" in changes:
            clean = (changes["name"] or "").strip()
            if not clean:
                raise ValueError("name must not be empty")
            recipe.name = clean

        if "body" in changes:
            clean = (changes["body"] or "").strip()
            if not clean:
                raise ValueError("body must not be empty")
            recipe.body = clean

        if "favourite" in changes:
            recipe.favourite = bool(changes["favourite"])

        # Independent of `favourite` in both directions: setting one never reads
        # or writes the other, and an explicit null clears the rating (AC 1, 3).
        if "rating" in changes:
            value = changes["rating"]
            recipe.rating = None if value is None else _rating(value)

        if "meal_type" in changes:
            recipe.meal_type = changes["meal_type"]

        for field in ("total_time_minutes", "servings"):
            if field in changes:
                value = changes[field]
                setattr(recipe, field, None if value is None else _positive_int(value, field))

        if "source" in changes:
            recipe.source = (changes["source"] or "").strip() or None

        if "tags" in changes:
            others = [r for r in doc.recipes if r.id != recipe.id]
            known = _tag_vocabulary(KitchencraftDoc(recipes=others))
            recipe.tags = _clean_tags(changes["tags"] or [], known)

        if "ingredients" in changes:
            incoming = [Ingredient.model_validate(i) for i in (changes["ingredients"] or [])]
            recipe.ingredients = _clean_ingredients(incoming, _ingredient_vocabulary(doc))

        changed = {f for f in _MARKED_FIELDS if getattr(before, f) != getattr(recipe, f)}
        changed |= {f"tag:{t}" for t in set(before.tags) ^ set(recipe.tags)}
        changed |= {
            f"ingredient:{i.text}"
            for i in before.ingredients + recipe.ingredients
            if (i in before.ingredients) != (i in recipe.ingredients)
        }
        _drop_marks(recipe, changed)

        if recipe != before:
            recipe.updated_at = _now_iso()

    return recipe


def delete_recipe(recipe_id: str) -> None:
    """Delete a recipe outright. There is no undo and no trash, by design (FR-4).

    Raises FileNotFoundError if the id is unknown.
    """
    with repo.doc_transaction() as doc:
        remaining = [r for r in doc.recipes if r.id != recipe_id]
        if len(remaining) == len(doc.recipes):
            raise FileNotFoundError(f"recipe {recipe_id} not found")
        doc.recipes = remaining


# -- The shopping list (Story 3.1) --------------------------------------------
# Exactly one list per user, and no list management: there is deliberately no
# create, name, switch or delete anywhere in this module (FR-14).


def _new_item_id() -> str:
    """Mint a stable item id like `s-ab12cd34`, on the recipe-id precedent.

    Minted rather than derived from the text, so an item survives being edited
    from `chicken thighs` to `2 packs chicken thighs`.
    """
    return f"s-{uuid.uuid4().hex[:8]}"


def get_shopping_list() -> ShoppingList:
    """The user's list. An empty one on first read, never an error."""
    return repo.read_shopping_list()


def add_shopping_item(text: str) -> ShoppingItem:
    """Append one hand-entered item to the end of the list.

    Appends rather than inserts, and nothing sorts afterwards: the order items
    were added is the order they are read in the shop.

    Raises ValueError for an empty or whitespace-only value.
    """
    clean = text.strip()
    if not clean:
        raise ValueError("text must not be empty")

    item = ShoppingItem(id=_new_item_id(), text=clean, created_at=_now_iso())
    with repo.shopping_transaction() as shopping_list:
        shopping_list.items.append(item)
    return item


def _find_item(shopping_list: ShoppingList, item_id: str) -> ShoppingItem:
    for item in shopping_list.items:
        if item.id == item_id:
            return item
    raise FileNotFoundError(f"shopping item {item_id} not found")


def set_item_ticked(item_id: str, ticked: bool) -> ShoppingItem:
    """Tick or untick one item, in place (Story 3.2).

    The item's position is untouched: nothing sorts ticked items to the bottom,
    hides them or moves them to a done group. A list read in an aisle must stay
    the list the cook built, in that order, with marks on it (FR-15).

    Raises FileNotFoundError for an unknown id.
    """
    with repo.shopping_transaction() as shopping_list:
        item = _find_item(shopping_list, item_id)
        item.ticked = ticked
    return item


def delete_shopping_item(item_id: str) -> None:
    """Remove one item, ticked or not. Raises FileNotFoundError if unknown."""
    with repo.shopping_transaction() as shopping_list:
        remaining = [i for i in shopping_list.items if i.id != item_id]
        if len(remaining) == len(shopping_list.items):
            raise FileNotFoundError(f"shopping item {item_id} not found")
        shopping_list.items = remaining


def clear_shopping_list() -> None:
    """Empty the list outright, ticked items included.

    Idempotent: clearing an empty list is a no-op rather than an error, because
    the confirmation the user just answered was about intent, not about state.
    """
    with repo.shopping_transaction() as shopping_list:
        shopping_list.items = []


def add_shopping_items(texts: list[str], mode: str = "merge") -> list[ShoppingItem]:
    """Add several items in one transaction (Stories 3.3, 3.4).

    One lock and one write for the whole batch, so a recipe's ingredients either
    all land or none do.

    `merge` adds what is not already there, matched case-insensitively — both
    against the existing list and within the batch, so the result can never hold
    a case-insensitive duplicate. `overwrite` discards everything first, ticked
    items included.

    **Returns only the items actually created**, which is what lets the caller
    report an honest count: a merge that sends six and adds four says four.

    Blank entries are skipped rather than rejecting the batch: the caller is a
    checkbox list, and one empty label should not cost the user the other nine.
    An all-blank batch adds nothing and is not an error.

    The items are ordinary `ShoppingItem`s. Nothing records which recipe they
    came from — on the list they are text like any other, which is what lets
    `chicken thighs` become `2 packs chicken thighs` (FR-16).
    """
    if mode not in {"merge", "overwrite"}:
        raise ValueError(f"unknown mode: {mode!r}")

    clean = [text.strip() for text in texts if text.strip()]
    if not clean and mode == "merge":
        return []

    with repo.shopping_transaction() as shopping_list:
        if mode == "overwrite":
            shopping_list.items = []

        # Seeded from whatever survives, so a merge never duplicates an existing
        # item and a batch never duplicates itself.
        seen = {i.text.casefold() for i in shopping_list.items}
        created: list[ShoppingItem] = []
        for text in clean:
            if text.casefold() in seen:
                continue
            seen.add(text.casefold())
            created.append(ShoppingItem(id=_new_item_id(), text=text, created_at=_now_iso()))
        shopping_list.items.extend(created)
    return created


# -- Offline enrichment (Epic 4) ----------------------------------------------
# Called by `backend/scripts/enrich.py`, never by a router. There is no HTTP
# surface for any of this (PRD Q1) — the script runs inside the container and
# goes through the repository layer, so it takes the same locks the app takes.


def enrichment_report() -> dict[str, Any]:
    """What a pass would need to know, without changing anything (Story 4.2).

    Two halves: the recipes that are missing structure, and the wording the
    collection already uses. The second half is what Story 4.4 is about — a pass
    that cannot see the existing wording will invent a near-synonym for it.
    """
    doc = repo.read_doc()
    gaps = []
    for recipe in doc.recipes:
        missing = [f for f in _MARKED_FIELDS if getattr(recipe, f) is None]
        if not missing and recipe.tags and recipe.ingredients:
            continue
        gaps.append(
            {
                "id": recipe.id,
                "name": recipe.name,
                "body": recipe.body,
                "missing_fields": missing,
                "has_tags": bool(recipe.tags),
                "has_ingredients": bool(recipe.ingredients),
                "unconfirmed": list(recipe.unconfirmed),
            }
        )

    return {
        "recipe_count": len(doc.recipes),
        "needing_attention": len(gaps),
        "recipes": gaps,
        # Reuse this wording. Introducing a near-synonym for something already
        # here is the drift Story 4.4 exists to prevent.
        "vocabulary": {
            "tags": _tag_vocabulary(doc),
            "ingredients": _ingredient_vocabulary(doc),
            "units": _unit_vocabulary(doc),
        },
    }


def _enrich_one(recipe: Recipe, values: dict[str, Any]) -> list[str]:
    """Apply one recipe's inferred values in place; return what was skipped.

    **A user-set value is never overwritten.** A field the user set carries no
    mark, so "not marked and not empty" is the test for "leave it alone" —
    which is also what makes a re-run a no-op rather than a fight.
    """
    marked = set(recipe.unconfirmed)
    skipped: list[str] = []

    for field in _MARKED_FIELDS:
        if field not in values:
            continue
        current = getattr(recipe, field)
        if current is not None and field not in marked:
            skipped.append(field)
            continue
        new = values[field]
        if field in ("total_time_minutes", "servings") and new is not None:
            new = _positive_int(new, field)
        if current != new:
            setattr(recipe, field, new)
        marked.add(field)

    if "tags" in values:
        known = {t.casefold(): t for t in recipe.tags}
        for raw in values["tags"]:
            tag = (raw or "").strip()
            if not tag or tag.casefold() in known:
                continue
            recipe.tags.append(tag)
            marked.add(f"tag:{tag}")
            known[tag.casefold()] = tag

    if "ingredients" in values:
        # A recipe whose ingredients the user entered is left entirely alone:
        # adding to a hand-written list would be editing their work, not
        # filling a gap.
        user_set = recipe.ingredients and not any(k.startswith("ingredient:") for k in marked)
        if user_set:
            skipped.append("ingredients")
        else:
            known = {i.text.casefold() for i in recipe.ingredients}
            incoming = [Ingredient.model_validate(i) for i in values["ingredients"]]
            for ingredient in _clean_ingredients(incoming, [i.text for i in recipe.ingredients]):
                if ingredient.text.casefold() in known:
                    continue
                recipe.ingredients.append(ingredient)
                marked.add(f"ingredient:{ingredient.text}")
                known.add(ingredient.text.casefold())

    recipe.unconfirmed = sorted(marked)
    return skipped


def _apply_batch(doc: KitchencraftDoc, updates: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """The whole batch against one document. Shared by the dry run and the real run."""
    applied: list[str] = []
    unchanged: list[str] = []
    unknown: list[str] = []
    skipped: dict[str, list[str]] = {}

    by_id = {r.id: r for r in doc.recipes}
    for recipe_id, values in updates.items():
        recipe = by_id.get(recipe_id)
        if recipe is None:
            unknown.append(recipe_id)
            continue

        before = recipe.model_copy(deep=True)
        left_alone = _enrich_one(recipe, values)
        if left_alone:
            skipped[recipe_id] = left_alone

        # The body is never touched by any of this, so it is restored rather
        # than trusted (FR-5, NFR-3).
        recipe.body = before.body

        if recipe == before:
            unchanged.append(recipe_id)
            continue
        recipe.updated_at = _now_iso()
        applied.append(recipe_id)

    return {
        "applied": applied,
        "unchanged": unchanged,
        "unknown": unknown,
        "skipped": skipped,
    }


def apply_enrichment(updates: dict[str, dict[str, Any]], *, write: bool = False) -> dict[str, Any]:
    """Apply inferred structure to many recipes in one run (Story 4.3).

    `updates` is keyed by **recipe id**, never by name, so a batch still lands
    after the user has renamed something (FR-20).

    Without `write=True` nothing is persisted: the batch runs against a document
    read outside any transaction, which is then discarded. Both paths call
    `_apply_batch`, so what the dry run reports is exactly what the real run
    does — a dry run that used different code would be worth very little.

    The real run holds the document's lock across the whole batch and writes
    once at the end, so an interruption leaves every recipe in a valid state
    rather than some of them half-written. An unknown id is reported and the
    rest of the batch still applies. A re-run of an identical batch changes
    nothing, so `updated_at` does not churn.
    """
    if write:
        with repo.doc_transaction() as doc:
            result = _apply_batch(doc, updates)
        return {"write": True, **result}

    return {"write": False, **_apply_batch(repo.read_doc(), updates)}
