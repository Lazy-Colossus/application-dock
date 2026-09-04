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


# ── DELETE /sheets/{sid}/tabs/{tid}/rows/{rid} (Story 2.4) ────────────────────


def _three_rows() -> tuple[str, str, list[str]]:
    sheet_id, tab_id = _sheet_and_tab()
    ids = [
        client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={}).json()["id"]
        for _ in range(3)
    ]
    return sheet_id, tab_id, ids


def test_delete_row_returns_204_with_no_body() -> None:
    sheet_id, tab_id, ids = _three_rows()

    resp = client.delete(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows/{ids[1]}")

    assert resp.status_code == 204
    assert resp.content == b""


def test_delete_row_removes_only_that_row() -> None:
    sheet_id, tab_id, ids = _three_rows()

    client.delete(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows/{ids[1]}")

    rows = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["rows"]
    assert [r["id"] for r in rows] == [ids[0], ids[2]]


def test_delete_row_keeps_the_remaining_rows_in_order() -> None:
    sheet_id, tab_id, ids = _three_rows()

    client.delete(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows/{ids[0]}")

    rows = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["rows"]
    orders = [r["order"] for r in rows]
    assert orders == sorted(orders)


def test_a_row_added_after_a_delete_still_sorts_last() -> None:
    """Order values must stay unique — appending must not collide with a survivor."""
    sheet_id, tab_id, ids = _three_rows()
    client.delete(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows/{ids[0]}")

    added = client.post(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows", json={}).json()

    rows = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["rows"]
    orders = [r["order"] for r in rows]
    assert len(set(orders)) == len(orders)
    assert added["order"] == max(orders)


def test_delete_unknown_row_returns_404() -> None:
    sheet_id, tab_id, _ = _three_rows()
    resp = client.delete(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows/r-nope")
    assert resp.status_code == 404
    assert "detail" in resp.json()


def test_delete_row_in_another_users_sheet_returns_404() -> None:
    sheet_id, tab_id, ids = _three_rows()
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        resp = client.delete(f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}/rows/{ids[0]}")
        assert resp.status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"


# ── columns (Story 2.5) ───────────────────────────────────────────────────────


def _tab_url(sheet_id: str, tab_id: str) -> str:
    return f"/api/listies/sheets/{sheet_id}/tabs/{tab_id}"


def _populated() -> tuple[str, str, list[str], str]:
    """A sheet with three typed columns and one row holding a value in each."""
    sheet_id, tab_id, row_id, ids = _row_with_cells()
    return sheet_id, tab_id, ids, row_id


def _columns(sheet_id: str) -> list[dict]:
    return client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["columns"]


def _rows(sheet_id: str) -> list[dict]:
    return client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["rows"]


# add


def test_add_column_appends_it_with_a_fresh_id() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    resp = client.post(
        f"{_tab_url(sheet_id, tab_id)}/columns", json={"name": "Notes", "type": "text"}
    )

    assert resp.status_code == 200
    columns = resp.json()["columns"]
    assert columns[-1]["name"] == "Notes"
    assert columns[-1]["id"].startswith("c-")
    assert columns[-1]["id"] not in ids
    assert columns[-1]["order"] == max(c["order"] for c in columns)


def test_add_column_leaves_existing_rows_untouched() -> None:
    sheet_id, tab_id, ids, _ = _populated()
    before = _rows(sheet_id)[0]["cells"]

    client.post(f"{_tab_url(sheet_id, tab_id)}/columns", json={"name": "Notes", "type": "text"})

    assert _rows(sheet_id)[0]["cells"] == before


@pytest.mark.parametrize("name", ["", "   "])
def test_add_column_rejects_a_blank_name(name: str) -> None:
    sheet_id, tab_id, _, _ = _populated()
    resp = client.post(f"{_tab_url(sheet_id, tab_id)}/columns", json={"name": name, "type": "text"})
    assert resp.status_code == 422


def test_add_column_rejects_a_duplicate_name_ignoring_case() -> None:
    sheet_id, tab_id, _, _ = _populated()
    resp = client.post(
        f"{_tab_url(sheet_id, tab_id)}/columns", json={"name": "item", "type": "text"}
    )
    assert resp.status_code == 422


def test_add_column_rejects_an_unknown_type() -> None:
    sheet_id, tab_id, _, _ = _populated()
    resp = client.post(
        f"{_tab_url(sheet_id, tab_id)}/columns", json={"name": "X", "type": "colour"}
    )
    assert resp.status_code == 422


# rename


def test_rename_column_changes_only_the_name() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    resp = client.put(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={"name": "Gear"})

    assert resp.status_code == 200
    assert resp.json()["columns"][0]["name"] == "Gear"
    assert resp.json()["columns"][0]["type"] == "text"


def test_rename_column_does_not_disturb_row_data() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    client.put(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={"name": "Gear"})

    assert _rows(sheet_id)[0]["cells"][ids[0]] == "Tent"


def test_rename_column_rejects_a_blank_or_duplicate_name() -> None:
    sheet_id, tab_id, ids, _ = _populated()
    assert (
        client.put(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={"name": " "}).status_code
        == 422
    )
    assert (
        client.put(
            f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={"name": "qty"}
        ).status_code
        == 422
    )


def test_renaming_a_column_to_its_own_name_is_allowed() -> None:
    sheet_id, tab_id, ids, _ = _populated()
    resp = client.put(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={"name": "Item"})
    assert resp.status_code == 200


# retype


def test_retype_to_text_keeps_the_values_as_strings() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    resp = client.put(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[1]}", json={"type": "text"})

    assert resp.status_code == 200
    assert resp.json()["rows"][0]["cells"][ids[1]] == "1"


def test_retype_to_number_blanks_what_cannot_parse() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={"type": "number"}
    ).json()

    assert ids[0] not in body["rows"][0]["cells"]
    assert body["columns"][0]["type"] == "number"


def test_retype_to_number_keeps_a_numeric_string() -> None:
    sheet_id, tab_id, ids, _ = _populated()
    row_id = _rows(sheet_id)[0]["id"]
    _put_cells(sheet_id, tab_id, row_id, {ids[0]: "12"})

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={"type": "number"}
    ).json()

    assert body["rows"][0]["cells"][ids[0]] == 12


def test_retype_to_date_blanks_what_cannot_parse() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={"type": "date"}
    ).json()

    assert ids[0] not in body["rows"][0]["cells"]


def test_retype_leaves_other_columns_alone() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={"type": "number"}
    ).json()

    assert body["rows"][0]["cells"][ids[2]] == "2026-09-02"


def test_update_column_rejects_a_body_with_nothing_to_change() -> None:
    sheet_id, tab_id, ids, _ = _populated()
    assert client.put(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}", json={}).status_code == 422


# reorder


def test_reorder_columns_persists_the_new_order() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    resp = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/order",
        json={"column_ids": [ids[2], ids[0], ids[1]]},
    )

    assert resp.status_code == 200
    ordered = sorted(resp.json()["columns"], key=lambda c: c["order"])
    assert [c["id"] for c in ordered] == [ids[2], ids[0], ids[1]]
    assert [c["id"] for c in sorted(_columns(sheet_id), key=lambda c: c["order"])] == [
        ids[2],
        ids[0],
        ids[1],
    ]


def test_reorder_does_not_touch_row_data() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/order", json={"column_ids": [ids[2], ids[1], ids[0]]}
    )

    assert _rows(sheet_id)[0]["cells"][ids[0]] == "Tent"


