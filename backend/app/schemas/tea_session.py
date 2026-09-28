"""Pydantic v2 schemas for Gongfu Session Timer sessions.

A session is stored inside the cabinet's tea doc (see `app/schemas/tea.py`) so that
finalising and the grams deduction it causes are one atomic write. The phone
owns a live session and sends it as a whole snapshot; the server only ever
replaces it.
"""

from __future__ import annotations

from typing import Literal, get_args

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.tea_class import TeaClass

SessionStatus = Literal["in_progress", "finalised"]
CurveSource = Literal["best_session", "tea", "almanac", "generic"]
Mood = Literal["calm", "bright", "contemplative", "cosy", "social", "focused", "tired", "restless"]
MOODS: tuple[str, ...] = get_args(Mood)


class Infusion(BaseModel):
    number: int = Field(ge=1)
    target_seconds: int = Field(gt=0)
    # null = not brewed yet (the pending next steep), distinct from a 0-second pour.
    actual_seconds: int | None = Field(default=None, ge=0)


class ChaXi(BaseModel):
    """The aesthetic layer of a sitting. Its photo is the session's own `image_url`."""

    moods: list[Mood] = Field(default_factory=list)
    guests: str = ""
    notes: str = ""

    @field_validator("moods")
    @classmethod
    def _each_once_in_order(cls, moods: list[Mood]) -> list[Mood]:
        if len(set(moods)) != len(moods):
            raise ValueError("Pick each mood once")
        return sorted(moods, key=MOODS.index)


class TeaSessionWrite(BaseModel):
    """The snapshot body: a session minus the fields the server owns."""

    # None only for a journal-only entry of a tea that is not in the cabinet.
    tea_id: str | None = None
    away_tea_name: str = ""
    away_class_id: TeaClass | None = None
    status: SessionStatus
    started_at: str
    leaf_grams: float | None = Field(default=None, gt=0)
    water_temp_c: int | None = Field(default=None, ge=1, le=100)
    rating: int | None = Field(default=None, ge=1, le=5)
    curve_source: CurveSource
    curve_source_label: str = ""
    infusions: list[Infusion] = Field(default_factory=list)
    teaware_id: str | None = None
    # False = journal-only: brewed away from the timer, so it has no infusions.
    timed: bool = True
    cha_xi: ChaXi | None = None

    @model_validator(mode="after")
    def _numbered_in_order(self) -> TeaSessionWrite:
        if [i.number for i in self.infusions] != list(range(1, len(self.infusions) + 1)):
            raise ValueError("Infusions must be numbered 1, 2, 3… in order")
        return self

    @model_validator(mode="after")
    def _one_tea(self) -> TeaSessionWrite:
        away = bool(self.away_tea_name.strip())
        if (self.tea_id is None) != away:
            raise ValueError("A session names either a cabinet tea or an away tea")
        if self.tea_id is not None and self.away_class_id is not None:
            raise ValueError("Only an away tea takes a class of its own")
        if away and self.timed:
            raise ValueError("An away tea can only be a journal-only entry")
        return self

    @model_validator(mode="after")
    def _untimed_is_finished(self) -> TeaSessionWrite:
        if not self.timed and (self.status != "finalised" or self.infusions):
            raise ValueError("A journal-only entry is saved finished, with no infusions")
        return self


class TeaSession(TeaSessionWrite):
    id: str
    # Server-owned like `id`: set from the caller on first write, never read from a body.
    brewed_by: str
    # Server-owned: copied from the vessel on every write, so it survives the pot's deletion.
    vessel_volume_ml: int | None = None
    updated_at: str
    finished_at: str | None = None
    # Server-owned: set by a photo upload, never read from a snapshot body.
    image_url: str | None = None


class BrewingCurve(BaseModel):
    leaf_grams: float | None = None
    water_temp_c: int | None = None
    steep_seconds: list[int]
    source: CurveSource
    source_label: str


class JournalEdit(BaseModel):
    """What a finished session lets its brewer change.

    The last four fields belong to journal-only entries; leaving them out keeps them.
    """

    cha_xi: ChaXi | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    leaf_grams: float | None = Field(default=None, gt=0)
    water_temp_c: int | None = Field(default=None, ge=1, le=100)
    teaware_id: str | None = None
    started_at: str | None = None
    tea_id: str | None = None
    away_tea_name: str = ""
    away_class_id: TeaClass | None = None


class JournalEntry(TeaSession):
    """A finished session with its tea resolved for a Journal card."""

    tea_name: str
    class_id: TeaClass
    tea_image_url: str | None = None
