"""Replacing the drawn plan (FP-2 to FP-8)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from pydantic import ValidationError

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import Label, PieceDraft, PlacementRequest, PlanWriteRequest
from app.services import auth_service
from app.services import floor_planner_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    auth_service.create_user("ana")


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
    apt = service.replace_plan("ana", sent)
    assert apt.rev == 1
    assert (apt.cols, apt.rows) == (10, 8)
    assert apt.surface == sent.surface
    assert apt.feature == sent.feature
    assert [(label.text, label.col, label.row) for label in apt.labels] == [("Hall", 2, 3)]
    assert service.get_apartment("ana").surface == sent.surface


def test_a_resized_plan_is_stored() -> None:
    apt = service.replace_plan("ana", _plan(cols=60, rows=45, labels=[]))
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
        service.replace_plan("ana", _plan(**over))
    assert service.get_apartment("ana").rev == 0


def test_a_locked_plan_cannot_be_painted() -> None:
    service.set_locked("ana", 0, True)
    with pytest.raises(ValueError, match="Unlock"):
        service.replace_plan("ana", _plan(base_rev=1))


def test_a_stale_plan_is_refused() -> None:
    service.replace_plan("ana", _plan())
    with pytest.raises(service.StaleRevError):
        service.replace_plan("ana", _plan())


@pytest.mark.parametrize("cols", [4, 151])
def test_the_size_is_bounded(cols: int) -> None:
    with pytest.raises(ValidationError):
        _plan(cols=cols)


def test_shrinking_drops_pieces_left_off_the_plan() -> None:
    service.replace_plan("ana", _plan(cols=50, rows=40, labels=[]))
    apt = service.add_pieces(
        "ana",
        [
            PieceDraft(name="Near", colour="grey", shape="rectangle", width_cm=40, depth_cm=40),
            PieceDraft(name="Far", colour="grey", shape="rectangle", width_cm=40, depth_cm=40),
        ],
    )
    layout, near, far = apt.layouts[0].id, apt.furniture[0].id, apt.furniture[1].id
    service.set_locked("ana", 1, True)
    service.place_piece("ana", layout, near, PlacementRequest(x_cm=100, y_cm=100))
    service.place_piece("ana", layout, far, PlacementRequest(x_cm=800, y_cm=100))
    service.set_locked("ana", 2, False)
    shrunk = service.replace_plan("ana", _plan(cols=20, rows=20, base_rev=3, labels=[]))
    assert [p.furniture_id for p in shrunk.layouts[0].placements] == [near]
