"""Sharing lifecycle for Shared Notes (Story 2.1).

Membership is the whole access model, so these tests lean on the distinction
that matters: a non-member gets `404` (the note does not exist, as far as they
can tell) while a member who is not the owner gets `403`.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.core.dependencies import get_current_user
from app.main import app
from app.repositories import shared_notes_repo as repo
from app.services import auth_service

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    # A real roster, so share targets validate against the platform's users.
    for name in ("ana", "bo", "cy"):
        auth_service.create_user(name)


def as_user(username: str) -> None:
    """Route subsequent requests through `username` (overrides the auth dep)."""
    app.dependency_overrides[get_current_user] = lambda: username


@pytest.fixture(autouse=True)
def restore_default_user():
    yield
    app.dependency_overrides[get_current_user] = lambda: "test_user"


def make_note(owner: str, title: str = "Groceries") -> str:
    as_user(owner)
    response = client.post("/api/shared-notes/notes", json={"title": title})
    assert response.status_code == 200, response.text
    return response.json()["id"]


def share(note_id: str, usernames: list[str]):
    return client.post(f"/api/shared-notes/notes/{note_id}/share", json={"usernames": usernames})


# ── sharing (AC-1) ────────────────────────────────────────────────────────────


def test_share_adds_the_named_users_to_members() -> None:
    note_id = make_note("ana")
    response = share(note_id, ["bo"])

    assert response.status_code == 200
    assert response.json()["members"] == ["ana", "bo"]


def test_a_shared_note_resolves_for_the_new_member() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])

    as_user("bo")
    assert client.get(f"/api/shared-notes/notes/{note_id}").status_code == 200


def test_a_shared_note_appears_in_the_new_members_list() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])

    as_user("bo")
    body = client.get("/api/shared-notes/notes").json()
    assert [n["id"] for n in body] == [note_id]
    assert body[0]["shared"] is True
    assert body[0]["owner"] == "ana"


def test_sharing_again_unions_rather_than_replaces() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])
    response = share(note_id, ["cy"])

    assert response.json()["members"] == ["ana", "bo", "cy"]


def test_sharing_with_an_existing_member_is_idempotent() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])
    response = share(note_id, ["bo"])

    assert response.json()["members"] == ["ana", "bo"]


def test_the_owner_stays_first_in_members() -> None:
    note_id = make_note("ana")
    share(note_id, ["cy", "bo"])

    assert share(note_id, []).json()["members"][0] == "ana"


def test_sharing_with_the_owner_does_not_duplicate_them() -> None:
    note_id = make_note("ana")
    response = share(note_id, ["ana", "bo"])

    assert response.json()["members"] == ["ana", "bo"]


# ── unknown users (AC-4) ──────────────────────────────────────────────────────


def test_sharing_with_an_unknown_user_is_rejected() -> None:
    note_id = make_note("ana")
    response = share(note_id, ["nobody"])

    assert response.status_code == 422
    assert isinstance(response.json()["detail"], str)


def test_one_bad_name_in_a_batch_persists_no_partial_change() -> None:
    note_id = make_note("ana")
    assert share(note_id, ["bo", "nobody"]).status_code == 422

    note = repo.read_note(note_id)
    assert note is not None
    assert note.members == ["ana"]


# ── removing a member (AC-2) ──────────────────────────────────────────────────


def test_removing_a_member_drops_them_from_the_roster() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])

    response = client.delete(f"/api/shared-notes/notes/{note_id}/share/bo")
    assert response.status_code == 200
    assert response.json()["members"] == ["ana"]


def test_a_removed_member_loses_access() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])
    client.delete(f"/api/shared-notes/notes/{note_id}/share/bo")

    as_user("bo")
    assert client.get(f"/api/shared-notes/notes/{note_id}").status_code == 404
    assert client.get("/api/shared-notes/notes").json() == []


def test_the_owner_cannot_be_removed() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])

    response = client.delete(f"/api/shared-notes/notes/{note_id}/share/ana")
    assert response.status_code == 422
    assert repo.read_note(note_id).members == ["ana", "bo"]  # type: ignore[union-attr]


def test_removing_someone_who_is_not_a_member_is_idempotent() -> None:
    note_id = make_note("ana")

    response = client.delete(f"/api/shared-notes/notes/{note_id}/share/bo")
    assert response.status_code == 200
    assert response.json()["members"] == ["ana"]


def test_removing_the_last_member_leaves_a_note_of_one() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])
    client.delete(f"/api/shared-notes/notes/{note_id}/share/bo")

    as_user("ana")
    body = client.get("/api/shared-notes/notes").json()
    assert body[0]["shared"] is False


# ── owner-only management (AC-3) ──────────────────────────────────────────────


def test_a_member_cannot_share_the_note() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])

    as_user("bo")
    response = share(note_id, ["cy"])
    assert response.status_code == 403
    assert isinstance(response.json()["detail"], str)


def test_a_member_cannot_remove_another_member() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo", "cy"])

    as_user("bo")
    response = client.delete(f"/api/shared-notes/notes/{note_id}/share/cy")
    assert response.status_code == 403
    assert repo.read_note(note_id).members == ["ana", "bo", "cy"]  # type: ignore[union-attr]


def test_a_member_cannot_delete_the_note() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])

    as_user("bo")
    assert client.delete(f"/api/shared-notes/notes/{note_id}").status_code == 403


# ── isolation (AC-5) ──────────────────────────────────────────────────────────


def test_a_non_member_sharing_gets_404_not_403() -> None:
    note_id = make_note("ana")

    as_user("cy")
    # 403 would confirm the note exists; a stranger must learn nothing.
    assert share(note_id, ["bo"]).status_code == 404


def test_a_non_member_removing_gets_404_not_403() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])

    as_user("cy")
    assert client.delete(f"/api/shared-notes/notes/{note_id}/share/bo").status_code == 404


def test_share_on_a_missing_note_matches_a_non_member_exactly() -> None:
    note_id = make_note("ana")
    as_user("cy")

    existing = share(note_id, ["bo"])
    missing = share("n-00000000", ["bo"])
    assert existing.status_code == missing.status_code == 404
    assert existing.json() == missing.json()


# ── the live-layer signal (AC-6) ──────────────────────────────────────────────


def test_a_membership_change_stamps_updated_at_without_bumping_content_rev(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.services import shared_notes_service as service

    stamps = iter(["2026-09-20T10:00:00Z", "2026-09-20T10:00:05Z"])
    monkeypatch.setattr(service, "now_iso", lambda: next(stamps))

    note_id = make_note("ana")
    before = repo.read_note(note_id)
    share(note_id, ["bo"])
    after = repo.read_note(note_id)

    assert before is not None and after is not None
    assert after.updated_at != before.updated_at
    # `rev` tracks content, not membership — Story 2.2 keys its refetch off it.
    assert after.rev == before.rev


def test_can_manage_stays_owner_only_on_a_shared_note() -> None:
    note_id = make_note("ana")
    share(note_id, ["bo"])

    as_user("bo")
    assert client.get(f"/api/shared-notes/notes/{note_id}").json()["can_manage"] is False
    as_user("ana")
    assert client.get(f"/api/shared-notes/notes/{note_id}").json()["can_manage"] is True
