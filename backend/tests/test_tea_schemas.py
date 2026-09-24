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
    assert doc.schema_version == 1
    assert doc.teas == []
    assert doc.catalogue_nodes == []


def test_tea_requires_only_name_and_node() -> None:
    tea = Tea(
        id="t-abc12345",
        name="Da Hong Pao",
        catalogue_node_id="oolong.wuyi-yancha.da-hong-pao",
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )
    assert tea.form is None
    assert tea.grams_remaining == 0
    assert tea.origin == ""


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
