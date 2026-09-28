"""Business rules of the ISS Vanguard resource tracker."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import iss_vanguard_repo as repo
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
