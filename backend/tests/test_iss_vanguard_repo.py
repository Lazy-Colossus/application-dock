"""Ship files and the membership map on disk."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import iss_vanguard_repo as repo


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def test_new_ship_writes_an_empty_ship_owned_by_the_caller(tmp_path: Path) -> None:
    ship_id = repo.new_ship("ana")
    assert ship_id.startswith("s_") and len(ship_id) == 34
    assert (tmp_path / "iss-vanguard" / "ships" / f"{ship_id}.json").is_file()
    doc = repo.read_ship(ship_id)
    assert (doc.id, doc.owner, doc.rev) == (ship_id, "ana", 0)


def test_a_transaction_writes_on_success_and_not_on_error() -> None:
    ship_id = repo.new_ship("ana")
    with repo.ship_transaction(ship_id) as doc:
        doc.stock["minerals"]["basic"] = 3
    assert repo.read_ship(ship_id).stock["minerals"]["basic"] == 3

    with pytest.raises(ValueError):
        with repo.ship_transaction(ship_id) as doc:
            doc.stock["minerals"]["basic"] = 9
            raise ValueError("refused")
    assert repo.read_ship(ship_id).stock["minerals"]["basic"] == 3


def test_a_deleted_ship_is_gone_and_a_transaction_does_not_resurrect_it() -> None:
    ship_id = repo.new_ship("ana")
    repo.delete_ship(ship_id)
    with pytest.raises(repo.ShipGoneError):
        repo.read_ship(ship_id)
    with pytest.raises(repo.ShipGoneError):
        with repo.ship_transaction(ship_id):
            pass
    with pytest.raises(repo.ShipGoneError):
        repo.read_ship(ship_id)


def test_memberships_round_trip_and_default_to_empty() -> None:
    assert repo.read_memberships() == {}
    repo.write_memberships({"ana": "s_" + "a" * 32})
    assert repo.read_memberships() == {"ana": "s_" + "a" * 32}


@pytest.mark.parametrize("bad", ["../x", "s_abc", "c_" + "0" * 32])
def test_unsafe_ship_ids_never_reach_a_path(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.read_ship(bad)
