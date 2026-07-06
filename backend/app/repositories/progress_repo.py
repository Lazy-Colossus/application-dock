"""Per-user SRS progress persistence: `users/{user}/progress.json`.

Layering: services call this; routers do not. Raises stdlib errors, never
HTTPException. The only filesystem code for progress. Holds no scheduling
logic — that lives in the pure `services/srs.py`.
"""

from __future__ import annotations

from pathlib import Path

from app.core.config import settings
from app.repositories import _storage
from app.schemas.hotaru import ProgressEntry


def _progress_path(user: str) -> Path:
    return settings.data_dir / "hotaru" / "users" / user / "progress.json"


def read_progress(user: str) -> dict[str, ProgressEntry]:
    rows = _storage.read_json(_progress_path(user), default={})
    return {wid: ProgressEntry.model_validate(e) for wid, e in rows.items()}


def write_progress(user: str, entries: dict[str, ProgressEntry]) -> None:
    _storage.atomic_write_json(
        _progress_path(user),
        {wid: e.model_dump(mode="json") for wid, e in entries.items()},
    )


def get_entry(user: str, word_id: str) -> ProgressEntry | None:
    return read_progress(user).get(word_id)


def set_entry(user: str, word_id: str, entry: ProgressEntry) -> None:
    entries = read_progress(user)
    entries[word_id] = entry
    write_progress(user, entries)
