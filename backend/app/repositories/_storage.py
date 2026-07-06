"""Shared filesystem helpers for Hotaru repositories.

The ONLY place (with the sibling per-aggregate repos) that touches the Hotaru
data files. All writes use the atomic write-`.tmp`-then-`os.replace` pattern so a
partial write is never visible. Per-aggregate repos build on these two helpers.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


def atomic_write_json(path: Path, payload: Any) -> None:
    """Write JSON to `path` atomically, creating parent dirs as needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def read_json(path: Path, default: Any = None) -> Any:
    """Return the parsed JSON at `path`, or `default` if the file does not exist."""
    if not path.exists():
        return default
    return json.loads(path.read_text(encoding="utf-8"))
