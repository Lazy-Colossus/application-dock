"""The Journal and session-photo routes: status codes and exception translation."""

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


# conftest.py signs every request in as "test_user" and clears overrides after each test.
@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea(grams: float = 40) -> dict[str, object]:
    body = {
        "name": "Tieguanyin",
        "catalogue_node_id": "oolong.anxi.tieguanyin",
        "grams_remaining": grams,
    }
    return client.post("/api/tea/teas", json=body).json()


def _snapshot(tea_id: object, status: str = "in_progress") -> dict[str, object]:
    return {
        "tea_id": tea_id,
        "status": status,
        "started_at": "2026-09-26T18:00:00+00:00",
        "leaf_grams": 6,
        "curve_source": "generic",
        "infusions": [{"number": 1, "target_seconds": 20, "actual_seconds": 21}],
    }


def _finish(tea_id: object, session_id: str = "s-1") -> None:
    client.put(f"/api/tea/sessions/{session_id}", json=_snapshot(tea_id))
    response = client.put(f"/api/tea/sessions/{session_id}", json=_snapshot(tea_id, "finalised"))
    assert response.status_code == 200


def _grams(tea_id: object) -> float:
    return client.get(f"/api/tea/teas/{tea_id}").json()["grams_remaining"]


def test_the_timers_discard_still_refuses_a_finished_sitting() -> None:
    tea = _tea(40)
    _finish(tea["id"])
    assert client.delete("/api/tea/sessions/s-1").status_code == 409
    assert _grams(tea["id"]) == 34
    assert [e["id"] for e in client.get("/api/tea/journal").json()] == ["s-1"]


def test_the_journal_lists_resolved_entries() -> None:
    tea = _tea()
    _finish(tea["id"])
    [entry] = client.get("/api/tea/journal").json()
    assert entry["tea_name"] == "Tieguanyin"
    assert entry["class_id"] == "oolong"
    assert entry["timed"] is True
    assert entry["image_url"] is None


def test_an_edit_returns_the_entry() -> None:
    tea = _tea()
    _finish(tea["id"])
    response = client.put(
        "/api/tea/sessions/s-1/journal",
        json={"leaf_grams": 6, "rating": 5, "cha_xi": {"moods": ["calm"], "guests": "Eva"}},
    )
    assert response.status_code == 200
    assert response.json()["cha_xi"]["guests"] == "Eva"


@pytest.mark.parametrize(
    ("body", "status"),
    [
        ({"cha_xi": {"moods": ["grumpy"]}}, 422),
        ({"started_at": "2026-09-01T12:00:00+00:00"}, 422),
    ],
)
def test_a_bad_edit_is_unprocessable(body: dict[str, object], status: int) -> None:
    tea = _tea()
    _finish(tea["id"])
    assert client.put("/api/tea/sessions/s-1/journal", json=body).status_code == status


def test_editing_a_live_session_is_unprocessable() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    assert client.put("/api/tea/sessions/s-1/journal", json={}).status_code == 422


def test_editing_an_unknown_session_is_not_found() -> None:
    assert client.put("/api/tea/sessions/s-nope/journal", json={}).status_code == 404


def test_another_member_cannot_edit_or_delete() -> None:
    tea = _tea()
    _finish(tea["id"])
    share("test_user", "bob")
    app.dependency_overrides[get_current_user] = lambda: "bob"
    assert client.put("/api/tea/sessions/s-1/journal", json={}).status_code == 403
    assert client.delete("/api/tea/sessions/s-1/journal").status_code == 403


def test_deleting_a_sitting_returns_its_grams() -> None:
    tea = _tea(40)
    _finish(tea["id"])
    assert client.delete("/api/tea/sessions/s-1/journal").status_code == 204
    assert _grams(tea["id"]) == 40
    assert client.get("/api/tea/journal").json() == []


def test_a_journal_only_entry_is_one_put() -> None:
    body = {
        "tea_id": None,
        "away_tea_name": "Teahouse Dancong",
        "status": "finalised",
        "started_at": "2026-09-20T12:00:00+00:00",
        "curve_source": "generic",
        "timed": False,
    }
    assert client.put("/api/tea/sessions/s-9", json=body).status_code == 200
    [entry] = client.get("/api/tea/journal").json()
    assert entry["tea_name"] == "Teahouse Dancong"


def test_a_session_photo_round_trips_via_token() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    uploaded = client.post(
        "/api/tea/sessions/s-1/image",
        files={"file": ("p.jpg", b"jpeg-bytes", "image/jpeg")},
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["image_url"] == "/api/tea/sessions/s-1/image"
    token = auth_service.create_access_token("test_user")
    fetched = client.get("/api/tea/sessions/s-1/image", params={"token": token})
    assert fetched.status_code == 200
    assert fetched.content == b"jpeg-bytes"
    assert client.delete("/api/tea/sessions/s-1/image").json()["image_url"] is None


def test_a_photo_that_cannot_be_kept_is_unprocessable() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    response = client.post(
        "/api/tea/sessions/s-1/image", files={"file": ("p.txt", b"hello", "text/plain")}
    )
    assert response.status_code == 422


def test_a_glob_session_id_is_unprocessable() -> None:
    tea = _tea()
    assert client.put("/api/tea/sessions/%2A", json=_snapshot(tea["id"])).status_code == 422
