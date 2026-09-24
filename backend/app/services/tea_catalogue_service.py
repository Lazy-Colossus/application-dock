"""The catalogue tree: the seeded spine plus whatever the user has added.

Seeded nodes ship in the repo and are read-only. A user's own nodes live in
their document and are merged over the seed on read — but never *replace* a
seeded node, so a seed update can never be silently hijacked by stale user data
and a user can never lose a node to a seed rename (FR-6).

Raises stdlib exceptions plus `NodeInUseError`; the router translates.
"""

from __future__ import annotations

import uuid

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, CreateNodeRequest

_OTHER = "other"


class NodeInUseError(Exception):
    """A catalogue node cannot be deleted while teas are classified under it."""


def _reaches_a_root(node: CatalogueNode, by_id: dict[str, CatalogueNode]) -> bool:
    """Whether walking up from `node` terminates at a root.

    Guards against both a missing parent and a cycle: a node that never reaches
    `parent_id is None` is unreachable in the picker and is dropped rather than
    allowed to break the walk (Review Focus 3).
    """
    seen: set[str] = set()
    current: CatalogueNode | None = node
    while current is not None:
        if current.id in seen:
            return False
        seen.add(current.id)
        if current.parent_id is None:
            return True
        current = by_id.get(current.parent_id)
    return False


def merged_nodes(username: str) -> list[CatalogueNode]:
    """The seed plus this user's own nodes, with unreachable nodes dropped."""
    seed = list(repo.read_seed_catalogue())
    seed_ids = {node.id for node in seed}

    # A user node claiming a seed id is ignored outright: the seed wins.
    mine = [node for node in repo.read_doc(username).catalogue_nodes if node.id not in seed_ids]

    combined = seed + mine
    by_id = {node.id: node for node in combined}
    return [node for node in combined if _reaches_a_root(node, by_id)]


def node_index(nodes: list[CatalogueNode]) -> dict[str, CatalogueNode]:
    return {node.id: node for node in nodes}


def resolve_class(index: dict[str, CatalogueNode], node_id: str) -> str:
    """The root class a node belongs to, or `other` if it cannot be resolved.

    A tea pointing at a node that has since been deleted or retired must still
    appear on the shelf; one unresolvable tea may never fail the whole list
    (Review Focus 2).
    """
    seen: set[str] = set()
    current = index.get(node_id)
    while current is not None:
        if current.id in seen:
            return _OTHER
        seen.add(current.id)
        if current.parent_id is None:
            return current.id
        current = index.get(current.parent_id)
    return _OTHER


def create_node(username: str, req: CreateNodeRequest) -> CatalogueNode:
    """Add one node under an existing parent and return it."""
    name = req.name.strip()
    if not name:
        raise ValueError("A catalogue entry needs a name")

    if req.parent_id not in node_index(merged_nodes(username)):
        raise ValueError(f"No catalogue entry with id {req.parent_id!r}")

    node = CatalogueNode(
        id=f"u-{uuid.uuid4().hex[:8]}",
        parent_id=req.parent_id,
        name=name,
        name_zh=req.name_zh.strip(),
        source="user",
        default_origin=req.default_origin.strip(),
    )
    with repo.doc_transaction(username) as doc:
        doc.catalogue_nodes.append(node)
    return node


def delete_node(username: str, node_id: str) -> None:
    """Remove one of the user's own nodes, if nothing is classified under it."""
    if any(node.id == node_id for node in repo.read_seed_catalogue()):
        raise ValueError("Teas that ship with the app cannot be removed")

    with repo.doc_transaction(username) as doc:
        if all(node.id != node_id for node in doc.catalogue_nodes):
            raise FileNotFoundError(f"No catalogue entry with id {node_id!r}")

        in_use = sum(1 for tea in doc.teas if tea.catalogue_node_id == node_id)
        if in_use:
            plural = "tea is" if in_use == 1 else "teas are"
            raise NodeInUseError(f"{in_use} {plural} classified here. Reclassify them first.")

        doc.catalogue_nodes = [node for node in doc.catalogue_nodes if node.id != node_id]
