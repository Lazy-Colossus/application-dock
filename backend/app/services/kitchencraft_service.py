"""Business logic for KitchenCraft recipe collections.

Operates on a single user's document (loaded/saved via `kitchencraft_repo`).
Raises stdlib exceptions only (`ValueError` for invalid input,
`FileNotFoundError` for a missing recipe) — routers translate these to HTTP.
The `username` is always supplied by the router from the JWT; it is never taken
from request input.

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
    IngredientTag,
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


def _clean_ingredients(values: list[IngredientTag], known: list[str]) -> list[IngredientTag]:
    """Normalise ingredient tags: category folded onto the vocabulary, specific left alone.

    The specific is free text the cook wrote about this one recipe (`chicken
    thighs`), so it is trimmed and otherwise kept exactly as typed — it is not
    vocabulary and nothing matches against it. A blank specific is stored as
    absent, never as an empty string, so the reading view can apply the absence
    rule without a second emptiness test.

    The same category may legitimately appear twice with different specifics
    (`cheese` -> `feta` and `cheese` -> `cheddar`); only exact repeats are dropped.
    """
    out: list[IngredientTag] = []
    seen: set[tuple[str, str]] = set()
    for raw in values:
        category = _resolve_casing(raw.category, known + [i.category for i in out])
        if not category:
            raise ValueError("An ingredient needs a category")
        specific = (raw.specific or "").strip() or None
        key = (category.casefold(), (specific or "").casefold())
        if key in seen:
            continue
        seen.add(key)
        out.append(IngredientTag(category=category, specific=specific))
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


def _category_vocabulary(doc: KitchencraftDoc) -> list[str]:
    """The shipped seed, plus the user's coined categories, plus anything in use.

    The seed comes first so the typeahead's ranking starts from the common case;
    a user's own categories follow. Unioned on read for the same reason as the
    tags: there is no separate index to keep honest.
    """
    out: list[str] = []
    seen: set[str] = set()
    accrued = list(doc.categories) + [i.category for r in doc.recipes for i in r.ingredients]
    for category in repo.read_seed_categories() + accrued:
        if category.casefold() not in seen:
            seen.add(category.casefold())
            out.append(category)
    return out


def get_vocabulary(username: str) -> Vocabulary:
    """The two typeahead namespaces, kept strictly apart (FR-8)."""
    doc = repo.read_doc(username)
    return Vocabulary(
        tags=_tag_vocabulary(doc),
        ingredient_categories=_category_vocabulary(doc),
    )


def _remember_categories(doc: KitchencraftDoc, ingredients: list[IngredientTag]) -> None:
    """Record any genuinely new category on the user's document.

    A category coined on the edit screen has to outlive the recipe that
    introduced it — that is what makes it *shared* vocabulary for every future
    recipe (FR-9, FR-22). Seeded categories are not copied in; the seed is
    already read on every vocabulary read.
    """
    seeded = {c.casefold() for c in repo.read_seed_categories()}
    known = {c.casefold() for c in doc.categories}
    for ingredient in ingredients:
        folded = ingredient.category.casefold()
        if folded not in seeded and folded not in known:
            known.add(folded)
            doc.categories.append(ingredient.category)


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


def list_recipes(username: str) -> list[Recipe]:
    """The whole collection, in collection order.

    Bodies included: search and filtering run client-side over the loaded
    collection (NFR-6), and the body is what full-text search matches (FR-11).
    """
    return _collection_order(repo.read_doc(username))


def _find(doc: KitchencraftDoc, recipe_id: str) -> Recipe:
    for recipe in doc.recipes:
        if recipe.id == recipe_id:
            return recipe
    raise FileNotFoundError(f"recipe {recipe_id} not found")


def get_recipe(username: str, recipe_id: str) -> Recipe:
    """One recipe. Raises FileNotFoundError if the id is unknown."""
    return _find(repo.read_doc(username), recipe_id)


# -- Writes -------------------------------------------------------------------


def create_recipe(
    username: str,
    *,
    name: str,
    body: str,
    rating: int | None = None,
    meal_type: str | None = None,
    total_time_minutes: int | None = None,
    servings: int | None = None,
    source: str | None = None,
    tags: list[str] | None = None,
    ingredients: list[IngredientTag] | None = None,
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
    with repo.doc_transaction(username) as doc:
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
            ingredients=_clean_ingredients(ingredients or [], _category_vocabulary(doc)),
        )
        _remember_categories(doc, recipe.ingredients)
        doc.recipes.append(recipe)
    return recipe


def _drop_marks(recipe: Recipe, changed: set[str]) -> None:
    """Retire the provenance marks an update has invalidated.

    A mark says "the app guessed this". It drops the moment the user's own value
    lands on top of it, and it also drops when the value it described is gone —
    a mark for a tag that is no longer on the recipe describes nothing.
    """
    live_tags = {f"tag:{t}" for t in recipe.tags}
    live_ingredients = {f"ingredient:{i.category}" for i in recipe.ingredients}
    recipe.unconfirmed = [
        key
        for key in recipe.unconfirmed
        if key not in changed
        and (not key.startswith("tag:") or key in live_tags)
        and (not key.startswith("ingredient:") or key in live_ingredients)
    ]


def update_recipe(username: str, recipe_id: str, changes: dict[str, Any]) -> Recipe:
    """Apply only the fields `changes` actually carries.

    A key present with `None` clears that field; an absent key leaves it alone,
    which is what keeps the four optional fields independently settable and
    clearable (FR-6). Crucially, an update that does not mention `body` never
    rewrites it (FR-5, NFR-3).

    Raises FileNotFoundError for an unknown id, ValueError for invalid input.
    """
    with repo.doc_transaction(username) as doc:
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
            incoming = [IngredientTag.model_validate(i) for i in (changes["ingredients"] or [])]
            recipe.ingredients = _clean_ingredients(incoming, _category_vocabulary(doc))
            _remember_categories(doc, recipe.ingredients)

        changed = {f for f in _MARKED_FIELDS if getattr(before, f) != getattr(recipe, f)}
        changed |= {f"tag:{t}" for t in set(before.tags) ^ set(recipe.tags)}
        changed |= {
            f"ingredient:{i.category}"
            for i in before.ingredients + recipe.ingredients
            if (i in before.ingredients) != (i in recipe.ingredients)
        }
        _drop_marks(recipe, changed)

        if recipe != before:
            recipe.updated_at = _now_iso()

    return recipe


def delete_recipe(username: str, recipe_id: str) -> None:
    """Delete a recipe outright. There is no undo and no trash, by design (FR-4).

    Raises FileNotFoundError if the id is unknown.
    """
    with repo.doc_transaction(username) as doc:
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


def get_shopping_list(username: str) -> ShoppingList:
    """The user's list. An empty one on first read, never an error."""
    return repo.read_shopping_list(username)