@pytest.mark.parametrize(
    "make_payload",
    [
        lambda ids: ids[:2],  # missing one
        lambda ids: [*ids, "c-extra"],  # an id that is not in the tab
        lambda ids: [ids[0], ids[0], ids[1]],  # duplicated
    ],
)
def test_reorder_rejects_anything_that_is_not_a_permutation(make_payload) -> None:
    sheet_id, tab_id, ids, _ = _populated()

    resp = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/order",
        json={"column_ids": make_payload(ids)},
    )

    assert resp.status_code == 422
    assert [c["id"] for c in sorted(_columns(sheet_id), key=lambda c: c["order"])] == ids


def test_order_is_not_mistaken_for_a_column_id() -> None:
    """The literal path segment must win over the {column_id} route."""
    sheet_id, tab_id, ids, _ = _populated()
    resp = client.put(f"{_tab_url(sheet_id, tab_id)}/columns/order", json={"column_ids": ids})
    assert resp.status_code == 200


# delete


def test_delete_column_removes_it_and_its_values() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    resp = client.delete(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}")

    assert resp.status_code == 204
    assert [c["id"] for c in _columns(sheet_id)] == ids[1:]
    assert ids[0] not in _rows(sheet_id)[0]["cells"]


def test_delete_column_keeps_the_other_values() -> None:
    sheet_id, tab_id, ids, _ = _populated()

    client.delete(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}")

    assert _rows(sheet_id)[0]["cells"][ids[1]] == 1


