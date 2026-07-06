from typing import Literal

from pydantic import BaseModel

DrillCap = Literal["r2m", "m2r", "k2r"]
Visibility = Literal["shared", "private"]


class HotaruUser(BaseModel):
    id: str
    name: str


class Word(BaseModel):
    id: str
    source: str
    reading: str
    kanji: str | None
    romaji: str
    meaning: str
    pos: str
    lesson: str
    visibility: Visibility
    drill_caps: list[DrillCap]
