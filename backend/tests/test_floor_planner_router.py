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
BASE = "/api/floor-planner/apartment"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    for name in ("test_user", "bo"):
        auth_service.create_user(name)


def test_get_returns_the_implicit_empty_apartment() -> None:
    body = client.get(BASE).json()
    assert body["id"] is None
    assert body["members"] == ["test_user"]
    assert len(body["surface"]) == 40
    assert "plan_updated_by" not in body
    assert body["plan_rev"] == 0


def test_lock_and_unlock_bump_rev() -> None:
    locked = client.post(f"{BASE}/lock", json={"base_rev": 0})
    assert locked.status_code == 200
    assert (locked.json()["rev"], locked.json()["locked"]) == (1, True)
    unlocked = client.post(f"{BASE}/unlock", json={"base_rev": 1}).json()
    assert (unlocked["rev"], unlocked["locked"]) == (2, False)


def test_a_stale_write_is_409_naming_the_writer() -> None:
    client.post(f"{BASE}/lock", json={"base_rev": 0})
    r = client.post(f"{BASE}/lock", json={"base_rev": 0})
    assert r.status_code == 409
    assert r.json()["detail"] == "test_user changed this"


def test_a_write_without_base_rev_is_422() -> None:
    assert client.post(f"{BASE}/lock", json={}).status_code == 422


def test_members_over_http() -> None:
    added = client.post(f"{BASE}/members", json={"username": "bo"})
    assert added.json()["members"] == ["bo", "test_user"]
    assert client.post(f"{BASE}/members", json={"username": "zed"}).status_code == 422
    assert client.delete(f"{BASE}/members/nobody").status_code == 404
    assert client.delete(f"{BASE}/members/bo").json()["members"] == ["test_user"]


def test_a_member_removing_the_owner_is_403() -> None:
    service.add_member("test_user", "bo")
    app.dependency_overrides[get_current_user] = lambda: "bo"
    assert client.delete(f"{BASE}/members/test_user").status_code == 403


def _plan_body(base_rev: int = 0, cols: int = 5) -> dict:
    return {
        "base_rev": base_rev,
        "cols": cols,
        "rows": 5,
        "surface": ["w1" * cols] * 5,
        "feature": [".." * cols] * 5,
        "labels": [],
    }


def test_putting_the_plan() -> None:
    r = client.put(f"{BASE}/plan", json=_plan_body())
    assert r.status_code == 200
    assert r.json()["surface"][0] == "w1" * 5
    assert client.put(f"{BASE}/plan", json=_plan_body()).status_code == 409
    assert client.put(f"{BASE}/plan", json=_plan_body(1, cols=151)).status_code == 422
    client.post(f"{BASE}/lock", json={"base_rev": 1})
    locked = client.put(f"{BASE}/plan", json=_plan_body(2))
    assert (locked.status_code, locked.json()["detail"]) == (422, "Unlock the plan to change it")


def test_furniture_over_http() -> None:
    sofa = {"name": "Sofa", "colour": "grey", "shape": "rectangle", "width_cm": 220, "depth_cm": 95}
    added = client.post(f"{BASE}/furniture", json={"pieces": [sofa]})
    assert added.status_code == 200
    piece_id = added.json()["furniture"][0]["id"]
    too_many = client.post(f"{BASE}/furniture", json={"pieces": [sofa] * 101})
    assert too_many.status_code == 422
    assert client.put(f"{BASE}/furniture/f_gone", json=sofa).status_code == 404
    edited = client.put(f"{BASE}/furniture/{piece_id}", json={**sofa, "colour": "blue"})
    assert edited.json()["furniture"][0]["colour"] == "blue"
    assert client.delete(f"{BASE}/furniture/{piece_id}").json()["furniture"] == []
