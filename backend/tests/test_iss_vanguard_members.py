"""Who shares a ship (RT-9, RT-10)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import iss_vanguard_repo as repo
from app.schemas.iss_vanguard import ProjectWriteRequest
from app.services import auth_service
from app.services import iss_vanguard_events as events
from app.services import iss_vanguard_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    for name in ("ana", "bo", "cy"):
        auth_service.create_user(name)


@pytest.fixture
def published(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict]]:
    spy: list[tuple[str, dict]] = []
    monkeypatch.setattr(events, "publish", lambda key, event: spy.append((key, event)))
    return spy


def test_the_owner_adds_a_member_who_then_shares_everything() -> None:
    service.adjust_stock("ana", "minerals", "basic", 1)
    ship = service.add_member("ana", " bo ")
    assert ship.members == ["ana", "bo"]
    theirs = service.get_ship("bo")
    assert (theirs.id, theirs.is_owner) == (ship.id, False)
    assert service.adjust_stock("bo", "minerals", "basic", 1).stock["minerals"]["basic"] == 2


@pytest.mark.parametrize(("username", "message"), [("ana", "already"), ("zed", "no one")])
def test_add_member_refuses_yourself_and_unknown_names(username: str, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        service.add_member("ana", username)


def test_add_member_refuses_someone_already_aboard() -> None:
    service.add_member("ana", "bo")
    with pytest.raises(ValueError, match="already"):
        service.add_member("ana", "bo")


def test_only_the_owner_adds_people() -> None:
    service.add_member("ana", "bo")
    with pytest.raises(PermissionError):
        service.add_member("bo", "cy")


def test_add_member_refuses_someone_whose_own_ship_has_anything() -> None:
    service.create_project("bo", ProjectWriteRequest(code="VB01"))
    with pytest.raises(ValueError, match="their ship"):
        service.add_member("ana", "bo")
    service.delete_project("bo", service.get_ship("bo").projects[0].id)
    service.adjust_stock("bo", "minerals", "basic", 1)
    with pytest.raises(ValueError, match="their ship"):
        service.add_member("ana", "bo")


def test_add_member_refuses_someone_who_shares_another_ship() -> None:
    service.add_member("cy", "bo")
    with pytest.raises(ValueError, match="shares"):
        service.add_member("ana", "bo")


def test_joining_removes_the_joiners_empty_ship_and_tells_its_stream(
    published: list[tuple[str, dict]],
) -> None:
    old = service.ensure_ship("bo")
    ship = service.add_member("ana", "bo")
    with pytest.raises(repo.ShipGoneError):
        repo.read_ship(old)
    assert (old, {"type": "ship.closed", "ship_id": old, "reason": "joined", "member": "bo"}) in (
        published
    )
    assert (
        ship.id,
        {"type": "members.changed", "ship_id": ship.id, "members": ["ana", "bo"]},
    ) in published


def test_the_owner_removes_a_member_who_then_starts_empty(
    published: list[tuple[str, dict]],
) -> None:
    ship = service.add_member("ana", "bo")
    service.adjust_stock("ana", "minerals", "basic", 1)
    assert service.remove_member("ana", "bo").members == ["ana"]
    fresh = service.get_ship("bo")
    assert (fresh.id, fresh.is_owner) == (None, True)
    assert (
        ship.id,
        {"type": "ship.closed", "ship_id": ship.id, "reason": "removed", "member": "bo"},
    ) in published


def test_a_member_leaves() -> None:
    service.add_member("ana", "bo")
    assert service.remove_member("bo", "bo").members == ["bo"]
    assert service.get_ship("ana").members == ["ana"]


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
    service.ensure_ship("ana")
    with pytest.raises(FileNotFoundError):
        service.remove_member("ana", "cy")
