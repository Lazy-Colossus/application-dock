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


# ── PUT /sheets/{id} — rename (Story 1.4) ─────────────────────────────────────


def test_rename_sheet_updates_the_name() -> None:
    sheet_id = _create().json()["id"]

    resp = client.put(f"/api/listies/sheets/{sheet_id}", json={"name": "Lisbon trip"})

    assert resp.status_code == 200
    assert resp.json()["name"] == "Lisbon trip"


def test_rename_sheet_persists() -> None:
    sheet_id = _create().json()["id"]
    client.put(f"/api/listies/sheets/{sheet_id}", json={"name": "Lisbon trip"})
    assert client.get("/api/listies/sheets").json()[0]["name"] == "Lisbon trip"


def test_rename_sheet_trims_the_name() -> None:
    sheet_id = _create().json()["id"]
    resp = client.put(f"/api/listies/sheets/{sheet_id}", json={"name": "  Lisbon  "})
    assert resp.json()["name"] == "Lisbon"


def test_rename_sheet_keeps_its_tabs() -> None:
    sheet_id = _create().json()["id"]
    body = client.put(f"/api/listies/sheets/{sheet_id}", json={"name": "Lisbon"}).json()
    assert len(body["tabs"][0]["columns"]) == 3


@pytest.mark.parametrize("name", ["", "   "])
def test_rename_sheet_rejects_a_blank_name(name: str) -> None:
    sheet_id = _create().json()["id"]
    assert client.put(f"/api/listies/sheets/{sheet_id}", json={"name": name}).status_code == 422


def test_rename_sheet_rejects_a_body_with_nothing_to_update() -> None:
    sheet_id = _create().json()["id"]
    assert client.put(f"/api/listies/sheets/{sheet_id}", json={}).status_code == 422


def test_rename_unknown_sheet_returns_404() -> None:
    resp = client.put("/api/listies/sheets/s-nope", json={"name": "x"})
    assert resp.status_code == 404
    assert "detail" in resp.json()


# ── DELETE /sheets/{id} (Story 1.4) ───────────────────────────────────────────


def test_delete_sheet_returns_204_with_no_body() -> None:
    sheet_id = _create().json()["id"]

    resp = client.delete(f"/api/listies/sheets/{sheet_id}")

    assert resp.status_code == 204
    assert resp.content == b""


def test_delete_sheet_removes_it_from_the_listing() -> None:
    sheet_id = _create().json()["id"]
    client.delete(f"/api/listies/sheets/{sheet_id}")
    assert client.get("/api/listies/sheets").json() == []


def test_delete_sheet_leaves_other_sheets_alone() -> None:
    first = _create(name="Keep").json()["id"]
    second = _create(name="Drop").json()["id"]

    client.delete(f"/api/listies/sheets/{second}")

    assert [s["id"] for s in client.get("/api/listies/sheets").json()] == [first]


def test_delete_unknown_sheet_returns_404() -> None:
    assert client.delete("/api/listies/sheets/s-nope").status_code == 404


def test_another_users_sheet_id_is_simply_not_found() -> None:
    sheet_id = _create().json()["id"]
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        assert client.put(f"/api/listies/sheets/{sheet_id}", json={"name": "x"}).status_code == 404
        assert client.delete(f"/api/listies/sheets/{sheet_id}").status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"


# ── GET /sheets/{id} (Story 2.1) ──────────────────────────────────────────────


def test_get_sheet_returns_tabs_columns_and_rows() -> None:
    sheet_id = _create().json()["id"]

    resp = client.get(f"/api/listies/sheets/{sheet_id}")

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == sheet_id
    assert len(body["tabs"]) == 1
    assert [c["name"] for c in body["tabs"][0]["columns"]] == ["Item", "Qty", "Due"]
    assert body["tabs"][0]["rows"] == []


def test_get_unknown_sheet_returns_404() -> None:
    resp = client.get("/api/listies/sheets/s-nope")
    assert resp.status_code == 404
    assert "detail" in resp.json()


def test_get_another_users_sheet_returns_404() -> None:
    sheet_id = _create().json()["id"]
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        assert client.get(f"/api/listies/sheets/{sheet_id}").status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"


# ── POST /sheets/{sid}/tabs/{tid}/rows (Story 2.1) ────────────────────────────


def _sheet_and_tab() -> tuple[str, str]:
    sheet = _create().json()
    return sheet["id"], sheet["tabs"][0]["id"]


def test_create_row_appends_an_empty_row() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    resp = client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={})

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"].startswith("r-")
    assert body["cells"] == {}
    assert body["order"] == 0
    assert body["created_at"] and body["updated_at"]


def test_create_row_appends_at_the_end_of_the_order() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={})

    second = client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={}).json()

    assert second["order"] == 1


def test_create_row_persists_into_the_sheet() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    row_id = client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={}).json()["id"]

    rows = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["rows"]

    assert [r["id"] for r in rows] == [row_id]


