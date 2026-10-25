"""Filesystem persistence for AMP per-instance ports.

The ONLY module that touches the ports file — one JSON file holding a flat map
of instance id -> port. All writes go through the shared atomic writer.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import settings
from app.core.storage import atomic_write_json

_APP_DIR = "amp"
_PORTS_FILE = "ports.json"


def _ports_path() -> Path:
    return settings.data_dir / _APP_DIR / _PORTS_FILE


def read_ports() -> dict[str, int]:
    """The stored instance-id -> port map, or `{}` if nothing is saved yet."""
    try:
        raw = _ports_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    data = json.loads(raw)
    return {str(key): int(value) for key, value in data.items()}


def write_ports(ports: dict[str, int]) -> None:
    """Persist the id -> port map atomically, creating `amp/` on first write."""
    atomic_write_json(_ports_path(), ports)
