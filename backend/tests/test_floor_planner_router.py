"""HTTP contract of the Floor Planner API."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.main import app
from app.services import auth_service
from app.services import floor_planner_service as service

client = TestClient(app)
ROOT = "/api/floor-planner/apartments"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    for name in ("test_user", "bo"):
        auth_service.create_user(name)


@pytest.fixture
def base() -> str:
    return f"{ROOT}/{client.get(ROOT).json()[0]['id']}"


def test_listing_creates_my_apartment_once() -> None:
    first = client.get(ROOT).json()
    assert [(a["name"], a["members"], a["is_owner"]) for a in first] == [
        ("My apartment", ["test_user"], True)
    ]
    assert client.get(ROOT).json() == first


def test_get_one_apartment(base: str) -> None:
    body = client.get(base).json()
    assert (body["name"], body["members"], body["plan_rev"]) == ("My apartment", ["test_user"], 0)
    assert len(body["surface"]) == 40
    assert "plan_updated_by" not in body


def test_apartments_are_created_renamed_duplicated_and_deleted(base: str) -> None:
    created = client.post(ROOT, json={"name": "Second"})
    assert created.status_code == 201
    second = created.json()["id"]
    assert client.put(f"{ROOT}/{second}/name", json={"name": "2nd"}).json()["name"] == "2nd"
    copy = client.post(f"{base}/duplicate", json={"name": "Copy"})
    assert (copy.status_code, copy.json()["name"]) == (201, "Copy")
    assert client.post(ROOT, json={"name": ""}).status_code == 422
    left = client.delete(f"{ROOT}/{second}").json()
    assert {a["name"] for a in left} == {"My apartment", "Copy"}


def test_someone_elses_apartment_is_404(base: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: "bo"
    assert client.get(base).status_code == 404
    assert client.post(f"{base}/lock", json={"base_rev": 0}).status_code == 404


def test_lock_and_unlock_bump_rev(base: str) -> None:
    locked = client.post(f"{base}/lock", json={"base_rev": 0})
    assert locked.status_code == 200
    assert (locked.json()["rev"], locked.json()["locked"]) == (1, True)
    unlocked = client.post(f"{base}/unlock", json={"base_rev": 1}).json()
    assert (unlocked["rev"], unlocked["locked"]) == (2, False)


def test_a_stale_write_is_409_naming_the_writer(base: str) -> None:
    client.post(f"{base}/lock", json={"base_rev": 0})
    r = client.post(f"{base}/lock", json={"base_rev": 0})
    assert r.status_code == 409
    assert r.json()["detail"] == "test_user changed this"


def test_a_write_without_base_rev_is_422(base: str) -> None:
    assert client.post(f"{base}/lock", json={}).status_code == 422


def test_members_over_http(base: str) -> None:
    added = client.post(f"{base}/members", json={"username": "bo"})
    assert added.json()["members"] == ["bo", "test_user"]
    assert client.post(f"{base}/members", json={"username": "zed"}).status_code == 422
    assert client.delete(f"{base}/members/nobody").status_code == 404
    assert client.delete(f"{base}/members/bo").json()["members"] == ["test_user"]
    client.post(f"{base}/members", json={"username": "bo"})
    app.dependency_overrides[get_current_user] = lambda: "bo"
    [mine] = client.post(f"{base}/leave").json()
    assert (mine["name"], mine["owner"]) == ("My apartment", "bo")


def test_a_member_removing_the_owner_is_403(base: str) -> None:
    service.add_member("test_user", base.rsplit("/", 1)[1], "bo")
    app.dependency_overrides[get_current_user] = lambda: "bo"
    assert client.delete(f"{base}/members/test_user").status_code == 403


def _plan_body(base_rev: int = 0, cols: int = 5) -> dict:
    return {
        "base_rev": base_rev,
        "cols": cols,
        "rows": 5,
        "surface": ["w1" * cols] * 5,
        "feature": [".." * cols] * 5,
        "labels": [],
    }


def test_putting_the_plan(base: str) -> None:
    r = client.put(f"{base}/plan", json=_plan_body())
    assert r.status_code == 200
    assert r.json()["surface"][0] == "w1" * 5
    assert client.put(f"{base}/plan", json=_plan_body()).status_code == 409
    assert client.put(f"{base}/plan", json=_plan_body(1, cols=151)).status_code == 422
    client.post(f"{base}/lock", json={"base_rev": 1})
    locked = client.put(f"{base}/plan", json=_plan_body(2))
    assert (locked.status_code, locked.json()["detail"]) == (422, "Unlock the plan to change it")


def test_furniture_over_http(base: str) -> None:
    sofa = {"name": "Sofa", "colour": "grey", "shape": "rectangle", "width_cm": 220, "depth_cm": 95}
    added = client.post(f"{base}/furniture", json={"pieces": [sofa]})
    assert added.status_code == 200
    piece_id = added.json()["furniture"][0]["id"]
    too_many = client.post(f"{base}/furniture", json={"pieces": [sofa] * 101})
    assert too_many.status_code == 422
    assert client.put(f"{base}/furniture/f_gone", json=sofa).status_code == 404
    edited = client.put(f"{base}/furniture/{piece_id}", json={**sofa, "colour": "blue"})
    assert edited.json()["furniture"][0]["colour"] == "blue"
    assert client.delete(f"{base}/furniture/{piece_id}").json()["furniture"] == []


def test_layouts_and_placements_over_http(base: str) -> None:
    sofa = {"name": "Sofa", "colour": "grey", "shape": "rectangle", "width_cm": 220, "depth_cm": 95}
    apt = client.post(f"{base}/furniture", json={"pieces": [sofa]}).json()
    layout, piece = apt["layouts"][0]["id"], apt["furniture"][0]["id"]
    spot = {"x_cm": 100, "y_cm": 100, "rotation": 90}
    unlocked = client.put(f"{base}/layouts/{layout}/placements/{piece}", json=spot)
    assert unlocked.status_code == 422
    client.post(f"{base}/lock", json={"base_rev": 0})
    placed = client.put(f"{base}/layouts/{layout}/placements/{piece}", json=spot)
    assert placed.json()["layouts"][0]["placements"][0]["rotation"] == 90
    assert client.put(f"{base}/layouts/l_gone/placements/{piece}", json=spot).status_code == 404
    copy = client.post(f"{base}/layouts/{layout}/duplicate").json()["layouts"][1]
    assert copy["name"] == "Layout A copy"
    renamed = client.put(f"{base}/layouts/{copy['id']}", json={"name": "B"}).json()
    assert renamed["layouts"][1]["name"] == "B"
    assert len(client.post(f"{base}/layouts", json={"name": "C"}).json()["layouts"]) == 3
    assert len(client.delete(f"{base}/layouts/{copy['id']}").json()["layouts"]) == 2
    back = client.delete(f"{base}/layouts/{layout}/placements/{piece}").json()
    assert back["layouts"][0]["placements"] == []
