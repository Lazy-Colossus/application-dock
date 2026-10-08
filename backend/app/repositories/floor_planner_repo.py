"""Filesystem persistence for Floor Planner: one JSON document per apartment.

The ONLY code that touches the filesystem for this app. Who belongs to which
apartment lives in `memberships.json` alone, so membership can never disagree
with itself.

Lock order is always membership, then apartment: never take the membership lock
while holding an apartment's.

Layering: callers MUST be services.
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.floor_planner import ApartmentDoc

__all__ = [
    "ApartmentGoneError",
    "apartment_lock",
    "apartment_transaction",
    "delete_apartment",
    "membership_lock",
    "new_apartment",
    "read_apartment",
    "read_memberships",
    "settings",
    "write_apartment",
    "write_memberships",
]

_APP_DIR = "floor-planner"
_APARTMENT_ID = re.compile(r"a_[0-9a-f]{32}")


class ApartmentGoneError(LookupError):
    """The apartment a request resolved was removed by a membership change before it ran."""


def _root() -> Path:
    return settings.data_dir / _APP_DIR


def _apartment_path(apartment_id: str) -> Path:
    if not _APARTMENT_ID.fullmatch(apartment_id):
        raise ValueError(f"unsafe apartment id: {apartment_id!r}")
    return _root() / "apartments" / f"{apartment_id}.json"


def _memberships_path() -> Path:
    return _root() / "memberships.json"


def read_apartment(apartment_id: str) -> ApartmentDoc:
    try:
        raw = _apartment_path(apartment_id).read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ApartmentGoneError(f"No apartment {apartment_id!r}") from exc
    return ApartmentDoc.model_validate(json.loads(raw))


def write_apartment(doc: ApartmentDoc) -> None:
    atomic_write_json(_apartment_path(doc.id), doc.model_dump(mode="json"))


@contextmanager
def apartment_lock(apartment_id: str) -> Iterator[None]:
    with key_lock(str(_apartment_path(apartment_id))):
        yield


@contextmanager
def apartment_transaction(apartment_id: str) -> Iterator[ApartmentDoc]:
    """Read-modify-write an apartment under its lock; nothing is written if the block raises.

    Never creates the file: a request that resolved its apartment just before a
    membership change deleted it gets `ApartmentGoneError` rather than resurrecting it.
    """
    with apartment_lock(apartment_id):
        doc = read_apartment(apartment_id)
        yield doc
        write_apartment(doc)


def new_apartment(owner: str) -> str:
    apartment_id = f"a_{uuid.uuid4().hex}"
    write_apartment(ApartmentDoc(id=apartment_id, owner=owner))
    return apartment_id


def delete_apartment(apartment_id: str) -> None:
    """Call under the apartment's lock."""
    _apartment_path(apartment_id).unlink(missing_ok=True)


@contextmanager
def membership_lock() -> Iterator[None]:
    with key_lock(str(_memberships_path())):
        yield


def read_memberships() -> dict[str, str]:
    """Every member, owner included, mapped to their apartment id."""
    try:
        raw = _memberships_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    return {str(user): str(apartment) for user, apartment in json.loads(raw).items()}


def write_memberships(members: dict[str, str]) -> None:
    """Call under the membership lock."""
    atomic_write_json(_memberships_path(), members)
