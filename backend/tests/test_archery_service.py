"""Tests for archery_service.generate_session_label."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import pytest

from app.services import archery_service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import settings

    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(archery_service.settings, "data_dir", tmp_path)


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
    # _in_progress.json already has today's base label
    ip = tmp_path / "_in_progress.json"
    ip.write_text(json.dumps({"label": BASE}))
    label = archery_service.generate_session_label(today=TODAY)
    assert label == f"{BASE}-2"


def test_label_considers_in_progress_suffix_collision(tmp_path: Path) -> None:
    (tmp_path / f"{BASE}.json").write_text("{}")
    ip = tmp_path / "_in_progress.json"
    ip.write_text(json.dumps({"label": f"{BASE}-2"}))
    label = archery_service.generate_session_label(today=TODAY)
    assert label == f"{BASE}-3"


def test_label_different_day_not_counted(tmp_path: Path) -> None:
    (tmp_path / "2026-05-28.json").write_text("{}")
    label = archery_service.generate_session_label(today=TODAY)
    assert label == BASE


def test_label_corrupt_in_progress_ignored(tmp_path: Path) -> None:
    ip = tmp_path / "_in_progress.json"
    ip.write_text("not json")
    label = archery_service.generate_session_label(today=TODAY)
    assert label == BASE
