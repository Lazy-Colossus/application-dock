"""A tea's own brewing parameters: stored, returned, validated."""

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


def _payload(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "name": "Tieguanyin",
        "catalogue_node_id": "oolong.chinese.anxi.tieguanyin",
        "grams_remaining": 50,
    }
    body.update(overrides)
    return body


def test_a_tea_without_brewing_returns_null() -> None:
    created = client.post("/api/tea/teas", json=_payload()).json()
    assert created["brewing"] is None


def test_brewing_round_trips() -> None:
    brewing = {"leaf_grams": 7, "water_temp_c": 95, "steep_seconds": [15, 20, 30]}
    created = client.post("/api/tea/teas", json=_payload(brewing=brewing)).json()
    assert created["brewing"] == brewing

    fetched = client.get(f"/api/tea/teas/{created['id']}").json()
    assert fetched["brewing"] == brewing


@pytest.mark.parametrize(
    "brewing",
    [
        {"leaf_grams": 0, "water_temp_c": None, "steep_seconds": []},
        {"leaf_grams": None, "water_temp_c": 0, "steep_seconds": []},
        {"leaf_grams": None, "water_temp_c": 101, "steep_seconds": []},
        {"leaf_grams": None, "water_temp_c": None, "steep_seconds": [10, 0]},
    ],
)
def test_invalid_brewing_is_422(brewing: dict[str, object]) -> None:
    response = client.post("/api/tea/teas", json=_payload(brewing=brewing))
    assert response.status_code == 422
