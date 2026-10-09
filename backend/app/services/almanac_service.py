"""Business logic for the Cha Dao Almanac.

Read-only: filters and searches the seeded entries, resolving each one's
name, native script, and default origin from its linked catalogue node.
Raises stdlib exceptions only; the router translates them.
"""

from __future__ import annotations

from app.repositories import almanac_repo as repo
from app.schemas.almanac import AlmanacEntry, AlmanacEntryView
from app.schemas.tea import CatalogueNode
from app.services import tea_catalogue_service as catalogue


def _view(entry: AlmanacEntry, index: dict[str, CatalogueNode]) -> AlmanacEntryView | None:
    node = index.get(entry.catalogue_node_id)
    if node is None:
        return None
    return AlmanacEntryView(
        **entry.model_dump(),
        name=node.name,
        name_zh=node.name_zh,
        default_origin=node.default_origin,
    )


def list_entries(
    username: str, country: str | None = None, q: str | None = None
) -> list[AlmanacEntryView]:
    """Every entry whose catalogue node still resolves, optionally filtered.

    An entry pointing at a node that no longer exists is dropped rather than
    failing the whole list — the same defensive rule `resolve_class` applies
    to a tea's classification (Review Focus: a broken link must not break
    the page for everything else).
    """
    index = catalogue.node_index(catalogue.merged_nodes(username))
    views = [v for entry in repo.read_seed_entries() if (v := _view(entry, index)) is not None]

    if country:
        needle = country.strip().casefold()
        views = [v for v in views if v.country.casefold() == needle]

    if q:
        needle = q.strip().casefold()
        views = [
            v
            for v in views
            if needle in v.name.casefold()
            or needle in v.name_zh.casefold()
            or needle in v.summary.casefold()
        ]

    return views


def get_entry(username: str, catalogue_node_id: str) -> AlmanacEntryView:
    index = catalogue.node_index(catalogue.merged_nodes(username))
    for entry in repo.read_seed_entries():
        if entry.catalogue_node_id == catalogue_node_id:
            view = _view(entry, index)
            if view is not None:
                return view
            break
    raise FileNotFoundError(f"No almanac entry for catalogue node {catalogue_node_id!r}")
