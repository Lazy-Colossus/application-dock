"""Filesystem persistence for the Tea Cabinet — one JSON document per cabinet.

This module is the ONLY code in the app that touches the filesystem for tea,
including the read of the shipped seed catalogue. All writes go through the
atomic write-then-rename helper.

A cabinet's teas, the catalogue nodes its members added and its sessions live in
one document because they are edited together (AR-1). Who belongs to which
cabinet lives in `memberships.json` alone, so membership can never disagree with
itself.

Lock order is always membership, then cabinet: never take the membership lock
while holding a cabinet's.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import cast

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.tea import CatalogueNode, TeaDoc

_APP_DIR = "tea"
_SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "tea_catalogue.json"
_CABINET_ID = re.compile(r"c_[0-9a-f]{32}")


class CabinetGoneError(LookupError):
    """The cabinet a request resolved was removed by a membership change before it ran."""


def _validate_username(username: str) -> str:
    """Ensure `username` is a safe bare filename, never a path.

    Mirrors `context_switch_repo`: rejects separators and anything that could
    be read as a parent reference, so the on-disk path can never escape
    `users/`.
    """
    if not username or not username.strip():
        raise ValueError("username must not be empty")
    if username != username.strip():
        raise ValueError("username must not have surrounding whitespace")
    if "/" in username or "\\" in username or ".." in username:
        raise ValueError(f"unsafe username: {username!r}")
    return username


def _validate_cabinet_id(cabinet_id: str) -> str:
    if not _CABINET_ID.fullmatch(cabinet_id):
        raise ValueError(f"unsafe cabinet id: {cabinet_id!r}")
    return cabinet_id


def _root() -> Path:
    return settings.data_dir / _APP_DIR


def _cabinet_path(cabinet_id: str) -> Path:
    return _root() / "cabinets" / f"{_validate_cabinet_id(cabinet_id)}.json"


def _legacy_path(username: str) -> Path:
    return _root() / "users" / f"{_validate_username(username)}.json"


def _memberships_path() -> Path:
    return _root() / "memberships.json"


def _images_dir(cabinet_id: str) -> Path:
    return _root() / "images" / _validate_cabinet_id(cabinet_id)


# v7 filed every tea under a country node; a cabinet's references to the old
# ids follow them. Old id -> new id, shipped beside the seed it describes.
REFILED_NODE_IDS: dict[str, str] = json.loads(
    (_SEED_PATH.parent / "tea_catalogue_refiled_v7.json").read_text(encoding="utf-8")
)


def _refiled(items: object, key: str) -> list[dict[str, object]]:
    rows = cast(list[dict[str, object]], items or [])
    return [
        {**row, key: REFILED_NODE_IDS.get(cast(str, row.get(key)), row.get(key))} for row in rows
    ]


def migrate(
    raw: dict[str, object], *, cabinet_id: str | None = None, owner: str | None = None
) -> dict[str, object]:
    """Upgrade a raw document to the current schema.

    v2 added `sessions`. v3 made the document a cabinet with an `id` and an
    `owner`, and gave every session a `brewed_by`. v4 added `teaware`. v5 added cha xi,
    journal-only sessions and session photos. v6 added the tasting sheet. v7 filed every
    tea under its country (`REFILED_NODE_IDS`). Only a legacy per-user file is
    ever below v3, and its user owns and brewed everything in it.
    """
    if raw.get("schema_version", 1) == 1:
        raw = {**raw, "schema_version": 2, "sessions": []}
    if raw["schema_version"] == 2:
        if cabinet_id is None or owner is None:
            raise ValueError("Upgrading to v3 needs the cabinet id and owner")
        sessions = cast(list[dict[str, object]], raw.get("sessions", []))
        raw = {
            **raw,
            "schema_version": 3,
            "id": cabinet_id,
            "owner": owner,
            "sessions": [{**session, "brewed_by": owner} for session in sessions],
        }
    if raw["schema_version"] == 3:
        raw = {**raw, "schema_version": 4, "teaware": []}
    if raw["schema_version"] == 4:
        # Every v5 field has a default: old sessions read as timed, cabinet-tea, no cha xi.
        raw = {**raw, "schema_version": 5}
    if raw["schema_version"] == 5:
        # v6 added the tasting sheet; it defaults to None.
        raw = {**raw, "schema_version": 6}
    if raw["schema_version"] == 6:
        raw = {
            **raw,
            "schema_version": 7,
            "teas": _refiled(raw.get("teas"), "catalogue_node_id"),
            "catalogue_nodes": _refiled(raw.get("catalogue_nodes"), "parent_id"),
            "teaware": _refiled(raw.get("teaware"), "dedicated_node_id"),
        }
    return raw


def read_doc(cabinet_id: str) -> TeaDoc:
    """Read a cabinet. A missing file means a membership change removed it."""
    try:
        raw = _cabinet_path(cabinet_id).read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise CabinetGoneError(f"No cabinet {cabinet_id!r}") from exc
    return TeaDoc.model_validate(migrate(json.loads(raw)))


def write_doc(cabinet_id: str, doc: TeaDoc) -> None:
    atomic_write_json(_cabinet_path(cabinet_id), doc.model_dump(mode="json"))


@contextmanager
def cabinet_lock(cabinet_id: str) -> Iterator[None]:
    with key_lock(str(_cabinet_path(cabinet_id))):
        yield


@contextmanager
def doc_transaction(cabinet_id: str) -> Iterator[TeaDoc]:
    """Read-modify-write a cabinet under that file's lock.

    The lock spans the whole block, so a concurrent request cannot read the
    same stale document and overwrite the change made here (NFR-2). If the
    block raises, nothing is written — a rejected request leaves no partial
    mutation behind. It never creates the file: a request that resolved its
    cabinet just before a membership change deleted it gets `CabinetGoneError`
    rather than resurrecting it.
    """
    with cabinet_lock(cabinet_id):
        doc = read_doc(cabinet_id)
        yield doc
        write_doc(cabinet_id, doc)


def new_cabinet(owner: str) -> str:
    """Write an empty cabinet owned by `owner` and return its id."""
    cabinet_id = f"c_{uuid.uuid4().hex}"
    write_doc(cabinet_id, TeaDoc(id=cabinet_id, owner=owner))
    return cabinet_id


def delete_cabinet(cabinet_id: str) -> None:
    """Remove a cabinet's document and its photos. Call under its lock."""
    _cabinet_path(cabinet_id).unlink(missing_ok=True)
    shutil.rmtree(_images_dir(cabinet_id), ignore_errors=True)