def test_the_last_column_cannot_be_deleted() -> None:
    sheet_id, tab_id, ids, _ = _populated()
    client.delete(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}")
    client.delete(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[1]}")

    resp = client.delete(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[2]}")

    assert resp.status_code == 422
    assert len(_columns(sheet_id)) == 1


def test_a_column_added_after_a_delete_still_sorts_last() -> None:
    sheet_id, tab_id, ids, _ = _populated()
    client.delete(f"{_tab_url(sheet_id, tab_id)}/columns/{ids[0]}")

    body = client.post(
        f"{_tab_url(sheet_id, tab_id)}/columns", json={"name": "Notes", "type": "text"}
    )

    orders = [c["order"] for c in body.json()["columns"]]
    assert len(set(orders)) == len(orders)


# unknown ids


@pytest.mark.parametrize(
    "call",
    [
        lambda url: client.put(f"{url}/columns/c-nope", json={"name": "x"}),
        lambda url: client.delete(f"{url}/columns/c-nope"),
    ],
)
def test_unknown_column_id_returns_404(call) -> None:
    sheet_id, tab_id, _, _ = _populated()
    assert call(_tab_url(sheet_id, tab_id)).status_code == 404


def test_column_operations_on_another_users_sheet_return_404() -> None:
    sheet_id, tab_id, ids, _ = _populated()
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        url = _tab_url(sheet_id, tab_id)
        assert client.post(f"{url}/columns", json={"name": "X", "type": "text"}).status_code == 404
        assert client.put(f"{url}/columns/{ids[0]}", json={"name": "X"}).status_code == 404
        assert client.delete(f"{url}/columns/{ids[0]}").status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"


# ── POST /sheets/{sid}/tabs (Story 3.1) ───────────────────────────────────────


def _tabs(sheet_id: str) -> list[dict]:
    return client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"]


def test_create_tab_appends_it_with_its_own_columns() -> None:
    sheet_id, _ = _sheet_and_tab()

    resp = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": "Flights", "columns": [{"name": "Airline", "type": "text"}]},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"].startswith("tb-")
    assert body["name"] == "Flights"
    assert body["rows"] == []
    assert [c["name"] for c in body["columns"]] == ["Airline"]
    assert body["columns"][0]["id"].startswith("c-")


def test_create_tab_goes_to_the_end_of_the_tab_order() -> None:
    sheet_id, _ = _sheet_and_tab()

    body = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": "Flights", "columns": [{"name": "Airline", "type": "text"}]},
    ).json()

    assert body["order"] == max(t["order"] for t in _tabs(sheet_id))


def test_create_tab_persists_alongside_the_existing_tab() -> None:
    sheet_id, first_tab = _sheet_and_tab()

    client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": "Flights", "columns": [{"name": "Airline", "type": "text"}]},
    )

    assert [t["id"] for t in _tabs(sheet_id)][0] == first_tab
    assert len(_tabs(sheet_id)) == 2


def test_create_tab_does_not_touch_the_other_tabs_columns() -> None:
    sheet_id, _ = _sheet_and_tab()

    client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": "Flights", "columns": [{"name": "Airline", "type": "text"}]},
    )

    assert [c["name"] for c in _tabs(sheet_id)[0]["columns"]] == ["Item", "Qty", "Due"]


def test_create_tab_trims_the_name() -> None:
    sheet_id, _ = _sheet_and_tab()
    body = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": "  Flights  ", "columns": [{"name": "Airline", "type": "text"}]},
    ).json()
    assert body["name"] == "Flights"


def test_a_duplicate_tab_name_is_allowed_tabs_are_identified_by_id() -> None:
    sheet_id, _ = _sheet_and_tab()

    resp = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": "Tab 1", "columns": [{"name": "Airline", "type": "text"}]},
    )

    assert resp.status_code == 200
    assert len(_tabs(sheet_id)) == 2


@pytest.mark.parametrize("name", ["", "   "])
def test_create_tab_rejects_a_blank_name(name: str) -> None:
    sheet_id, _ = _sheet_and_tab()
    resp = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": name, "columns": [{"name": "Airline", "type": "text"}]},
    )
    assert resp.status_code == 422


def test_create_tab_rejects_zero_columns() -> None:
    sheet_id, _ = _sheet_and_tab()
    resp = client.post(f"/api/listies/sheets/{sheet_id}/tabs", json={"name": "X", "columns": []})
    assert resp.status_code == 422


def test_create_tab_rejects_duplicate_column_names() -> None:
    sheet_id, _ = _sheet_and_tab()
    resp = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={
            "name": "X",
            "columns": [{"name": "A", "type": "text"}, {"name": "a", "type": "text"}],
        },
    )
    assert resp.status_code == 422


