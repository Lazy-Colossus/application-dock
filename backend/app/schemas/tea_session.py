"""Pydantic v2 schemas for Gongfu Session Timer sessions.

A session is stored inside the cabinet's tea doc (see `app/schemas/tea.py`) so that
finalising and the grams deduction it causes are one atomic write. The phone
owns a live session and sends it as a whole snapshot; the server only ever
replaces it.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

SessionStatus = Literal["in_progress", "finalised"]
CurveSource = Literal["best_session", "tea", "almanac", "generic"]


class Infusion(BaseModel):
    number: int = Field(ge=1)
    target_seconds: int = Field(gt=0)
    # null = not brewed yet (the pending next steep), distinct from a 0-second pour.
    actual_seconds: int | None = Field(default=None, ge=0)


class TeaSessionWrite(BaseModel):
    """The snapshot body: a session minus the fields the server owns."""

    tea_id: str
    status: SessionStatus
    started_at: str
    leaf_grams: float | None = Field(default=None, gt=0)
    water_temp_c: int | None = Field(default=None, ge=1, le=100)
    rating: int | None = Field(default=None, ge=1, le=5)
    curve_source: CurveSource
    curve_source_label: str = ""
    infusions: list[Infusion] = Field(default_factory=list)
    teaware_id: str | None = None

    @model_validator(mode="after")
    def _numbered_in_order(self) -> TeaSessionWrite:
        if [i.number for i in self.infusions] != list(range(1, len(self.infusions) + 1)):
            raise ValueError("Infusions must be numbered 1, 2, 3… in order")
        return self


class TeaSession(TeaSessionWrite):
    id: str
    # Server-owned like `id`: set from the caller on first write, never read from a body.
    brewed_by: str
    # Server-owned: copied from the vessel on every write, so it survives the pot's deletion.
    vessel_volume_ml: int | None = None
    updated_at: str
    finished_at: str | None = None


class BrewingCurve(BaseModel):
    leaf_grams: float | None = None
    water_temp_c: int | None = None
    steep_seconds: list[int]
    source: CurveSource
    source_label: str
