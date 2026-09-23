"""Pydantic v2 schemas for KitchenCraft — a per-user recipe collection (Story 1.2).

The persisted document is one JSON file per user
(`DATA_DIR/kitchencraft/users/{username}.json`).

Two shapes carry the domain's load-bearing decisions:

- **A recipe is a name and a body.** Every other field is nullable with a default,
  so a recipe captured from a paste alone validates and stays valid forever
  (FR-3). Strictness is uniform — unlike archery there is no second, stricter
  lifecycle state to validate against.
- **An ingredient tag is two-level**: a `category` from the shared vocabulary
  plus an optional free-text `specific` (FR-7). The pantry filter matches on
  category; the reading view shows the specific where one exists.

`unconfirmed` carries per-field provenance (Architecture Gap 3): the keys of
values written by the offline enrichment pass and not yet touched by the user.
The schema lands here in Story 1.2; Epic 4 is what writes into it.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

# Exactly the meal-type dividers on the folder, in their order, so every meal
# type a cook can pick has a tab to find it under. PRD FR-4 listed six; lunch,
# snack and other were cut in schema v3 because no divider could reach them.
MealType = Literal["breakfast", "dinner", "dessert"]

MEAL_TYPES: tuple[str, ...] = ("breakfast", "dinner", "dessert")


class Ingredient(BaseModel):
    """How much of what: an amount, a unit, and the ingredient itself.

    `text` is the only required part, so `garlic` is a complete ingredient and
    `2 tsp smoked paprika` is the same ingredient with the detail a cook needs
    at the shop. Amount and unit are optional because plenty of ingredients have
    neither — `a pinch of salt`, `1 onion` — and FR-3's rule that no optional
    field may block a save applies here too.

    `amount` is a string, not a number: `1/2`, `2-3` and `a few` are all things
    cooks write, and parsing them would be a promise this app does not keep
    anywhere else (the body is stored verbatim for the same reason).

    Replaced the two-level `category` + `specific` tag in schema v2. The shared
    ingredient vocabulary, the pantry filter and the coining ceremony went with
    it, by decision.
    """

    amount: str | None = None
    unit: str | None = None
    text: str


class Recipe(BaseModel):
    id: str
    name: str
    body: str
    created_at: str
    updated_at: str
    favourite: bool = False
    # A judgement only the cook can make, so the enrichment pass never writes it
    # and no `rating` key may enter `unconfirmed` (Story 2.7). Independent of
    # `favourite`: neither is derived from the other.
    rating: int | None = None
    meal_type: MealType | None = None
    total_time_minutes: int | None = None
    servings: int | None = None
    source: str | None = None
    tags: list[str] = Field(default_factory=list)
    ingredients: list[Ingredient] = Field(default_factory=list)
    # Provenance keys: "meal_type", "total_time_minutes", "servings", "source",
    # "tag:{value}", "ingredient:{text}". Written by Epic 4's enrichment
    # pass; an update that changes or removes the value drops its key.
    unconfirmed: list[str] = Field(default_factory=list)


class KitchencraftDoc(BaseModel):
    schema_version: int = 3
    recipes: list[Recipe] = Field(default_factory=list)


class ShoppingItem(BaseModel):
    """One line on the shopping list.

    The text is ordinary free text — no parsing, no quantity field, no link back
    to the recipe or ingredient category it may have come from — so
    `chicken thighs` can be amended to `2 packs chicken thighs` in place (FR-16).

    `ticked` is the purchased mark. It lands here in Story 3.1 rather than with
    the ticking behaviour in Story 3.2, so the persisted shape settles once and
    a later story does not pay for a migration to add a boolean.
    """

    id: str
    text: str
    ticked: bool = False
    created_at: str


class ShoppingList(BaseModel):
    """A user's one and only shopping list (FR-14).

    Its own document rather than a field on `KitchencraftDoc`: the collection is
    read whole on every page load while this is written repeatedly mid-shop, so
    sharing a file would mean rewriting every recipe to tick one item — and the
    two want independent locks.

    Items stay in the order they were added. Nothing sorts them, here or later:
    a list that reorders under a thumb in a supermarket is worse than useless.
    """

    schema_version: int = 1
    items: list[ShoppingItem] = Field(default_factory=list)


class Vocabulary(BaseModel):
    """What each typeahead may offer, kept strictly apart (FR-8).

    `ingredients` is now previously-typed ingredient text from the collection rather
    than a shared category vocabulary — there is no shared vocabulary in v2.
    `units` is the shipped list plus whatever the user has coined.
    """

    tags: list[str]
    ingredients: list[str]
    units: list[str]


# -- Request bodies -----------------------------------------------------------


class CreateRecipeRequest(BaseModel):
    # Only `name` and `body` are required, and nothing else can block a save
    # (FR-3). The optional fields are here so a capture that *does* know its
    # meal type need not be a create followed by an update.
    name: str
    body: str
    rating: int | None = None
    meal_type: MealType | None = None
    total_time_minutes: int | None = None
    servings: int | None = None
    source: str | None = None
    tags: list[str] = Field(default_factory=list)
    ingredients: list[Ingredient] = Field(default_factory=list)


class AddShoppingItemRequest(BaseModel):
    # Unconstrained so an empty or whitespace-only value is rejected by the
    # service as a `ValueError` and reaches the client as a `{ detail }` string,
    # matching every other validated field in this app.
    text: str


class AddShoppingItemsRequest(BaseModel):
    """Several items at once, from a recipe's ingredients (Story 3.3).

    A batch rather than N calls so the whole add is one lock and one atomic
    write — half a recipe's ingredients landing is not a state worth having.

    `mode` is the add-vs-overwrite decision (Story 3.4). It defaults to `merge`
    because that is the non-destructive answer, and a caller that forgets to
    choose should not be the one that empties a list.
    """

    texts: list[str]
    mode: Literal["merge", "overwrite"] = "merge"


class UpdateShoppingItemRequest(BaseModel):
    """What may change about an item. Only the tick, for now (Story 3.2)."""

    ticked: bool


class UpdateRecipeRequest(BaseModel):
    """A partial update. Only fields actually sent are applied.

    An explicit `null` clears a field; an absent field is left untouched — the
    router passes `model_dump(exclude_unset=True)` so the two stay
    distinguishable (FR-6: each field independently settable *and* clearable).

    `total_time_minutes`, `servings` and `rating` are deliberately unconstrained
    here so a bad value is rejected by the service as a `ValueError` and reaches
    the client as a `{ detail }` string, rather than as pydantic's error array.
    """

    name: str | None = None
    body: str | None = None
    favourite: bool | None = None
    rating: int | None = None
    meal_type: MealType | None = None
    total_time_minutes: int | None = None
    servings: int | None = None
    source: str | None = None
    tags: list[str] | None = None
    ingredients: list[Ingredient] | None = None
