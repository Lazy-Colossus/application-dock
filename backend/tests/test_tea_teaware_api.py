"""The /api/tea/teaware surface: status codes, photos, sessions and sharing."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app
from app.repositories import tea_repo as repo
from app.services import auth_service
from tests.tea_support import share

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _pot(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {"name": "Zhuni shuiping", "type": "pot", "volume_ml": 110}
    body.update(overrides)
    response = client.post("/api/tea/teaware", json=body)
    assert response.status_code == 201
    return response.json()


def _tea() -> str:
    body = {"name": "Tieguanyin", "catalogue_node_id": "oolong.chinese.anxi.tieguanyin"}
    return client.post("/api/tea/teas", json=body).json()["id"]


def _session(tea_id: str, teaware_id: str | None) -> dict[str, object]:
    return {
        "tea_id": tea_id,
        "status": "in_progress",
        "started_at": "2026-09-27T18:00:00+00:00",
        "curve_source": "generic",
        "teaware_id": teaware_id,
        "infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": None}],
    }


def test_create_list_get_replace_delete() -> None:
    pot = _pot()
    assert pot["id"].startswith("w-")
    assert [w["id"] for w in client.get("/api/tea/teaware").json()] == [pot["id"]]
    assert client.get(f"/api/tea/teaware/{pot['id']}").json()["name"] == "Zhuni shuiping"

    replaced = client.put(
        f"/api/tea/teaware/{pot['id']}", json={"name": "Renamed", "type": "pot", "retired": True}
    )
    assert replaced.status_code == 200
    assert replaced.json()["retired_at"] is not None

    assert client.delete(f"/api/tea/teaware/{pot['id']}").status_code == 204
    assert client.get("/api/tea/teaware").json() == []


def test_refusals_and_unknowns() -> None:
    assert client.post("/api/tea/teaware", json={"name": " ", "type": "pot"}).status_code == 422
    assert client.post("/api/tea/teaware", json={"name": "Pot", "type": "vase"}).status_code == 422
    assert client.get("/api/tea/teaware/w-nosuchid").status_code == 404
    assert client.delete("/api/tea/teaware/w-nosuchid").status_code == 404
    assert client.get("/api/tea/teaware/w-nosuchid/usage").status_code == 404


def test_last_used_is_not_read_as_an_id() -> None:
    response = client.get("/api/tea/teaware/last-used")
    assert response.status_code == 200
    assert response.json() is None


def test_a_session_records_the_vessel_and_refuses_a_cup() -> None:
    tea_id = _tea()
    pot = _pot()
    cup = _pot(name="Cup", type="cup")

    stored = client.put("/api/tea/sessions/s-1", json=_session(tea_id, pot["id"]))
    assert stored.status_code == 200
    assert (stored.json()["teaware_id"], stored.json()["vessel_volume_ml"]) == (pot["id"], 110)

    refused = client.put("/api/tea/sessions/s-2", json=_session(tea_id, cup["id"]))
    assert refused.status_code == 422

    last = client.get("/api/tea/teaware/last-used", params={"tea_id": tea_id})
    assert last.json()["id"] == pot["id"]


def test_usage_lists_finished_sessions() -> None:
    tea_id = _tea()
    pot = _pot()
    client.put("/api/tea/sessions/s-1", json={**_session(tea_id, pot["id"]), "status": "finalised"})
    usage = client.get(f"/api/tea/teaware/{pot['id']}/usage").json()
    assert (usage["total"], usage["off_dedication"]) == (1, 0)
    assert usage["sessions"][0]["id"] == "s-1"


def test_photo_round_trip_via_token() -> None:
    pot = _pot()
    uploaded = client.post(
        f"/api/tea/teaware/{pot['id']}/image",
        files={"file": ("p.jpg", b"jpeg-bytes", "image/jpeg")},
    )
    assert uploaded.status_code == 201
    token = auth_service.create_access_token("test_user")
    fetched = client.get(f"/api/tea/teaware/{pot['id']}/image", params={"token": token})
    assert fetched.status_code == 200
    assert fetched.content == b"jpeg-bytes"
    assert client.delete(f"/api/tea/teaware/{pot['id']}/image").json()["image_url"] is None


def test_a_household_member_sees_the_owners_teaware() -> None:
    pot = _pot()
    share("test_user", "bob")
    app.dependency_overrides[get_current_user] = lambda: "bob"
    assert [w["id"] for w in client.get("/api/tea/teaware").json()] == [pot["id"]]
