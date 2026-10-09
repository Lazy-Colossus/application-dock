"""Pydantic v2 schemas for the Cha Dao Almanac.

Read-only in this round: entries ship as seed JSON under
`app/data/almanac/{country}.json`, one array per file, merged on read (see
`app/repositories/almanac_repo.py`). An entry always links to a catalogue
leaf node rather than duplicating its name, native script, or default
origin — `AlmanacEntryView` resolves those through the link.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

EntrySource = Literal["seed", "user"]


class BrewingParameters(BaseModel):
    leaf_grams: float | None = None
    water_temp_c: int | None = None
    steep_seconds: list[int] = Field(default_factory=list)


class AlmanacEntry(BaseModel):
    catalogue_node_id: str
    country: str
    reading: str = ""
    summary: str
    brewing: BrewingParameters = Field(default_factory=BrewingParameters)
    source: EntrySource = "seed"


class AlmanacEntryView(AlmanacEntry):
    """An entry as the API returns it: with its catalogue identity resolved."""

    name: str
    name_zh: str = ""
    default_origin: str = ""