def test_create_tab_in_an_unknown_sheet_returns_404() -> None:
    resp = client.post(
        "/api/listies/sheets/s-nope/tabs",
        json={"name": "X", "columns": [{"name": "A", "type": "text"}]},
    )
    assert resp.status_code == 404


def test_create_tab_in_another_users_sheet_returns_404() -> None:
    sheet_id, _ = _sheet_and_tab()
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        resp = client.post(
            f"/api/listies/sheets/{sheet_id}/tabs",
            json={"name": "X", "columns": [{"name": "A", "type": "text"}]},
        )
        assert resp.status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"


# ── copying a tab's column setup (Story 3.2) ──────────────────────────────────


def _copy_tab(sheet_id: str, source_tab_id: str, name: str = "Copy"):
    return client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": name, "copy_columns_from": source_tab_id},
    )


def test_copying_reproduces_the_names_types_and_order() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    body = _copy_tab(sheet_id, tab_id).json()

    source = _tabs(sheet_id)[0]["columns"]
    assert [(c["name"], c["type"], c["order"]) for c in body["columns"]] == [
        (c["name"], c["type"], c["order"]) for c in source
    ]


def test_copying_mints_fresh_column_ids() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    source_ids = {c["id"] for c in _tabs(sheet_id)[0]["columns"]}

    body = _copy_tab(sheet_id, tab_id).json()

    assert {c["id"] for c in body["columns"]}.isdisjoint(source_ids)
    assert all(c["id"].startswith("c-") for c in body["columns"])


def test_copying_brings_no_rows() -> None:
    sheet_id, tab_id, _, _ = _populated()

    body = _copy_tab(sheet_id, tab_id).json()

    assert body["rows"] == []


def test_a_copied_tab_is_a_snapshot_not_a_link() -> None:
    """Renaming a column in one tab must not touch the other."""
    sheet_id, tab_id = _sheet_and_tab()
    copy = _copy_tab(sheet_id, tab_id).json()
    source_column = _tabs(sheet_id)[0]["columns"][0]["id"]

    client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{source_column}",
        json={"name": "Renamed"},
    )

    after = next(t for t in _tabs(sheet_id) if t["id"] == copy["id"])
    assert after["columns"][0]["name"] == "Item"


def test_deleting_a_column_in_the_source_leaves_the_copy_intact() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    copy = _copy_tab(sheet_id, tab_id).json()
    source_column = _tabs(sheet_id)[0]["columns"][0]["id"]

    client.delete(f"{_tab_url(sheet_id, tab_id)}/columns/{source_column}")

    after = next(t for t in _tabs(sheet_id) if t["id"] == copy["id"])
    assert len(after["columns"]) == 3


def test_copying_from_a_tab_that_is_not_in_this_sheet_returns_404() -> None:
    sheet_id, _ = _sheet_and_tab()
    assert _copy_tab(sheet_id, "tb-nope").status_code == 404


def test_supplying_both_columns_and_a_copy_source_is_rejected() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    resp = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={
            "name": "X",
            "columns": [{"name": "A", "type": "text"}],
            "copy_columns_from": tab_id,
        },
    )

    assert resp.status_code == 422


def test_supplying_neither_columns_nor_a_copy_source_is_rejected() -> None:
    sheet_id, _ = _sheet_and_tab()
    resp = client.post(f"/api/listies/sheets/{sheet_id}/tabs", json={"name": "X"})
    assert resp.status_code == 422


def test_a_rejected_tab_creation_writes_nothing() -> None:
    sheet_id, _ = _sheet_and_tab()
    client.post(f"/api/listies/sheets/{sheet_id}/tabs", json={"name": "X"})
    assert len(_tabs(sheet_id)) == 1


# ── PUT / DELETE /sheets/{sid}/tabs/{tid} (Story 3.3) ─────────────────────────


def _second_tab(sheet_id: str) -> str:
    return client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": "Flights", "columns": [{"name": "Airline", "type": "text"}]},
    ).json()["id"]


def test_rename_tab_updates_the_name() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    resp = client.put(_tab_url(sheet_id, tab_id), json={"name": "Packing"})

    assert resp.status_code == 200
    assert resp.json()["name"] == "Packing"
    assert _tabs(sheet_id)[0]["name"] == "Packing"


def test_rename_tab_trims_the_name() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    assert client.put(_tab_url(sheet_id, tab_id), json={"name": "  P  "}).json()["name"] == "P"


