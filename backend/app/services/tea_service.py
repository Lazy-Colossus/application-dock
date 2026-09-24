"""Business logic for the Tea Cabinet's teas.

Operates on a single user's document via `tea_repo`. Raises stdlib exceptions
only (`ValueError` for invalid input, `FileNotFoundError` for a missing tea) —
the router translates them. The `username` always comes from the JWT via the
router and is never taken from request input.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, Tea, TeaView, TeaWriteRequest
from app.services import tea_catalogue_service as catalogue


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return f"t-{uuid.uuid4().hex[:8]}"


def _validate(req: TeaWriteRequest, index: dict[str, CatalogueNode]) -> str:
    """Check a write request and return the cleaned name.

    Bounds that Pydantic can express (non-negative, year floor, purchased > 0)
    live on `TeaWriteRequest`; the rules that need context live here.
    """
    name = req.name.strip()
    if not name:
        raise ValueError("A tea needs a name")

    if req.catalogue_node_id not in index:
        raise ValueError(f"No catalogue entry with id {req.catalogue_node_id!r}")

    if req.year is not None and req.year > datetime.now(UTC).year + 1:
        raise ValueError("That harvest year is in the future")

    if req.purchase_date is not None:
        try:
            date.fromisoformat(req.purchase_date)
        except ValueError as exc:
            raise ValueError("Purchase date must be a date like 2024-03-12") from exc

    if req.grams_purchased is not None and req.grams_remaining > req.grams_purchased:
        raise ValueError(
            f"You've only bought {req.grams_purchased:g}g of this. "
            "Change the amount bought first."
        )

    return name


def _resolved_remaining(req: TeaWriteRequest) -> float:
    """A new tea with an amount bought but no remaining starts full (FR-1)."""
    if req.grams_remaining == 0 and req.grams_purchased is not None:
        return req.grams_purchased
    return req.grams_remaining


def _view(tea: Tea, index: dict[str, CatalogueNode]) -> TeaView:
    return TeaView(
        **tea.model_dump(), class_id=catalogue.resolve_class(index, tea.catalogue_node_id)
    )


def list_teas(username: str) -> list[TeaView]:
    """Every tea in the cabinet, each with its root class resolved."""
    index = catalogue.node_index(catalogue.merged_nodes(username))
    return [_view(tea, index) for tea in repo.read_doc(username).teas]


def get_tea(username: str, tea_id: str) -> TeaView:
    index = catalogue.node_index(catalogue.merged_nodes(username))
    for tea in repo.read_doc(username).teas:
        if tea.id == tea_id:
            return _view(tea, index)
    raise FileNotFoundError(f"No tea with id {tea_id!r}")


def create_tea(username: str, req: TeaWriteRequest) -> TeaView:
    index = catalogue.node_index(catalogue.merged_nodes(username))
    name = _validate(req, index)
    stamp = _now_iso()

    tea = Tea(
        **req.model_dump(exclude={"name", "grams_remaining"}),
        name=name,
        grams_remaining=_resolved_remaining(req),
        id=_new_id(),
        created_at=stamp,
        updated_at=stamp,
    )
    with repo.doc_transaction(username) as doc:
        doc.teas.append(tea)
    return _view(tea, index)


def replace_tea(username: str, tea_id: str, req: TeaWriteRequest) -> TeaView:
    """Full replace, as the notes app does. `id` and `created_at` survive."""
    index = catalogue.node_index(catalogue.merged_nodes(username))
    name = _validate(req, index)

    with repo.doc_transaction(username) as doc:
        for position, existing in enumerate(doc.teas):
            if existing.id == tea_id:
                updated = Tea(
                    **req.model_dump(exclude={"name"}),
                    name=name,
                    id=existing.id,
                    created_at=existing.created_at,
                    updated_at=_now_iso(),
                )
                doc.teas[position] = updated
                return _view(updated, index)
        raise FileNotFoundError(f"No tea with id {tea_id!r}")


def delete_tea(username: str, tea_id: str) -> None:
    with repo.doc_transaction(username) as doc:
        remaining = [tea for tea in doc.teas if tea.id != tea_id]
        if len(remaining) == len(doc.teas):
            raise FileNotFoundError(f"No tea with id {tea_id!r}")
        doc.teas = remaining
