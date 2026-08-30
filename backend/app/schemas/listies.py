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

ColumnType = Literal["text", "number", "date"]

# A cell holds a string (text / date), a number, or nothing at all.
CellValue = str | int | float | None


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


class Tab(BaseModel):
    id: str
    name: str
    order: int = 0
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