def test_rename_tab_keeps_its_columns_and_rows() -> None:
    sheet_id, tab_id, _, _ = _populated()

    body = client.put(_tab_url(sheet_id, tab_id), json={"name": "Packing"}).json()

    assert len(body["columns"]) == 3
    assert len(body["rows"]) == 1


@pytest.mark.parametrize("name", ["", "   "])
def test_rename_tab_rejects_a_blank_name(name: str) -> None:
    sheet_id, tab_id = _sheet_and_tab()
    assert client.put(_tab_url(sheet_id, tab_id), json={"name": name}).status_code == 422


def test_rename_tab_rejects_a_body_with_nothing_to_change() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    assert client.put(_tab_url(sheet_id, tab_id), json={}).status_code == 422


def test_rename_unknown_tab_returns_404() -> None:
    sheet_id, _ = _sheet_and_tab()
    assert client.put(_tab_url(sheet_id, "tb-nope"), json={"name": "x"}).status_code == 404


def test_delete_tab_removes_it_with_its_rows() -> None:
    sheet_id, first = _sheet_and_tab()
    second = _second_tab(sheet_id)

    resp = client.delete(_tab_url(sheet_id, second))

    assert resp.status_code == 204
    assert resp.content == b""
    assert [t["id"] for t in _tabs(sheet_id)] == [first]


def test_delete_tab_keeps_the_remaining_tabs_in_order() -> None:
    sheet_id, first = _sheet_and_tab()
    second = _second_tab(sheet_id)
    third = _second_tab(sheet_id)

    client.delete(_tab_url(sheet_id, second))

    orders = [t["order"] for t in _tabs(sheet_id)]
    assert orders == sorted(orders)
    assert [t["id"] for t in _tabs(sheet_id)] == [first, third]


def test_a_tab_added_after_a_delete_still_sorts_last() -> None:
    sheet_id, first = _sheet_and_tab()
    second = _second_tab(sheet_id)
    client.delete(_tab_url(sheet_id, first))

    added = client.post(
        f"/api/listies/sheets/{sheet_id}/tabs",
        json={"name": "New", "columns": [{"name": "A", "type": "text"}]},
    ).json()

    orders = [t["order"] for t in _tabs(sheet_id)]
    assert len(set(orders)) == len(orders)
    assert added["order"] == max(orders)
    assert second in [t["id"] for t in _tabs(sheet_id)]


def test_the_last_tab_cannot_be_deleted() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    resp = client.delete(_tab_url(sheet_id, tab_id))

    assert resp.status_code == 422
    assert "detail" in resp.json()
    assert len(_tabs(sheet_id)) == 1


def test_delete_unknown_tab_returns_404() -> None:
    sheet_id, _ = _sheet_and_tab()
    _second_tab(sheet_id)
    assert client.delete(_tab_url(sheet_id, "tb-nope")).status_code == 404


def test_tab_operations_on_another_users_sheet_return_404() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    _second_tab(sheet_id)
    app.dependency_overrides[get_current_user] = lambda: "someone_else"
    try:
        assert client.put(_tab_url(sheet_id, tab_id), json={"name": "x"}).status_code == 404
        assert client.delete(_tab_url(sheet_id, tab_id)).status_code == 404
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"


# ── tab colour (UI follow-up) ─────────────────────────────────────────────────


def test_a_new_tab_has_no_colour_until_one_is_chosen() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    assert _tabs(sheet_id)[0]["color"] is None


def test_set_a_tab_colour() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    resp = client.put(_tab_url(sheet_id, tab_id), json={"color": "#ffcc00"})

    assert resp.status_code == 200
    assert resp.json()["color"] == "#ffcc00"
    assert _tabs(sheet_id)[0]["color"] == "#ffcc00"


def test_setting_a_colour_leaves_the_name_alone() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    client.put(_tab_url(sheet_id, tab_id), json={"name": "Packing"})

    body = client.put(_tab_url(sheet_id, tab_id), json={"color": "#ffcc00"}).json()

    assert body["name"] == "Packing"


def test_renaming_leaves_the_colour_alone() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    client.put(_tab_url(sheet_id, tab_id), json={"color": "#ffcc00"})

    body = client.put(_tab_url(sheet_id, tab_id), json={"name": "Packing"}).json()

    assert body["color"] == "#ffcc00"


def test_name_and_colour_can_be_set_together() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    body = client.put(
        _tab_url(sheet_id, tab_id), json={"name": "Packing", "color": "#00aaff"}
    ).json()

    assert (body["name"], body["color"]) == ("Packing", "#00aaff")


def test_a_tab_colour_can_be_cleared() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    client.put(_tab_url(sheet_id, tab_id), json={"color": "#ffcc00"})

    body = client.put(_tab_url(sheet_id, tab_id), json={"color": ""}).json()

    assert body["color"] is None


