"""Story 2.1 — PUT /api/qotd/today/answer (upsert)."""

from __future__ import annotations

import threading
from datetime import date, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app
from app.repositories import qotd_repo as repo
from app.services import qotd_service as service

client = TestClient(app)


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def _freeze_today(monkeypatch: pytest.MonkeyPatch, day: date) -> None:
    monkeypatch.setattr(service, "today", lambda: day)


def _text_day(start: date = date(2026, 9, 6)) -> date:
    return next(
        start + timedelta(days=i)
        for i in range(30)
        if service.question_for_date(start + timedelta(days=i)).type == "text"
    )


def _scale_day(start: date = date(2026, 9, 6)) -> date:
    return next(
        start + timedelta(days=i)
        for i in range(30)
        if service.question_for_date(start + timedelta(days=i)).type == "scale"
    )


def test_saves_a_text_answer(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze_today(monkeypatch, day)

    response = client.put("/api/qotd/today/answer", json={"text": "  a great day  "})
    assert response.status_code == 200
    body = response.json()
    assert body["text"] == "a great day"  # trimmed
    assert body["rating"] is None
    assert body["created_at"] and body["updated_at"]

    stored = repo.read_day(day.isoformat())
    assert stored.answers["test_user"].text == "a great day"


def test_saves_a_scale_answer_within_range(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _scale_day()
    _freeze_today(monkeypatch, day)
    question = service.question_for_date(day)
    assert question.scale is not None

    response = client.put("/api/qotd/today/answer", json={"rating": question.scale.min})
    assert response.status_code == 200
    assert response.json()["rating"] == question.scale.min


def test_resubmit_upserts_preserving_created_at(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze_today(monkeypatch, day)

    first = client.put("/api/qotd/today/answer", json={"text": "first"}).json()
    # A later stamp on the edit; now_iso has second precision, so nudge it.
    monkeypatch.setattr(service, "now_iso", lambda: "2999-01-01T00:00:00Z")
    second = client.put("/api/qotd/today/answer", json={"text": "second"}).json()

    stored = repo.read_day(day.isoformat())
    assert len(stored.answers) == 1  # still one answer for the user
    assert second["text"] == "second"
    assert second["created_at"] == first["created_at"]  # preserved
    assert second["updated_at"] != first["updated_at"]  # bumped


def test_rejects_rating_for_a_text_question(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze_today(monkeypatch, day)
    response = client.put("/api/qotd/today/answer", json={"rating": 3})
    assert response.status_code == 422
    assert "detail" in response.json()
    assert repo.read_day(day.isoformat()).answers == {}  # nothing written


def test_rejects_text_for_a_scale_question(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _scale_day()
    _freeze_today(monkeypatch, day)
    response = client.put("/api/qotd/today/answer", json={"text": "nope"})
    assert response.status_code == 422
    assert repo.read_day(day.isoformat()).answers == {}


def test_rejects_out_of_range_rating(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _scale_day()
    _freeze_today(monkeypatch, day)
    question = service.question_for_date(day)
    assert question.scale is not None
    response = client.put("/api/qotd/today/answer", json={"rating": question.scale.max + 1})
    assert response.status_code == 422
    assert repo.read_day(day.isoformat()).answers == {}


def test_rejects_empty_text(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze_today(monkeypatch, day)
    response = client.put("/api/qotd/today/answer", json={"text": "   "})
    assert response.status_code == 422
    assert repo.read_day(day.isoformat()).answers == {}


def test_rejects_both_fields(monkeypatch: pytest.MonkeyPatch) -> None:
    day = _text_day()
    _freeze_today(monkeypatch, day)
    response = client.put("/api/qotd/today/answer", json={"text": "hi", "rating": 3})
    assert response.status_code == 422


def test_body_username_cannot_attribute_to_someone_else(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = _text_day()
    _freeze_today(monkeypatch, day)

    # A forged username in the body is ignored: attribution is the token's user.
    response = client.put("/api/qotd/today/answer", json={"text": "mine", "username": "victim"})
    assert response.status_code == 200
    stored = repo.read_day(day.isoformat())
    assert "victim" not in stored.answers
    assert stored.answers["test_user"].text == "mine"


def test_concurrent_answers_by_different_users_all_persist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = _text_day()
    _freeze_today(monkeypatch, day)
    day_str = day.isoformat()

    def answer_as(username: str) -> None:
        # Each thread posts as a different user via the service directly (the
        # dependency override is process-wide, so drive the service to vary the
        # username under real per-day locking).
        service.upsert_today_answer(username, text=f"from {username}")

    names = [f"user{i}" for i in range(8)]
    threads = [threading.Thread(target=answer_as, args=(n,)) for n in names]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    stored = repo.read_day(day_str)
    assert set(stored.answers.keys()) == set(names)  # none lost


def test_answer_requires_auth() -> None:
    # With the auth override removed, the router-level dependency rejects.
    app.dependency_overrides.pop(get_current_user, None)
    try:
        response = client.put("/api/qotd/today/answer", json={"text": "hi"})
        assert response.status_code == 401
    finally:
        app.dependency_overrides[get_current_user] = lambda: "test_user"
