"""Pydantic v2 schemas for the Context-Switch todo-board app (Story 1.2).

The persisted document is one JSON file per user
(`DATA_DIR/context-switch/users/{username}.json`). Schema strictness is
intentionally simple: every persisted field is present with a default so a
freshly created list/todo validates without ceremony.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TodoStatus = Literal["active", "archived"]

# Grid bounds — a board is a fixed columns x rows page of pills (Story 2.2).
_GRID_MIN = 1
_GRID_MAX = 12


class Grid(BaseModel):
    columns: int = Field(default=3, ge=_GRID_MIN, le=_GRID_MAX)
    rows: int = Field(default=2, ge=_GRID_MIN, le=_GRID_MAX)


class TodoUpdate(BaseModel):
    id: str
    text: str
    created_at: str


class Todo(BaseModel):
    id: str
    header: str
    body: str = ""
    color: str = "#ffffff"
    status: TodoStatus = "active"
    order: int = 0
    created_at: str
    updated_at: str
    archived_at: str | None = None
    updates: list[TodoUpdate] = Field(default_factory=list)


class TodoList(BaseModel):
    id: str
    name: str
    grid: Grid = Field(default_factory=Grid)
    created_at: str
    todos: list[Todo] = Field(default_factory=list)


class ContextSwitchDoc(BaseModel):
    schema_version: int = 1
    lists: list[TodoList] = Field(default_factory=list)


# Lightweight projection for the list picker (Story 1.3).
class ListSummary(BaseModel):
    id: str
    name: str
    active_count: int


# ── Request bodies ────────────────────────────────────────────────────────────


class CreateListRequest(BaseModel):
    name: str


class UpdateListRequest(BaseModel):
    # All-optional so later stories add fields (e.g. `grid` in Story 2.2)
    # without a new endpoint; only provided fields are applied.
    name: str | None = None
