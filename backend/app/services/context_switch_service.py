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
from app.schemas.context_switch import ContextSwitchDoc, ListSummary, TodoList


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id(prefix: str) -> str:
    """Mint a stable id like `l-ab12cd34` / `t-…` / `u-…`."""
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _active_count(lst: TodoList) -> int:
    return sum(1 for todo in lst.todos if todo.status == "active")


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
    return new_list


def _find_list(doc: ContextSwitchDoc, list_id: str) -> TodoList:
    for lst in doc.lists:
        if lst.id == list_id:
            return lst
    raise FileNotFoundError(f"list {list_id} not found")


def rename_list(username: str, list_id: str, name: str) -> TodoList:
    """Rename a list. Raises ValueError on a blank name, FileNotFoundError if absent."""
    clean = name.strip()
    if not clean:
        raise ValueError("List name must not be empty")

    doc = repo.read_doc(username)
    lst = _find_list(doc, list_id)
    lst.name = clean
    repo.write_doc(username, doc)
    return lst


def delete_list(username: str, list_id: str) -> None:
    """Delete a list and its todos. Raises FileNotFoundError if absent."""
    doc = repo.read_doc(username)
    remaining = [lst for lst in doc.lists if lst.id != list_id]
    if len(remaining) == len(doc.lists):
        raise FileNotFoundError(f"list {list_id} not found")
    doc.lists = remaining
    repo.write_doc(username, doc)
