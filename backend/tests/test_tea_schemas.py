"""Schemas and the shape of the shipped seed catalogue."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.tea import CATALOGUE_CLASSES, CatalogueNode, Tea, TeaDoc

SEED_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "tea_catalogue.json"


def _seed_nodes() -> list[CatalogueNode]:
    raw = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    return [CatalogueNode.model_validate(node) for node in raw]


def test_empty_doc_defaults_are_usable() -> None:
    doc = TeaDoc()
    assert doc.schema_version == 7
    assert doc.teas == []
    assert doc.catalogue_nodes == []
    assert doc.sessions == []


def test_tea_requires_only_name_and_node() -> None:
    tea = Tea(
        id="t-abc12345",
        name="Da Hong Pao",
        catalogue_node_id="oolong.chinese.wuyi-yancha.da-hong-pao",
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )
    assert tea.form is None
    assert tea.grams_remaining == 0
    assert tea.origin == ""
    assert tea.image_url is None


def test_seed_parses_and_every_root_is_a_class() -> None:
    nodes = _seed_nodes()
    roots = [n for n in nodes if n.parent_id is None]
    assert {n.id for n in roots} == set(CATALOGUE_CLASSES)


def test_seed_ids_are_unique() -> None:
    ids = [n.id for n in _seed_nodes()]
    assert len(ids) == len(set(ids))


def test_every_seed_parent_resolves() -> None:
    nodes = _seed_nodes()
    known = {n.id for n in nodes}
    orphans = [n.id for n in nodes if n.parent_id is not None and n.parent_id not in known]
    assert orphans == []


def test_every_seed_node_is_marked_seed() -> None:
    assert all(n.source == "seed" for n in _seed_nodes())


@pytest.mark.parametrize("class_id", CATALOGUE_CLASSES)
def test_class_order_is_the_chinese_classification(class_id: str) -> None:
    assert class_id in ("green", "yellow", "white", "oolong", "red", "dark", "other")
    assert CATALOGUE_CLASSES.index("green") < CATALOGUE_CLASSES.index("dark")


def test_a_session_without_a_vessel_parses() -> None:
    from app.schemas.tea_session import TeaSession

    session = TeaSession.model_validate(
        {
            "id": "s-1",
            "tea_id": "t-1",
            "status": "finalised",
            "started_at": "2026-09-27T18:00:00+00:00",
            "curve_source": "generic",
            "brewed_by": "alice",
            "updated_at": "2026-09-27T18:30:00+00:00",
        }
    )
    assert (session.teaware_id, session.vessel_volume_ml) == (None, None)


def test_teaware_write_refuses_a_zero_volume_and_a_negative_price() -> None:
    from pydantic import ValidationError

    from app.schemas.teaware import TeawareWriteRequest

    with pytest.raises(ValidationError):
        TeawareWriteRequest.model_validate({"name": "Pot", "type": "pot", "volume_ml": 0})
    with pytest.raises(ValidationError):
        TeawareWriteRequest.model_validate({"name": "Pot", "type": "pot", "price_paid": -1})


MOVED_UNDER_COUNTRY = {
    "red.japanese.wakoucha": "red.japanese",
    "red.korean.balhyocha": "red.korean",
    "red.taiwanese.hongyu": "red.taiwanese",
    "red.taiwanese.mi-xiang": "red.taiwanese",
    "yellow.korean.hwangcha": "yellow.korean",
    "dark.korean.cheongtaejeon": "dark.korean",
    "other.thai.miang": "other.thai",
}


def test_teas_from_outside_china_sit_under_their_country() -> None:
    nodes = {node.id: node for node in _seed_nodes()}
    for node_id, parent_id in MOVED_UNDER_COUNTRY.items():
        assert nodes[node_id].parent_id == parent_id
        assert nodes[parent_id].parent_id in CATALOGUE_CLASSES


def test_a_class_holds_only_country_groups() -> None:
    nodes = _seed_nodes()
    parents = {node.parent_id for node in nodes}
    loose = [n.id for n in nodes if n.parent_id in CATALOGUE_CLASSES and n.id not in parents]
    assert loose == []


@pytest.mark.parametrize("cls", ["green", "yellow", "white", "oolong", "red", "dark"])
def test_chinese_teas_sit_under_a_chinese_group(cls: str) -> None:
    nodes = {node.id: node for node in _seed_nodes()}
    group = nodes[f"{cls}.chinese"]
    assert (group.parent_id, group.name, group.default_origin) == (cls, "Chinese", "China")


def test_every_almanac_entry_points_at_a_seed_node() -> None:
    ids = {node.id for node in _seed_nodes()}
    for path in (SEED_PATH.parent / "almanac").glob("*.json"):
        for entry in json.loads(path.read_text(encoding="utf-8")):
            assert entry["catalogue_node_id"] in ids, (path.name, entry["catalogue_node_id"])
