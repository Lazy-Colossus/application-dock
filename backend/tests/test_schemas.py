"""Schema validation coverage for app.schemas.session."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.session import (
    CreateSessionRequest,
    SessionData,
    SessionSummary,
    TargetScores,
)

# ─── TargetScores ────────────────────────────────────────────────────────────


def test_target_scores_happy_path() -> None:
    target = TargetScores(number=1, scores={"Alice": [10, 8], "Bob": [5, 0]})
    assert target.number == 1
    assert target.scores["Alice"] == [10, 8]


@pytest.mark.parametrize("invalid_number", [0, -1, 19, 100])
def test_target_scores_rejects_out_of_range_number(invalid_number: int) -> None:
    with pytest.raises(ValidationError):
        TargetScores(number=invalid_number, scores={"Alice": [0, 0]})


@pytest.mark.parametrize("bad_shot", [1, 2, 3, 4, 6, 7, 9, 12, 100, -1])
def test_target_scores_rejects_invalid_shot_value(bad_shot: int) -> None:
    with pytest.raises(ValidationError) as exc:
        TargetScores(number=1, scores={"Alice": [bad_shot, 0]})
    assert "invalid shot value" in str(exc.value)


@pytest.mark.parametrize("shot_list", [[10], [10, 8, 5], []])
def test_target_scores_rejects_wrong_shot_count(shot_list: list[int]) -> None:
    with pytest.raises(ValidationError) as exc:
        TargetScores(number=1, scores={"Alice": shot_list})
    assert "exactly 2 shots" in str(exc.value)


# ─── SessionData ─────────────────────────────────────────────────────────────


def _make_session(**overrides: object) -> SessionData:
    defaults: dict[str, object] = {
        "label": "2026-05-28",
        "created": "2026-05-28T14:00:00Z",
        "status": "in_progress",
        "archers": ["Alice", "Bob"],
        "targets": [],
    }
    defaults.update(overrides)
    return SessionData(**defaults)  # type: ignore[arg-type]


def test_session_happy_path() -> None:
    session = _make_session()
    assert session.label == "2026-05-28"
    assert session.status == "in_progress"
    assert session.archers == ["Alice", "Bob"]
    assert session.targets == []


def test_session_with_confirmed_targets() -> None:
    session = _make_session(
        targets=[
            {"number": 1, "scores": {"Alice": [10, 8], "Bob": [5, 0]}},
            {"number": 7, "scores": {"Alice": [11, 11], "Bob": [10, 10]}},
        ]
    )
    assert len(session.targets) == 2
    assert session.targets[0].scores["Alice"] == [10, 8]


def test_session_rejects_empty_roster() -> None:
    with pytest.raises(ValidationError) as exc:
        _make_session(archers=[])
    assert "at least one archer" in str(exc.value)


def test_session_rejects_duplicate_archer_names() -> None:
    with pytest.raises(ValidationError) as exc:
        _make_session(archers=["Alice", "Alice"])
    assert "unique" in str(exc.value)


def test_session_rejects_empty_archer_name() -> None:
    with pytest.raises(ValidationError) as exc:
        _make_session(archers=["Alice", ""])
    assert "non-empty" in str(exc.value)


def test_session_archer_name_whitespace_trimmed() -> None:
    session = _make_session(archers=["  Alice  ", "Bob"])
    assert session.archers == ["Alice", "Bob"]


def test_session_rejects_whitespace_only_name() -> None:
    with pytest.raises(ValidationError):
        _make_session(archers=["   ", "Alice"])


@pytest.mark.parametrize(
    "bad_created",
    [
        "2026-05-28",  # date only
        "2026-05-28 14:00:00",  # space separator
        "2026-05-28T14:00:00",  # missing Z
        "2026-05-28T14:00:00+02:00",  # timezone offset, not Z
        "not-a-date",
    ],
)
def test_session_rejects_malformed_created(bad_created: str) -> None:
    with pytest.raises(ValidationError):
        _make_session(created=bad_created)


def test_session_accepts_fractional_seconds() -> None:
    session = _make_session(created="2026-05-28T14:00:00.123Z")
    assert session.created == "2026-05-28T14:00:00.123Z"


def test_session_target_must_cover_full_roster() -> None:
    with pytest.raises(ValidationError) as exc:
        _make_session(
            archers=["Alice", "Bob"],
            targets=[{"number": 1, "scores": {"Alice": [10, 8]}}],
        )
    assert "missing=['Bob']" in str(exc.value)


def test_session_target_rejects_stray_archer() -> None:
    with pytest.raises(ValidationError) as exc:
        _make_session(
            archers=["Alice"],
            targets=[
                {
                    "number": 1,
                    "scores": {"Alice": [10, 8], "Bob": [5, 0]},
                }
            ],
        )
    assert "extra=['Bob']" in str(exc.value)


@pytest.mark.parametrize("status", ["in_progress", "finalised"])
def test_session_accepts_both_statuses(status: str) -> None:
    session = _make_session(status=status)
    assert session.status == status


def test_session_rejects_unknown_status() -> None:
    with pytest.raises(ValidationError):
        _make_session(status="archived")


# ─── CreateSessionRequest ────────────────────────────────────────────────────


def test_create_session_request_happy_path() -> None:
    req = CreateSessionRequest(archers=["Alice", "Bob"])
    assert req.archers == ["Alice", "Bob"]


def test_create_session_request_trims_names() -> None:
    req = CreateSessionRequest(archers=["  Alice  "])
    assert req.archers == ["Alice"]


def test_create_session_request_rejects_empty_list() -> None:
    with pytest.raises(ValidationError):
        CreateSessionRequest(archers=[])


def test_create_session_request_rejects_duplicates() -> None:
    with pytest.raises(ValidationError):
        CreateSessionRequest(archers=["Alice", "Alice"])


# ─── SessionSummary ──────────────────────────────────────────────────────────


def test_session_summary_shape() -> None:
    summary = SessionSummary(
        label="2026-05-21",
        archer_count=3,
        winner="Jamie",
        winning_score=284,
    )
    assert summary.model_dump() == {
        "label": "2026-05-21",
        "archer_count": 3,
        "winner": "Jamie",
        "winning_score": 284,
    }
