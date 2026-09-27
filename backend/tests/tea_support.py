"""Helpers for tests that reach past a tea service into the cabinet on disk."""

from __future__ import annotations

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc
from app.services import tea_cabinet_service as cabinets


def seed_doc(username: str, doc: TeaDoc) -> str:
    """Write `doc` as `username`'s cabinet, creating it if needed; return its id."""
    cabinet_id = cabinets.ensure(username)
    repo.write_doc(cabinet_id, doc.model_copy(update={"id": cabinet_id, "owner": username}))
    return cabinet_id


def doc_of(username: str) -> TeaDoc:
    return cabinets.read_doc_for(username)


def cabinet_of(username: str) -> str:
    cabinet_id = cabinets.resolve(username)
    assert cabinet_id is not None
    return cabinet_id
