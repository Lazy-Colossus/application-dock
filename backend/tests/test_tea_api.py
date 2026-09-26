"""The /api/tea surface: status codes and exception translation."""

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
        "name": "Da Hong Pao",
        "catalogue_node_id": "oolong.wuyi-yancha.da-hong-pao",
        "grams_purchased": 100,
        "grams_remaining": 38,
    }
    body.update(overrides)
    return body


def test_catalogue_returns_the_flat_seed() -> None:
    response = client.get("/api/tea/catalogue")
    assert response.status_code == 200
    nodes = response.json()
    assert any(n["id"] == "oolong" and n["parent_id"] is None for n in nodes)
    assert any(n["id"] == "oolong.wuyi-yancha" and n["parent_id"] == "oolong" for n in nodes)


def test_empty_cabinet_lists_nothing() -> None:
    assert client.get("/api/tea/teas").json() == []


def test_create_returns_201_and_the_tea() -> None:
    response = client.post("/api/tea/teas", json=_payload())
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Da Hong Pao"
    assert body["class_id"] == "oolong"
    assert body["id"].startswith("t-")


def test_full_round_trip() -> None:
    created = client.post("/api/tea/teas", json=_payload()).json()

    fetched = client.get(f"/api/tea/teas/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == created["id"]

    replaced = client.put(
        f"/api/tea/teas/{created['id']}", json=_payload(name="Rou Gui", grams_remaining=12)
    )
    assert replaced.status_code == 200
    assert replaced.json()["name"] == "Rou Gui"

    assert client.delete(f"/api/tea/teas/{created['id']}").status_code == 204
    assert client.get(f"/api/tea/teas/{created['id']}").status_code == 404


def test_unknown_tea_is_404_with_a_detail() -> None:
    response = client.get("/api/tea/teas/t-nosuchid")
    assert response.status_code == 404
    assert response.json()["detail"] == "Tea not found"


def test_a_rejected_rule_is_422_and_says_what_to_do() -> None:
    response = client.post("/api/tea/teas", json=_payload(grams_remaining=500))
    assert response.status_code == 422
    assert "Change the amount bought first" in response.json()["detail"]


def test_an_unknown_node_is_422() -> None:
    assert client.post("/api/tea/teas", json=_payload(catalogue_node_id="nope")).status_code == 422


def test_create_node_returns_201_and_appears_in_the_catalogue() -> None:
    response = client.post(
        "/api/tea/catalogue", json={"parent_id": "oolong.wuyi-yancha", "name": "Bai Ji Guan"}
    )
    assert response.status_code == 201
    node = response.json()
    assert node["source"] == "user"
    assert any(n["id"] == node["id"] for n in client.get("/api/tea/catalogue").json())


def test_deleting_an_unused_node_is_204() -> None:
    node = client.post("/api/tea/catalogue", json={"parent_id": "oolong", "name": "Temp"}).json()
    assert client.delete(f"/api/tea/catalogue/{node['id']}").status_code == 204


def test_deleting_a_node_in_use_is_409_and_names_the_count() -> None:
    node = client.post("/api/tea/catalogue", json={"parent_id": "oolong", "name": "Used"}).json()
    client.post("/api/tea/teas", json=_payload(catalogue_node_id=node["id"]))

    response = client.delete(f"/api/tea/catalogue/{node['id']}")
    assert response.status_code == 409
    assert "1 tea is classified here" in response.json()["detail"]


def test_deleting_a_seed_node_is_422() -> None:
    assert client.delete("/api/tea/catalogue/oolong").status_code == 422


def test_deleting_an_unknown_node_is_404() -> None:
    assert client.delete("/api/tea/catalogue/u-nosuchid").status_code == 404


def _token(username: str) -> str:
    from app.services import auth_service

    return auth_service.create_access_token(username)


def test_uploading_an_image_sets_image_url_and_returns_the_tea() -> None:
    tea_id = client.post("/api/tea/teas", json=_payload()).json()["id"]

    response = client.post(
        f"/api/tea/teas/{tea_id}/image",
        files={"file": ("photo.jpg", b"fake-jpeg-bytes", "image/jpeg")},
    )

    assert response.status_code == 201
    assert response.json()["image_url"] == f"/api/tea/teas/{tea_id}/image"


def test_uploading_an_unsupported_content_type_is_422() -> None:
    tea_id = client.post("/api/tea/teas", json=_payload()).json()["id"]

    response = client.post(
        f"/api/tea/teas/{tea_id}/image",
        files={"file": ("doc.pdf", b"whatever", "application/pdf")},
    )

    assert response.status_code == 422


def test_uploading_to_an_unknown_tea_is_404() -> None:
    response = client.post(
        "/api/tea/teas/t-nosuchid/image",
        files={"file": ("photo.jpg", b"bytes", "image/jpeg")},
    )
    assert response.status_code == 404


def test_fetching_the_image_returns_the_bytes(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-for-tests-only")
    tea_id = client.post("/api/tea/teas", json=_payload()).json()["id"]
    client.post(
        f"/api/tea/teas/{tea_id}/image",
        files={"file": ("photo.jpg", b"fake-jpeg-bytes", "image/jpeg")},
    )

    response = client.get(f"/api/tea/teas/{tea_id}/image?token={_token('test_user')}")

    assert response.status_code == 200
    assert response.content == b"fake-jpeg-bytes"
    assert response.headers["content-type"] == "image/jpeg"


def test_fetching_the_image_without_a_token_is_422() -> None:
    tea_id = client.post("/api/tea/teas", json=_payload()).json()["id"]
    assert client.get(f"/api/tea/teas/{tea_id}/image").status_code == 422


def test_fetching_the_image_with_a_bad_token_is_401() -> None:
    tea_id = client.post("/api/tea/teas", json=_payload()).json()["id"]
    assert client.get(f"/api/tea/teas/{tea_id}/image?token=garbage").status_code == 401


def test_fetching_the_image_for_a_tea_with_none_is_404(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-for-tests-only")
    tea_id = client.post("/api/tea/teas", json=_payload()).json()["id"]

    response = client.get(f"/api/tea/teas/{tea_id}/image?token={_token('test_user')}")
    assert response.status_code == 404


def test_deleting_the_image_clears_image_url() -> None:
    tea_id = client.post("/api/tea/teas", json=_payload()).json()["id"]
    client.post(
        f"/api/tea/teas/{tea_id}/image",
        files={"file": ("photo.jpg", b"bytes", "image/jpeg")},
    )

    response = client.delete(f"/api/tea/teas/{tea_id}/image")

    assert response.status_code == 200
    assert response.json()["image_url"] is None


def test_deleting_the_image_for_an_unknown_tea_is_404() -> None:
    assert client.delete("/api/tea/teas/t-nosuchid/image").status_code == 404
