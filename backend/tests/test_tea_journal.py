"""Cha Xi Journal: session schema rules, journal-only entries, photos, edits, deletes, listing."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import tea_repo as repo
from app.schemas.tea_session import ChaXi, TeaSessionWrite


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _write(**overrides: object) -> TeaSessionWrite:
    """A live timed snapshot."""
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


def _entry(**overrides: object) -> TeaSessionWrite:
    """A journal-only entry: finished, untimed, no infusions."""
    payload: dict[str, object] = {
        "tea_id": "t-1",
        "status": "finalised",
        "started_at": "2026-09-20T12:00:00+00:00",
        "curve_source": "generic",
        "timed": False,
        "infusions": [],
    }
    payload.update(overrides)
    return TeaSessionWrite.model_validate(payload)


def test_moods_are_kept_once_each_in_vocabulary_order() -> None:
    assert ChaXi(moods=["social", "calm"]).moods == ["calm", "social"]


@pytest.mark.parametrize("moods", [["calm", "calm"], ["grumpy"]])
def test_a_repeated_or_unknown_mood_is_refused(moods: list[str]) -> None:
    with pytest.raises(ValidationError):
        ChaXi.model_validate({"moods": moods})


def test_a_snapshot_carries_its_cha_xi() -> None:
    snapshot = _write(cha_xi={"moods": ["calm"], "guests": "Eva", "notes": "honey"})
    assert snapshot.cha_xi is not None
    assert snapshot.cha_xi.guests == "Eva"
    assert snapshot.timed is True


def test_a_journal_only_entry_may_name_an_away_tea() -> None:
    entry = _entry(tea_id=None, away_tea_name="Teahouse Dancong", away_class_id="oolong")
    assert entry.tea_id is None
    assert entry.away_class_id == "oolong"


@pytest.mark.parametrize(
    "overrides",
    [
        {"tea_id": None},
        {"away_tea_name": "Dancong"},
        {"away_class_id": "oolong"},
        {"status": "in_progress"},
        {"infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": 10}]},
    ],
)
def test_an_invalid_journal_only_entry_is_refused(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _entry(**overrides)


def test_an_away_tea_cannot_be_timed() -> None:
    with pytest.raises(ValidationError):
        _write(tea_id=None, away_tea_name="Dancong")


def test_a_v4_cabinet_upgrades_to_v5() -> None:
    raw: dict[str, object] = {
        "schema_version": 4,
        "id": "c-1",
        "owner": "alice",
        "teas": [],
        "catalogue_nodes": [],
        "sessions": [],
        "teaware": [],
    }
    assert repo.migrate(raw)["schema_version"] == 5
