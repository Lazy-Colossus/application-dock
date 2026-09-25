"""Filtering, searching, and catalogue resolution for Almanac entries."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import almanac_repo as repo
from app.repositories import tea_repo
from app.schemas.almanac import AlmanacEntry
from app.services import almanac_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tea_repo.settings, "data_dir", tmp_path)


def test_list_entries_returns_every_seeded_entry_resolved() -> None:
    views = service.list_entries("alice")
    longjing = next(v for v in views if v.catalogue_node_id == "green.longjing")
    assert longjing.name == "Longjing"
    assert longjing.name_zh == "龍井"


def test_list_entries_filters_by_country_case_insensitively() -> None:
    views = service.list_entries("alice", country="japan")
    assert views
    assert all(v.country == "Japan" for v in views)


def test_list_entries_filters_by_country_with_no_matches_returns_empty() -> None:
    assert service.list_entries("alice", country="Atlantis") == []


def test_list_entries_search_matches_summary_case_insensitively() -> None:
    views = service.list_entries("alice", q="SHADED GREEN")
    ids = {v.catalogue_node_id for v in views}
    assert "green.japanese.gyokuro" in ids


def test_list_entries_search_matches_native_script() -> None:
    views = service.list_entries("alice", q="龍井")
    ids = {v.catalogue_node_id for v in views}
    assert "green.longjing" in ids


def test_list_entries_drops_an_entry_whose_catalogue_node_no_longer_resolves(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Review Focus: a broken link must not break the whole listing."""
    broken = AlmanacEntry(catalogue_node_id="gone.for.good", country="Nowhere", summary="x")
    monkeypatch.setattr(repo, "read_seed_entries", lambda: (broken,))

    assert service.list_entries("alice") == []


def test_get_entry_returns_the_resolved_view() -> None:
    view = service.get_entry("alice", "green.japanese.matcha")
    assert view.name == "Matcha"
    assert view.brewing.steep_seconds == []


def test_get_entry_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.get_entry("alice", "does.not.exist")


def test_get_entry_raises_not_found_when_the_node_cannot_resolve(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    broken = AlmanacEntry(catalogue_node_id="gone.for.good", country="Nowhere", summary="x")
    monkeypatch.setattr(repo, "read_seed_entries", lambda: (broken,))

    with pytest.raises(FileNotFoundError):
        service.get_entry("alice", "gone.for.good")
