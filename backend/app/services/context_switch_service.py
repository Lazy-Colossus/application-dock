"""Business logic for Context-Switch todo boards.

Operates on a single user's document (loaded/saved via `context_switch_repo`).
Raises stdlib exceptions only (`ValueError` for invalid input,
`FileNotFoundError` for a missing list/todo) — routers translate these to HTTP.
The `username` is always supplied by the router from the JWT; it is never taken
from request input.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from app.repositories import context_switch_repo as repo
from app.schemas.context_switch import (
    ContextSwitchDoc,
    Grid,
    ListSummary,
    Todo,
    TodoList,
    TodoUpdate,
)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id(prefix: str) -> str:
    """Mint a stable id like `l-ab12cd34` / `t-…` / `u-…`."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _active_count(lst: TodoList) -> int:
    return sum(1 for todo in lst.todos if todo.status == "active")


def _active_sorted(lst: TodoList) -> list[Todo]:
    """The list's active todos in board order."""
    return sorted((t for t in lst.todos if t.status == "active"), key=lambda t: t.order)


def _board_view(lst: TodoList) -> TodoList:
    """The list as the board sees it: active todos only, in order.

    Every endpoint returning a `TodoList` goes through this so callers never
    have to ask whether a given response includes archived todos. The archive
    gets its own view (Story 2.7).
    """
    return lst.model_copy(update={"todos": _active_sorted(lst)})


def list_lists(username: str) -> list[ListSummary]:
    """Return summaries (id, name, active todo count) of the user's lists."""
    doc = repo.read_doc(username)
    return [
        ListSummary(id=lst.id, name=lst.name, active_count=_active_count(lst)) for lst in doc.lists
    ]


def create_list(username: str, name: str) -> TodoList:
    """Create a new empty list and return it. Raises ValueError on a blank name."""
    clean = name.strip()
    if not clean:
        raise ValueError("List name must not be empty")

    doc = repo.read_doc(username)
    new_list = TodoList(id=_new_id("l"), name=clean, created_at=_now_iso(), todos=[])
    doc.lists.append(new_list)
    repo.write_doc(username, doc)
    return _board_view(new_list)


def _find_list(doc: ContextSwitchDoc, list_id: str) -> TodoList:
    for lst in doc.lists:
        if lst.id == list_id:
            return lst
    raise FileNotFoundError(f"list {list_id} not found")


def update_list(
    username: str,
    list_id: str,
    *,
    name: str | None = None,
    grid: Grid | None = None,
) -> TodoList:
    """Apply the provided fields to a list; absent fields are left alone.

    Raises ValueError on a blank name, FileNotFoundError if the list is absent.
    """
    doc = repo.read_doc(username)
    lst = _find_list(doc, list_id)

    if name is not None:
        clean = name.strip()
        if not clean:
            raise ValueError("List name must not be empty")
        lst.name = clean

    if grid is not None:
        lst.grid = grid

    repo.write_doc(username, doc)
    return _board_view(lst)


def delete_list(username: str, list_id: str) -> None:
    """Delete a list and its todos. Raises FileNotFoundError if absent."""
    doc = repo.read_doc(username)
    remaining = [lst for lst in doc.lists if lst.id != list_id]
    if len(remaining) == len(doc.lists):
        raise FileNotFoundError(f"list {list_id} not found")
    doc.lists = remaining
    repo.write_doc(username, doc)


def get_list(username: str, list_id: str) -> TodoList:
    """Return a list carrying only its active todos, in board order.

    Archived todos are excluded — the archive gets its own view (Story 2.7).
    """
    doc = repo.read_doc(username)
    return _board_view(_find_list(doc, list_id))


def add_todo(username: str, list_id: str, header: str, body: str, color: str) -> Todo:
    """Append a new active todo to a list and return it.

    Raises ValueError on a blank header, FileNotFoundError if the list is absent.
    """
    clean = header.strip()
    if not clean:
        raise ValueError("Todo header must not be empty")

    doc = repo.read_doc(username)
    lst = _find_list(doc, list_id)

    now = _now_iso()
    todo = Todo(
        id=_new_id("t"),
        header=clean,
        body=body,
        color=color,
        status="active",
        order=max((t.order for t in lst.todos if t.status == "active"), default=-1) + 1,
        created_at=now,
        updated_at=now,
    )
    lst.todos.append(todo)
    repo.write_doc(username, doc)
    return todo


def _find_todo(lst: TodoList, todo_id: str) -> Todo:
    for todo in lst.todos:
        if todo.id == todo_id:
            return todo
    raise FileNotFoundError(f"todo {todo_id} not found")


def update_todo(
    username: str,
    list_id: str,
    todo_id: str,
    *,
    header: str | None = None,
    body: str | None = None,
    color: str | None = None,
) -> Todo:
    """Apply the provided fields to a todo and bump `updated_at`.

    Absent fields are left alone. Raises ValueError on a blank header,
    FileNotFoundError if the list or todo is absent.
    """
    doc = repo.read_doc(username)
    todo = _find_todo(_find_list(doc, list_id), todo_id)

    if header is not None:
        clean = header.strip()
        if not clean:
            raise ValueError("Todo header must not be empty")
        todo.header = clean

    if body is not None:
        todo.body = body

    if color is not None:
        todo.color = color

    todo.updated_at = _now_iso()
    repo.write_doc(username, doc)
    return todo


def add_update(username: str, list_id: str, todo_id: str, text: str) -> Todo:
    """Append a timestamped log entry to a todo and return the todo.

    The entry is append-only: it never edits the todo's header/body and does not
    bump `updated_at` (that field tracks edits to the todo itself). Raises
    ValueError on blank text, FileNotFoundError if the list or todo is absent.
    """
    clean = text.strip()
    if not clean:
        raise ValueError("Update text must not be empty")

    doc = repo.read_doc(username)
    todo = _find_todo(_find_list(doc, list_id), todo_id)

    todo.updates.append(TodoUpdate(id=_new_id("u"), text=clean, created_at=_now_iso()))
    repo.write_doc(username, doc)
    return todo


def reorder_todos(username: str, list_id: str, ordered_ids: list[str]) -> TodoList:
    """Rewrite active todo `order` from a full ordered id sequence.

    `ordered_ids` must be a permutation of the list's current active todo ids —
    anything else (a duplicate, a gap, an archived or unknown id) raises
    ValueError before a single field is touched, so a rejected request is
    never a partial write. Raises FileNotFoundError if the list is absent.
    """
    doc = repo.read_doc(username)
    lst = _find_list(doc, list_id)

    active_ids = {t.id for t in lst.todos if t.status == "active"}
    if len(ordered_ids) != len(set(ordered_ids)):
        raise ValueError("ordered_ids must not repeat a todo")
    if set(ordered_ids) != active_ids:
        raise ValueError("ordered_ids must list exactly the active todos of this list")

    position = {todo_id: index for index, todo_id in enumerate(ordered_ids)}
    for todo in lst.todos:
        if todo.status == "active":
            todo.order = position[todo.id]

    repo.write_doc(username, doc)
    return _board_view(lst)
