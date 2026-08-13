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
