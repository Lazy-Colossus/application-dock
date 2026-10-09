"""Business rules of the ISS Vanguard resource tracker."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import iss_vanguard_repo as repo
from app.schemas.iss_vanguard import ProjectWriteRequest
from app.services import iss_vanguard_events as events
from app.services import iss_vanguard_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


@pytest.fixture
def published(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict]]:
    spy: list[tuple[str, dict]] = []
    monkeypatch.setattr(events, "publish", lambda key, event: spy.append((key, event)))
    return spy


def test_a_new_user_reads_an_empty_ship_they_own_without_creating_it(tmp_path: Path) -> None:
    ship = service.get_ship("ana")
    assert (ship.id, ship.owner, ship.members, ship.is_owner, ship.rev) == (
        None,
        "ana",
        ["ana"],
        True,
        0,
    )
    assert ship.projects == []
    assert not (tmp_path / "iss-vanguard").exists()


def test_ensure_ship_creates_one_ship_and_is_idempotent() -> None:
    first = service.ensure_ship("ana")
    assert service.ensure_ship("ana") == first
    assert repo.read_memberships() == {"ana": first}


def test_the_first_tap_creates_the_ship_and_counts() -> None:
    ship = service.adjust_stock("ana", "minerals", "rare", 1)
    assert ship.id is not None
    assert ship.stock["minerals"]["rare"] == 1
    assert ship.rev == 1
    assert service.get_ship("ana").stock["minerals"]["rare"] == 1


def test_stock_goes_down_but_never_below_zero() -> None:
    service.adjust_stock("ana", "minerals", "rare", 1)
    assert service.adjust_stock("ana", "minerals", "rare", -1).stock["minerals"]["rare"] == 0
    with pytest.raises(ValueError, match="already at 0"):
        service.adjust_stock("ana", "minerals", "rare", -1)
    assert service.get_ship("ana").rev == 2


def test_every_write_publishes_ship_changed_with_the_new_rev(
    published: list[tuple[str, dict]],
) -> None:
    ship = service.adjust_stock("ana", "minerals", "basic", 1)
    assert published == [
        (ship.id, {"type": "ship.changed", "ship_id": ship.id, "rev": 1, "actor": "ana"})
    ]


def test_a_refused_write_publishes_nothing(published: list[tuple[str, dict]]) -> None:
    with pytest.raises(ValueError):
        service.adjust_stock("ana", "minerals", "basic", -1)
    assert published == []


def _req(code: str = "VB07", **kw: object) -> ProjectWriteRequest:
    return ProjectWriteRequest(code=code, **kw)


def test_create_project_strips_and_stores_it() -> None:
    ship = service.create_project(
        "ana", _req("  VB07 ", name=" Reactor ", cost={"minerals": {"rare": 2}})
    )
    (project,) = ship.projects
    assert (project.code, project.name, project.done) == ("VB07", "Reactor", False)
    assert project.id.startswith("p-")
    assert project.cost["minerals"]["rare"] == 2


def test_a_blank_code_is_refused() -> None:
    with pytest.raises(ValueError, match="code"):
        service.create_project("ana", _req("   "))


def test_a_prerequisite_must_be_another_project_on_this_ship() -> None:
    first = service.create_project("ana", _req("VB03")).projects[0]
    second = service.create_project("ana", _req("VB07", prerequisite_id=first.id)).projects[1]
    assert second.prerequisite_id == first.id
    with pytest.raises(ValueError, match="prerequisite"):
        service.create_project("ana", _req("VB09", prerequisite_id="p-00000000"))
    with pytest.raises(ValueError, match="itself"):
        service.update_project("ana", first.id, _req("VB03", prerequisite_id=first.id))


def test_update_replaces_fields_but_keeps_done() -> None:
    project = service.create_project("ana", _req("VB07")).projects[0]
    service.adjust_stock("ana", "minerals", "basic", 1)
    service.complete_project("ana", project.id)
    updated = service.update_project(
        "ana", project.id, _req("VB08", name="Lab", cost={"minerals": {"basic": 1}})
    ).projects[0]
    assert (updated.code, updated.name, updated.done) == ("VB08", "Lab", True)


def test_editing_or_deleting_an_unknown_project_is_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        service.update_project("ana", "p-00000000", _req())
    with pytest.raises(FileNotFoundError):
        service.delete_project("ana", "p-00000000")


def test_deleting_a_project_clears_prerequisites_pointing_at_it() -> None:
    first = service.create_project("ana", _req("VB03")).projects[0]
    service.create_project("ana", _req("VB07", prerequisite_id=first.id))
    ship = service.delete_project("ana", first.id)
    assert [(p.code, p.prerequisite_id) for p in ship.projects] == [("VB07", None)]


def test_complete_deducts_cost_and_reopen_restores_it() -> None:
    for _ in range(3):
        service.adjust_stock("ana", "minerals", "rare", 1)
    project = service.create_project("ana", _req(cost={"minerals": {"rare": 2}})).projects[0]

    done = service.complete_project("ana", project.id)
    assert done.stock["minerals"]["rare"] == 1
    assert done.projects[0].done is True

    reopened = service.reopen_project("ana", project.id)
    assert reopened.stock["minerals"]["rare"] == 3
    assert reopened.projects[0].done is False


def test_completing_with_short_stock_clamps_at_zero_and_reopen_restores_full_cost() -> None:
    service.adjust_stock("ana", "minerals", "rare", 1)
    project = service.create_project("ana", _req(cost={"minerals": {"rare": 2}})).projects[0]
    assert service.complete_project("ana", project.id).stock["minerals"]["rare"] == 0
    # Reopening restores the whole cost, not what was actually taken: the game
    # state is what the crew says it is, and the clamp only guards against negatives.
    assert service.reopen_project("ana", project.id).stock["minerals"]["rare"] == 2


def test_complete_twice_and_reopen_open_are_refused() -> None:
    project = service.create_project("ana", _req()).projects[0]
    with pytest.raises(ValueError, match="isn't done"):
        service.reopen_project("ana", project.id)
    service.complete_project("ana", project.id)
    with pytest.raises(ValueError, match="already done"):
        service.complete_project("ana", project.id)
