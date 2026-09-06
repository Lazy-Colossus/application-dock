"""Story 1.4 — GET /api/qotd/today."""

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


def _freeze_today(monkeypatch: pytest.MonkeyPatch, day: date) -> None:
    monkeypatch.setattr(service, "today", lambda: day)


def test_today_returns_the_deterministic_question(monkeypatch: pytest.MonkeyPatch) -> None:
    day = date(2026, 9, 6)
    _freeze_today(monkeypatch, day)

    response = client.get("/api/qotd/today")
    assert response.status_code == 200
    body = response.json()

    expected = service.question_for_date(day)
    assert body["date"] == "2026-09-06"
    assert body["question"]["id"] == expected.id
    assert body["question"]["text"] == expected.text
    assert body["question"]["type"] == expected.type
    assert body["answered"] is False


def test_today_scale_question_carries_bounds_and_labels(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Find a date whose question is a scale, so the payload's scale is exercised.
    scale_day = next(
        d
        for d in (date(2026, 9, 6) + timedelta(days=i) for i in range(30))
        if service.question_for_date(d).type == "scale"
    )
    _freeze_today(monkeypatch, scale_day)

    body = client.get("/api/qotd/today").json()
    assert body["question"]["type"] == "scale"
    scale = body["question"]["scale"]
    assert scale["min"] < scale["max"]
    assert "min_label" in scale and "max_label" in scale


def test_today_reports_answered_true_once_an_answer_exists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    day = date(2026, 9, 6)
    _freeze_today(monkeypatch, day)

    stamp = service.now_iso()
    repo.write_day(
        Day(
            schema_version=repo.CURRENT_SCHEMA_VERSION,
            date="2026-09-06",
            question_id=service.question_id_for_date(day),
            answers={"test_user": Answer(text="hi", created_at=stamp, updated_at=stamp)},
        )
    )

    body = client.get("/api/qotd/today").json()
    assert body["answered"] is True


def test_today_does_not_leak_other_users_answers(monkeypatch: pytest.MonkeyPatch) -> None:
    day = date(2026, 9, 6)
    _freeze_today(monkeypatch, day)

    stamp = service.now_iso()
    repo.write_day(
        Day(
            schema_version=repo.CURRENT_SCHEMA_VERSION,
            date="2026-09-06",
            question_id=service.question_id_for_date(day),
            answers={"someone_else": Answer(text="secret", created_at=stamp, updated_at=stamp)},
        )
    )

    body = client.get("/api/qotd/today").json()
    # The caller ("test_user") has not answered; no answers pool is exposed.
    assert body["answered"] is False
    assert "answers" not in body
    assert "secret" not in response_text(body)


def test_today_response_is_direct_and_snake_case(monkeypatch: pytest.MonkeyPatch) -> None:
    _freeze_today(monkeypatch, date(2026, 9, 6))
    body = client.get("/api/qotd/today").json()
    # Direct object, not an envelope. `my_answer` carries the caller's own answer
    # (null until they answer) — never the pool of other users' answers.
    assert set(body.keys()) == {"date", "question", "answered", "my_answer"}
    assert body["my_answer"] is None
    # snake_case scale fields.
    if body["question"]["type"] == "scale":
        assert "min_label" in body["question"]["scale"]


def response_text(body: object) -> str:
    import json

    return json.dumps(body)
