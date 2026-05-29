"""Tests for archery_service.generate_session_label (Story 6.1 multi-session)."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from app.repositories import session_repo
from app.services import archery_service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)
    monkeypatch.setattr(session_repo.settings, "data_dir", tmp_path)


TODAY = date(2026, 5, 29)
BASE = "2026-05-29"


def test_label_first_session_of_day(tmp_path: Path) -> None:
    label = archery_service.generate_session_label(today=TODAY)
    assert label == BASE


def test_label_second_session_of_day(tmp_path: Path) -> None:
    (tmp_path / f"{BASE}.json").write_text("{}")
    label = archery_service.generate_session_label(today=TODAY)
    assert label == f"{BASE}-2"


def test_label_third_session(tmp_path: Path) -> None:
    (tmp_path / f"{BASE}.json").write_text("{}")
    (tmp_path / f"{BASE}-2.json").write_text("{}")
    label = archery_service.generate_session_label(today=TODAY)
    assert label == f"{BASE}-3"


def test_label_considers_in_progress_collision(tmp_path: Path) -> None:
    # An in-progress session already holds today's base label.
    (tmp_path / f"_ip_{BASE}.json").write_text("{}")
    label = archery_service.generate_session_label(today=TODAY)
    assert label == f"{BASE}-2"


def test_label_considers_in_progress_suffix_collision(tmp_path: Path) -> None:
    (tmp_path / f"{BASE}.json").write_text("{}")
    (tmp_path / f"_ip_{BASE}-2.json").write_text("{}")
    label = archery_service.generate_session_label(today=TODAY)
    assert label == f"{BASE}-3"


def test_label_considers_mix_of_finalised_and_in_progress(tmp_path: Path) -> None:
    (tmp_path / f"{BASE}.json").write_text("{}")  # finalised #1
    (tmp_path / f"_ip_{BASE}-2.json").write_text("{}")  # in-progress #2
    (tmp_path / f"_ip_{BASE}-3.json").write_text("{}")  # in-progress #3
    label = archery_service.generate_session_label(today=TODAY)
    assert label == f"{BASE}-4"


def test_label_different_day_not_counted(tmp_path: Path) -> None:
    (tmp_path / "2026-05-28.json").write_text("{}")
    (tmp_path / "_ip_2026-05-28.json").write_text("{}")
    label = archery_service.generate_session_label(today=TODAY)
    assert label == BASE


# ─── Story 7.1: null/missing-safe totals ────────────────────────────────────


def test_archer_total_treats_null_and_missing_as_zero() -> None:
    from app.schemas.session import SessionData

    session = SessionData(
        label=BASE,
        name=BASE,
        date=BASE,
        created="2026-05-29T10:00:00Z",
        status="in_progress",
        archers=["Alice", "Bob"],
        targets=[
            {"number": 1, "scores": {"Alice": [11, None]}},  # Bob missing entirely
            {"number": 2, "scores": {"Alice": [None, None], "Bob": [10, 8]}},
        ],
    )
    assert archery_service._archer_total(session, "Alice") == 11
    assert archery_service._archer_total(session, "Bob") == 18