@pytest.mark.parametrize("colour", ["red", "#fff", "#12345", "ffcc00", "#gggggg"])
def test_a_colour_that_is_not_a_hex_triple_is_rejected(colour: str) -> None:
    sheet_id, tab_id = _sheet_and_tab()
    assert client.put(_tab_url(sheet_id, tab_id), json={"color": colour}).status_code == 422


def test_a_document_written_before_colours_still_reads() -> None:
    """The field is additive — an older file has no `color` key at all."""
    from app.repositories import listies_repo
    from app.schemas.listies import ListiesDoc

    raw = {
        "schema_version": 1,
        "sheets": [
            {
                "id": "s-old",
                "name": "Old",
                "created_at": "t",
                "tabs": [{"id": "tb-old", "name": "Tab 1", "order": 0, "columns": [], "rows": []}],
            }
        ],
    }
    doc = ListiesDoc.model_validate(listies_repo.migrate(raw))
    assert doc.sheets[0].tabs[0].color is None


# ── the `place` column type (Story 4.2) ───────────────────────────────────────

PLACE = {
    "place_id": "ChIJ_blue_bottle",
    "name": "Blue Bottle",
    "address": "Rua Nova 12, Lisboa",
    "lat": 38.7107,
    "lng": -9.1373,
}


def _sheet_with_place() -> tuple[str, str, str, str]:
    """A sheet with a text column and a place column, and one row."""
    resp = _create(columns=[{"name": "Cafe", "type": "text"}, {"name": "Where", "type": "place"}])
    sheet = resp.json()
    tab_id = sheet["tabs"][0]["id"]
    text_id, place_id = (c["id"] for c in sheet["tabs"][0]["columns"])
    row_id = client.post(f"/api/listies/sheets/{sheet['id']}/tabs/{tab_id}/rows", json={}).json()[
        "id"
    ]
    return sheet["id"], tab_id, row_id, place_id


def test_a_place_column_can_be_created() -> None:
    resp = _create(columns=[{"name": "Where", "type": "place"}])

    assert resp.status_code == 200
    assert resp.json()["tabs"][0]["columns"][0]["type"] == "place"


def test_a_place_column_can_be_added_to_an_existing_tab() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    resp = client.post(
        f"{_tab_url(sheet_id, tab_id)}/columns", json={"name": "Where", "type": "place"}
    )

    assert resp.status_code == 200
    assert resp.json()["columns"][-1]["type"] == "place"


def test_a_place_can_be_stored_in_a_place_cell() -> None:
    sheet_id, tab_id, row_id, place_col = _sheet_with_place()

    resp = _put_cells(sheet_id, tab_id, row_id, {place_col: PLACE})

    assert resp.status_code == 200
    assert resp.json()["cells"][place_col] == PLACE


def test_a_stored_place_survives_a_reread() -> None:
    sheet_id, tab_id, row_id, place_col = _sheet_with_place()
    _put_cells(sheet_id, tab_id, row_id, {place_col: PLACE})

    rows = client.get(f"/api/listies/sheets/{sheet_id}").json()["tabs"][0]["rows"]

    assert rows[0]["cells"][place_col]["name"] == "Blue Bottle"
    assert rows[0]["cells"][place_col]["lat"] == 38.7107


def test_a_place_cell_can_be_cleared() -> None:
    sheet_id, tab_id, row_id, place_col = _sheet_with_place()
    _put_cells(sheet_id, tab_id, row_id, {place_col: PLACE})

    body = _put_cells(sheet_id, tab_id, row_id, {place_col: None}).json()

    assert place_col not in body["cells"]


def test_a_scalar_is_rejected_in_a_place_column() -> None:
    sheet_id, tab_id, row_id, place_col = _sheet_with_place()

    assert _put_cells(sheet_id, tab_id, row_id, {place_col: "Blue Bottle"}).status_code == 422
    assert _put_cells(sheet_id, tab_id, row_id, {place_col: 42}).status_code == 422


def test_a_place_is_rejected_in_a_text_column() -> None:
    sheet = _create(
        columns=[{"name": "Cafe", "type": "text"}, {"name": "Where", "type": "place"}]
    ).json()
    tab_id = sheet["tabs"][0]["id"]
    text_col = sheet["tabs"][0]["columns"][0]["id"]
    row_id = client.post(f"/api/listies/sheets/{sheet['id']}/tabs/{tab_id}/rows", json={}).json()[
        "id"
    ]

    assert _put_cells(sheet["id"], tab_id, row_id, {text_col: PLACE}).status_code == 422


