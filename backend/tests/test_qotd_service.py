"""Story 2.3 — edit today, lock days that have passed.

The past/present boundary is decided server-side by `today()`; these tests drive
the day rolling over by monkeypatching it, so the lock is proven without waiting
until midnight (NFR-5).
"""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pytest

from app.repositories import qotd_repo as repo
from app.services import qotd_service as service


def _first_text_day(start: date = date(2026, 9, 6)) -> date:
    """A date whose deterministic question is `text`, so a text payload is valid."""
    return next(
        start + timedelta(days=i)
        for i in range(30)
        if service.question_for_date(start + timedelta(days=i)).type == "text"
    )


TEXT_DAY = _first_text_day()


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def _freeze(monkeypatch: pytest.MonkeyPatch, day: date) -> None:
    monkeypatch.setattr(service, "today", lambda: day)


def test_editing_today_upserts_and_preserves_created_at(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _freeze(monkeypatch, TEXT_DAY)

    first = service.upsert_today_answer("alice", text="first")
    monkeypatch.setattr(service, "now_iso", lambda: "2999-01-01T00:00:00Z")
    second = service.upsert_today_answer("alice", text="second")

    stored = repo.read_day(TEXT_DAY.isoformat())
    assert len(stored.answers) == 1
    assert second.text == "second"
    assert second.created_at == first.created_at  # preserved
    assert second.updated_at != first.updated_at  # bumped


def test_write_to_a_past_date_is_refused_and_writes_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _freeze(monkeypatch, TEXT_DAY)
    past = (TEXT_DAY - timedelta(days=1)).isoformat()
    with pytest.raises(PermissionError):
        service._upsert_answer("alice", past, text="late", rating=None)
    assert repo.read_day(past).answers == {}  # nothing written


def test_answer_becomes_non_editable_once_the_day_rolls_over(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Answer while it is still "today".
    _freeze(monkeypatch, TEXT_DAY)
    service.upsert_today_answer("alice", text="in the moment")
    assert repo.read_day(TEXT_DAY.isoformat()).answers["alice"].text == "in the moment"

    # The day rolls over: the answer is now locked.
    tomorrow = TEXT_DAY + timedelta(days=1)
    _freeze(monkeypatch, tomorrow)
    with pytest.raises(PermissionError):
        service._upsert_answer("alice", TEXT_DAY.isoformat(), text="changed my mind", rating=None)
    # The original answer is untouched.
    assert repo.read_day(TEXT_DAY.isoformat()).answers["alice"].text == "in the moment"


def test_today_is_not_past_and_stays_writable(monkeypatch: pytest.MonkeyPatch) -> None:
    _freeze(monkeypatch, TEXT_DAY)
    assert service.is_past(TEXT_DAY.isoformat()) is False
    service._assert_answerable(TEXT_DAY.isoformat())  # does not raise


def test_future_date_is_rejected_as_value_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _freeze(monkeypatch, TEXT_DAY)
    with pytest.raises(ValueError):
        service._assert_answerable("2099-01-01")
