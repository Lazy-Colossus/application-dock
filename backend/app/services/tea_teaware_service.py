"""Business logic for the Teaware Cabinet.

Operates on the caller's cabinet, resolved by `tea_cabinet_service` before any
transaction opens, so a household shares its ware as it shares its teas.
Raises `ValueError` for invalid input and `FileNotFoundError` for a missing
item; the router translates.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from pathlib import Path

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc
from app.schemas.teaware import Teaware, TeawareWriteRequest
from app.services import tea_cabinet_service as cabinets
from app.services import tea_catalogue_service as catalogue
from app.services import tea_service


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return f"w-{uuid.uuid4().hex[:8]}"


def _position(doc: TeaDoc, teaware_id: str) -> int:
    for position, item in enumerate(doc.teaware):
        if item.id == teaware_id:
            return position
    raise FileNotFoundError(f"No teaware with id {teaware_id!r}")


def _validate(username: str, req: TeawareWriteRequest) -> str:
    """Check a write request and return the cleaned name."""
    name = req.name.strip()
    if not name:
        raise ValueError("Teaware needs a name")
    if req.acquired_date is not None:
        try:
            date.fromisoformat(req.acquired_date)
        except ValueError as exc:
            raise ValueError("Acquired date must be a date like 2024-03-12") from exc
    if req.dedicated_node_id is not None:
        if not req.porous:
            raise ValueError("Only a pot that seasons can be dedicated to a tea")
        if req.dedicated_node_id not in {n.id for n in catalogue.merged_nodes(username)}:
            raise ValueError(f"No catalogue entry with id {req.dedicated_node_id!r}")
    return name


def _retired_at(req: TeawareWriteRequest, previous: str | None, stamp: str) -> str | None:
    """Stamped when retiring starts; kept while it stays retired; cleared on the way back."""
    if not req.retired:
        return None
    return previous or stamp


def _item(
    req: TeawareWriteRequest,
    name: str,
    *,
    teaware_id: str,
    created_at: str,
    image_url: str | None,
    retired_at: str | None,
    stamp: str,
) -> Teaware:
    return Teaware(
        **req.model_dump(exclude={"name", "retired"}),
        name=name,
        id=teaware_id,
        image_url=image_url,
        retired_at=retired_at,
        created_at=created_at,
        updated_at=stamp,
    )


def list_teaware(username: str) -> list[Teaware]:
    """Every piece in the cabinet, retired ones included — the shelf filters."""
    return list(cabinets.read_doc_for(username).teaware)


def get_teaware(username: str, teaware_id: str) -> Teaware:
    doc = cabinets.read_doc_for(username)
    return doc.teaware[_position(doc, teaware_id)]


def create_teaware(username: str, req: TeawareWriteRequest) -> Teaware:
    name = _validate(username, req)
    stamp = _now_iso()
    item = _item(
        req,
        name,
        teaware_id=_new_id(),
        created_at=stamp,
        image_url=None,
        retired_at=_retired_at(req, None, stamp),
        stamp=stamp,
    )
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        doc.teaware.append(item)
    return item


def replace_teaware(username: str, teaware_id: str, req: TeawareWriteRequest) -> Teaware:
    """Full replace. `id`, `created_at` and the photo survive."""
    name = _validate(username, req)
    stamp = _now_iso()
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        position = _position(doc, teaware_id)
        existing = doc.teaware[position]
        item = _item(
            req,
            name,
            teaware_id=existing.id,
            created_at=existing.created_at,
            image_url=existing.image_url,
            retired_at=_retired_at(req, existing.retired_at, stamp),
            stamp=stamp,
        )
        doc.teaware[position] = item
        return item


def delete_teaware(username: str, teaware_id: str) -> None:
    """Remove a piece. Its sessions stay, keeping the volume they were brewed at."""
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        del doc.teaware[_position(doc, teaware_id)]
        doc.sessions = [
            s.model_copy(update={"teaware_id": None}) if s.teaware_id == teaware_id else s
            for s in doc.sessions
        ]
    repo.delete_image(cabinet_id, teaware_id)


def save_image(username: str, teaware_id: str, content: bytes, content_type: str) -> Teaware:
    extension = tea_service.image_extension(content, content_type)
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _position(doc, teaware_id)
        repo.save_image(cabinet_id, teaware_id, content, extension)
        updated = doc.teaware[position].model_copy(
            update={"image_url": f"/api/tea/teaware/{teaware_id}/image", "updated_at": _now_iso()}
        )
        doc.teaware[position] = updated
        return updated


def delete_image(username: str, teaware_id: str) -> Teaware:
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _position(doc, teaware_id)
        repo.delete_image(cabinet_id, teaware_id)
        updated = doc.teaware[position].model_copy(
            update={"image_url": None, "updated_at": _now_iso()}
        )
        doc.teaware[position] = updated
        return updated


def image_path(username: str, teaware_id: str) -> Path:
    """The stored photo's path. 404s cover both a missing piece and no photo."""
    cabinet_id = cabinets.resolve(username)
    if cabinet_id is None or not any(w.id == teaware_id for w in repo.read_doc(cabinet_id).teaware):
        raise FileNotFoundError(f"No teaware with id {teaware_id!r}")
    path = repo.find_image(cabinet_id, teaware_id)
    if path is None:
        raise FileNotFoundError(f"No image for teaware {teaware_id!r}")
    return path
