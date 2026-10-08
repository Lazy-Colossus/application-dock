"""Several apartments per user: create, duplicate, rename, delete, access (AP-1 to AP-6)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import APARTMENTS_MAX, PieceDraft, PlacementRequest
from app.services import auth_service
from app.services import floor_planner_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    for name in ("ana", "bo"):
        auth_service.create_user(name)


def _names(username: str) -> list[str]:
    return [s.name for s in service.list_apartments(username)]


def test_a_new_apartment_is_empty_owned_and_listed_first() -> None:
    service.list_apartments("ana")
    apt = service.create_apartment("ana", "  Summer flat ")
    assert (apt.name, apt.owner, apt.members, apt.locked) == (
        "Summer flat",
        "ana",
        ["ana"],
        False,
    )
    assert [layout.name for layout in apt.layouts] == ["Layout A"]
    assert _names("ana") == ["Summer flat", "My apartment"]


def test_the_list_follows_the_latest_change() -> None:
    first = service.list_apartments("ana")[0].id
    service.create_apartment("ana", "Second")
    service.set_locked("ana", first, 0, True)
    assert _names("ana") == ["My apartment", "Second"]


@pytest.mark.parametrize("bad", ["", "   ", "x" * 61])
def test_names_are_one_to_sixty_characters(bad: str) -> None:
    with pytest.raises(ValueError, match="1–60"):
        service.create_apartment("ana", bad)


def test_a_duplicate_copies_everything_and_belongs_to_the_caller_alone() -> None:
    source = service.list_apartments("ana")[0].id
    service.add_member("ana", source, "bo")
    apt = service.add_pieces(
        "ana",
        source,
        [PieceDraft(name="Sofa", colour="grey", shape="rectangle", width_cm=200, depth_cm=90)],
    )
    sofa, layout = apt.furniture[0].id, apt.layouts[0].id
    service.set_locked("ana", source, 0, True)
    service.place_piece("ana", source, layout, sofa, PlacementRequest(x_cm=100, y_cm=100))

    copy = service.duplicate_apartment("bo", source, "Try B")
    assert copy.id != source
    assert (copy.name, copy.owner, copy.members, copy.rev, copy.plan_rev) == (
        "Try B",
        "bo",
        ["bo"],
        0,
        0,
    )
    assert copy.locked is True
    assert [p.name for p in copy.furniture] == ["Sofa"]
    assert copy.layouts[0].placements[0].x_cm == 100

    service.rename_layout("bo", copy.id, layout, "Changed")
    assert service.get_apartment("ana", source).layouts[0].name == "Layout A"


def test_any_member_renames() -> None:
    apt = service.list_apartments("ana")[0].id
    service.add_member("ana", apt, "bo")
    assert service.rename_apartment("bo", apt, "Our flat").name == "Our flat"
    assert _names("ana") == ["Our flat"]


def test_deleting_removes_it_for_every_member() -> None:
    keep = service.list_apartments("ana")[0].id
    doomed = service.create_apartment("ana", "Doomed").id
    service.add_member("ana", doomed, "bo")
    left = service.delete_apartment("ana", doomed)
    assert [s.id for s in left] == [keep]
    assert all(s.id != doomed for s in service.list_apartments("bo"))
    with pytest.raises(repo.ApartmentGoneError):
        repo.read_apartment(doomed)


def test_only_the_owner_deletes() -> None:
    apt = service.list_apartments("ana")[0].id
    service.add_member("ana", apt, "bo")
    with pytest.raises(PermissionError):
        service.delete_apartment("bo", apt)


def test_deleting_the_last_one_starts_a_fresh_one() -> None:
    only = service.list_apartments("ana")[0].id
    [fresh] = service.delete_apartment("ana", only)
    assert fresh.id != only
    assert fresh.name == "My apartment"


def test_someone_elses_apartment_is_not_found() -> None:
    theirs = service.list_apartments("ana")[0].id
    with pytest.raises(FileNotFoundError):
        service.get_apartment("bo", theirs)
    with pytest.raises(FileNotFoundError):
        service.set_locked("bo", theirs, 0, True)
    with pytest.raises(FileNotFoundError):
        service.duplicate_apartment("bo", theirs, "Mine now")


def test_a_user_holds_at_most_the_limit() -> None:
    service.list_apartments("ana")
    for i in range(APARTMENTS_MAX - 1):
        service.create_apartment("ana", f"Flat {i}")
    with pytest.raises(ValueError, match=f"{APARTMENTS_MAX} apartments"):
        service.create_apartment("ana", "One too many")
    with pytest.raises(ValueError, match=f"{APARTMENTS_MAX} apartments"):
        service.duplicate_apartment("ana", service.list_apartments("ana")[0].id, "Copy")


def test_the_one_apartment_per_user_format_still_reads(tmp_path: Path) -> None:
    """Before 1.5, memberships.json mapped each user to one id and docs had no name."""
    old = "a_" + "0" * 32
    root = tmp_path / "floor-planner"
    (root / "apartments").mkdir(parents=True)
    (root / "apartments" / f"{old}.json").write_text(json.dumps({"id": old, "owner": "ana"}))
    (root / "memberships.json").write_text(json.dumps({"ana": old, "bo": old}))

    [summary] = service.list_apartments("bo")
    assert (summary.id, summary.name, summary.members) == (old, "My apartment", ["ana", "bo"])
    service.create_apartment("ana", "New")
    assert json.loads((root / "memberships.json").read_text())["bo"] == [old]
