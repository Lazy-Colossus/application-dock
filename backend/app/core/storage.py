"""The one atomic JSON writer every repository uses.

Consolidates three near-identical copies that had drifted apart (`session_repo`,
`auth_repo`, and the Hotaru `_storage` helper), each carrying the same flaw: a
deterministic temp path of `path + ".tmp"`, so two concurrent writers to one
file staged over each other's payload before either rename. The temp file is now
unique per write.

Layering: repositories only. Services never call this directly.
"""

from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path
from typing import Any


def atomic_write_json(path: Path, payload: Any) -> None:
    """Write `payload` as JSON to `path` atomically, creating parent dirs.

    Stages to a uniquely-named temp file in the same directory, flushes it to
    disk, then renames. `os.replace` is atomic on POSIX (best-effort on
    Windows), so a reader never sees a partial document and a crash mid-write
    leaves the previous file at `path` intact.
    """
    path.parent.mkdir(parents=True, exist_ok=True)

    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f"{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        # Serialization failed, or the rename did — do not leave the staged
        # file lying beside the real one.
        tmp.unlink(missing_ok=True)
        raise
