"""Floor Planner models: one apartment document per sharing group."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

DEFAULT_COLS = 50
DEFAULT_ROWS = 40
EMPTY_CELL = ".."
CELL_CM = 20
SURFACE_CODES = frozenset(
    {EMPTY_CELL, "t0", "t1", "t2", "t3", "w0", "w1", "w2", "c0", "c1", "c2", "c3", "b0"}
)
FEATURE_CODES = frozenset({EMPTY_CELL, "wl", "wn", "dr", "fd"})
MIN_SIDE = 5  # 1 m
MAX_SIDE = 150  # 30 m
LABEL_MAX = 40
NAME_MAX = 40
NOTE_MAX = 200
SIDE_CM_MAX = 1000
CUSTOM_MAX = 20  # squares on each side: 4 m
PIECES_MAX = 300
BULK_MAX = 100
LAYOUT_NAME_MAX = 40
LAYOUTS_MAX = 20
APARTMENT_NAME_MAX = 60
APARTMENTS_MAX = 20  # per user, owned or shared
DEFAULT_APARTMENT_NAME = "My apartment"

Shape = Literal["rectangle", "round", "oval", "egg", "custom"]
Colour = Literal[
    "white", "black", "grey", "beige", "brown", "red", "orange", "yellow", "green", "blue", "purple"
]
Rotation = Literal[0, 90, 180, 270]


def empty_rows(cols: int, rows: int) -> list[str]:
    return [EMPTY_CELL * cols for _ in range(rows)]


class Label(BaseModel):
    id: str
    text: str
    col: int
    row: int


class Furniture(BaseModel):
    id: str
    name: str
    colour: Colour
    note: str = ""
    shape: Shape
    width_cm: int
    depth_cm: int
    cells: list[str] | None = None


class Placement(BaseModel):
    furniture_id: str
    x_cm: int
    y_cm: int
    rotation: Rotation = 0


class Layout(BaseModel):
    id: str
    name: str
    placements: list[Placement] = Field(default_factory=list)


def _first_layouts() -> list[Layout]:
    return [Layout(id=f"l_{uuid.uuid4().hex}", name="Layout A")]


class ApartmentDoc(BaseModel):
    """One apartment on disk. Membership lives in `memberships.json`, never here."""

    id: str
    owner: str
    name: str = DEFAULT_APARTMENT_NAME
    updated_at: datetime | None = None
    rev: int = 0
    plan_rev: int = 0
    plan_updated_by: str | None = None
    cols: int = DEFAULT_COLS
    rows: int = DEFAULT_ROWS
    surface: list[str] = Field(default_factory=lambda: empty_rows(DEFAULT_COLS, DEFAULT_ROWS))
    feature: list[str] = Field(default_factory=lambda: empty_rows(DEFAULT_COLS, DEFAULT_ROWS))
    labels: list[Label] = Field(default_factory=list)
    locked: bool = False
    furniture: list[Furniture] = Field(default_factory=list)
    layouts: list[Layout] = Field(default_factory=_first_layouts)


class ApartmentSummary(BaseModel):
    """One row of the apartment switcher."""

    id: str
    name: str
    owner: str
    members: list[str]
    is_owner: bool
    updated_at: datetime | None


class ApartmentView(ApartmentSummary):
    """One apartment as its members see it."""

    rev: int
    plan_rev: int
    cols: int
    rows: int
    surface: list[str]
    feature: list[str]
    labels: list[Label]
    locked: bool
    furniture: list[Furniture]
    layouts: list[Layout]


class ApartmentNameRequest(BaseModel):
    name: str


class RevRequest(BaseModel):
    base_rev: int


class PlanWriteRequest(BaseModel):
    base_rev: int
    cols: int = Field(ge=MIN_SIDE, le=MAX_SIDE)
    rows: int = Field(ge=MIN_SIDE, le=MAX_SIDE)
    surface: list[str]
    feature: list[str]
    labels: list[Label]


class PieceDraft(BaseModel):
    """A piece as the client sends it; the service cleans it into a `Furniture`."""

    name: str
    colour: Colour
    note: str = ""
    shape: Shape
    width_cm: int = 0
    depth_cm: int = 0
    cells: list[str] | None = None


class AddPiecesRequest(BaseModel):
    pieces: list[PieceDraft] = Field(min_length=1, max_length=BULK_MAX)


class LayoutNameRequest(BaseModel):
    name: str


class PlacementRequest(BaseModel):
    x_cm: int
    y_cm: int
    rotation: Rotation = 0


class AddMemberRequest(BaseModel):
    username: str