def test_create_row_accepts_initial_cells() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    columns = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["columns"]
    item_id = columns[0]["id"]

    body = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows",
        json={"cells": {item_id: "Tent"}},
    ).json()

    assert body["cells"] == {item_id: "Tent"}


def test_create_row_rejects_a_value_that_does_not_fit_its_column() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    qty_id = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["columns"][1]["id"]

    resp = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows",
        json={"cells": {qty_id: "not a number"}},
    )

    assert resp.status_code == 422


def test_create_row_rejects_an_unknown_column_id() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    resp = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows",
        json={"cells": {"c-nope": "Tent"}},
    )

    assert resp.status_code == 422


def test_create_row_prunes_empty_values() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    item_id = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["columns"][0]["id"]

    body = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows",
        json={"cells": {item_id: "   "}},
    ).json()

    assert body["cells"] == {}


def test_create_row_in_an_unknown_tab_returns_404() -> None:
    sheet_id, _ = _sheet_and_tab()
    resp = client.post(f"/api/listies/sheets/{sheet_id}/tabs/tb-nope/rows", json={})
    assert resp.status_code == 404


def test_create_row_in_an_unknown_sheet_returns_404() -> None:
    assert client.post("/api/listies/sheets/s-nope/tabs/tb-1/rows", json={}).status_code == 404


# ── PUT /sheets/{sid}/tabs/{tid}/rows/{rid} (Story 2.2) ───────────────────────


def _row_with_cells() -> tuple[str, str, str, list[str]]:
    """A sheet with one row holding a value in each of its three columns."""
    sheet_id, tab_id = _sheet_and_tab()
    columns = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["columns"]
    ids = [c["id"] for c in columns]
    row_id = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows",
        json={"cells": {ids[0]: "Tent", ids[1]: 1, ids[2]: "2026-09-02"}},
    ).json()["id"]
    return sheet_id, tab_id, row_id, ids


def _put_cells(sheet_id: str, tab_id: str, row_id: str, cells: dict):
    return client.put(
        f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows/{row_id}",
        json={"cells": cells},
    )


def test_update_row_sets_the_given_cell() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()

    resp = _put_cells(sheet_id, tab_id, row_id, {ids[0]: "Stove"})

    assert resp.status_code == 200
    assert resp.json()["cells"][ids[0]] == "Stove"


def test_update_row_merges_rather_than_replacing() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()

    body = _put_cells(sheet_id, tab_id, row_id, {ids[0]: "Stove"}).json()

    assert body["cells"][ids[1]] == 1
    assert body["cells"][ids[2]] == "2026-09-02"


def test_update_row_stamps_updated_at_without_touching_created_at() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()
    before = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["rows"][0]

    body = _put_cells(sheet_id, tab_id, row_id, {ids[0]: "Stove"}).json()

    assert body["created_at"] == before["created_at"]
    assert body["updated_at"] >= before["updated_at"]


def test_update_row_persists() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()
    _put_cells(sheet_id, tab_id, row_id, {ids[0]: "Stove"})

    rows = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["rows"]

    assert rows[0]["cells"][ids[0]] == "Stove"


def test_clearing_a_cell_stores_nothing_rather_than_zero_or_empty_string() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()

    body = _put_cells(sheet_id, tab_id, row_id, {ids[0]: None}).json()

    assert ids[0] not in body["cells"]
    assert body["cells"][ids[1]] == 1


def test_clearing_a_text_cell_with_whitespace_also_empties_it() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()

    body = _put_cells(sheet_id, tab_id, row_id, {ids[0]: "   "}).json()

    assert ids[0] not in body["cells"]


def test_zero_is_a_value_not_an_empty_cell() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()

    body = _put_cells(sheet_id, tab_id, row_id, {ids[1]: 0}).json()

    assert body["cells"][ids[1]] == 0


def test_update_row_rejects_a_value_that_does_not_fit_its_column() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()

    assert _put_cells(sheet_id, tab_id, row_id, {ids[1]: "abc"}).status_code == 422
    assert _put_cells(sheet_id, tab_id, row_id, {ids[2]: "31/02/2026"}).status_code == 422


def test_a_rejected_update_changes_nothing() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()

    _put_cells(sheet_id, tab_id, row_id, {ids[0]: "Stove", ids[1]: "abc"})

    rows = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["rows"]
    assert rows[0]["cells"][ids[0]] == "Tent"


def test_update_row_rejects_an_unknown_column_id() -> None:
    sheet_id, tab_id, row_id, _ = _row_with_cells()
    assert _put_cells(sheet_id, tab_id, row_id, {"c-nope": "x"}).status_code == 422


def test_update_unknown_row_returns_404() -> None:
    sheet_id, tab_id, _, ids = _row_with_cells()
    assert _put_cells(sheet_id, tab_id, "r-nope", {ids[0]: "x"}).status_code == 404


def test_update_row_in_another_users_sheet_returns_404() -> None:
    sheet_id, tab_id, row_id, ids = _row_with_cells()
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        assert _put_cells(sheet_id, tab_id, row_id, {ids[0]: "x"}).status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"
