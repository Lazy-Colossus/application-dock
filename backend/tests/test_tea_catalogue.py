"""Merging, walking and guarding the catalogue tree."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, CreateNodeRequest, Tea, TeaDoc
from app.services import tea_catalogue_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea(node_id: str, tea_id: str = "t-abc12345") -> Tea:
    return Tea(
        id=tea_id,
        name="A tea",
        catalogue_node_id=node_id,
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )


def test_merged_nodes_include_the_seed_for_a_user_with_no_file() -> None:
    nodes = service.merged_nodes("alice")
    ids = {n.id for n in nodes}
    assert "oolong" in ids
    assert "oolong.wuyi-yancha.da-hong-pao" in ids


def test_user_nodes_are_merged_over_the_seed() -> None:
    node = service.create_node(
        "alice", CreateNodeRequest(parent_id="oolong.wuyi-yancha", name="Bai Ji Guan")
    )
    ids = {n.id for n in service.merged_nodes("alice")}
    assert node.id in ids
    assert node.source == "user"
    assert node.id.startswith("u-")


def test_one_users_nodes_are_invisible_to_another() -> None:
    service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Alice's own"))
    assert all(n.source == "seed" for n in service.merged_nodes("bob"))


def test_a_user_node_cannot_shadow_a_seed_node() -> None:
    """A user document naming a seed id must not replace the seed's node."""
    repo.write_doc(
        "alice",
        TeaDoc(
            catalogue_nodes=[
                CatalogueNode(id="oolong", parent_id=None, name="Hijacked", source="user")
            ]
        ),
    )
    index = service.node_index(service.merged_nodes("alice"))
    assert index["oolong"].name == "Oolong"
    assert index["oolong"].source == "seed"


def test_create_node_refuses_a_parent_that_does_not_exist() -> None:
    with pytest.raises(ValueError):
        service.create_node("alice", CreateNodeRequest(parent_id="nope", name="Orphan"))


def test_create_node_refuses_a_blank_name() -> None:
    with pytest.raises(ValueError):
        service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="   "))


@pytest.mark.parametrize(
    ("node_id", "expected"),
    [
        ("oolong", "oolong"),
        ("oolong.wuyi-yancha", "oolong"),
        ("oolong.wuyi-yancha.da-hong-pao", "oolong"),
        ("dark.sheng-puerh", "dark"),
        ("green.japanese.matcha", "green"),
    ],
)
def test_resolve_class_walks_to_the_root_at_every_depth(node_id: str, expected: str) -> None:
    index = service.node_index(service.merged_nodes("alice"))
    assert service.resolve_class(index, node_id) == expected


def test_resolve_class_of_an_unknown_node_is_other() -> None:
    """Review Focus 2: a retired or deleted node must not break the shelf."""
    index = service.node_index(service.merged_nodes("alice"))
    assert service.resolve_class(index, "gone.for.good") == "other"


def test_orphaned_user_nodes_are_dropped_from_the_tree() -> None:
    """Review Focus 3: a hand-edited file pointing at a parent that isn't there."""
    repo.write_doc(
        "alice",
        TeaDoc(
            catalogue_nodes=[
                CatalogueNode(
                    id="u-orphan01", parent_id="does-not-exist", name="Lost", source="user"
                )
            ]
        ),
    )
    assert all(n.id != "u-orphan01" for n in service.merged_nodes("alice"))


def test_a_cycle_among_user_nodes_does_not_hang() -> None:
    """Two nodes each claiming the other as parent reach no root, so both go."""
    repo.write_doc(
        "alice",
        TeaDoc(
            catalogue_nodes=[
                CatalogueNode(id="u-aaa", parent_id="u-bbb", name="A", source="user"),
                CatalogueNode(id="u-bbb", parent_id="u-aaa", name="B", source="user"),
            ]
        ),
    )
    ids = {n.id for n in service.merged_nodes("alice")}
    assert "u-aaa" not in ids and "u-bbb" not in ids


def test_two_siblings_may_share_a_name_and_stay_distinct() -> None:
    """Review Focus 5: duplicates are permitted, never silently merged."""
    first = service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Rou Gui"))
    second = service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Rou Gui"))
    assert first.id != second.id
    ids = {n.id for n in service.merged_nodes("alice")}
    assert {first.id, second.id} <= ids


def test_delete_node_removes_an_unused_user_node() -> None:
    node = service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Temp"))
    service.delete_node("alice", node.id)
    assert all(n.id != node.id for n in service.merged_nodes("alice"))


def test_delete_node_refuses_a_node_teas_point_at() -> None:
    node = service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Used"))
    with repo.doc_transaction("alice") as doc:
        doc.teas.append(_tea(node.id))

    with pytest.raises(service.NodeInUseError) as excinfo:
        service.delete_node("alice", node.id)
    assert "1" in str(excinfo.value)


def test_delete_node_refuses_a_seed_node() -> None:
    with pytest.raises(ValueError):
        service.delete_node("alice", "oolong")


def test_delete_node_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.delete_node("alice", "u-nosuchid")
