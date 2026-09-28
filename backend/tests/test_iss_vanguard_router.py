"""HTTP contract of the ISS Vanguard API."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.repositories import iss_vanguard_repo as repo
from app.services import auth_service
from app.services import iss_vanguard_service as service

client = TestClient(app)
BASE = "/api/iss-vanguard/ship"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    for name in ("test_user", "bo"):
        auth_service.create_user(name)


def test_get_ship_returns_the_implicit_empty_ship() -> None:
    body = client.get(BASE).json()
    assert body["id"] is None
    assert body["members"] == ["test_user"]
    assert body["stock"]["minerals"] == {"basic": 0, "rare": 0, "very_rare": 0}


def test_a_stock_tap_returns_the_whole_ship() -> None:
    r = client.post(f"{BASE}/stock", json={"resource": "minerals", "tier": "rare", "delta": 1})
    assert r.status_code == 200
    assert r.json()["stock"]["minerals"]["rare"] == 1
    assert r.json()["rev"] == 1


@pytest.mark.parametrize(
    "body",
    [
        {"resource": "gold", "tier": "rare", "delta": 1},
        {"resource": "minerals", "tier": "rare", "delta": 5},
        {"resource": "minerals", "tier": "rare", "delta": -1},  # already at 0
    ],
)
def test_a_bad_tap_is_422(body: dict) -> None:
    assert client.post(f"{BASE}/stock", json=body).status_code == 422


def test_project_lifecycle_over_http() -> None:
    created = client.post(
        f"{BASE}/projects", json={"code": "VB07", "cost": {"minerals": {"basic": 1}}}
    )
    assert created.status_code == 200
    project_id = created.json()["projects"][0]["id"]

    edited = client.put(f"{BASE}/projects/{project_id}", json={"code": "VB08", "name": "Lab"})
    assert edited.json()["projects"][0]["code"] == "VB08"
    assert client.post(f"{BASE}/projects/{project_id}/complete").json()["projects"][0]["done"]
    assert not client.post(f"{BASE}/projects/{project_id}/reopen").json()["projects"][0]["done"]
    assert client.delete(f"{BASE}/projects/{project_id}").json()["projects"] == []


def test_project_errors_map_to_404_and_422() -> None:
    assert client.put(f"{BASE}/projects/p-00000000", json={"code": "X"}).status_code == 404
    assert client.post(f"{BASE}/projects/p-00000000/complete").status_code == 404
    assert client.post(f"{BASE}/projects", json={"code": "  "}).status_code == 422
    assert (
        client.post(f"{BASE}/projects", json={"code": "X", "cost": {"minerals": {"basic": -1}}})
    ).status_code == 422


def test_members_over_http() -> None:
    added = client.post(f"{BASE}/members", json={"username": "bo"})
    assert added.json()["members"] == ["bo", "test_user"]
    assert client.post(f"{BASE}/members", json={"username": "zed"}).status_code == 422
    assert client.delete(f"{BASE}/members/nobody").status_code == 404
    assert client.delete(f"{BASE}/members/bo").json()["members"] == ["test_user"]


def test_a_non_owner_adding_crew_is_403() -> None:
    service.add_member("bo", "test_user")
    auth_service.create_user("cy")
    assert client.post(f"{BASE}/members", json={"username": "cy"}).status_code == 403


def test_a_ship_that_vanished_mid_request_is_410(monkeypatch: pytest.MonkeyPatch) -> None:
    def gone(*_: object) -> None:
        raise repo.ShipGoneError("gone")

    monkeypatch.setattr(service, "adjust_stock", gone)
    r = client.post(f"{BASE}/stock", json={"resource": "minerals", "tier": "rare", "delta": 1})
    assert r.status_code == 410
    assert r.json()["detail"] == "Your ship changed — reload"


def test_the_shell_lists_the_app() -> None:
    apps = client.get("/api/apps").json()
    assert {
        "id": "iss-vanguard",
        "label": "ISS Vanguard",
        "icon": "rocket_launch",
        "route": "/iss-vanguard",
    } in apps
