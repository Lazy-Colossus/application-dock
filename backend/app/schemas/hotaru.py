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


class CreateWordRequest(BaseModel):
    reading: str
    meaning: str
    kanji: str | None = None
    romaji: str = ""
    pos: str = ""
    # When filing into an existing lesson, `source` is the chosen textbook slug;
    # otherwise it defaults (server-side) to the active user id (a Custom word).
    source: str | None = None
    lesson: str = ""
    visibility: Visibility = "shared"


class UpdateWordRequest(BaseModel):
    # Editable fields only — `id` and `source` are server-preserved.
    reading: str
    meaning: str
    kanji: str | None = None
    romaji: str = ""
    pos: str = ""
    lesson: str = ""
    visibility: Visibility = "shared"


class Topic(BaseModel):
    # Shared, many-to-many grouping over the master list. `word_ids` holds raw
    # ids; the topic view is the intersection with the caller's visible words,
    # so private words never leak across users (FR-7).
    id: str
    name: str
    word_ids: list[str]


class CreateTopicRequest(BaseModel):
    name: str
