"""Who shares an apartment (SH-1, revised in Story 1.5)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import APARTMENTS_MAX
from app.services import auth_service
from app.services import floor_planner_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    for name in ("ana", "bo", "cy"):
        auth_service.create_user(name)


@pytest.fixture
def ana() -> str:
    return service.list_apartments("ana")[0].id


def test_the_owner_adds_a_member_who_then_shares_everything(ana: str) -> None:
    service.rename_apartment("ana", ana, "Shared flat")
    apt = service.add_member("ana", ana, " bo ")
    assert apt.members == ["ana", "bo"]
    theirs = service.get_apartment("bo", ana)
    assert (theirs.is_owner, theirs.name) == (False, "Shared flat")
    assert service.rename_apartment("bo", ana, "Our flat").name == "Our flat"


def test_joining_keeps_the_joiners_own_apartments(ana: str) -> None:
    own = service.list_apartments("bo")[0].id
    service.add_member("ana", ana, "bo")
    assert {s.id for s in service.list_apartments("bo")} == {own, ana}


@pytest.mark.parametrize(("username", "message"), [("ana", "already"), ("zed", "no one")])
def test_add_member_refuses_yourself_and_unknown_names(
    ana: str, username: str, message: str
) -> None:
    with pytest.raises(ValueError, match=message):
        service.add_member("ana", ana, username)


def test_add_member_refuses_someone_already_sharing(ana: str) -> None:
    service.add_member("ana", ana, "bo")
    with pytest.raises(ValueError, match="already"):
        service.add_member("ana", ana, "bo")


def test_only_the_owner_adds_people(ana: str) -> None:
    service.add_member("ana", ana, "bo")
    with pytest.raises(PermissionError):
        service.add_member("bo", ana, "cy")


def test_add_member_refuses_someone_at_the_limit(ana: str) -> None:
    for i in range(APARTMENTS_MAX):
        service.create_apartment("bo", f"Flat {i}")
    with pytest.raises(ValueError, match=f"{APARTMENTS_MAX} apartments"):
        service.add_member("ana", ana, "bo")


def test_the_owner_removes_a_member(ana: str) -> None:
    service.add_member("ana", ana, "bo")
    assert service.remove_member("ana", ana, "bo").members == ["ana"]
    with pytest.raises(FileNotFoundError):
        service.get_apartment("bo", ana)


def test_a_member_leaves_and_lands_on_their_own_apartment(ana: str) -> None:
    service.add_member("ana", ana, "bo")
    [left_with] = service.leave_apartment("bo", ana)
    assert (left_with.name, left_with.is_owner) == ("My apartment", True)
    assert service.get_apartment("ana", ana).members == ["ana"]


def test_a_member_cannot_remove_someone_else(ana: str) -> None:
    service.add_member("ana", ana, "bo")
    service.add_member("ana", ana, "cy")
    with pytest.raises(PermissionError):
        service.remove_member("bo", ana, "cy")


def test_the_owner_cannot_leave(ana: str) -> None:
    service.add_member("ana", ana, "bo")
    with pytest.raises(ValueError, match="owner"):
        service.leave_apartment("ana", ana)


def test_removing_a_non_member_is_not_found(ana: str) -> None:
    with pytest.raises(FileNotFoundError):
        service.remove_member("ana", ana, "cy")
