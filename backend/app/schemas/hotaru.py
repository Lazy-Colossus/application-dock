from datetime import datetime
from typing import Literal

from pydantic import BaseModel

DrillCap = Literal["r2m", "m2r", "k2r"]
Visibility = Literal["shared", "private"]
Grade = Literal["correct", "close", "incorrect"]


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


class ProgressEntry(BaseModel):
    # Per-user, per-word SRS state. `tier` 0–4 (New→Mastered); `points` accrue
    # within a tier. A brand-new (unseen) word is the defaults below. "Due" is
    # derived from these fields on demand (srs.due_at) — never a field here.
    tier: int = 0
    points: int = 0
    last_reviewed_at: datetime | None = None


class PracticeOverview(BaseModel):
    # Pre-session overview for a scope. `familiarity` is a length-5 list indexed
    # by tier (0–4). Queue-not-debt: NO due-counts/overdue/next_review_at here.
    scope: str
    word_count: int
    familiarity: list[int]


class QueueItem(BaseModel):
    # One drill card. A thin wrapper so later stories can attach per-card data
    # (Epic 3 adds notes) without changing the endpoint shape. Queue-not-debt:
    # carries NO due/overdue/next_review_at — "due" only orders the queue.
    word: Word


class GradeItem(BaseModel):
    # One graded card in a batch submission.
    word_id: str
    grade: Grade
