"""Pydantic v2 schemas for Gongfu Session Timer sessions.

A session is stored inside the cabinet's tea doc (see `app/schemas/tea.py`) so that
finalising and the grams deduction it causes are one atomic write. The phone
owns a live session and sends it as a whole snapshot; the server only ever
replaces it.
"""

from __future__ import annotations

from typing import Annotated, Literal, get_args

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


Stars = Annotated[int, Field(ge=1, le=5)]
LiquorColour = Literal[
    "pale_jade", "yellow_green", "golden", "amber", "orange_red", "red", "deep_red", "dark_brown"
]
AromaStructure = Literal[
    "single", "simple", "coarse", "short", "high", "layered", "complex", "delicate", "long", "deep"
]
AROMA_STRUCTURES: tuple[str, ...] = get_args(AromaStructure)
LiquorBody = Literal["watery", "light", "mild", "mellow", "thick"]
Saturation = Literal["low", "medium", "fairly_high", "high"]
BodyFeel = Literal["none", "sweating", "warmth", "head_rush"]
BODY_FEELS: tuple[str, ...] = get_args(BodyFeel)


def _once_in_order(values: list[str], vocabulary: tuple[str, ...], what: str) -> list[str]:
    if len(set(values)) != len(values):
        raise ValueError(f"Pick each {what} once")
    return sorted(values, key=vocabulary.index)


class Leaf(BaseModel):
    dry: str = ""
    wet: str = ""
    spent: str = ""
    quality: Stars | None = None


class Liquor(BaseModel):
    colour: LiquorColour | None = None
    clarity: Stars | None = None


class Aroma(BaseModel):
    """香&气 — what the tea smells like, stage by stage."""

    aroma: str = ""
    aroma_type: str = ""
    richness: Stars | None = None
    top_note: str = ""
    middle_note: str = ""
    base_note: str = ""
    tail_note: str = ""
    cup_aroma: str = ""
    structure: list[AromaStructure] = Field(default_factory=list)

    @field_validator("structure")
    @classmethod
    def _structure_once_in_order(cls, values: list[AromaStructure]) -> list[AromaStructure]:
        return _once_in_order(values, AROMA_STRUCTURES, "aroma structure")


class Mouthfeel(BaseModel):
    thin: Stars | None = None
    dry: Stars | None = None
    astringent: Stars | None = None
    rough: Stars | None = None
    thick: Stars | None = None
    moist: Stars | None = None
    slick: Stars | None = None
    cooling: Stars | None = None


class Intensity(BaseModel):
    strength: Stars | None = None
    duration: Stars | None = None


class Sensation(BaseModel):
    """感&觉 — how the tea feels in the mouth, the throat and the body."""

    body: LiquorBody | None = None
    smoothness: Stars | None = None
    saturation: Saturation | None = None
    throat: Stars | None = None
    mouthfeel: Mouthfeel = Field(default_factory=Mouthfeel)
    hui_gan: Intensity = Field(default_factory=Intensity)
    sheng_jin: Intensity = Field(default_factory=Intensity)
    body_feel: list[BodyFeel] = Field(default_factory=list)
    body_feel_other: str = ""

    @field_validator("body_feel")
    @classmethod
    def _body_feel_consistent(cls, values: list[BodyFeel]) -> list[BodyFeel]:
        if "none" in values and len(values) > 1:
            raise ValueError("'None noticeable' can't go with another body feeling")
        return _once_in_order(values, BODY_FEELS, "body feeling")


class Tasting(BaseModel):
    """One sitting's tasting, in the user's notebook vocabulary. Every field is optional."""

    leaf: Leaf = Field(default_factory=Leaf)
    liquor: Liquor = Field(default_factory=Liquor)
    aroma: Aroma = Field(default_factory=Aroma)
    sensation: Sensation = Field(default_factory=Sensation)


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
    tasting: Tasting | None = None

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
    tasting: Tasting | None = None
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
