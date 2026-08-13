"""Integration tests for the Context-Switch list endpoints (Story 1.3)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app
from app.repositories import context_switch_repo

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(context_switch_repo.settings, "data_dir", tmp_path)


# ── GET /lists ────────────────────────────────────────────────────────────────


def test_list_lists_empty_for_new_user() -> None:
    resp = client.get("/api/context-switch/lists")
    assert resp.status_code == 200
    assert resp.json() == []


# ── POST /lists ───────────────────────────────────────────────────────────────


def test_create_list_returns_created_list() -> None:
    resp = client.post("/api/context-switch/lists", json={"name": "Work"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"].startswith("l-")
    assert body["name"] == "Work"
    assert body["todos"] == []
    assert body["grid"]["columns"] >= 1
    assert body["grid"]["rows"] >= 1


def test_create_then_list_shows_summary() -> None:
    client.post("/api/context-switch/lists", json={"name": "Work"})
    resp = client.get("/api/context-switch/lists")
    body = resp.json()
    assert len(body) == 1
    assert body[0]["name"] == "Work"
    assert body[0]["active_count"] == 0
    assert body[0]["id"].startswith("l-")


def test_create_list_trims_name() -> None:
    resp = client.post("/api/context-switch/lists", json={"name": "  Groceries  "})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Groceries"


def test_create_list_blank_name_rejected() -> None:
    resp = client.post("/api/context-switch/lists", json={"name": "   "})
    assert resp.status_code == 422


def test_create_second_list_keeps_first() -> None:
    client.post("/api/context-switch/lists", json={"name": "One"})
    client.post("/api/context-switch/lists", json={"name": "Two"})
    resp = client.get("/api/context-switch/lists")
    names = sorted(item["name"] for item in resp.json())
    assert names == ["One", "Two"]


# ── per-user isolation (auth-scoped file) ─────────────────────────────────────


def test_lists_are_isolated_per_user() -> None:
    client.post("/api/context-switch/lists", json={"name": "Mine"})

    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        resp = client.get("/api/context-switch/lists")
        assert resp.json() == []
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"


# ── PUT /lists/{id} — rename (Story 1.4) ──────────────────────────────────────


def _create(name: str) -> str:
    return client.post("/api/context-switch/lists", json={"name": name}).json()["id"]


def test_rename_list_updates_name() -> None:
    list_id = _create("Old")
    resp = client.put(f"/api/context-switch/lists/{list_id}", json={"name": "New"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "New"

    summaries = client.get("/api/context-switch/lists").json()
    assert summaries[0]["name"] == "New"


def test_rename_list_trims_name() -> None:
    list_id = _create("Old")
    resp = client.put(f"/api/context-switch/lists/{list_id}", json={"name": "  Trimmed  "})
    assert resp.json()["name"] == "Trimmed"


def test_rename_list_blank_name_rejected() -> None:
    list_id = _create("Old")
    resp = client.put(f"/api/context-switch/lists/{list_id}", json={"name": "   "})
    assert resp.status_code == 422


def test_rename_unknown_list_404() -> None:
    resp = client.put("/api/context-switch/lists/l-nope", json={"name": "X"})
    assert resp.status_code == 404


# ── DELETE /lists/{id} (Story 1.4) ────────────────────────────────────────────


def test_delete_list_removes_it() -> None:
    list_id = _create("Doomed")
    resp = client.delete(f"/api/context-switch/lists/{list_id}")
    assert resp.status_code == 204
    assert client.get("/api/context-switch/lists").json() == []


def test_delete_unknown_list_404() -> None:
    resp = client.delete("/api/context-switch/lists/l-nope")
    assert resp.status_code == 404


def test_delete_is_scoped_to_own_lists() -> None:
    list_id = _create("Mine")

    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        # Another user cannot delete a list that isn't in their own file.
        resp = client.delete(f"/api/context-switch/lists/{list_id}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"

    # The owner's list is untouched.
    assert len(client.get("/api/context-switch/lists").json()) == 1


# ── GET /lists/{id} + POST /lists/{id}/todos (Story 2.1) ──────────────────────


def _add_todo(list_id: str, header: str, **extra: object) -> dict:
    body: dict[str, object] = {"header": header, **extra}
    return client.post(f"/api/context-switch/lists/{list_id}/todos", json=body).json()


def test_get_list_returns_list_with_todos() -> None:
    list_id = _create("Work")
    resp = client.get(f"/api/context-switch/lists/{list_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == list_id
    assert body["name"] == "Work"
    assert body["todos"] == []


def test_get_unknown_list_404() -> None:
    assert client.get("/api/context-switch/lists/l-nope").status_code == 404


def test_add_todo_returns_active_todo() -> None:
    list_id = _create("Work")
    resp = client.post(
        f"/api/context-switch/lists/{list_id}/todos",
        json={"header": "Ship it", "body": "the thing", "color": "#aabbcc"},
    )
    assert resp.status_code == 200
    todo = resp.json()
    assert todo["id"].startswith("t-")
    assert todo["header"] == "Ship it"
    assert todo["body"] == "the thing"
    assert todo["color"] == "#aabbcc"
    assert todo["status"] == "active"
    assert todo["order"] == 0
    assert todo["updates"] == []
    assert todo["archived_at"] is None


def test_added_todo_appears_in_get_list() -> None:
    list_id = _create("Work")
    _add_todo(list_id, "First")
    todos = client.get(f"/api/context-switch/lists/{list_id}").json()["todos"]
    assert [t["header"] for t in todos] == ["First"]


def test_add_todo_appends_at_end_of_order() -> None:
    list_id = _create("Work")
    for header in ("A", "B", "C"):
        _add_todo(list_id, header)
    todos = client.get(f"/api/context-switch/lists/{list_id}").json()["todos"]
    assert [t["header"] for t in todos] == ["A", "B", "C"]
    assert [t["order"] for t in todos] == [0, 1, 2]


def test_add_todo_trims_header() -> None:
    list_id = _create("Work")
    assert _add_todo(list_id, "  Padded  ")["header"] == "Padded"


def test_add_todo_blank_header_rejected() -> None:
    list_id = _create("Work")
    resp = client.post(f"/api/context-switch/lists/{list_id}/todos", json={"header": "   "})
    assert resp.status_code == 422


def test_add_todo_empty_body_allowed() -> None:
    list_id = _create("Work")
    assert _add_todo(list_id, "No body")["body"] == ""


def test_add_todo_invalid_color_rejected() -> None:
    list_id = _create("Work")
    resp = client.post(
        f"/api/context-switch/lists/{list_id}/todos",
        json={"header": "X", "color": "red"},
    )
    assert resp.status_code == 422


def test_add_todo_unknown_list_404() -> None:
    resp = client.post("/api/context-switch/lists/l-nope/todos", json={"header": "X"})
    assert resp.status_code == 404


def test_todos_are_isolated_per_user() -> None:
    list_id = _create("Mine")
    _add_todo(list_id, "Secret")

    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        assert client.get(f"/api/context-switch/lists/{list_id}").status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"

    todos = client.get(f"/api/context-switch/lists/{list_id}").json()["todos"]
    assert [t["header"] for t in todos] == ["Secret"]


# ── PUT /lists/{id} — grid (Story 2.2) ────────────────────────────────────────


def test_grid_defaults_are_within_bounds() -> None:
    grid = client.get(f"/api/context-switch/lists/{_create('Work')}").json()["grid"]
    assert grid["columns"] >= 1
    assert grid["rows"] >= 1


def test_set_grid_persists() -> None:
    list_id = _create("Work")
    resp = client.put(
        f"/api/context-switch/lists/{list_id}",
        json={"grid": {"columns": 4, "rows": 3}},
    )
    assert resp.status_code == 200
    assert resp.json()["grid"] == {"columns": 4, "rows": 3}

    reloaded = client.get(f"/api/context-switch/lists/{list_id}").json()
    assert reloaded["grid"] == {"columns": 4, "rows": 3}


def test_set_grid_leaves_name_alone() -> None:
    list_id = _create("Work")
    client.put(f"/api/context-switch/lists/{list_id}", json={"grid": {"columns": 2, "rows": 2}})
    assert client.get(f"/api/context-switch/lists/{list_id}").json()["name"] == "Work"


def test_update_list_can_set_name_and_grid_together() -> None:
    list_id = _create("Work")
    resp = client.put(
        f"/api/context-switch/lists/{list_id}",
        json={"name": "Renamed", "grid": {"columns": 5, "rows": 1}},
    )
    body = resp.json()
    assert body["name"] == "Renamed"
    assert body["grid"] == {"columns": 5, "rows": 1}


def test_update_list_with_no_fields_rejected() -> None:
    resp = client.put(f"/api/context-switch/lists/{_create('Work')}", json={})
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "grid",
    [
        {"columns": 0, "rows": 2},
        {"columns": 2, "rows": 0},
        {"columns": 99, "rows": 2},
        {"columns": 2, "rows": 99},
        {"columns": -1, "rows": -1},
    ],
)
def test_out_of_bounds_grid_rejected(grid: dict[str, int]) -> None:
    resp = client.put(f"/api/context-switch/lists/{_create('Work')}", json={"grid": grid})
    assert resp.status_code == 422


def test_grid_does_not_limit_how_many_todos_exist() -> None:
    # "rows" is page height, not a cap — every todo stays reachable.
    list_id = _create("Work")
    client.put(f"/api/context-switch/lists/{list_id}", json={"grid": {"columns": 1, "rows": 1}})
    for header in ("A", "B", "C"):
        _add_todo(list_id, header)
    todos = client.get(f"/api/context-switch/lists/{list_id}").json()["todos"]
    assert [t["header"] for t in todos] == ["A", "B", "C"]


def test_active_count_reflects_added_todos() -> None:
    list_id = _create("Work")
    _add_todo(list_id, "One")
    _add_todo(list_id, "Two")
    summaries = client.get("/api/context-switch/lists").json()
    assert summaries[0]["active_count"] == 2


# ── PUT /lists/{id}/todos/{todo_id} (Story 2.4) ───────────────────────────────


def _edit(list_id: str, todo_id: str, **fields: object):
    return client.put(f"/api/context-switch/lists/{list_id}/todos/{todo_id}", json=fields)


def test_update_todo_changes_only_provided_fields() -> None:
    list_id = _create("Work")
    todo = _add_todo(list_id, "Old", body="old body", color="#aabbcc")

    updated = _edit(list_id, todo["id"], header="New").json()

    assert updated["header"] == "New"
    assert updated["body"] == "old body"
    assert updated["color"] == "#aabbcc"


def test_update_todo_bumps_updated_at_and_keeps_created_at() -> None:
    list_id = _create("Work")
    todo = _add_todo(list_id, "Old")

    updated = _edit(list_id, todo["id"], body="fresh").json()

    assert updated["updated_at"] >= todo["updated_at"]
    assert updated["created_at"] == todo["created_at"]


def test_update_todo_persists() -> None:
    list_id = _create("Work")
    todo = _add_todo(list_id, "Old")
    _edit(list_id, todo["id"], header="New", body="text", color="#112233")

    reloaded = client.get(f"/api/context-switch/lists/{list_id}").json()["todos"][0]
    assert reloaded["header"] == "New"
    assert reloaded["body"] == "text"
    assert reloaded["color"] == "#112233"


def test_update_todo_trims_header() -> None:
    list_id = _create("Work")
    todo = _add_todo(list_id, "Old")
    assert _edit(list_id, todo["id"], header="  Trimmed  ").json()["header"] == "Trimmed"


def test_update_todo_blank_header_rejected() -> None:
    list_id = _create("Work")
    todo = _add_todo(list_id, "Keep")

    assert _edit(list_id, todo["id"], header="   ").status_code == 422
    assert client.get(f"/api/context-switch/lists/{list_id}").json()["todos"][0]["header"] == "Keep"


def test_update_todo_blank_body_allowed() -> None:
    list_id = _create("Work")
    todo = _add_todo(list_id, "Header", body="something")
    assert _edit(list_id, todo["id"], body="").json()["body"] == ""


def test_update_todo_invalid_color_rejected() -> None:
    list_id = _create("Work")
    todo = _add_todo(list_id, "Header")
    assert _edit(list_id, todo["id"], color="blue").status_code == 422


def test_update_todo_with_no_fields_rejected() -> None:
    list_id = _create("Work")
    todo = _add_todo(list_id, "Header")
    assert _edit(list_id, todo["id"]).status_code == 422


def test_update_todo_does_not_change_order_or_status() -> None:
    list_id = _create("Work")
    _add_todo(list_id, "A")
    second = _add_todo(list_id, "B")

    updated = _edit(list_id, second["id"], header="B2").json()

    assert updated["order"] == 1
    assert updated["status"] == "active"


def test_update_unknown_todo_404() -> None:
    list_id = _create("Work")
    assert _edit(list_id, "t-nope", header="X").status_code == 404


def test_update_todo_in_unknown_list_404() -> None:
    assert _edit("l-nope", "t-nope", header="X").status_code == 404


def test_update_todo_is_scoped_to_own_lists() -> None:
    list_id = _create("Work")
    todo = _add_todo(list_id, "Mine")

    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        assert _edit(list_id, todo["id"], header="Yours").status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"

    assert client.get(f"/api/context-switch/lists/{list_id}").json()["todos"][0]["header"] == "Mine"


# ── POST /lists/{id}/todos/reorder (Story 2.3) ────────────────────────────────


def _headers(list_id: str) -> list[str]:
    return [t["header"] for t in client.get(f"/api/context-switch/lists/{list_id}").json()["todos"]]


def _seed_three() -> tuple[str, list[str]]:
    list_id = _create("Work")
    ids = [_add_todo(list_id, header)["id"] for header in ("A", "B", "C")]
    return list_id, ids


def _reorder(list_id: str, ordered_ids: list[str]):
    return client.post(
        f"/api/context-switch/lists/{list_id}/todos/reorder",
        json={"ordered_ids": ordered_ids},
    )


def test_reorder_rewrites_order_and_persists() -> None:
    list_id, ids = _seed_three()
    resp = _reorder(list_id, [ids[2], ids[0], ids[1]])

    assert resp.status_code == 200
    assert [t["header"] for t in resp.json()["todos"]] == ["C", "A", "B"]
    assert [t["order"] for t in resp.json()["todos"]] == [0, 1, 2]
    # Survives a reload.
    assert _headers(list_id) == ["C", "A", "B"]


def test_reorder_missing_id_rejected() -> None:
    list_id, ids = _seed_three()
    assert _reorder(list_id, ids[:2]).status_code == 422
    assert _headers(list_id) == ["A", "B", "C"]


def test_reorder_extra_id_rejected() -> None:
    list_id, ids = _seed_three()
    assert _reorder(list_id, [*ids, "t-ghost"]).status_code == 422
    assert _headers(list_id) == ["A", "B", "C"]


def test_reorder_duplicate_id_rejected() -> None:
    list_id, ids = _seed_three()
    assert _reorder(list_id, [ids[0], ids[0], ids[1]]).status_code == 422
    assert _headers(list_id) == ["A", "B", "C"]


def test_reorder_unknown_id_rejected() -> None:
    list_id, ids = _seed_three()
    assert _reorder(list_id, [ids[0], ids[1], "t-nope"]).status_code == 422
    assert _headers(list_id) == ["A", "B", "C"]


def test_reorder_id_from_another_list_rejected() -> None:
    list_id, ids = _seed_three()
    other_id = _add_todo(_create("Other"), "Elsewhere")["id"]
    assert _reorder(list_id, [ids[0], ids[1], other_id]).status_code == 422
    assert _headers(list_id) == ["A", "B", "C"]


def test_reorder_referencing_an_archived_todo_rejected() -> None:
    # Archiving lands in Story 2.6, so flip the status on disk to set this up.
    list_id, ids = _seed_three()
    doc = context_switch_repo.read_doc("test_user")
    archived = next(t for t in doc.lists[0].todos if t.id == ids[1])
    archived.status = "archived"
    context_switch_repo.write_doc("test_user", doc)

    assert _headers(list_id) == ["A", "C"]
    assert _reorder(list_id, ids).status_code == 422
    assert _headers(list_id) == ["A", "C"]


def test_reorder_ignores_archived_todos() -> None:
    list_id, ids = _seed_three()
    doc = context_switch_repo.read_doc("test_user")
    next(t for t in doc.lists[0].todos if t.id == ids[0]).status = "archived"
    context_switch_repo.write_doc("test_user", doc)

    resp = _reorder(list_id, [ids[2], ids[1]])
    assert resp.status_code == 200
    assert _headers(list_id) == ["C", "B"]


def test_reorder_unknown_list_404() -> None:
    assert _reorder("l-nope", []).status_code == 404


def test_reorder_of_empty_list_is_a_noop() -> None:
    list_id = _create("Work")
    assert _reorder(list_id, []).status_code == 200


def test_reorder_is_scoped_to_own_lists() -> None:
    list_id, ids = _seed_three()

    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        assert _reorder(list_id, ids).status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"

    assert _headers(list_id) == ["A", "B", "C"]
