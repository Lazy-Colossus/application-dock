"""The furniture list (FU-1 to FU-5)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import Furniture, Layout, PieceDraft, Placement, PlanWriteRequest
from app.services import auth_service
from app.services import floor_planner_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    auth_service.create_user("ana")


def _draft(**over: Any) -> PieceDraft:
    data: dict[str, Any] = {
        "name": "Sofa",
        "colour": "grey",
        "shape": "rectangle",
        "width_cm": 220,
        "depth_cm": 95,
    }
    data.update(over)
    return PieceDraft(**data)


def test_pieces_are_added_in_order_and_cleaned() -> None:
    apt = service.add_pieces(
        "ana",
        [
            _draft(name="  Sofa ", note=" IKEA Kivik "),
            _draft(name="Coffee table", shape="round", width_cm=80, depth_cm=80, colour="brown"),
            _draft(name="Egg chair", shape="egg", width_cm=85, depth_cm=90, colour="green"),
        ],
    )
    assert [p.name for p in apt.furniture] == ["Sofa", "Coffee table", "Egg chair"]
    assert all(p.id.startswith("f_") and p.cells is None for p in apt.furniture)
    assert apt.furniture[0].note == "IKEA Kivik"


def test_a_piece_write_does_not_stale_the_plan() -> None:
    service.set_locked("ana", 0, True)
    apt = service.add_pieces("ana", [_draft()])
    assert (apt.rev, apt.plan_rev) == (2, 1)
    assert service.set_locked("ana", 1, False).locked is False


def test_a_custom_shape_is_trimmed_and_sized_from_its_mask() -> None:
    apt = service.add_pieces(
        "ana",
        [
            _draft(
                name="Corner sofa",
                shape="custom",
                width_cm=999,
                depth_cm=1,
                cells=["....", ".#..", ".#..", ".###", "...."],
            )
        ],
    )
    piece = apt.furniture[0]
    assert piece.cells == ["#..", "#..", "###"]
    assert (piece.width_cm, piece.depth_cm) == (60, 60)


@pytest.mark.parametrize(
    ("over", "message"),
    [
        ({"name": "   "}, "name needs"),
        ({"name": "x" * 41}, "name needs"),
        ({"note": "x" * 201}, "note"),
        ({"width_cm": 0}, "width must be"),
        ({"depth_cm": 1001}, "depth must be"),
        ({"shape": "round", "width_cm": 80, "depth_cm": 90}, "one diameter"),
        ({"shape": "custom", "cells": ["...", "..."]}, "at least one"),
        ({"shape": "custom", "cells": None}, "equal rows"),
        ({"shape": "custom", "cells": ["##", "#"]}, "equal rows"),
        ({"shape": "custom", "cells": ["#" * 21]}, "squares of"),
        ({"shape": "custom", "cells": ["#x"]}, "squares of"),
    ],
)
def test_a_bad_piece_is_refused(over: dict[str, Any], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        service.add_pieces("ana", [_draft(**over)])


def test_one_bad_piece_refuses_the_whole_batch() -> None:
    with pytest.raises(ValueError, match="Bad: width"):
        service.add_pieces("ana", [_draft(), _draft(name="Bad", width_cm=0)])
    assert service.get_apartment("ana").furniture == []


def test_the_piece_cap_is_enforced() -> None:
    with repo.apartment_transaction(service.ensure_apartment("ana")) as doc:
        doc.furniture = [
            Furniture(
                id=f"f_{i}",
                name="Box",
                colour="grey",
                shape="rectangle",
                width_cm=10,
                depth_cm=10,
            )
            for i in range(300)
        ]
    with pytest.raises(ValueError, match="at most 300"):
        service.add_pieces("ana", [_draft()])


def test_updating_keeps_the_id() -> None:
    piece = service.add_pieces("ana", [_draft()]).furniture[0]
    apt = service.update_piece("ana", piece.id, _draft(colour="blue", width_cm=200))
    assert (apt.furniture[0].id, apt.furniture[0].colour, apt.furniture[0].width_cm) == (
        piece.id,
        "blue",
        200,
    )
    with pytest.raises(FileNotFoundError):
        service.update_piece("ana", "f_gone", _draft())


def test_deleting_a_piece_removes_it_from_every_layout() -> None:
    sofa, chair = service.add_pieces("ana", [_draft(), _draft(name="Chair")]).furniture
    with repo.apartment_transaction(service.ensure_apartment("ana")) as doc:
        here = [
            Placement(furniture_id=sofa.id, x_cm=0, y_cm=0),
            Placement(furniture_id=chair.id, x_cm=100, y_cm=0),
        ]
        doc.layouts = [
            Layout(id="l_a", name="A", placements=here),
            Layout(id="l_b", name="B", placements=[here[0]]),
        ]
    apt = service.delete_piece("ana", sofa.id)
    assert [p.name for p in apt.furniture] == ["Chair"]
    assert [[p.furniture_id for p in layout.placements] for layout in apt.layouts] == [
        [chair.id],
        [],
    ]
    with pytest.raises(FileNotFoundError):
        service.delete_piece("ana", sofa.id)


def test_furniture_can_be_edited_on_a_locked_plan() -> None:
    service.set_locked("ana", 0, True)
    assert len(service.add_pieces("ana", [_draft()]).furniture) == 1


def test_plan_writes_still_catch_real_plan_conflicts() -> None:
    service.add_pieces("ana", [_draft()])
    plan = service.get_apartment("ana")
    req = PlanWriteRequest(
        base_rev=plan.plan_rev,
        cols=plan.cols,
        rows=plan.rows,
        surface=plan.surface,
        feature=plan.feature,
        labels=[],
    )
    service.replace_plan("ana", req)
    with pytest.raises(service.StaleRevError):
        service.replace_plan("ana", req)
