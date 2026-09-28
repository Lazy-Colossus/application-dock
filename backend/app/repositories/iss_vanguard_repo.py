"""Filesystem persistence for ISS Vanguard: one JSON document per ship.

The ONLY code that touches the filesystem for this app. Who belongs to which
ship lives in `memberships.json` alone, so membership can never disagree with
itself.

Lock order is always membership, then ship: never take the membership lock
while holding a ship's.

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
from app.schemas.iss_vanguard import ShipDoc

__all__ = [
    "ShipGoneError",
    "delete_ship",
    "membership_lock",
    "new_ship",
    "read_memberships",
    "read_ship",
    "settings",
    "ship_lock",
    "ship_transaction",
    "write_memberships",
    "write_ship",
]

_APP_DIR = "iss-vanguard"
_SHIP_ID = re.compile(r"s_[0-9a-f]{32}")


class ShipGoneError(LookupError):
    """The ship a request resolved was removed by a membership change before it ran."""


def _root() -> Path:
    return settings.data_dir / _APP_DIR


def _ship_path(ship_id: str) -> Path:
    if not _SHIP_ID.fullmatch(ship_id):
        raise ValueError(f"unsafe ship id: {ship_id!r}")
    return _root() / "ships" / f"{ship_id}.json"


def _memberships_path() -> Path:
    return _root() / "memberships.json"


def read_ship(ship_id: str) -> ShipDoc:
    try:
        raw = _ship_path(ship_id).read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ShipGoneError(f"No ship {ship_id!r}") from exc
    return ShipDoc.model_validate(json.loads(raw))


def write_ship(doc: ShipDoc) -> None:
    atomic_write_json(_ship_path(doc.id), doc.model_dump(mode="json"))


@contextmanager
def ship_lock(ship_id: str) -> Iterator[None]:
    with key_lock(str(_ship_path(ship_id))):
        yield


@contextmanager
def ship_transaction(ship_id: str) -> Iterator[ShipDoc]:
    """Read-modify-write a ship under its lock; nothing is written if the block raises.

    Never creates the file: a request that resolved its ship just before a
    membership change deleted it gets `ShipGoneError` rather than resurrecting it.
    """
    with ship_lock(ship_id):
        doc = read_ship(ship_id)
        yield doc
        write_ship(doc)


def new_ship(owner: str) -> str:
    ship_id = f"s_{uuid.uuid4().hex}"
    write_ship(ShipDoc(id=ship_id, owner=owner))
    return ship_id


def delete_ship(ship_id: str) -> None:
    """Call under the ship's lock."""
    _ship_path(ship_id).unlink(missing_ok=True)


@contextmanager
def membership_lock() -> Iterator[None]:
    with key_lock(str(_memberships_path())):
        yield


def read_memberships() -> dict[str, str]:
    """Every member, owner included, mapped to their ship id."""
    try:
        raw = _memberships_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    return {str(user): str(ship) for user, ship in json.loads(raw).items()}


def write_memberships(members: dict[str, str]) -> None:
    """Call under the membership lock."""
    atomic_write_json(_memberships_path(), members)
