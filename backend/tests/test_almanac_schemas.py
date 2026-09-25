"""Defaults and shape of the Almanac's pydantic models."""

from __future__ import annotations

from app.schemas.almanac import AlmanacEntry, AlmanacEntryView, BrewingParameters


def test_brewing_parameters_default_to_unknown() -> None:
    params = BrewingParameters()
    assert params.leaf_grams is None
    assert params.water_temp_c is None
    assert params.steep_seconds == []


def test_almanac_entry_defaults_to_seed_source() -> None:
    entry = AlmanacEntry(catalogue_node_id="green.longjing", country="China", summary="x")
    assert entry.source == "seed"
    assert entry.reading == ""
    assert entry.brewing.steep_seconds == []


def test_almanac_entry_view_carries_the_resolved_catalogue_fields() -> None:
    view = AlmanacEntryView(
        catalogue_node_id="green.longjing",
        country="China",
        summary="x",
        name="Longjing",
        name_zh="龍井",
        default_origin="Xihu, Zhejiang",
    )
    assert view.name == "Longjing"
    assert view.name_zh == "龍井"
    assert view.default_origin == "Xihu, Zhejiang"
