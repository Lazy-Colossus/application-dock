"""Filesystem read for the Cha Dao Almanac's seeded entries.

Read-only: entries ship in `app/data/almanac/*.json`, one file per country,
each a flat JSON array of `AlmanacEntry`. This module is the only code that
touches the filesystem for the Almanac — mirrors
`tea_repo.read_seed_catalogue`.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.schemas.almanac import AlmanacEntry

_SEED_DIR = Path(__file__).resolve().parents[1] / "data" / "almanac"


@lru_cache(maxsize=1)
def read_seed_entries() -> tuple[AlmanacEntry, ...]:
    """Every seeded Almanac entry across all country files, read once."""
    entries: list[AlmanacEntry] = []
    for path in sorted(_SEED_DIR.glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        entries.extend(AlmanacEntry.model_validate(item) for item in raw)
    return tuple(entries)
