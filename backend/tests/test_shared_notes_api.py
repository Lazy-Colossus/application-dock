"""Integration tests for the Shared Notes endpoints (Story 1.3).

The caller always comes from the JWT, never from request input, so these tests
switch users by overriding the auth dependency rather than by sending a field.
"""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


@pytest.fixture
def as_user() -> Iterator[object]:
    """Run requests as a chosen username, restoring the default afterwards."""

    def _switch(username: str) -> None:
        app.dependency_overrides[get_current_user] = lambda: username

    _switch("ana")
    yield _switch
    app.dependency_overrides[get_current_user] = lambda: "test_user"


def _create(title: str = "Groceries") -> dict:
    response = client.post("/api/shared-notes/notes", json={"title": title})
    assert response.status_code == 200, response.text
    return response.json()


def _share_with(note_id: str, username: str) -> None:
    """Add a member directly through the repo.

    Epic 2 adds the sharing endpoints; this story only needs a note that
    already has two members so the member-vs-owner rules can be exercised.
    """
    from app.repositories import shared_notes_repo as repo

    with repo.note_transaction(note_id) as note:
        note.members.append(username)


# ── POST /notes ───────────────────────────────────────────────────────────────


def test_create_returns_the_new_note(as_user) -> None:
    body = _create()
    assert body["title"] == "Groceries"
    assert body["body"] == ""
    assert body["owner"] == "ana"
    assert body["members"] == ["ana"]
    assert body["rev"] == 0
    assert body["id"].startswith("n-")


def test_create_marks_the_owner_as_able_to_manage(as_user) -> None:
    assert _create()["can_manage"] is True


def test_create_rejects_a_blank_title(as_user) -> None:
    response = client.post("/api/shared-notes/notes", json={"title": "   "})
    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


def test_create_never_takes_the_owner_from_the_request(as_user) -> None:
    response = client.post(
        "/api/shared-notes/notes",
        json={"title": "Groceries", "owner": "mallory", "members": ["mallory"]},
    )
    assert response.status_code == 200
    assert response.json()["owner"] == "ana"
    assert response.json()["members"] == ["ana"]


# ── GET /notes ────────────────────────────────────────────────────────────────


def test_list_returns_only_my_notes(as_user) -> None:
    mine = _create("Mine")
    as_user("bo")
    _create("Theirs")

    as_user("ana")
    body = client.get("/api/shared-notes/notes").json()
    assert [n["id"] for n in body] == [mine["id"]]


def test_list_includes_notes_shared_with_me(as_user) -> None:
    as_user("bo")
    theirs = _create("Bo's note")
    _share_with(theirs["id"], "ana")

    as_user("ana")
    body = client.get("/api/shared-notes/notes").json()
    assert [n["id"] for n in body] == [theirs["id"]]
    assert body[0]["owner"] == "bo"


