"""Unit tests for steam_service. The HTTP seam (_fetch_app_name) is stubbed."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.repositories import steam_repo
from app.services import steam_service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


def test_game_name_returns_cached_without_fetching(monkeypatch: pytest.MonkeyPatch) -> None:
    steam_repo.write_names({"1623730": "Palworld"})

    def boom(app_id: int) -> str | None:
        raise AssertionError("should not fetch when cached")

    monkeypatch.setattr(steam_service, "_fetch_app_name", boom)
    assert steam_service.game_name(1623730) == "Palworld"


def test_game_name_fetches_and_caches_on_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    def fake_fetch(app_id: int) -> str | None:
        calls["n"] += 1
        return "V Rising"

    monkeypatch.setattr(steam_service, "_fetch_app_name", fake_fetch)

    assert steam_service.game_name(1604030) == "V Rising"
    assert steam_repo.read_names() == {"1604030": "V Rising"}
    # Second call is served from cache — no second fetch.
    assert steam_service.game_name(1604030) == "V Rising"
    assert calls["n"] == 1


def test_game_name_returns_none_and_does_not_cache_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(steam_service, "_fetch_app_name", lambda app_id: None)
    assert steam_service.game_name(999999) is None
    assert steam_repo.read_names() == {}
