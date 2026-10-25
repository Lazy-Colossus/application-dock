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


class _FakeResponse:
    """Stand-in for httpx.Response covering the bits _fetch_app_name uses."""

    def __init__(self, payload: object, json_exc: Exception | None = None) -> None:
        self._payload = payload
        self._json_exc = json_exc

    def raise_for_status(self) -> None:
        pass

    def json(self) -> object:
        if self._json_exc is not None:
            raise self._json_exc
        return self._payload


def test_fetch_app_name_parses_name_on_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        steam_service.httpx,
        "get",
        lambda *a, **k: _FakeResponse({"1623730": {"success": True, "data": {"name": "Palworld"}}}),
    )
    assert steam_service._fetch_app_name(1623730) == "Palworld"


def test_fetch_app_name_none_when_success_false(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        steam_service.httpx,
        "get",
        lambda *a, **k: _FakeResponse({"1623730": {"success": False}}),
    )
    assert steam_service._fetch_app_name(1623730) is None


def test_fetch_app_name_none_when_name_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        steam_service.httpx,
        "get",
        lambda *a, **k: _FakeResponse({"1623730": {"success": True, "data": {}}}),
    )
    assert steam_service._fetch_app_name(1623730) is None


def test_fetch_app_name_none_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(*a: object, **k: object) -> object:
        raise steam_service.httpx.HTTPError("down")

    monkeypatch.setattr(steam_service.httpx, "get", boom)
    assert steam_service._fetch_app_name(1623730) is None


def test_fetch_app_name_none_on_non_json(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        steam_service.httpx,
        "get",
        lambda *a, **k: _FakeResponse(None, json_exc=ValueError("not json")),
    )
    assert steam_service._fetch_app_name(1623730) is None
