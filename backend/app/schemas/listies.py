"""Pydantic v2 schemas for the Listies sheets app (Story 1.2).

The persisted document is one JSON file per user
(`DATA_DIR/listies/users/{username}.json`).

Cells are keyed by **column id**, never by index or name — that is what lets a
column be renamed, reordered or deleted without disturbing row data. An absent
key is equivalent to `null` ("not filled in"), which is distinct from `0` or
`""`; the service prunes `null` entries so files stay small.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

ColumnType = Literal["text", "number", "date", "place", "place_group"]


class Place(BaseModel):
    """A snapshot of somewhere, as Google Places returned it.

    Deliberately a snapshot and not a reference: nothing is re-fetched later,
    so a sheet still reads correctly if the API key is ever removed.
    """

    place_id: str
    name: str
    address: str = ""
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


# A cell holds a string (text / date), a number, a place, or nothing at all.
# Widening this was additive — a document written before places has no place
# cells, so `schema_version` stays 1.
CellValue = str | int | float | Place | None


class Column(BaseModel):
    id: str
    name: str
    type: ColumnType
    order: int = 0


class Row(BaseModel):
    id: str
    order: int = 0
    cells: dict[str, CellValue] = Field(default_factory=dict)
    created_at: str
    updated_at: str


# A tab's accent, stored as `#rrggbb`. Optional and additive: a document
# written before colours simply has no key, which reads as `None`.
HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"


class PlaceGroup(BaseModel):
    """A named, coloured bucket a row's places can belong to (Story 4.6).

    Groups live on the tab; a `place_group` cell stores only a group **id**, so
    recolouring or renaming a group updates every pin without touching a cell.
    """

    id: str
    name: str
    color: str = Field(pattern=HEX_COLOR_PATTERN)


class Tab(BaseModel):
    id: str
    name: str
    order: int = 0
    color: str | None = None
    # Optional and additive: a document written before groups has no key, which
    # reads as an empty list, so `schema_version` stays 1.
    place_groups: list[PlaceGroup] = Field(default_factory=list)
    columns: list[Column] = Field(default_factory=list)
    rows: list[Row] = Field(default_factory=list)


class Sheet(BaseModel):
    id: str
    name: str
    created_at: str
    tabs: list[Tab] = Field(default_factory=list)


class ListiesDoc(BaseModel):
    schema_version: int = 1
    sheets: list[Sheet] = Field(default_factory=list)


# Lightweight projection for the sheet picker (Story 1.3).
class SheetSummary(BaseModel):
    id: str
    name: str
    tab_count: int
    row_count: int
    created_at: str


# ── Request bodies ────────────────────────────────────────────────────────────


class ColumnSpec(BaseModel):
    """A column as the client defines it — the id and order are minted server-side."""

    name: str
    type: ColumnType


class CreateSheetRequest(BaseModel):
    name: str
    columns: list[ColumnSpec]


class UpdateSheetRequest(BaseModel):
    # All-optional so a later story adds a field without a new endpoint; only
    # provided fields are applied, and a body with nothing to apply is a 422.
    name: str | None = None


class CreateRowRequest(BaseModel):
    cells: dict[str, CellValue] | None = None


class UpdateRowRequest(BaseModel):
    # Only the provided keys are applied; a key set to null clears that cell.
    cells: dict[str, CellValue]


class AddColumnRequest(BaseModel):
    name: str
    type: ColumnType


class UpdateColumnRequest(BaseModel):
    name: str | None = None
    type: ColumnType | None = None


class ReorderColumnsRequest(BaseModel):
    # Must be a permutation of the tab's current column ids — a partial list
    # would silently drop columns.
    column_ids: list[str]


class CreateTabRequest(BaseModel):
    name: str
    # Exactly one of these: define the columns, or copy another tab's setup.
    columns: list[ColumnSpec] | None = None
    copy_columns_from: str | None = None


class UpdateTabRequest(BaseModel):
    name: str | None = None
    # An empty string clears the colour; `None` means "leave it alone", which
    # is why the two are not the same thing here.
    color: str | None = None
    # `None` means "leave the groups alone"; a list (even empty) replaces them.
    place_groups: list[PlaceGroup] | None = None


# ── places (Story 4.1) ────────────────────────────────────────────────────────


class PlaceResult(BaseModel):
    """One search hit, normalised down to what a place cell stores."""

    place_id: str
    name: str
    address: str
    lat: float
    lng: float


class MapsConfig(BaseModel):
    enabled: bool
    # Present only when enabled; the server key is never serialised anywhere.
    browser_key: str | None = None