@pytest.mark.parametrize(
    "bad",
    [
        {**PLACE, "lat": 91},
        {**PLACE, "lat": -91},
        {**PLACE, "lng": 181},
        {**PLACE, "lng": -181},
    ],
)
def test_coordinates_outside_the_world_are_rejected(bad: dict) -> None:
    sheet_id, tab_id, row_id, place_col = _sheet_with_place()
    assert _put_cells(sheet_id, tab_id, row_id, {place_col: bad}).status_code == 422


@pytest.mark.parametrize("missing", ["place_id", "name", "lat", "lng"])
def test_an_incomplete_place_is_rejected(missing: str) -> None:
    sheet_id, tab_id, row_id, place_col = _sheet_with_place()
    bad = {k: v for k, v in PLACE.items() if k != missing}

    assert _put_cells(sheet_id, tab_id, row_id, {place_col: bad}).status_code == 422


def test_a_place_without_an_address_is_allowed() -> None:
    """Google does not always return a formatted address."""
    sheet_id, tab_id, row_id, place_col = _sheet_with_place()
    body = _put_cells(sheet_id, tab_id, row_id, {place_col: {**PLACE, "address": ""}})
    assert body.status_code == 200


# retyping to and from place


def test_retyping_a_place_column_to_text_keeps_the_place_name() -> None:
    sheet_id, tab_id, row_id, place_col = _sheet_with_place()
    _put_cells(sheet_id, tab_id, row_id, {place_col: PLACE})

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{place_col}", json={"type": "text"}
    ).json()

    assert body["rows"][0]["cells"][place_col] == "Blue Bottle"


@pytest.mark.parametrize("target", ["number", "date"])
def test_retyping_a_place_column_to_a_scalar_type_blanks_it(target: str) -> None:
    sheet_id, tab_id, row_id, place_col = _sheet_with_place()
    _put_cells(sheet_id, tab_id, row_id, {place_col: PLACE})

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{place_col}", json={"type": target}
    ).json()

    assert place_col not in body["rows"][0]["cells"]


def test_retyping_a_text_column_to_place_blanks_it() -> None:
    """A place cannot be reconstructed from a string."""
    sheet_id, tab_id, row_id, _ = _sheet_with_place()
    text_col = _columns(sheet_id)[0]["id"]
    _put_cells(sheet_id, tab_id, row_id, {text_col: "Blue Bottle"})

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{text_col}", json={"type": "place"}
    ).json()

    assert text_col not in body["rows"][0]["cells"]


def test_a_document_written_before_places_still_reads() -> None:
    from app.repositories import listies_repo
    from app.schemas.listies import ListiesDoc

    raw = {
        "schema_version": 1,
        "sheets": [
            {
                "id": "s-old",
                "name": "Old",
                "created_at": "t",
                "tabs": [
                    {
                        "id": "tb-old",
                        "name": "Tab 1",
                        "order": 0,
                        "columns": [{"id": "c-1", "name": "Item", "type": "text", "order": 0}],
                        "rows": [
                            {
                                "id": "r-1",
                                "order": 0,
                                "cells": {"c-1": "Tent"},
                                "created_at": "t",
                                "updated_at": "t",
                            }
                        ],
                    }
                ],
            }
        ],
    }

    doc = ListiesDoc.model_validate(listies_repo.migrate(raw))

    assert doc.schema_version == 1
    assert doc.sheets[0].tabs[0].rows[0].cells["c-1"] == "Tent"


# ── the `place_group` column type and place groups (Story 4.6) ─────────────────

GROUPS = [
    {"id": "g-1", "name": "Must see", "color": "#e5484d"},
    {"id": "g-2", "name": "Maybe", "color": "#3e63dd"},
]


def _sheet_with_group() -> tuple[str, str, str, str]:
    """A sheet with a text column and a place_group column, and one row."""
    resp = _create(
        columns=[{"name": "Cafe", "type": "text"}, {"name": "Bucket", "type": "place_group"}]
    )
    sheet = resp.json()
    tab_id = sheet["tabs"][0]["id"]
    _text_id, group_id = (c["id"] for c in sheet["tabs"][0]["columns"])
    row_id = client.post(f"/api/listies/sheets/{sheet['id']}/tabs/{tab_id}/rows", json={}).json()[
        "id"
    ]
    return sheet["id"], tab_id, row_id, group_id


def test_a_place_group_column_can_be_created() -> None:
    resp = _create(columns=[{"name": "Bucket", "type": "place_group"}])

    assert resp.status_code == 200
    assert resp.json()["tabs"][0]["columns"][0]["type"] == "place_group"


