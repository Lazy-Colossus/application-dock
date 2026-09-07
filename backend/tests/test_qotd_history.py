"""Story 3.2 — GET /api/qotd/history."""

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


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    monkeypatch.setattr(service, "today", lambda: TODAY)
    return tmp_path


def _seed(day: str, answers: dict[str, Answer] | None = None) -> None:
    d = date.fromisoformat(day)
    repo.write_day(
        Day(
            schema_version=repo.CURRENT_SCHEMA_VERSION,
            date=day,
            question_id=service.question_id_for_date(d),
            answers=answers or {},
        )
    )


def _answer(text: str = "x") -> Answer:
    stamp = service.now_iso()
    return Answer(text=text, created_at=stamp, updated_at=stamp)


def test_history_returns_past_days_newest_first() -> None:
    _seed("2026-09-07", {"a": _answer()})
    _seed("2026-09-09", {"b": _answer()})
    _seed("2026-09-08", {"c": _answer()})

    rows = client.get("/api/qotd/history").json()
    assert [r["date"] for r in rows] == ["2026-09-09", "2026-09-08", "2026-09-07"]


def test_history_resolves_question_text_and_type() -> None:
    _seed("2026-09-08", {"a": _answer()})
    row = client.get("/api/qotd/history").json()[0]
    expected = service.question_for_date(date(2026, 9, 8))
    assert row["question_text"] == expected.text
    assert row["type"] == expected.type


def test_history_excludes_today() -> None:
    _seed(TODAY.isoformat(), {"me": _answer()})
    _seed("2026-09-08", {"a": _answer()})
    dates = [r["date"] for r in client.get("/api/qotd/history").json()]
    assert TODAY.isoformat() not in dates
    assert "2026-09-08" in dates


def test_history_excludes_future_days() -> None:
    _seed("2026-09-20", {"future": _answer()})  # somehow-stored future date
    _seed("2026-09-08", {"a": _answer()})
    dates = [r["date"] for r in client.get("/api/qotd/history").json()]
    assert "2026-09-20" not in dates
    assert dates == ["2026-09-08"]


def test_no_answer_past_day_is_still_listed() -> None:
    # A past day whose file has no answers is still part of the record and must
    # not be silently dropped (AC-2).
    _seed("2026-09-08", {})
    rows = client.get("/api/qotd/history").json()
    assert [r["date"] for r in rows] == ["2026-09-08"]


def test_empty_history_is_an_empty_list() -> None:
    assert client.get("/api/qotd/history").json() == []


def test_missing_question_id_surfaces_loudly() -> None:
    # A stored day referencing a removed question must not silently drop — the
    # endpoint surfaces a 5xx instead.
    repo.write_day(
        Day(
            schema_version=repo.CURRENT_SCHEMA_VERSION,
            date="2026-09-08",
            question_id="q-removed-from-set",
            answers={"a": _answer()},
        )
    )
    assert client.get("/api/qotd/history").status_code == 500
