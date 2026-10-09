"""Replacing the drawn plan (FP-2 to FP-8)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import (
    DoorSetting,
    Label,
    PieceDraft,
    PlacementRequest,
    PlanWriteRequest,
)
from app.services import auth_service
from app.services import floor_planner_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    auth_service.create_user("ana")


def _apt(username: str) -> str:
    return service.list_apartments(username)[0].id


def _plan(cols: int = 10, rows: int = 8, **over: Any) -> PlanWriteRequest:
    surface = [".." * cols for _ in range(rows)]
    feature = [".." * cols for _ in range(rows)]
    surface[1] = "t0" * 3 + ".." * (cols - 3)
    feature[0] = "wl" * cols
    data: dict[str, Any] = {
        "base_rev": 0,
        "cols": cols,
        "rows": rows,
        "surface": surface,
        "feature": feature,
        "labels": [Label(id="lb_1", text="  Hall ", col=2, row=3)],
    }
    data.update(over)
    return PlanWriteRequest(**data)


def test_a_drawn_plan_round_trips() -> None:
    sent = _plan()
    apt = service.replace_plan("ana", _apt("ana"), sent)
    assert apt.rev == 1
    assert (apt.cols, apt.rows) == (10, 8)
    assert apt.surface == sent.surface
    assert apt.feature == sent.feature
    assert [(label.text, label.col, label.row) for label in apt.labels] == [("Hall", 2, 3)]
    assert service.get_apartment("ana", _apt("ana")).surface == sent.surface


def test_a_resized_plan_is_stored() -> None:
    apt = service.replace_plan("ana", _apt("ana"), _plan(cols=60, rows=45, labels=[]))
    assert (apt.cols, apt.rows, len(apt.surface), len(apt.feature[0])) == (60, 45, 45, 120)


def _swap(layer: str, row: int, text: str) -> dict[str, list[str]]:
    rows = list(getattr(_plan(), layer))
    rows[row] = text
    return {layer: rows}


@pytest.mark.parametrize(
    ("over", "message"),
    [
        (_swap("surface", 2, ".." * 9), "isn't 10 squares"),
        ({"feature": [".." * 10] * 9}, "9 rows"),
        (_swap("surface", 2, "zz" + ".." * 9), "unknown surface code 'zz' at column 0, row 2"),
        (_swap("feature", 2, "t0" + ".." * 9), "unknown feature code 't0'"),
        (_swap("surface", 2, "wl" + ".." * 9), "unknown surface code 'wl'"),
        ({"labels": [Label(id="a", text="Hall", col=10, row=0)]}, "outside the plan"),
        ({"labels": [Label(id="a", text="   ", col=0, row=0)]}, "characters"),
        ({"labels": [Label(id="a", text="x" * 41, col=0, row=0)]}, "characters"),
        (
            {
                "labels": [
                    Label(id="a", text="A", col=0, row=0),
                    Label(id="a", text="B", col=1, row=0),
                ]
            },
            "share an id",
        ),
    ],
)
def test_a_malformed_plan_is_refused(over: dict[str, Any], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        service.replace_plan("ana", _apt("ana"), _plan(**over))
    assert service.get_apartment("ana", _apt("ana")).rev == 0


def test_a_stale_plan_is_refused() -> None:
    service.replace_plan("ana", _apt("ana"), _plan())
    with pytest.raises(service.StaleRevError):
        service.replace_plan("ana", _apt("ana"), _plan())


@pytest.mark.parametrize("cols", [4, 151])
def test_the_size_is_bounded(cols: int) -> None:
    with pytest.raises(ValidationError):
        _plan(cols=cols)


def test_shrinking_drops_pieces_left_off_the_plan() -> None:
    service.replace_plan("ana", _apt("ana"), _plan(cols=50, rows=40, labels=[]))
    apt = service.add_pieces(
        "ana",
        _apt("ana"),
        [
            PieceDraft(name="Near", colour="grey", shape="rectangle", width_cm=40, depth_cm=40),
            PieceDraft(name="Far", colour="grey", shape="rectangle", width_cm=40, depth_cm=40),
        ],
    )
    layout, near, far = apt.layouts[0].id, apt.furniture[0].id, apt.furniture[1].id
    service.place_piece("ana", _apt("ana"), layout, near, PlacementRequest(x_cm=100, y_cm=100))
    service.place_piece("ana", _apt("ana"), layout, far, PlacementRequest(x_cm=800, y_cm=100))
    shrunk = service.replace_plan(
        "ana", _apt("ana"), _plan(cols=20, rows=20, base_rev=1, labels=[])
    )
    assert [p.furniture_id for p in shrunk.layouts[0].placements] == [near]


def _door_plan(**over: Any) -> PlanWriteRequest:
    """A 10 × 8 plan with a two-square door at (3, 0)-(4, 0) and a front door at (0, 5)."""
    feature = list(_plan().feature)
    feature[0] = "wl" * 3 + "dr" * 2 + "wl" * 5
    feature[5] = "fd" + ".." * 9
    return _plan(feature=feature, **over)


_HALL = DoorSetting(col=3, row=0, into=1, hinge=0)
_FRONT = DoorSetting(col=0, row=5, into=0, hinge=1, double=True)


def test_door_settings_round_trip() -> None:
    apt = service.replace_plan("ana", _apt("ana"), _door_plan(doors=[_HALL, _FRONT]))
    assert apt.doors == [_HALL, _FRONT]
    assert service.get_apartment("ana", _apt("ana")).doors == [_HALL, _FRONT]


def test_a_plan_without_doors_stores_none() -> None:
    assert service.replace_plan("ana", _apt("ana"), _plan()).doors == []


@pytest.mark.parametrize(
    "lost",
    [
        DoorSetting(col=5, row=0, into=0, hinge=0),  # a wall square
        DoorSetting(col=2, row=3, into=0, hinge=0),  # an empty square
        DoorSetting(col=10, row=0, into=0, hinge=0),  # past the right edge
        DoorSetting(col=0, row=8, into=0, hinge=0),  # past the bottom edge
        DoorSetting(col=-1, row=0, into=0, hinge=0),
    ],
)
def test_a_setting_off_a_door_square_is_dropped(lost: DoorSetting) -> None:
    apt = service.replace_plan("ana", _apt("ana"), _door_plan(doors=[_HALL, lost]))
    assert apt.doors == [_HALL]


def test_shrinking_drops_door_settings_left_off_the_plan() -> None:
    service.replace_plan("ana", _apt("ana"), _door_plan(doors=[_HALL, _FRONT]))
    feature = [".." * 10 for _ in range(5)]
    feature[0] = "wl" * 3 + "dr" * 2 + "wl" * 5
    shrunk = service.replace_plan(
        "ana",
        _apt("ana"),
        _plan(
            rows=5,
            base_rev=1,
            surface=[".." * 10] * 5,
            feature=feature,
            labels=[],
            doors=[_HALL, _FRONT],
        ),
    )
    assert shrunk.doors == [_HALL]


def test_two_settings_on_one_square_are_refused() -> None:
    twin = DoorSetting(col=3, row=0, into=0, hinge=1)
    with pytest.raises(ValueError, match="Two door settings share a square"):
        service.replace_plan("ana", _apt("ana"), _door_plan(doors=[_HALL, twin]))
    assert service.get_apartment("ana", _apt("ana")).rev == 0


@pytest.mark.parametrize("field", ["into", "hinge"])
def test_into_and_hinge_are_0_or_1(field: str) -> None:
    with pytest.raises(ValidationError):
        DoorSetting(**{"col": 0, "row": 0, "into": 0, "hinge": 0, field: 2})


def test_an_apartment_saved_before_doors_loads_with_none() -> None:
    apartment_id = _apt("ana")
    path = repo.settings.data_dir / "floor-planner" / "apartments" / f"{apartment_id}.json"
    raw = json.loads(path.read_text())
    raw.pop("doors", None)
    path.write_text(json.dumps(raw))
    assert service.get_apartment("ana", apartment_id).doors == []


def test_a_duplicate_apartment_keeps_its_doors() -> None:
    service.replace_plan("ana", _apt("ana"), _door_plan(doors=[_HALL, _FRONT]))
    copy = service.duplicate_apartment("ana", _apt("ana"), "Copy")
    assert copy.doors == [_HALL, _FRONT]
    assert service.get_apartment("ana", copy.id).doors == [_HALL, _FRONT]
