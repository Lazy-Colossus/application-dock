"""Loading and merging the Almanac's seeded per-country JSON files."""

from __future__ import annotations

from app.repositories import almanac_repo as repo
from app.repositories import tea_repo


def test_read_seed_entries_merges_every_country_file() -> None:
    entries = repo.read_seed_entries()
    countries = {e.country for e in entries}
    assert "China" in countries
    assert "Japan" in countries


def test_read_seed_entries_includes_known_teas() -> None:
    ids = {e.catalogue_node_id for e in repo.read_seed_entries()}
    assert "green.longjing" in ids
    assert "green.japanese.matcha" in ids


def test_every_seed_entry_references_a_real_catalogue_node() -> None:
    """A typo'd catalogue_node_id in a seed file must fail fast, not ship."""
    catalogue_ids = {n.id for n in tea_repo.read_seed_catalogue()}
    for entry in repo.read_seed_entries():
        assert entry.catalogue_node_id in catalogue_ids, entry.catalogue_node_id


def test_read_seed_entries_is_cached() -> None:
    assert repo.read_seed_entries() is repo.read_seed_entries()
