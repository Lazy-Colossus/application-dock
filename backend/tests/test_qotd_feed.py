"""Story 3.1 — today's shared feed (answer-to-reveal)."""

from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import qotd_repo as repo
from app.schemas.qotd import Answer, Day
from app.services import qotd_service as service

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def _freeze(monkeypatch: pytest.MonkeyPatch, day: date) -> None:
    monkeypatch.setattr(service, "today", lambda: day)


def _text_day(start: date = date(2026, 9, 6)) -> date:
    return next(
        start + timedelta(days=i)
        for i in range(30)
        if service.question_for_date(start + timedelta(days=i)).type == "text"
    )


def _answer(text: str, created_at: str) -> Answer:
    return Answer(text=text, created_at=created_at, updated_at=created_at)


def _seed_day(day: date, answers: dict[str, Answer]) -> None:
    repo.write_day(
        Day(
            schema_version=repo.CURRENT_SCHEMA_VERSION,
            date=day.isoformat(),
            question_id=service.question_id_for_date(day),
            answers=answers,
        )
    )


def test_feed_withheld_until_the_caller_answers(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze(monkeypatch, day)
    # Others have answered, but the caller (test_user) has not.
    _seed_day(
        day,
        {
            "alice": _answer("A", "2026-09-06T09:00:00Z"),
            "bob": _answer("B", "2026-09-06T09:05:00Z"),
        },
    )

    import json

    body = client.get("/api/qotd/today/answers").json()
    assert body["revealed"] is False
    assert body["answers"] == []  # no contents leaked
    assert body["count"] == 2  # count teaser is allowed
    # Neither an author nor an answer's text appears anywhere in the payload.
    assert "alice" not in json.dumps(body)
    assert "A" not in json.dumps(body["answers"])


def test_feed_revealed_after_the_caller_answers(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze(monkeypatch, day)
    _seed_day(
        day,
        {
            "bob": _answer("B", "2026-09-06T09:05:00Z"),
            "alice": _answer("A", "2026-09-06T09:00:00Z"),
            "test_user": _answer("mine", "2026-09-06T10:00:00Z"),
        },
    )

    body = client.get("/api/qotd/today/answers").json()
    assert body["revealed"] is True
    assert body["count"] == 3
    # Attributed and ordered by created_at (alice 09:00, bob 09:05, me 10:00).
    assert [a["username"] for a in body["answers"]] == ["alice", "bob", "test_user"]
    assert body["answers"][0]["text"] == "A"


def test_unanswered_caller_cannot_bypass_the_gate(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze(monkeypatch, day)
    _seed_day(day, {"alice": _answer("secret", "2026-09-06T09:00:00Z")})

    # Direct API call, no answer from the caller — contents stay withheld.
    body = client.get("/api/qotd/today/answers").json()
    assert body["revealed"] is False
    assert body["answers"] == []


def test_feed_unlocks_in_place_after_answering(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze(monkeypatch, day)
    _seed_day(day, {"alice": _answer("A", "2026-09-06T09:00:00Z")})

    # Withheld before answering.
    assert client.get("/api/qotd/today/answers").json()["revealed"] is False
    # Answer, then the feed reveals.
    client.put("/api/qotd/today/answer", json={"text": "mine"})
    after = client.get("/api/qotd/today/answers").json()
    assert after["revealed"] is True
    assert {a["username"] for a in after["answers"]} == {"alice", "test_user"}


def test_empty_day_feed_is_withheld_with_zero_count(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze(monkeypatch, day)
    body = client.get("/api/qotd/today/answers").json()
    assert body == {"revealed": False, "count": 0, "answers": []}
