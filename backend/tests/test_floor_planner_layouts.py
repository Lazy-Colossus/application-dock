"""Layouts and placements (LA-1 to LA-5)."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import PieceDraft, PlacementRequest
from app.services import auth_service
from app.services import floor_planner_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    auth_service.create_user("ana")


def _apt(username: str) -> str:
    return service.list_apartments(username)[0].id


@pytest.fixture
def ids() -> tuple[str, str, str]:
    """A locked 10 × 8 m plan with a sofa and a chair; returns (layout, sofa, chair)."""
    apt = service.add_pieces(
        "ana",
        _apt("ana"),
        [
            PieceDraft(name="Sofa", colour="grey", shape="rectangle", width_cm=220, depth_cm=95),
            PieceDraft(name="Chair", colour="green", shape="egg", width_cm=85, depth_cm=90),
        ],
    )
    service.set_locked("ana", _apt("ana"), 0, True)
    return apt.layouts[0].id, apt.furniture[0].id, apt.furniture[1].id


def _at(x: int, y: int, rotation: int = 0) -> PlacementRequest:
    return PlacementRequest(x_cm=x, y_cm=y, rotation=rotation)


def _placements(layout_index: int = 0) -> list[tuple[str, int, int, int]]:
    layout = service.get_apartment("ana", _apt("ana")).layouts[layout_index]
    return [(p.furniture_id, p.x_cm, p.y_cm, p.rotation) for p in layout.placements]


def test_arranging_needs_a_locked_plan(ids: tuple[str, str, str]) -> None:
    layout, sofa, _ = ids
    service.set_locked("ana", _apt("ana"), 1, False)
    with pytest.raises(ValueError, match="Lock the plan"):
        service.place_piece("ana", _apt("ana"), layout, sofa, _at(100, 100))
    with pytest.raises(ValueError, match="Lock the plan"):
        service.remove_placement("ana", _apt("ana"), layout, sofa)


def test_placing_a_piece_twice_moves_it(ids: tuple[str, str, str]) -> None:
    layout, sofa, chair = ids
    service.place_piece("ana", _apt("ana"), layout, sofa, _at(100, 100))
    service.place_piece("ana", _apt("ana"), layout, chair, _at(400, 100))
    service.place_piece("ana", _apt("ana"), layout, sofa, _at(200, 300, 90))
    assert sorted(_placements()) == sorted([(chair, 400, 100, 0), (sofa, 200, 300, 90)])


def test_a_rotation_must_be_a_right_angle() -> None:
    with pytest.raises(ValidationError):
        _at(0, 0, 45)


@pytest.mark.parametrize(
    ("x", "y", "ok"),
    [
        (1000 - 110, 300, True),  # centre exactly on the right edge
        (1000 - 109, 300, False),  # centre just past it
        (-110, 300, True),  # centre exactly on the left edge
        (-111, 300, False),
        (100, -48, False),  # 95 cm deep: centre at -0.5
    ],
)
def test_the_centre_must_stay_on_the_plan(
    ids: tuple[str, str, str], x: int, y: int, ok: bool
) -> None:
    layout, sofa, _ = ids
    if ok:
        service.place_piece("ana", _apt("ana"), layout, sofa, _at(x, y))
    else:
        with pytest.raises(ValueError, match="on the plan"):
            service.place_piece("ana", _apt("ana"), layout, sofa, _at(x, y))


def test_unknown_layouts_and_pieces_are_not_found(ids: tuple[str, str, str]) -> None:
    layout, sofa, _ = ids
    with pytest.raises(FileNotFoundError, match="layout"):
        service.place_piece("ana", _apt("ana"), "l_gone", sofa, _at(0, 0))
    with pytest.raises(FileNotFoundError, match="piece"):
        service.place_piece("ana", _apt("ana"), layout, "f_gone", _at(0, 0))


def test_back_to_tray_twice_is_harmless(ids: tuple[str, str, str]) -> None:
    layout, sofa, _ = ids
    service.place_piece("ana", _apt("ana"), layout, sofa, _at(100, 100))
    service.remove_placement("ana", _apt("ana"), layout, sofa)
    service.remove_placement("ana", _apt("ana"), layout, sofa)
    assert _placements() == []


def test_layouts_are_created_renamed_and_capped(ids: tuple[str, str, str]) -> None:
    layout, _, _ = ids
    apt = service.create_layout("ana", _apt("ana"), "  Layout B ")
    assert [lay.name for lay in apt.layouts] == ["Layout A", "Layout B"]
    for bad in ("   ", "x" * 41):
        with pytest.raises(ValueError, match="1–40"):
            service.create_layout("ana", _apt("ana"), bad)
    assert service.rename_layout("ana", _apt("ana"), layout, "Sofa by window").layouts[0].name == (
        "Sofa by window"
    )
    for i in range(18):
        service.create_layout("ana", _apt("ana"), f"L{i}")
    with pytest.raises(ValueError, match="at most 20"):
        service.create_layout("ana", _apt("ana"), "One too many")


def test_duplicating_copies_placements_independently(ids: tuple[str, str, str]) -> None:
    layout, sofa, _ = ids
    service.place_piece("ana", _apt("ana"), layout, sofa, _at(100, 100))
    apt = service.duplicate_layout("ana", _apt("ana"), layout)
    copy = apt.layouts[1]
    assert copy.name == "Layout A copy"
    service.place_piece("ana", _apt("ana"), copy.id, sofa, _at(500, 500))
    assert _placements(0) == [(sofa, 100, 100, 0)]
    assert _placements(1) == [(sofa, 500, 500, 0)]


def test_the_last_layout_cannot_be_deleted(ids: tuple[str, str, str]) -> None:
    layout, _, _ = ids
    with pytest.raises(ValueError, match="at least one"):
        service.delete_layout("ana", _apt("ana"), layout)
    other = service.create_layout("ana", _apt("ana"), "Layout B").layouts[1].id
    assert [lay.id for lay in service.delete_layout("ana", _apt("ana"), layout).layouts] == [other]


def test_arranging_never_touches_plan_rev(ids: tuple[str, str, str]) -> None:
    layout, sofa, _ = ids
    before = service.get_apartment("ana", _apt("ana")).plan_rev
    service.place_piece("ana", _apt("ana"), layout, sofa, _at(100, 100))
    service.create_layout("ana", _apt("ana"), "Layout B")
    assert service.get_apartment("ana", _apt("ana")).plan_rev == before
