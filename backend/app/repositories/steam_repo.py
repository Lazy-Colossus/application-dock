"""Filesystem cache for Steam game names, keyed by app id (as string).

The ONLY module that touches the Steam name cache file. Writes go through the
shared atomic writer.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import settings
from app.core.storage import atomic_write_json

_DIR = "steam"
_FILE = "games.json"


def _names_path() -> Path:
    return settings.data_dir / _DIR / _FILE


def read_names() -> dict[str, str]:
    """The cached app-id -> game-name map, or `{}` if nothing is cached yet."""
    try:
        raw = _names_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    data = json.loads(raw)
    return {str(key): str(value) for key, value in data.items()}


def write_names(names: dict[str, str]) -> None:
    """Persist the app-id -> name map atomically, creating `steam/` on first write."""
    atomic_write_json(_names_path(), names)
