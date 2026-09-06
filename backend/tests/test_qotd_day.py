"""Story 3.3 — GET /api/qotd/days/{date} (read a past day, read-only)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import qotd_repo as repo
from app.schemas.qotd import Answer, Day
from app.services import qotd_service as service

client = TestClient(app)

TODAY = date(2026, 9, 10)
PAST = "2026-09-08"


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    monkeypatch.setattr(service, "today", lambda: TODAY)
    return tmp_path


def _answer(text: str, created_at: str) -> Answer:
    return Answer(text=text, created_at=created_at, updated_at=created_at)


def _seed(day: str, answers: dict[str, Answer]) -> None:
    repo.write_day(
        Day(
            schema_version=repo.CURRENT_SCHEMA_VERSION,
            date=day,
            question_id=service.question_id_for_date(date.fromisoformat(day)),
            answers=answers,
        )
    )


def test_past_day_returns_question_and_all_answers() -> None:
    _seed(
        PAST,
        {
            "bob": _answer("B", "2026-09-08T09:05:00Z"),
            "alice": _answer("A", "2026-09-08T09:00:00Z"),
        },
    )

    body = client.get(f"/api/qotd/days/{PAST}").json()
    expected = service.question_for_date(date.fromisoformat(PAST))
    assert body["date"] == PAST
    assert body["question"]["id"] == expected.id
    # Every answer, attributed and ordered by created_at — no reveal gate.
    assert [a["username"] for a in body["answers"]] == ["alice", "bob"]
    assert body["answers"][0]["text"] == "A"


def test_past_day_visible_even_if_caller_never_answered() -> None:
    # The caller (test_user) is not among the authors, yet sees everything —
    # past days are not gated behind answer-to-reveal.
    _seed(PAST, {"alice": _answer("A", "2026-09-08T09:00:00Z")})
    body = client.get(f"/api/qotd/days/{PAST}").json()
    assert len(body["answers"]) == 1
    assert body["answers"][0]["username"] == "alice"


def test_empty_past_day_shows_the_question_with_no_answers() -> None:
    _seed(PAST, {})
    body = client.get(f"/api/qotd/days/{PAST}").json()
    assert body["answers"] == []
    assert body["question"]["id"]  # question still resolved


def test_unknown_past_date_is_404() -> None:
    assert client.get("/api/qotd/days/2026-09-07").status_code == 404


def test_today_is_refused() -> None:
    _seed(TODAY.isoformat(), {"me": _answer("x", "2026-09-10T09:00:00Z")})
    assert client.get(f"/api/qotd/days/{TODAY.isoformat()}").status_code == 404


def test_future_date_is_refused() -> None:
    assert client.get("/api/qotd/days/2026-09-20").status_code == 404


def test_malformed_date_is_400() -> None:
    assert client.get("/api/qotd/days/2026-9-8").status_code == 400
    assert client.get("/api/qotd/days/not-a-date").status_code == 400


def test_traversal_date_reads_nothing_outside_days(isolate: Path) -> None:
    # A traversal-style date is rejected before any filesystem access, and
    # nothing is read or created outside days/.
    response = client.get("/api/qotd/days/..%2f..%2fetc")
    assert response.status_code in {400, 404}
    assert list(isolate.rglob("etc")) == []
