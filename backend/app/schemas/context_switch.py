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

# Pill colors are stored as a single `#rrggbb` string; preset swatches and the
# custom picker both resolve to this one field (Story 2.1).
HEX_COLOR_PATTERN = r"^#[0-9a-fA-F]{6}$"


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
    # All-optional so each story adds a field without a new endpoint;
    # only provided fields are applied.
    name: str | None = None
    grid: Grid | None = None


class CreateTodoRequest(BaseModel):
    # A todo is header + color; its content lives in the append-only updates log
    # (Story 2.8 removed the old `body`). An optional first update seeds the log.
    header: str
    color: str = Field(default="#ffffff", pattern=HEX_COLOR_PATTERN)
    update: str | None = None


class UpdateTodoRequest(BaseModel):
    # The single mutation surface for a todo's fields: header/color and `status`
    # (archive, Story 2.6). All-optional — only provided fields apply. (`body`
    # was removed in Story 2.8.)
    header: str | None = None
    color: str | None = Field(default=None, pattern=HEX_COLOR_PATTERN)
    status: TodoStatus | None = None


class ReorderTodosRequest(BaseModel):
    # The complete active-todo id sequence, not a from/to pair — the service
    # can then reject anything that isn't a permutation (Story 2.3).
    ordered_ids: list[str]


class AddUpdateRequest(BaseModel):
    # A single timestamped log entry appended to a todo (Story 2.5). Blank text
    # is rejected in the service; the entry never touches header/body.
    text: str
