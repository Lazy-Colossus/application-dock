"""Vocabulary persistence: the read-only shipped seed plus writable user sources.

Layering: services call this; routers do not. Raises stdlib errors, never
HTTPException.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import settings
from app.repositories import _storage
from app.schemas.hotaru import Word

SCHEMA_VERSION = 1

# The seed ships in the image (committed, read-only at runtime), NOT under DATA_DIR.
_SEED_PATH = Path(__file__).resolve().parent.parent / "hotaru_seed" / "vocab_seed.json"

_HOTARU_DIR = settings.data_dir / "hotaru"
_SHARED_PATH = _HOTARU_DIR / "vocab_shared.json"


def migrate(raw: dict) -> dict:
    """Upgrade a raw seed envelope to the current schema. Identity at v1."""
    version = raw.get("schema_version")
    if version == SCHEMA_VERSION:
        return raw
    raise ValueError(f"Unsupported vocab_seed schema_version: {version!r}")


def read_seed() -> list[Word]:
    raw = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    migrated = migrate(raw)
    return [Word.model_validate(w) for w in migrated["words"]]


def read_shared() -> list[Word]:
    rows = _storage.read_json(_SHARED_PATH, default=[])
    return [Word.model_validate(w) for w in rows]


def _private_path(user: str) -> Path:
    return _HOTARU_DIR / "users" / user / "words_private.json"


def read_private(user: str) -> list[Word]:
    rows = _storage.read_json(_private_path(user), default=[])
    return [Word.model_validate(w) for w in rows]


def write_shared(words: list[Word]) -> None:
    _storage.atomic_write_json(_SHARED_PATH, [w.model_dump(mode="json") for w in words])


def write_private(user: str, words: list[Word]) -> None:
    _storage.atomic_write_json(_private_path(user), [w.model_dump(mode="json") for w in words])
