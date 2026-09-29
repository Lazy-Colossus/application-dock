"""Pydantic v2 schemas for the Tea Cabinet.

The persisted document is one JSON file per cabinet
(`DATA_DIR/tea/cabinets/{cabinet_id}.json`) holding the cabinet's teas, the
catalogue nodes its members added, their brewing sessions and their teaware. Who belongs to a
cabinet is recorded separately, in `DATA_DIR/tea/memberships.json`. Seeded nodes
are never written there — they ship in `app/data/tea_catalogue.json` and are
merged on read.

Only `name` and `catalogue_node_id` are required on a tea: adding a tea must
never feel like a form to fill in (FR-2).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, PositiveInt

from app.schemas.almanac import BrewingParameters
from app.schemas.tea_class import TeaClass
from app.schemas.tea_session import TeaSession
from app.schemas.teaware import Teaware

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
MIN_YEAR = 1900


class BrewingWrite(BaseModel):
    """A tea's own brewing parameters as the form sends them.

    Stricter than the Almanac's `BrewingParameters`, which describes curated seed
    data rather than input.
    """

    leaf_grams: float | None = Field(default=None, gt=0)
    water_temp_c: int | None = Field(default=None, ge=1, le=100)
    steep_seconds: list[PositiveInt] = Field(default_factory=list)


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
    image_url: str | None = None
    brewing: BrewingParameters | None = None
    created_at: str
    updated_at: str


class TeaView(Tea):
    """A tea as the API returns it: with its root class resolved server-side.

    The shelf groups on `class_id`, so classification and grouping cannot drift
    apart (AR-5).
    """

    class_id: TeaClass


class TeaDoc(BaseModel):
    schema_version: int = 6
    # Empty only on the implicit cabinet of a user who has not written anything yet.
    id: str = ""
    owner: str = ""
    teas: list[Tea] = Field(default_factory=list)
    catalogue_nodes: list[CatalogueNode] = Field(default_factory=list)
    sessions: list[TeaSession] = Field(default_factory=list)
    teaware: list[Teaware] = Field(default_factory=list)


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
    year: int | None = Field(default=None, ge=MIN_YEAR)
    harvest_season: HarvestSeason | None = None
    cultivar: str = ""
    grams_purchased: float | None = Field(default=None, gt=0)
    grams_remaining: float = Field(default=0, ge=0)
    price_paid: float | None = Field(default=None, ge=0)
    purchase_date: str | None = None
    storage_location: str = ""
    low_threshold_grams: float | None = Field(default=None, ge=0)
    notes: str = ""
    image_url: str | None = None
    brewing: BrewingWrite | None = None


class AutofillRequest(BaseModel):
    name: str


class AutofillSuggestion(BaseModel):
    """A Jev-matched category, plus the best origin guess to go with it."""

    catalogue_node_id: str
    origin: str = ""


class LabelScanSuggestion(BaseModel):
    """What a photo of a tea's label could fill in. Empty/None = not read."""

    name: str = ""
    catalogue_node_id: str | None = None
    origin: str = ""
    vendor: str = ""
    year: int | None = None
    cultivar: str = ""
    grams: float | None = None


class CabinetView(BaseModel):
    """The caller's cabinet as the Household sheet shows it. `members` includes the owner.

    `id` is None while the caller has no cabinet yet — they own an implicit empty one.
    """

    id: str | None
    owner: str
    members: list[str]
    is_owner: bool


class AddMemberRequest(BaseModel):
    username: str