def test_place_groups_persist_through_the_tab_update_endpoint() -> None:
    sheet_id, tab_id = _sheet_and_tab()

    resp = client.put(_tab_url(sheet_id, tab_id), json={"place_groups": GROUPS})

    assert resp.status_code == 200
    assert resp.json()["place_groups"] == GROUPS
    assert _tabs(sheet_id)[0]["place_groups"] == GROUPS


def test_setting_place_groups_leaves_the_name_and_colour_alone() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    client.put(_tab_url(sheet_id, tab_id), json={"name": "Trip", "color": "#00aaff"})

    body = client.put(_tab_url(sheet_id, tab_id), json={"place_groups": GROUPS}).json()

    assert (body["name"], body["color"]) == ("Trip", "#00aaff")


def test_a_group_id_round_trips_in_a_place_group_cell() -> None:
    sheet_id, tab_id, row_id, group_col = _sheet_with_group()

    resp = _put_cells(sheet_id, tab_id, row_id, {group_col: "g-1"})

    assert resp.status_code == 200
    assert resp.json()["cells"][group_col] == "g-1"


def test_a_dangling_group_id_is_stored_not_rejected() -> None:
    """A group can be deleted out from under a cell; the id simply persists."""
    sheet_id, tab_id, row_id, group_col = _sheet_with_group()

    resp = _put_cells(sheet_id, tab_id, row_id, {group_col: "g-does-not-exist"})

    assert resp.status_code == 200
    assert resp.json()["cells"][group_col] == "g-does-not-exist"


def test_a_place_in_a_group_column_is_rejected() -> None:
    sheet_id, tab_id, row_id, group_col = _sheet_with_group()

    resp = _put_cells(sheet_id, tab_id, row_id, {group_col: PLACE})

    assert resp.status_code == 422
    assert "detail" in resp.json()


def test_a_number_in_a_group_column_is_rejected() -> None:
    sheet_id, tab_id, row_id, group_col = _sheet_with_group()
    assert _put_cells(sheet_id, tab_id, row_id, {group_col: 3}).status_code == 422


def test_a_group_that_is_not_a_hex_colour_is_rejected() -> None:
    sheet_id, tab_id = _sheet_and_tab()
    bad = [{"id": "g-1", "name": "X", "color": "red"}]
    assert client.put(_tab_url(sheet_id, tab_id), json={"place_groups": bad}).status_code == 422


def test_retyping_place_group_to_text_keeps_the_group_name() -> None:
    sheet_id, tab_id, row_id, group_col = _sheet_with_group()
    client.put(_tab_url(sheet_id, tab_id), json={"place_groups": GROUPS})
    _put_cells(sheet_id, tab_id, row_id, {group_col: "g-1"})

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{group_col}", json={"type": "text"}
    ).json()

    assert body["rows"][0]["cells"][group_col] == "Must see"


@pytest.mark.parametrize("target", ["number", "date"])
def test_retyping_place_group_to_a_scalar_blanks_it(target: str) -> None:
    sheet_id, tab_id, row_id, group_col = _sheet_with_group()
    client.put(_tab_url(sheet_id, tab_id), json={"place_groups": GROUPS})
    _put_cells(sheet_id, tab_id, row_id, {group_col: "g-1"})

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{group_col}", json={"type": target}
    ).json()

    assert group_col not in body["rows"][0]["cells"]


def test_retyping_text_to_place_group_blanks_it() -> None:
    sheet_id, tab_id, row_id, _ = _sheet_with_group()
    text_col = _columns(sheet_id)[0]["id"]
    _put_cells(sheet_id, tab_id, row_id, {text_col: "hello"})

    body = client.put(
        f"{_tab_url(sheet_id, tab_id)}/columns/{text_col}", json={"type": "place_group"}
    ).json()

    assert text_col not in body["rows"][0]["cells"]


def test_a_document_written_before_groups_still_reads() -> None:
    """`place_groups` is additive — an older file has no key at all."""
    from app.repositories import listies_repo
    from app.schemas.listies import ListiesDoc

    raw = {
        "schema_version": 1,
        "sheets": [
            {
                "id": "s-old",
                "name": "Old",
                "created_at": "t",
                "tabs": [{"id": "tb-old", "name": "Tab 1", "order": 0, "columns": [], "rows": []}],
            }
        ],
    }

    doc = ListiesDoc.model_validate(listies_repo.migrate(raw))

    assert doc.schema_version == 1
    assert doc.sheets[0].tabs[0].place_groups == []
