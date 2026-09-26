"""Tea sessions: schema rules, snapshot upsert, finalise, discard, listing."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import tea_repo as repo
from app.schemas.tea_session import TeaSessionWrite


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
