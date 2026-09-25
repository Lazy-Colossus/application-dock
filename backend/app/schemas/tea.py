"""Pydantic v2 schemas for the Tea Cabinet.

The persisted document is one JSON file per user
(`DATA_DIR/tea/users/{username}.json`) holding both that user's teas and the
catalogue nodes they added themselves. Seeded nodes are never written there —
they ship in `app/data/tea_catalogue.json` and are merged on read.

Only `name` and `catalogue_node_id` are required on a tea: adding a tea must
never feel like a form to fill in (FR-2).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TeaClass = Literal["green", "yellow", "white", "oolong", "red", "dark", "other"]
TeaForm = Literal["loose", "cake", "brick", "tuo", "ball", "bag", "sample", "other"]
HarvestSeason = Literal["spring", "summer", "autumn", "winter"]
NodeSource = Literal["seed", "user"]

# The Chinese classification's own order, which is also the shelf's section
# order (FR-5). Categorical, never a ranking.
CATALOGUE_CLASSES: tuple[str, ...] = (
    "green",
    "yellow",
    "white",
    "oolong",
    "red",
    "dark",
    "other",
)

# A tea recorded before 1900 is a typo, not a collector's item.
_MIN_YEAR = 1900


class CatalogueNode(BaseModel):
    id: str
    parent_id: str | None = None
    name: str
    name_zh: str = ""
    source: NodeSource = "seed"
    default_origin: str = ""


class Tea(BaseModel):
    id: str
    name: str
    catalogue_node_id: str
    form: TeaForm | None = None
    origin: str = ""
    vendor: str = ""
    year: int | None = None
    harvest_season: HarvestSeason | None = None
    cultivar: str = ""
    grams_purchased: float | None = None
    grams_remaining: float = 0
    price_paid: float | None = None
    purchase_date: str | None = None
    storage_location: str = ""
    low_threshold_grams: float | None = None
    notes: str = ""
    created_at: str
    updated_at: str


class TeaView(Tea):
    """A tea as the API returns it: with its root class resolved server-side.

    The shelf groups on `class_id`, so classification and grouping cannot drift
    apart (AR-5).
    """

    class_id: TeaClass


class TeaDoc(BaseModel):
    schema_version: int = 1
    teas: list[Tea] = Field(default_factory=list)
    catalogue_nodes: list[CatalogueNode] = Field(default_factory=list)


class CreateNodeRequest(BaseModel):
    parent_id: str
    name: str
    name_zh: str = ""
    default_origin: str = ""


class TeaWriteRequest(BaseModel):
    """The body for both create and replace. Mirrors `Tea` minus server fields."""

    name: str
    catalogue_node_id: str
    form: TeaForm | None = None
    origin: str = ""
    vendor: str = ""
    year: int | None = Field(default=None, ge=_MIN_YEAR)
    harvest_season: HarvestSeason | None = None
    cultivar: str = ""
    grams_purchased: float | None = Field(default=None, gt=0)
    grams_remaining: float = Field(default=0, ge=0)
    price_paid: float | None = Field(default=None, ge=0)
    purchase_date: str | None = None
    storage_location: str = ""
    low_threshold_grams: float | None = Field(default=None, ge=0)
    notes: str = ""


class AutofillRequest(BaseModel):
    name: str


class AutofillSuggestion(BaseModel):
    """A Jev-matched category, plus the best origin guess to go with it."""

    catalogue_node_id: str
    origin: str = ""
