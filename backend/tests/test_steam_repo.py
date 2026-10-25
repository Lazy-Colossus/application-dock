"""Unit tests for steam_repo. Each test gets its own empty data_dir."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.repositories import steam_repo


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


def test_read_names_missing_file_returns_empty() -> None:
    assert steam_repo.read_names() == {}


def test_write_then_read_round_trips() -> None:
    steam_repo.write_names({"1623730": "Palworld", "1604030": "V Rising"})
    assert steam_repo.read_names() == {"1623730": "Palworld", "1604030": "V Rising"}
