"""The session and curve routes: status codes and exception translation."""

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


def _tea() -> dict[str, object]:
    body = {
        "name": "Tieguanyin",
        "catalogue_node_id": "oolong.anxi.tieguanyin",
        "grams_remaining": 40,
    }
    return client.post("/api/tea/teas", json=body).json()


def _snapshot(tea_id: object, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "tea_id": tea_id,
        "status": "in_progress",
        "started_at": "2026-09-26T18:00:00+00:00",
        "leaf_grams": 6,
        "curve_source": "almanac",
        "curve_source_label": "almanac: Tieguanyin",
        "infusions": [
            {"number": 1, "target_seconds": 20, "actual_seconds": 21},
            {"number": 2, "target_seconds": 25, "actual_seconds": None},
        ],
    }
    body.update(overrides)
    return body


def test_put_creates_and_lists_in_progress() -> None:
    tea = _tea()
    response = client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    assert response.status_code == 200
    assert response.json()["id"] == "s-1"

    live = client.get("/api/tea/sessions", params={"status": "in_progress"}).json()
    assert [s["id"] for s in live] == ["s-1"]


def test_finalise_deducts_and_appears_on_the_tea() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"], status="finalised", rating=5))

    assert client.get(f"/api/tea/teas/{tea['id']}").json()["grams_remaining"] == 34
    listed = client.get(f"/api/tea/teas/{tea['id']}/sessions").json()
    assert [s["id"] for s in listed] == ["s-1"]


def test_put_after_finalise_is_409() -> None:
    tea = _tea()
    final = _snapshot(tea["id"], status="finalised")
    client.put("/api/tea/sessions/s-1", json=final)
    response = client.put("/api/tea/sessions/s-1", json=final)
    assert response.status_code == 409
    assert response.json()["detail"] == "This session is already finished"


def test_put_for_an_unknown_tea_is_404() -> None:
    response = client.put("/api/tea/sessions/s-1", json=_snapshot("t-nosuch"))
    assert response.status_code == 404
    assert response.json()["detail"] == "Tea not found"


def test_an_invalid_snapshot_is_422() -> None:
    tea = _tea()
    response = client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"], rating=6))
    assert response.status_code == 422


def test_delete_discards_then_404s() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    assert client.delete("/api/tea/sessions/s-1").status_code == 204
    assert client.delete("/api/tea/sessions/s-1").status_code == 404


def test_delete_of_a_finalised_session_is_409() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"], status="finalised"))
    assert client.delete("/api/tea/sessions/s-1").status_code == 409


def test_curve_and_its_404() -> None:
    tea = _tea()
    curve = client.get(f"/api/tea/teas/{tea['id']}/curve").json()
    assert curve["source"] == "almanac"
    assert curve["steep_seconds"] == [20, 25, 30, 40]
    assert client.get("/api/tea/teas/t-nosuch/curve").status_code == 404
    assert client.get("/api/tea/teas/t-nosuch/sessions").status_code == 404
