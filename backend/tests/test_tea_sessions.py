"""Tea sessions: schema rules, snapshot upsert, finalise, discard, listing."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaWriteRequest
from app.schemas.tea_session import TeaSessionWrite
from app.services import tea_service
from app.services import tea_session_service as sessions
from tests.tea_support import doc_of


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _write(**overrides: object) -> TeaSessionWrite:
    payload: dict[str, object] = {
        "tea_id": "t-1",
        "status": "in_progress",
        "started_at": "2026-09-26T18:00:00+00:00",
        "curve_source": "generic",
        "curve_source_label": "generic gongfu",
        "infusions": [
            {"number": 1, "target_seconds": 10, "actual_seconds": 11},
            {"number": 2, "target_seconds": 15, "actual_seconds": None},
        ],
    }
    payload.update(overrides)
    return TeaSessionWrite.model_validate(payload)


def test_a_valid_snapshot_parses() -> None:
    assert len(_write().infusions) == 2


@pytest.mark.parametrize(
    "overrides",
    [
        {"rating": 6},
        {"rating": 0},
        {"leaf_grams": 0},
        {"water_temp_c": 101},
        {"infusions": [{"number": 2, "target_seconds": 10, "actual_seconds": None}]},
        {"infusions": [{"number": 1, "target_seconds": 0, "actual_seconds": None}]},
        {"infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": -1}]},
    ],
)
def test_an_invalid_snapshot_is_rejected(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _write(**overrides)


def _tea(grams: float = 40) -> str:
    req = TeaWriteRequest.model_validate(
        {
            "name": "Tieguanyin",
            "catalogue_node_id": "oolong.anxi.tieguanyin",
            "grams_remaining": grams,
        }
    )
    return tea_service.create_tea("alice", req).id


def _grams(tea_id: str) -> float:
    return tea_service.get_tea("alice", tea_id).grams_remaining


def test_upsert_creates_then_replaces() -> None:
    tea_id = _tea()
    first = sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    assert first.id == "s-1"
    assert first.finished_at is None

    three = [
        {"number": 1, "target_seconds": 10, "actual_seconds": 11},
        {"number": 2, "target_seconds": 15, "actual_seconds": 16},
        {"number": 3, "target_seconds": 20, "actual_seconds": None},
    ]
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id, infusions=three))

    stored = doc_of("alice").sessions
    assert len(stored) == 1
    assert len(stored[0].infusions) == 3


def test_upsert_for_an_unknown_tea_is_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.upsert("alice", "s-1", _write(tea_id="t-nosuch"))


def test_finalise_deducts_grams_and_drops_the_pending_steep() -> None:
    tea_id = _tea(grams=40)
    done = sessions.upsert(
        "alice", "s-1", _write(tea_id=tea_id, status="finalised", leaf_grams=6, rating=4)
    )
    assert done.finished_at is not None
    assert [i.number for i in done.infusions] == [1]
    assert _grams(tea_id) == 34


def test_a_retried_finalise_is_refused_and_never_deducts_twice() -> None:
    tea_id = _tea(grams=40)
    final = _write(tea_id=tea_id, status="finalised", leaf_grams=6)
    sessions.upsert("alice", "s-1", final)
    with pytest.raises(sessions.SessionFinalisedError):
        sessions.upsert("alice", "s-1", final)
    assert _grams(tea_id) == 34


def test_finalise_clamps_grams_at_zero() -> None:
    tea_id = _tea(grams=3)
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id, status="finalised", leaf_grams=6))
    assert _grams(tea_id) == 0


def test_finalise_without_leaf_grams_leaves_grams_alone() -> None:
    tea_id = _tea(grams=40)
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id, status="finalised"))
    assert _grams(tea_id) == 40


def test_finalise_with_nothing_brewed_keeps_an_empty_session() -> None:
    tea_id = _tea()
    pending_only = [{"number": 1, "target_seconds": 10, "actual_seconds": None}]
    done = sessions.upsert(
        "alice", "s-1", _write(tea_id=tea_id, status="finalised", infusions=pending_only)
    )
    assert done.infusions == []


def test_discard_removes_an_in_progress_session() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.discard("alice", "s-1")
    assert doc_of("alice").sessions == []


def test_discard_refuses_a_finalised_session() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id, status="finalised"))
    with pytest.raises(sessions.SessionFinalisedError):
        sessions.discard("alice", "s-1")


def test_discard_of_an_unknown_session_is_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.discard("alice", "s-nosuch")


def test_listing_splits_in_progress_from_finalised() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-live", _write(tea_id=tea_id))
    sessions.upsert("alice", "s-old", _write(tea_id=tea_id, status="finalised"))
    sessions.upsert("alice", "s-new", _write(tea_id=tea_id, status="finalised"))

    assert [s.id for s in sessions.list_in_progress("alice")] == ["s-live"]
    assert [s.id for s in sessions.list_for_tea("alice", tea_id)] == ["s-new", "s-old"]


def test_listing_for_an_unknown_tea_is_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.list_for_tea("alice", "t-nosuch")


def test_deleting_a_tea_deletes_its_sessions() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    tea_service.delete_tea("alice", tea_id)
    assert doc_of("alice").sessions == []
