"""Category autofill for the Tea Cabinet, via TypeSafe's Jev.

Given the free-text name someone typed while adding a tea, asks a single
Choice judgment over every catalogue node to find the best match, using the
linked Almanac summary as extra context where one exists. This is the only
module that talks to TypeSafe.

The confidence threshold below is a starting point, not a tuned constant —
TypeSafe's own guidance is to validate it against real data.

Raises stdlib exceptions plus `AutofillNotConfiguredError` and
`AutofillUpstreamError`; the router translates them.
"""

from __future__ import annotations

import httpx

from app.core.config import settings
from app.repositories import almanac_repo
from app.schemas.almanac import AlmanacEntry
from app.schemas.tea import AutofillSuggestion, CatalogueNode
from app.services import tea_catalogue_service as catalogue

_TYPESAFE_URL = "https://api.typesafe.ai/v1/systemone"
_TIMEOUT_SECONDS = 15.0
_CONFIDENCE_THRESHOLD = 0.5
_SUMMARY_EXCERPT_LENGTH = 240


class AutofillNotConfiguredError(RuntimeError):
    """No TypeSafe credentials are configured, so autofill cannot work."""


class AutofillUpstreamError(RuntimeError):
    """TypeSafe refused, failed, or timed out."""


def autofill_enabled() -> bool:
    return bool(settings.typesafe_api_key)


def _path_of(index: dict[str, CatalogueNode], node_id: str) -> list[CatalogueNode]:
    """Root-first ancestry, including the node itself. [] for an unknown id or a cycle."""
    chain: list[CatalogueNode] = []
    seen: set[str] = set()
    current = index.get(node_id)
    while current is not None:
        if current.id in seen:
            return []
        seen.add(current.id)
        chain.append(current)
        if current.parent_id is None:
            chain.reverse()
            return chain
        current = index.get(current.parent_id)
    return []


def _default_origin(chain: list[CatalogueNode]) -> str:
    """The origin to offer for this node: the nearest one going up the chain."""
    for node in reversed(chain):
        if node.default_origin:
            return node.default_origin
    return ""


def _describe(chain: list[CatalogueNode], entry: AlmanacEntry | None) -> str:
    node = chain[-1]
    bits = [node.name]
    if node.name_zh:
        bits.append(f"({node.name_zh})")
    ancestors = " > ".join(n.name for n in chain[:-1])
    if ancestors:
        bits.append(f"— a kind of {ancestors}")
    origin = _default_origin(chain)
    if origin:
        bits.append(f"typically from {origin}")
    if entry and entry.summary:
        bits.append(f": {entry.summary[:_SUMMARY_EXCERPT_LENGTH]}")
    return " ".join(bits)


def suggest(username: str, name: str) -> AutofillSuggestion | None:
    label = name.strip()
    if not label:
        raise ValueError("a tea name is required")
    if not autofill_enabled():
        raise AutofillNotConfiguredError(
            "Autofill is not configured on this server (TYPESAFE_API_KEY)"
        )

    nodes = catalogue.merged_nodes(username)
    index = catalogue.node_index(nodes)
    almanac_by_node = {entry.catalogue_node_id: entry for entry in almanac_repo.read_seed_entries()}
    criteria = {
        node.id: _describe(_path_of(index, node.id), almanac_by_node.get(node.id)) for node in nodes
    }

    body = {
        "model": "jev-latest",
        "state": {"tea_name": label},
        "questions": {
            "category": {
                "type": "choice",
                "instructions": (
                    "tea_name is free text someone typed while adding a tea to their "
                    "personal cabinet. It may be a bare tea name or a vendor product "
                    "title decorated with a harvest year, weight, or brand name around "
                    "the actual tea. Which catalogue entry does the tea itself refer to?"
                ),
                "criteria": criteria,
            }
        },
    }

    try:
        with httpx.Client(timeout=_TIMEOUT_SECONDS) as client:
            response = client.post(
                _TYPESAFE_URL,
                json=body,
                headers={"Authorization": f"Bearer {settings.typesafe_api_key}"},
            )
    except httpx.HTTPError as exc:
        raise AutofillUpstreamError("Autofill is unavailable right now") from exc

    if response.status_code >= 400:
        raise AutofillUpstreamError(f"Autofill failed upstream (status {response.status_code})")

    answer = response.json()["answers"]["category"]
    if answer["confidence"] < _CONFIDENCE_THRESHOLD:
        return None

    node_id = answer["choice"]
    chain = _path_of(index, node_id)
    if not chain:
        return None  # the model named something outside the candidate set

    origin = _default_origin(chain)
    if not origin:
        entry = almanac_by_node.get(node_id)
        if entry:
            origin = entry.country

    return AutofillSuggestion(catalogue_node_id=node_id, origin=origin)