def test_list_is_newest_updated_first(as_user, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import shared_notes_service as service

    # `now_iso` has second granularity, so three writes in the same second
    # would tie and leave the assertion resolving on filename order. Drive the
    # clock instead, which is what the ordering actually keys off.
    stamps = iter(
        [
            "2026-09-20T10:00:01Z",
            "2026-09-20T10:00:02Z",
            "2026-09-20T10:00:03Z",
        ]
    )
    monkeypatch.setattr(service, "now_iso", lambda: next(stamps))

    first = _create("First")
    second = _create("Second")
    # Touch the older note so it becomes the most recently updated.
    client.put(f"/api/shared-notes/notes/{first['id']}", json={"body": "hi"})

    body = client.get("/api/shared-notes/notes").json()
    assert [n["id"] for n in body] == [first["id"], second["id"]]


def test_list_flags_a_note_with_more_than_one_member_as_shared(as_user) -> None:
    solo = _create("Solo")
    shared = _create("Shared")
    _share_with(shared["id"], "bo")

    by_id = {n["id"]: n for n in client.get("/api/shared-notes/notes").json()}
    assert by_id[solo["id"]]["shared"] is False
    assert by_id[shared["id"]]["shared"] is True


def test_list_summaries_carry_no_body(as_user) -> None:
    _create()
    assert "body" not in client.get("/api/shared-notes/notes").json()[0]


def test_list_is_empty_for_a_user_with_no_notes(as_user) -> None:
    assert client.get("/api/shared-notes/notes").json() == []


# ── GET /notes/{id} ───────────────────────────────────────────────────────────


def test_get_returns_the_full_note_for_its_owner(as_user) -> None:
    created = _create()
    body = client.get(f"/api/shared-notes/notes/{created['id']}").json()
    assert body["title"] == "Groceries"
    assert body["body"] == ""
    assert body["members"] == ["ana"]
    assert body["can_manage"] is True


def test_get_allows_a_member_but_does_not_let_them_manage(as_user) -> None:
    created = _create()
    _share_with(created["id"], "bo")

    as_user("bo")
    body = client.get(f"/api/shared-notes/notes/{created['id']}").json()
    assert body["owner"] == "ana"
    assert body["can_manage"] is False


def test_get_is_404_for_a_non_member(as_user) -> None:
    created = _create()
    as_user("mallory")
    response = client.get(f"/api/shared-notes/notes/{created['id']}")
    assert response.status_code == 404
    assert isinstance(response.json()["detail"], str)


def test_a_non_member_cannot_tell_a_note_exists(as_user) -> None:
    created = _create()
    as_user("mallory")
    existing = client.get(f"/api/shared-notes/notes/{created['id']}")
    missing = client.get("/api/shared-notes/notes/n-00000000")
    assert existing.status_code == missing.status_code == 404
    assert existing.json() == missing.json()


def test_get_is_422_for_an_unsafe_note_id(as_user) -> None:
    assert client.get("/api/shared-notes/notes/n-ab.json").status_code == 422


# ── PUT /notes/{id} ───────────────────────────────────────────────────────────


def test_update_writes_title_and_body_and_bumps_rev(as_user) -> None:
    created = _create()
    body = client.put(
        f"/api/shared-notes/notes/{created['id']}",
        json={"title": "Shopping", "body": "milk\neggs"},
    ).json()
    assert body["title"] == "Shopping"
    assert body["body"] == "milk\neggs"
    assert body["rev"] == created["rev"] + 1


def test_update_applies_only_the_supplied_field(as_user) -> None:
    created = _create()
    client.put(f"/api/shared-notes/notes/{created['id']}", json={"body": "milk"})
    body = client.put(f"/api/shared-notes/notes/{created['id']}", json={"title": "Shopping"}).json()
    assert body["title"] == "Shopping"
    assert body["body"] == "milk"


def test_update_persists_an_emptied_body_without_deleting_the_note(as_user) -> None:
    created = _create()
    client.put(f"/api/shared-notes/notes/{created['id']}", json={"body": "milk"})
    body = client.put(f"/api/shared-notes/notes/{created['id']}", json={"body": ""}).json()
    assert body["body"] == ""
    assert client.get(f"/api/shared-notes/notes/{created['id']}").status_code == 200


def test_update_stamps_updated_at_without_touching_created_at(as_user) -> None:
    created = _create()
    body = client.put(f"/api/shared-notes/notes/{created['id']}", json={"body": "x"}).json()
    assert body["created_at"] == created["created_at"]
    assert body["updated_at"] >= created["updated_at"]


def test_update_rejects_a_blank_title(as_user) -> None:
    created = _create()
    response = client.put(f"/api/shared-notes/notes/{created['id']}", json={"title": "  "})
    assert response.status_code == 422


def test_update_rejects_a_body_with_nothing_to_apply(as_user) -> None:
    created = _create()
    assert client.put(f"/api/shared-notes/notes/{created['id']}", json={}).status_code == 422


def test_a_member_may_edit_the_note(as_user) -> None:
    created = _create()
    _share_with(created["id"], "bo")

    as_user("bo")
    response = client.put(f"/api/shared-notes/notes/{created['id']}", json={"body": "from bo"})
    assert response.status_code == 200
    assert response.json()["body"] == "from bo"


def test_update_is_404_for_a_non_member(as_user) -> None:
    created = _create()
    as_user("mallory")
    response = client.put(f"/api/shared-notes/notes/{created['id']}", json={"body": "x"})
    assert response.status_code == 404


# ── DELETE /notes/{id} ────────────────────────────────────────────────────────


def test_owner_can_delete_their_note(as_user) -> None:
    created = _create()
    assert client.delete(f"/api/shared-notes/notes/{created['id']}").status_code == 204
    assert client.get(f"/api/shared-notes/notes/{created['id']}").status_code == 404


def test_a_member_who_is_not_the_owner_gets_403(as_user) -> None:
    created = _create()
    _share_with(created["id"], "bo")

    as_user("bo")
    response = client.delete(f"/api/shared-notes/notes/{created['id']}")
    assert response.status_code == 403
    assert isinstance(response.json()["detail"], str)

    as_user("ana")
    assert client.get(f"/api/shared-notes/notes/{created['id']}").status_code == 200


def test_a_non_member_gets_404_not_403(as_user) -> None:
    created = _create()
    as_user("mallory")
    # 403 would confirm the note exists; a stranger must learn nothing.
    assert client.delete(f"/api/shared-notes/notes/{created['id']}").status_code == 404


def test_delete_is_404_for_a_missing_note(as_user) -> None:
    assert client.delete("/api/shared-notes/notes/n-00000000").status_code == 404
