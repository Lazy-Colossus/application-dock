"""The cabinet routes: membership status codes, and what a member can reach."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app
from app.repositories import tea_repo as repo
from app.services import auth_service
from app.services import tea_cabinet_service as cabinets

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    for name in ("alice", "bob", "carol"):
        auth_service.create_user(name)
    yield


def _as(username: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: username


def test_get_cabinet_for_a_new_user() -> None:
    _as("alice")
    assert client.get("/api/tea/cabinet").json() == {
        "id": None,
        "owner": "alice",
        "members": ["alice"],
        "is_owner": True,
    }


def test_add_then_remove_a_member() -> None:
    _as("alice")
    added = client.post("/api/tea/cabinet/members", json={"username": "bob"})
    assert added.status_code == 200
    assert added.json()["members"] == ["alice", "bob"]

    removed = client.delete("/api/tea/cabinet/members/bob")
    assert removed.status_code == 200
    assert removed.json()["members"] == ["alice"]


def test_refusals_map_to_422_with_the_reason() -> None:
    _as("alice")
    response = client.post("/api/tea/cabinet/members", json={"username": "nobody"})
    assert response.status_code == 422
    assert "no one called" in response.json()["detail"]


def test_a_member_adding_people_is_403() -> None:
    cabinets.add_member("alice", "bob")
    _as("bob")
    assert client.post("/api/tea/cabinet/members", json={"username": "carol"}).status_code == 403


def test_removing_a_stranger_is_404() -> None:
    cabinets.ensure("alice")
    _as("alice")
    assert client.delete("/api/tea/cabinet/members/carol").status_code == 404


def test_a_member_can_see_the_owners_tea_photo() -> None:
    _as("alice")
    tea = client.post("/api/tea/teas", json={"name": "Longjing", "catalogue_node_id": "green"})
    tea_id = tea.json()["id"]
    client.post(
        f"/api/tea/teas/{tea_id}/image", files={"file": ("p.jpg", b"jpeg-bytes", "image/jpeg")}
    )
    cabinets.add_member("alice", "bob")

    token = auth_service.create_access_token("bob")
    response = client.get(f"/api/tea/teas/{tea_id}/image", params={"token": token})
    assert response.status_code == 200
    assert response.content == b"jpeg-bytes"
