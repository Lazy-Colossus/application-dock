"""The /api/tea/almanac surface: status codes, filters, and 404s."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import tea_repo as repo

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def test_list_almanac_returns_seeded_entries() -> None:
    response = client.get("/api/tea/almanac")
    assert response.status_code == 200
    body = response.json()
    assert any(e["catalogue_node_id"] == "green.longjing" for e in body)


def test_list_almanac_filters_by_country() -> None:
    response = client.get("/api/tea/almanac", params={"country": "Japan"})
    assert response.status_code == 200
    body = response.json()
    assert body
    assert all(e["country"] == "Japan" for e in body)


def test_list_almanac_filters_by_search_text() -> None:
    response = client.get("/api/tea/almanac", params={"q": "West Lake"})
    assert response.status_code == 200
    ids = {e["catalogue_node_id"] for e in response.json()}
    assert "green.longjing" in ids


def test_get_almanac_entry_returns_the_entry() -> None:
    response = client.get("/api/tea/almanac/oolong.anxi.tieguanyin")
    assert response.status_code == 200
    assert response.json()["name"] == "Tieguanyin"


def test_get_almanac_entry_404s_for_an_unknown_id() -> None:
    response = client.get("/api/tea/almanac/does.not.exist")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()
