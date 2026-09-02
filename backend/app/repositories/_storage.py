"""Shared filesystem helpers for Hotaru repositories.

The ONLY place (with the sibling per-aggregate repos) that touches the Hotaru
data files. All writes use the atomic write-`.tmp`-then-`os.replace` pattern so a
partial write is never visible. Per-aggregate repos build on these two helpers.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.core.storage import atomic_write_json

__all__ = ["atomic_write_json", "read_json"]


def read_json(path: Path, default: Any = None) -> Any:
    """Return the parsed JSON at `path`, or `default` if the file does not exist."""
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))
