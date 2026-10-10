"""The furniture list (FU-1 to FU-5)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest

from app.repositories import floor_planner_repo as repo
from app.schemas.floor_planner import (
    Furniture,
    Layout,
    PieceDraft,
    Placement,
    PlanWriteRequest,
    empty_rows,
)
from app.services import auth_service
from app.services import floor_planner_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    auth_service.create_user("ana")


def _apt(username: str) -> str:
    return service.list_apartments(username)[0].id


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
        _apt("ana"),
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
    blank = empty_rows(50, 40)
    plan = PlanWriteRequest(base_rev=0, cols=50, rows=40, surface=blank, feature=blank, labels=[])
    service.replace_plan("ana", _apt("ana"), plan)
    apt = service.add_pieces("ana", _apt("ana"), [_draft()])
    assert (apt.rev, apt.plan_rev) == (2, 1)
    painted = service.replace_plan("ana", _apt("ana"), plan.model_copy(update={"base_rev": 1}))
    assert (painted.rev, painted.plan_rev) == (3, 2)


def test_a_drawn_shape_is_trimmed_sized_and_coloured_from_its_squares() -> None:
    apt = service.add_pieces(
        "ana",
        _apt("ana"),
        [
            _draft(
                name="Corner sofa",
                shape="custom",
                colour="red",
                width_cm=999,
                depth_cm=1,
                cells=["....", ".u..", ".g..", ".ggu", "...."],
            )
        ],
    )
    piece = apt.furniture[0]
    assert piece.cells == ["u..", "g..", "ggu"]
    assert (piece.width_cm, piece.depth_cm) == (30, 30)
    assert piece.colour == "grey"


def test_a_colour_tie_goes_to_the_first_painted() -> None:
    apt = service.add_pieces("ana", _apt("ana"), [_draft(shape="custom", cells=["ug", "gu"])])
    assert apt.furniture[0].colour == "blue"


def test_a_twenty_cm_mask_becomes_four_coloured_squares() -> None:
    apt = service.add_pieces(
        "ana", _apt("ana"), [_draft(shape="custom", colour="brown", cells=["#.", "##"])]
    )
    piece = apt.furniture[0]
    assert piece.cells == ["bb..", "bb..", "bbbb", "bbbb"]
    assert (piece.width_cm, piece.depth_cm) == (40, 40)


def test_a_stored_twenty_cm_mask_is_upgraded_on_read() -> None:
    piece = Furniture.model_validate(
        {
            "id": "f_1",
            "name": "Desk",
            "colour": "green",
            "shape": "custom",
            "width_cm": 40,
            "depth_cm": 20,
            "cells": ["##"],
        }
    )
    assert piece.cells == ["nnnn", "nnnn"]
    assert (piece.width_cm, piece.depth_cm) == (40, 20)


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
        ({"shape": "custom", "cells": ["gg", "g"]}, "equal rows"),
        ({"shape": "custom", "cells": ["g" * 41]}, "squares of"),
        ({"shape": "custom", "cells": ["gx"]}, "squares of"),
        ({"shape": "custom", "cells": ["#g"]}, "squares of"),
    ],
)
def test_a_bad_piece_is_refused(over: dict[str, Any], message: str) -> None:
    with pytest.raises(ValueError, match=message):
        service.add_pieces("ana", _apt("ana"), [_draft(**over)])


def test_one_bad_piece_refuses_the_whole_batch() -> None:
    with pytest.raises(ValueError, match="Bad: width"):
        service.add_pieces("ana", _apt("ana"), [_draft(), _draft(name="Bad", width_cm=0)])
    assert service.get_apartment("ana", _apt("ana")).furniture == []


def test_the_piece_cap_is_enforced() -> None:
    with repo.apartment_transaction(_apt("ana")) as doc:
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
        service.add_pieces("ana", _apt("ana"), [_draft()])


def test_updating_keeps_the_id() -> None:
    piece = service.add_pieces("ana", _apt("ana"), [_draft()]).furniture[0]
    apt = service.update_piece("ana", _apt("ana"), piece.id, _draft(colour="blue", width_cm=200))
    assert (apt.furniture[0].id, apt.furniture[0].colour, apt.furniture[0].width_cm) == (
        piece.id,
        "blue",
        200,
    )
    with pytest.raises(FileNotFoundError):
        service.update_piece("ana", _apt("ana"), "f_gone", _draft())


def test_deleting_a_piece_removes_it_from_every_layout() -> None:
    sofa, chair = service.add_pieces("ana", _apt("ana"), [_draft(), _draft(name="Chair")]).furniture
    with repo.apartment_transaction(_apt("ana")) as doc:
        here = [
            Placement(furniture_id=sofa.id, x_cm=0, y_cm=0),
            Placement(furniture_id=chair.id, x_cm=100, y_cm=0),
        ]
        doc.layouts = [
            Layout(id="l_a", name="A", placements=here),
            Layout(id="l_b", name="B", placements=[here[0]]),
        ]
    apt = service.delete_piece("ana", _apt("ana"), sofa.id)
    assert [p.name for p in apt.furniture] == ["Chair"]
    assert [[p.furniture_id for p in layout.placements] for layout in apt.layouts] == [
        [chair.id],
        [],
    ]
    with pytest.raises(FileNotFoundError):
        service.delete_piece("ana", _apt("ana"), sofa.id)


def test_plan_writes_still_catch_real_plan_conflicts() -> None:
    service.add_pieces("ana", _apt("ana"), [_draft()])
    plan = service.get_apartment("ana", _apt("ana"))
    req = PlanWriteRequest(
        base_rev=plan.plan_rev,
        cols=plan.cols,
        rows=plan.rows,
        surface=plan.surface,
        feature=plan.feature,
        labels=[],
    )
    service.replace_plan("ana", _apt("ana"), req)
    with pytest.raises(service.StaleRevError):
        service.replace_plan("ana", _apt("ana"), req)