def add_shopping_item(username: str, text: str) -> ShoppingItem:
    """Append one hand-entered item to the end of the list.

    Appends rather than inserts, and nothing sorts afterwards: the order items
    were added is the order they are read in the shop.

    Raises ValueError for an empty or whitespace-only value.
    """
    clean = text.strip()
    if not clean:
        raise ValueError("text must not be empty")

    item = ShoppingItem(id=_new_item_id(), text=clean, created_at=_now_iso())
    with repo.shopping_transaction(username) as shopping_list:
        shopping_list.items.append(item)
    return item


def _find_item(shopping_list: ShoppingList, item_id: str) -> ShoppingItem:
    for item in shopping_list.items:
        if item.id == item_id:
            return item
    raise FileNotFoundError(f"shopping item {item_id} not found")


def set_item_ticked(username: str, item_id: str, ticked: bool) -> ShoppingItem:
    """Tick or untick one item, in place (Story 3.2).

    The item's position is untouched: nothing sorts ticked items to the bottom,
    hides them or moves them to a done group. A list read in an aisle must stay
    the list the cook built, in that order, with marks on it (FR-15).

    Raises FileNotFoundError for an unknown id.
    """
    with repo.shopping_transaction(username) as shopping_list:
        item = _find_item(shopping_list, item_id)
        item.ticked = ticked
    return item


def delete_shopping_item(username: str, item_id: str) -> None:
    """Remove one item, ticked or not. Raises FileNotFoundError if unknown."""
    with repo.shopping_transaction(username) as shopping_list:
        remaining = [i for i in shopping_list.items if i.id != item_id]
        if len(remaining) == len(shopping_list.items):
            raise FileNotFoundError(f"shopping item {item_id} not found")
        shopping_list.items = remaining


def clear_shopping_list(username: str) -> None:
    """Empty the list outright, ticked items included.

    Idempotent: clearing an empty list is a no-op rather than an error, because
    the confirmation the user just answered was about intent, not about state.
    """
    with repo.shopping_transaction(username) as shopping_list:
        shopping_list.items = []


def add_shopping_items(username: str, texts: list[str]) -> list[ShoppingItem]:
    """Append several items in one transaction (Story 3.3).

    One lock and one write for the whole batch, so a recipe's ingredients either
    all land or none do.

    Blank entries are skipped rather than rejecting the batch: the caller is a
    checkbox list, and one empty label should not cost the user the other nine.
    An all-blank batch adds nothing and is not an error.

    The items are ordinary `ShoppingItem`s. Nothing records which recipe they
    came from — on the list they are text like any other, which is what lets
    `chicken thighs` become `2 packs chicken thighs` (FR-16).
    """
    clean = [text.strip() for text in texts]
    items = [
        ShoppingItem(id=_new_item_id(), text=text, created_at=_now_iso()) for text in clean if text
    ]
    if not items:
        return []

    with repo.shopping_transaction(username) as shopping_list:
        shopping_list.items.extend(items)
    return items
