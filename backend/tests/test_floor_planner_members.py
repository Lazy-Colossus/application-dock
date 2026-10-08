"""Who shares an apartment (SH-1)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import Label
from app.services import auth_service
from app.services import floor_planner_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    for name in ("ana", "bo", "cy"):
        auth_service.create_user(name)


def _add_label(username: str) -> None:
    # Nothing in story 1.1 writes a label, so put one straight onto the document.
    with repo.apartment_transaction(service.ensure_apartment(username)) as doc:
        doc.labels.append(Label(id="x", text="Hall", col=1, row=1))


def test_the_owner_adds_a_member_who_then_shares_everything() -> None:
    service.set_locked("ana", 0, True)
    apt = service.add_member("ana", " bo ")
    assert apt.members == ["ana", "bo"]
    theirs = service.get_apartment("bo")
    assert (theirs.id, theirs.is_owner, theirs.locked) == (apt.id, False, True)
    assert service.set_locked("bo", 1, False).locked is False


@pytest.mark.parametrize(("username", "message"), [("ana", "already"), ("zed", "no one")])
def test_add_member_refuses_yourself_and_unknown_names(username: str, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        service.add_member("ana", username)


def test_add_member_refuses_someone_already_sharing() -> None:
    service.add_member("ana", "bo")
    with pytest.raises(ValueError, match="already"):
        service.add_member("ana", "bo")


def test_only_the_owner_adds_people() -> None:
    service.add_member("ana", "bo")
    with pytest.raises(PermissionError):
        service.add_member("bo", "cy")


def test_add_member_refuses_someone_whose_own_apartment_has_anything() -> None:
    _add_label("bo")
    with pytest.raises(ValueError, match="of their own"):
        service.add_member("ana", "bo")


def test_add_member_accepts_someone_whose_apartment_was_only_locked() -> None:
    service.set_locked("bo", 0, True)
    assert service.add_member("ana", "bo").members == ["ana", "bo"]


def test_add_member_refuses_someone_who_shares_another_apartment() -> None:
    service.add_member("cy", "bo")
    with pytest.raises(ValueError, match="shares"):
        service.add_member("ana", "bo")


def test_joining_removes_the_joiners_empty_apartment() -> None:
    old = service.ensure_apartment("bo")
    service.add_member("ana", "bo")
    with pytest.raises(repo.ApartmentGoneError):
        repo.read_apartment(old)


def test_the_owner_removes_a_member_who_then_starts_empty() -> None:
    service.add_member("ana", "bo")
    service.set_locked("ana", 0, True)
    assert service.remove_member("ana", "bo").members == ["ana"]
    fresh = service.get_apartment("bo")
    assert (fresh.id, fresh.is_owner, fresh.locked) == (None, True, False)


def test_a_member_leaves() -> None:
    service.add_member("ana", "bo")
    assert service.remove_member("bo", "bo").members == ["bo"]
    assert service.get_apartment("ana").members == ["ana"]


def test_a_member_cannot_remove_someone_else() -> None:
    service.add_member("ana", "bo")
    service.add_member("ana", "cy")
    with pytest.raises(PermissionError):
        service.remove_member("bo", "cy")


def test_the_owner_cannot_leave() -> None:
    service.add_member("ana", "bo")
    with pytest.raises(ValueError, match="owner"):
        service.remove_member("ana", "ana")


def test_removing_a_non_member_is_not_found() -> None:
    service.ensure_apartment("ana")
    with pytest.raises(FileNotFoundError):
        service.remove_member("ana", "cy")