@contextmanager
def membership_lock() -> Iterator[None]:
    with key_lock(str(_memberships_path())):
        yield


def read_memberships() -> dict[str, str]:
    """Every member, owner included, mapped to their cabinet id."""
    try:
        raw = _memberships_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    return {str(user): str(cabinet) for user, cabinet in json.loads(raw).items()}


def write_memberships(members: dict[str, str]) -> None:
    """Replace the membership map. Call under the membership lock."""
    atomic_write_json(_memberships_path(), members)


def legacy_exists(username: str) -> bool:
    return _legacy_path(username).is_file()


def delete_legacy(username: str) -> None:
    _legacy_path(username).unlink(missing_ok=True)


def _orphan_owned_by(username: str, referenced: set[str]) -> str | None:
    """A cabinet an interrupted migration of `username` wrote but never mapped."""
    directory = _root() / "cabinets"
    if not directory.is_dir():
        return None
    for path in sorted(directory.glob("c_*.json")):
        if path.stem in referenced:
            continue
        if json.loads(path.read_text(encoding="utf-8")).get("owner") == username:
            return path.stem
    return None


def adopt_legacy(username: str, referenced: set[str]) -> str:
    """Copy `username`'s legacy document into a cabinet they own; return its id.

    Safe to repeat after a crash: a retry reuses the cabinet the interrupted
    attempt wrote, so photos never end up split across two folders. The legacy
    file is left in place — the caller deletes it only after mapping the id.
    Call under the membership lock.
    """
    cabinet_id = _orphan_owned_by(username, referenced) or f"c_{uuid.uuid4().hex}"
    raw = json.loads(_legacy_path(username).read_text(encoding="utf-8"))
    write_doc(
        cabinet_id,
        TeaDoc.model_validate(migrate(raw, cabinet_id=cabinet_id, owner=username)),
    )
    legacy_images = _root() / "images" / _validate_username(username)
    if legacy_images.is_dir() and not _images_dir(cabinet_id).exists():
        legacy_images.rename(_images_dir(cabinet_id))
    return cabinet_id


def find_image(cabinet_id: str, tea_id: str) -> Path | None:
    """The one stored image file for `tea_id`, whatever its extension."""
    directory = _images_dir(cabinet_id)
    if not directory.is_dir():
        return None
    matches = sorted(directory.glob(f"{tea_id}.*"))
    return matches[0] if matches else None


def save_image(cabinet_id: str, tea_id: str, content: bytes, extension: str) -> Path:
    """Store `content` as `tea_id`'s image, atomically and replacing any prior upload."""
    delete_image(cabinet_id, tea_id)
    directory = _images_dir(cabinet_id)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{tea_id}.{extension}"

    fd, tmp_name = tempfile.mkstemp(dir=directory, prefix=f"{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return path


def delete_image(cabinet_id: str, tea_id: str) -> None:
    """Remove `tea_id`'s stored image, if any. Harmless when none exists."""
    existing = find_image(cabinet_id, tea_id)
    if existing is not None:
        existing.unlink(missing_ok=True)


@lru_cache(maxsize=1)
def read_seed_catalogue() -> tuple[CatalogueNode, ...]:
    """The shipped catalogue tree, read once.

    It is immutable and ships with the image, so it is cached for the life of
    the process. A tuple rather than a list so a caller cannot mutate the
    cached value out from under everyone else.
    """
    raw = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    return tuple(CatalogueNode.model_validate(node) for node in raw)
