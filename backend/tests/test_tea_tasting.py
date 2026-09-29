"""Tasting sheet: the typed tasting record on a session, its rules, and its round trips."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaWriteRequest
from app.schemas.tea_session import JournalEdit, Tasting, TeaSessionWrite
from app.services import tea_service
from app.services import tea_session_service as sessions

FULL: dict[str, object] = {
    "leaf": {"dry": "tight, dark twists", "wet": "roasted", "spent": "supple", "quality": 4},
    "liquor": {"colour": "amber", "clarity": 5},
    "aroma": {
        "aroma": "orchid, honey",
        "aroma_type": "orchid",
        "richness": 4,
        "top_note": "orchid",
        "middle_note": "honey",
        "base_note": "stone",
        "tail_note": "faint orchid",
        "cup_aroma": "caramel",
        "structure": ["long", "delicate"],
    },
    "sensation": {
        "body": "mellow",
        "smoothness": 4,
        "saturation": "fairly_high",
        "throat": 3,
        "mouthfeel": {"thick": 4, "slick": 5, "astringent": 1},
        "hui_gan": {"strength": 4, "duration": 3},
        "sheng_jin": {"strength": 3, "duration": 2},
        "body_feel": ["warmth"],
        "body_feel_other": "",
    },
}


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea() -> str:
    req = TeaWriteRequest.model_validate(
        {"name": "Dan Cong", "catalogue_node_id": "oolong.anxi.tieguanyin", "grams_remaining": 40}
    )
    return tea_service.create_tea("alice", req).id


def _write(tea_id: str, **overrides: object) -> TeaSessionWrite:
    payload: dict[str, object] = {
        "tea_id": tea_id,
        "status": "in_progress",
        "started_at": "2026-09-29T18:00:00+00:00",
        "curve_source": "generic",
        "infusions": [{"number": 1, "target_seconds": 20, "actual_seconds": 21}],
    }
    payload.update(overrides)
    return TeaSessionWrite.model_validate(payload)


def test_a_partial_tasting_is_valid_and_fills_in_the_rest_empty() -> None:
    tasting = Tasting.model_validate({"sensation": {"hui_gan": {"strength": 4}}})
    assert tasting.sensation.hui_gan.strength == 4
    assert tasting.sensation.hui_gan.duration is None
    assert tasting.aroma.structure == []
    assert tasting.leaf.dry == ""


def test_picks_are_kept_once_each_in_listed_order() -> None:
    tasting = Tasting.model_validate(
        {
            "aroma": {"structure": ["long", "single"]},
            "sensation": {"body_feel": ["warmth", "sweating"]},
        }
    )
    assert tasting.aroma.structure == ["single", "long"]
    assert tasting.sensation.body_feel == ["sweating", "warmth"]


@pytest.mark.parametrize(
    "raw",
    [
        {"aroma": {"richness": 0}},
        {"aroma": {"richness": 6}},
        {"sensation": {"mouthfeel": {"thin": 7}}},
        {"aroma": {"structure": ["floral"]}},
        {"aroma": {"structure": ["long", "long"]}},
        {"sensation": {"body": "gloopy"}},
        {"liquor": {"colour": "blue"}},
        {"sensation": {"body_feel": ["none", "warmth"]}},
    ],
)
def test_a_tasting_that_breaks_a_rule_is_refused(raw: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        Tasting.model_validate(raw)


def test_a_tasting_rides_the_snapshot_through_finish_and_a_journal_edit() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id, tasting=FULL))
    finished = sessions.upsert("alice", "s-1", _write(tea_id, status="finalised", tasting=FULL))
    assert finished.tasting is not None
    assert finished.tasting.sensation.mouthfeel.slick == 5

    edited = sessions.edit_journal(
        "alice",
        "s-1",
        JournalEdit.model_validate(
            {"tasting": {**FULL, "liquor": {"colour": "golden", "clarity": 4}}}
        ),
    )
    assert edited.tasting is not None
    assert edited.tasting.liquor.colour == "golden"
    [entry] = sessions.list_journal("alice")
    assert entry.tasting is not None and entry.tasting.aroma.top_note == "orchid"


def test_a_session_without_a_tasting_has_none() -> None:
    tea_id = _tea()
    assert sessions.upsert("alice", "s-1", _write(tea_id)).tasting is None


def test_a_v5_cabinet_upgrades_to_v6() -> None:
    raw: dict[str, object] = {
        "schema_version": 5,
        "id": "c-1",
        "owner": "alice",
        "teas": [],
        "catalogue_nodes": [],
        "sessions": [],
        "teaware": [],
    }
    assert repo.migrate(raw)["schema_version"] == 6
