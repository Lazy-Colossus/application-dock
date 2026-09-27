"""The Brewing Curve: best session → tea → Almanac ancestor → generic."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CreateNodeRequest, TeaWriteRequest
from app.schemas.tea_session import TeaSessionWrite
from app.services import tea_catalogue_service as catalogue
from app.services import tea_curve_service as curves
from app.services import tea_service
from app.services import tea_session_service as sessions
from tests.tea_support import share

TIEGUANYIN = "oolong.anxi.tieguanyin"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea(node: str = TIEGUANYIN, brewing: dict[str, object] | None = None) -> str:
    req = TeaWriteRequest.model_validate(
        {"name": "Tea", "catalogue_node_id": node, "grams_remaining": 50, "brewing": brewing}
    )
    return tea_service.create_tea("alice", req).id


def _finish(
    tea_id: str,
    session_id: str,
    actuals: list[int],
    rating: int | None,
    leaf_grams: float | None = None,
    water_temp_c: int | None = None,
    username: str = "alice",
) -> None:
    infusions = [
        {"number": n, "target_seconds": 10, "actual_seconds": s} for n, s in enumerate(actuals, 1)
    ]
    sessions.upsert(
        username,
        session_id,
        TeaSessionWrite.model_validate(
            {
                "tea_id": tea_id,
                "status": "finalised",
                "started_at": "2026-09-12T18:00:00+00:00",
                "rating": rating,
                "leaf_grams": leaf_grams,
                "water_temp_c": water_temp_c,
                "curve_source": "generic",
                "infusions": infusions,
            }
        ),
    )


def test_unknown_tea_is_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        curves.curve_for("alice", "t-nosuch")


def test_generic_when_nothing_else_exists() -> None:
    curve = curves.curve_for("alice", _tea(node="oolong"))
    assert curve.source == "generic"
    assert curve.source_label == "generic gongfu"
    assert curve.steep_seconds == [10, 15, 20, 25]
    assert curve.leaf_grams is None


def test_almanac_entry_of_the_tea_itself() -> None:
    curve = curves.curve_for("alice", _tea())
    assert curve.source == "almanac"
    assert curve.source_label.startswith("almanac: ")
    assert curve.steep_seconds == [20, 25, 30, 40]
    assert (curve.leaf_grams, curve.water_temp_c) == (6, 95)


def test_almanac_entry_of_the_nearest_ancestor() -> None:
    node = catalogue.create_node(
        "alice", CreateNodeRequest(parent_id=TIEGUANYIN, name="Monkey-picked")
    )
    curve = curves.curve_for("alice", _tea(node=node.id))
    assert curve.source == "almanac"
    assert curve.steep_seconds == [20, 25, 30, 40]


def test_tea_brewing_beats_the_almanac_and_missing_fields_fall_through() -> None:
    tea_id = _tea(brewing={"leaf_grams": 8, "water_temp_c": None, "steep_seconds": [12, 18]})
    curve = curves.curve_for("alice", tea_id)
    assert curve.source == "tea"
    assert curve.source_label == "tea default"
    assert curve.steep_seconds == [12, 18]
    assert curve.leaf_grams == 8
    assert curve.water_temp_c == 95  # from the Almanac


def test_highest_rated_session_wins() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-five", [11, 16, 22], rating=5, leaf_grams=7, water_temp_c=98)
    _finish(tea_id, "s-three", [30, 30], rating=3)
    curve = curves.curve_for("alice", tea_id)
    assert curve.source == "best_session"
    assert curve.steep_seconds == [11, 16, 22]
    assert (curve.leaf_grams, curve.water_temp_c) == (7, 98)
    assert curve.source_label.startswith("from your best session (★5, ")


def test_a_tie_goes_to_the_most_recent_session() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-older", [10], rating=4)
    _finish(tea_id, "s-newer", [40], rating=4)
    assert curves.curve_for("alice", tea_id).steep_seconds == [40]


def test_unrated_and_in_progress_sessions_are_ignored() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-unrated", [99], rating=None)
    sessions.upsert(
        "alice",
        "s-live",
        TeaSessionWrite.model_validate(
            {
                "tea_id": tea_id,
                "status": "in_progress",
                "started_at": "2026-09-26T18:00:00+00:00",
                "rating": 5,
                "curve_source": "generic",
                "infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": 77}],
            }
        ),
    )
    assert curves.curve_for("alice", tea_id).source == "almanac"


def test_best_session_ignores_sessions_with_no_brewed_infusions() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-empty", [], rating=5)
    assert curves.curve_for("alice", tea_id).source == "almanac"


def test_best_session_zero_second_steep_suggests_one_second() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-1", [0, 15], rating=5)
    assert curves.curve_for("alice", tea_id).steep_seconds == [1, 15]


def test_ancestry_is_node_first_and_empty_for_unknown() -> None:
    index = catalogue.node_index(catalogue.merged_nodes("alice"))
    assert [n.id for n in catalogue.ancestry(index, TIEGUANYIN)] == [
        TIEGUANYIN,
        "oolong.anxi",
        "oolong",
    ]
    assert catalogue.ancestry(index, "nope") == []


def test_your_own_best_session_beats_a_better_rated_partners() -> None:
    tea_id = _tea()
    share("alice", "bob")
    _finish(tea_id, "s-mine", [30], rating=3)
    _finish(tea_id, "s-theirs", [12], rating=5, username="bob")

    curve = curves.curve_for("alice", tea_id)
    assert curve.steep_seconds == [30]
    assert curve.source_label.startswith("from your best session (★3")


def test_a_partners_best_session_beats_the_tea_defaults() -> None:
    tea_id = _tea(brewing={"steep_seconds": [40]})
    share("alice", "bob")
    _finish(tea_id, "s-theirs", [12], rating=5, username="bob")

    curve = curves.curve_for("alice", tea_id)
    assert curve.source == "best_session"
    assert curve.steep_seconds == [12]
    assert curve.source_label.startswith("from bob's best session (★5")
