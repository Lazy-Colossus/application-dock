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

# Verbatim from PRD FR-4, in the PRD's order. Never re-worded, re-cased or
# re-ordered — the UI renders this sequence as-is.
MealType = Literal["breakfast", "lunch", "dinner", "snack", "dessert", "other"]

MEAL_TYPES: tuple[str, ...] = (
    "breakfast",
    "lunch",
    "dinner",
    "snack",
    "dessert",
    "other",
)


class IngredientTag(BaseModel):
    """A category from the shared vocabulary, plus an optional specific.

    `cheese` alone is a complete ingredient tag; `cheese` -> `feta` is the same
    tag with the detail the cook cares about kept alongside it.
    """

    category: str
    specific: str | None = None


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
    ingredients: list[IngredientTag] = Field(default_factory=list)
    # Provenance keys: "meal_type", "total_time_minutes", "servings", "source",
    # "tag:{value}", "ingredient:{category}". Written by Epic 4's enrichment
    # pass; an update that changes or removes the value drops its key.
    unconfirmed: list[str] = Field(default_factory=list)


class KitchencraftDoc(BaseModel):
    schema_version: int = 1
    recipes: list[Recipe] = Field(default_factory=list)
    # Ingredient categories this user has coined, on top of the shipped seed.
    # The effective vocabulary is seed + these + whatever the recipes already
    # use, unioned on read — so there is no index to keep in step.
    categories: list[str] = Field(default_factory=list)


class Vocabulary(BaseModel):
    """What the two typeahead namespaces may offer, kept strictly apart (FR-8)."""

    tags: list[str]
    ingredient_categories: list[str]


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
    ingredients: list[IngredientTag] = Field(default_factory=list)


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
    ingredients: list[IngredientTag] | None = None
