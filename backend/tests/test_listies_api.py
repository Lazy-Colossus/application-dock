"""Integration tests for the Listies sheet endpoints (Story 1.3)."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app
from app.repositories import listies_repo

client = TestClient(app)

COLS = [
    {"name": "Item", "type": "text"},
    {"name": "Qty", "type": "number"},
    {"name": "Due", "type": "date"},
]


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(listies_repo.settings, "data_dir", tmp_path)


def _create(name: str = "Trip planning", columns: list[dict] | None = None):
    return client.post(
        "/api/listies/sheets",
        json={"name": name, "columns": COLS if columns is None else columns},
    )


# ── GET /sheets ───────────────────────────────────────────────────────────────


def test_list_sheets_is_empty_for_a_new_user() -> None:
    resp = client.get("/api/listies/sheets")
    assert resp.status_code == 200
    assert resp.json() == []


def test_list_sheets_returns_summaries_not_full_payloads() -> None:
    _create()
    body = client.get("/api/listies/sheets").json()
    assert len(body) == 1
    assert body[0]["name"] == "Trip planning"
    assert body[0]["tab_count"] == 1
    assert body[0]["row_count"] == 0
    assert "tabs" not in body[0]


# ── POST /sheets ──────────────────────────────────────────────────────────────


def test_create_sheet_returns_the_sheet_with_a_first_tab() -> None:
    resp = _create()
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"].startswith("s-")
    assert body["name"] == "Trip planning"
    assert len(body["tabs"]) == 1
    assert body["tabs"][0]["id"].startswith("tb-")
    assert body["tabs"][0]["name"] == "Tab 1"
    assert body["tabs"][0]["rows"] == []


def test_create_sheet_seeds_the_first_tab_with_the_given_columns() -> None:
    columns = _create().json()["tabs"][0]["columns"]
    assert [c["name"] for c in columns] == ["Item", "Qty", "Due"]
    assert [c["type"] for c in columns] == ["text", "number", "date"]
    assert [c["order"] for c in columns] == [0, 1, 2]
    assert all(c["id"].startswith("c-") for c in columns)


def test_create_sheet_persists_it() -> None:
    sheet_id = _create().json()["id"]
    assert [s["id"] for s in client.get("/api/listies/sheets").json()] == [sheet_id]


def test_create_sheet_trims_the_name() -> None:
    assert _create(name="  Trip  ").json()["name"] == "Trip"


def test_create_sheet_trims_column_names() -> None:
    columns = _create(columns=[{"name": "  Item  ", "type": "text"}]).json()["tabs"][0]["columns"]
    assert columns[0]["name"] == "Item"


# ── POST /sheets: validation ──────────────────────────────────────────────────


@pytest.mark.parametrize("name", ["", "   "])
def test_create_sheet_rejects_a_blank_name(name: str) -> None:
    assert _create(name=name).status_code == 422


def test_create_sheet_rejects_zero_columns() -> None:
    assert _create(columns=[]).status_code == 422


def test_create_sheet_rejects_a_blank_column_name() -> None:
    assert _create(columns=[{"name": "  ", "type": "text"}]).status_code == 422


def test_create_sheet_rejects_duplicate_column_names() -> None:
    resp = _create(columns=[{"name": "Item", "type": "text"}, {"name": "item", "type": "text"}])
    assert resp.status_code == 422
    assert "detail" in resp.json()


def test_create_sheet_rejects_an_unknown_column_type() -> None:
    assert _create(columns=[{"name": "Item", "type": "colour"}]).status_code == 422


def test_a_rejected_create_writes_nothing() -> None:
    _create(name="")
    assert client.get("/api/listies/sheets").json() == []


# ── per-user isolation ────────────────────────────────────────────────────────


def test_sheets_are_isolated_per_user() -> None:
    _create()
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        assert client.get("/api/listies/sheets").json() == []
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"


# ── contract ──────────────────────────────────────────────────────────────────


def test_responses_are_direct_serializations_without_an_envelope() -> None:
    body = client.get("/api/listies/sheets").json()
    assert isinstance(body, list)
