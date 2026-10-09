"""Resolving a user's cabinet, and migrating legacy per-user files into one."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import Tea, TeaWriteRequest
from app.services import auth_service, tea_service
from app.services import tea_cabinet_service as cabinets
from tests.tea_support import share


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _write_legacy(tmp_path: Path, username: str = "alice") -> None:
    tea = Tea(
        id="t-abc12345",
        name="Da Hong Pao",
        catalogue_node_id="oolong",
        grams_remaining=38,
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )
    raw = {"schema_version": 2, "teas": [tea.model_dump(mode="json")], "sessions": []}
    path = tmp_path / "tea" / "users" / f"{username}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw), encoding="utf-8")


def test_a_new_user_has_no_cabinet_and_reads_an_empty_one_they_own(tmp_path: Path) -> None:
    assert cabinets.resolve("alice") is None
    doc = cabinets.read_doc_for("alice")
    assert (doc.id, doc.owner, doc.teas) == ("", "alice", [])
    assert not (tmp_path / "tea" / "memberships.json").exists()


def test_ensure_creates_one_cabinet_and_is_idempotent() -> None:
    first = cabinets.ensure("alice")
    assert cabinets.ensure("alice") == first
    assert cabinets.resolve("alice") == first
    assert repo.read_memberships() == {"alice": first}
    assert repo.read_doc(first).owner == "alice"


def test_resolve_migrates_a_legacy_file(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    cabinet_id = cabinets.resolve("alice")
    assert cabinet_id is not None
    assert repo.read_memberships() == {"alice": cabinet_id}
    assert [t.id for t in cabinets.read_doc_for("alice").teas] == ["t-abc12345"]
    assert not repo.legacy_exists("alice")


def test_a_crash_before_the_map_write_is_redone_on_the_same_cabinet(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    interrupted = repo.adopt_legacy("alice", referenced=set())  # crashed before mapping
    assert cabinets.resolve("alice") == interrupted
    assert len(list((tmp_path / "tea" / "cabinets").glob("c_*.json"))) == 1


def test_a_leftover_legacy_file_is_deleted_once_mapped(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    cabinet_id = repo.adopt_legacy("alice", referenced=set())
    repo.write_memberships({"alice": cabinet_id})  # crashed before deleting the legacy file
    assert cabinets.resolve("alice") == cabinet_id
    assert not repo.legacy_exists("alice")


def test_ensure_on_a_legacy_user_migrates_rather_than_starting_empty(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    cabinet_id = cabinets.ensure("alice")
    assert [t.id for t in repo.read_doc(cabinet_id).teas] == ["t-abc12345"]


def test_a_cabinet_deleted_under_a_mapped_user_reads_as_gone() -> None:
    cabinet_id = cabinets.ensure("alice")
    repo.delete_cabinet(cabinet_id)
    with pytest.raises(cabinets.CabinetGoneError):
        cabinets.read_doc_for("alice")


def _users(*names: str) -> None:
    for name in names:
        auth_service.create_user(name)


def _add_tea(username: str) -> str:
    req = TeaWriteRequest(name="Longjing", catalogue_node_id="green")
    return tea_service.create_tea(username, req).id


def test_a_new_user_sees_a_cabinet_of_their_own() -> None:
    view = cabinets.get_cabinet("alice")
    assert (view.id, view.owner, view.members, view.is_owner) == (None, "alice", ["alice"], True)


def test_the_owner_adds_a_member_who_then_shares_everything() -> None:
    tea_id = _add_tea("alice")
    share("alice", "bob")

    view = cabinets.get_cabinet("bob")
    assert view.members == ["alice", "bob"]
    assert (view.owner, view.is_owner) == ("alice", False)
    assert cabinets.resolve("bob") == cabinets.resolve("alice")
    assert [t.id for t in tea_service.list_teas("bob")] == [tea_id]


def test_add_member_strips_whitespace() -> None:
    _users("alice", "bob")
    assert cabinets.add_member("alice", " bob ").members == ["alice", "bob"]


def test_joining_removes_the_joiners_empty_cabinet(tmp_path: Path) -> None:
    _users("alice", "bob")
    old = cabinets.ensure("bob")
    cabinets.add_member("alice", "bob")
    assert not (tmp_path / "tea" / "cabinets" / f"{old}.json").exists()


@pytest.mark.parametrize(
    ("username", "message"),
    [("nobody", "no one called"), ("alice", "already in this cabinet")],
)
def test_add_member_refuses_unknown_names_and_yourself(username: str, message: str) -> None:
    _users("alice")
    with pytest.raises(ValueError, match=message):
        cabinets.add_member("alice", username)


def test_add_member_refuses_someone_already_here() -> None:
    share("alice", "bob")
    with pytest.raises(ValueError, match="already in this cabinet"):
        cabinets.add_member("alice", "bob")


def test_only_the_owner_adds_people() -> None:
    share("alice", "bob")
    _users("carol")
    with pytest.raises(PermissionError):
        cabinets.add_member("bob", "carol")


def test_add_member_refuses_someone_with_teas() -> None:
    _users("alice", "bob")
    _add_tea("bob")
    with pytest.raises(ValueError, match="bob already has teas in their cabinet"):
        cabinets.add_member("alice", "bob")
    assert cabinets.get_cabinet("alice").members == ["alice"]


def test_add_member_refuses_a_legacy_user_with_teas(tmp_path: Path) -> None:
    _users("alice", "bob")
    _write_legacy(tmp_path, "bob")
    with pytest.raises(ValueError, match="already has teas"):
        cabinets.add_member("alice", "bob")


@pytest.mark.parametrize("target", ["bob", "carol"])
def test_add_member_refuses_someone_who_shares_another_cabinet(target: str) -> None:
    share("bob", "carol")
    _users("alice")
    with pytest.raises(ValueError, match="already shares a cabinet"):
        cabinets.add_member("alice", target)


def test_the_owner_removes_a_member_who_then_starts_empty() -> None:
    share("alice", "bob")
    view = cabinets.remove_member("alice", "bob")
    assert view.members == ["alice"]
    assert cabinets.resolve("bob") is None
    assert cabinets.get_cabinet("bob").members == ["bob"]


def test_a_member_leaves_and_starts_empty() -> None:
    _add_tea("alice")
    share("alice", "bob")
    view = cabinets.remove_member("bob", "bob")
    assert (view.id, view.members) == (None, ["bob"])
    assert tea_service.list_teas("bob") == []
    assert len(tea_service.list_teas("alice")) == 1


def test_leaving_after_a_migration_starts_empty(tmp_path: Path) -> None:
    _users("alice", "bob")
    cabinets.ensure("bob")
    share("alice", "bob")
    _write_legacy(tmp_path, "bob")  # a stale leftover that must never come back
    cabinets.resolve("bob")
    cabinets.remove_member("bob", "bob")
    assert tea_service.list_teas("bob") == []


def test_a_member_cannot_remove_someone_else() -> None:
    share("alice", "bob", "carol")
    with pytest.raises(PermissionError):
        cabinets.remove_member("bob", "carol")


def test_the_owner_cannot_leave() -> None:
    share("alice", "bob")
    with pytest.raises(ValueError, match="owner can't leave"):
        cabinets.remove_member("alice", "alice")


def test_removing_a_non_member_is_not_found() -> None:
    share("alice", "bob")
    _users("carol")
    with pytest.raises(FileNotFoundError):
        cabinets.remove_member("alice", "carol")
