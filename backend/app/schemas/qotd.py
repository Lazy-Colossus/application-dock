"""Question of the Day schemas.

Two families live here. This story defines the **question** models — the shape of
the bundled, curated set (`Scale`, `Question`). Story 1.3 adds the **day** models
(`Answer`, `Day`) that record what people answered.

A question is one of two types. `text` invites a written response; `scale` a
rating between two bounds with optional end labels. The type is authoritative:
the model rejects a `scale` question missing its bounds and a `text` question
that carries a scale, so a malformed set fails loudly at load rather than
surfacing a half-built question later (FR-3, AR-3).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

QuestionType = Literal["text", "scale"]


class Scale(BaseModel):
    """The bounds of a `scale` question. `min` must be strictly below `max`."""

    min: int
    max: int
    min_label: str | None = None
    max_label: str | None = None

    @model_validator(mode="after")
    def _check_bounds(self) -> Scale:
        if self.min >= self.max:
            raise ValueError(f"scale min ({self.min}) must be < max ({self.max})")
        return self


class Question(BaseModel):
    """One curated question. `scale` is present iff `type == "scale"`."""

    id: str
    text: str
    type: QuestionType
    scale: Scale | None = None

    @model_validator(mode="after")
    def _check_type_matches_scale(self) -> Question:
        if self.type == "scale" and self.scale is None:
            raise ValueError(f"scale question {self.id!r} must carry a scale")
        if self.type == "text" and self.scale is not None:
            raise ValueError(f"text question {self.id!r} must not carry a scale")
        return self


# ── The day: what people answered ────────────────────────────────────────────


class Answer(BaseModel):
    """One person's answer to a day's question.

    Exactly one of `text` / `rating` is set — which one is dictated by the day's
    question type (the service validates the match; the model only enforces that
    precisely one field carries a value). `created_at` is stamped on first write
    and preserved across edits; `updated_at` moves on every write (FR-8).
    """

    text: str | None = None
    rating: int | None = None
    created_at: str
    updated_at: str

    @model_validator(mode="after")
    def _exactly_one_value(self) -> Answer:
        has_text = self.text is not None
        has_rating = self.rating is not None
        if has_text == has_rating:  # both set, or neither
            raise ValueError("an answer must set exactly one of text / rating")
        return self


class Day(BaseModel):
    """One day's shared record: its question and everyone's answers.

    Keyed by date, never by user — the whole dock shares the day. `answers` is
    keyed by username, so there is structurally one answer per user per day. A
    day with no answers yet materialises as an empty `Day`; the `question_id` is
    filled from the deterministic selection when the day is first written.

    Stored inside its `Month` document (see below), not as a standalone file.
    """

    schema_version: int
    date: str
    question_id: str = ""
    answers: dict[str, Answer] = Field(default_factory=dict)


class Month(BaseModel):
    """A calendar month's days, in one file (`qotd/months/{YYYY-MM}.json`).

    The store is bucketed by month rather than by day: with a tiny group the
    per-file write lock at month granularity is ample (a handful of short
    read-modify-writes a day), and a month per file keeps the folder small and
    legible for a human opening it by hand — the reason this was chosen over one
    file per day. `days` is keyed by `YYYY-MM-DD`.
    """

    schema_version: int
    month: str  # YYYY-MM
    days: dict[str, Day] = Field(default_factory=dict)


# ── What the client sees ──────────────────────────────────────────────────────


class TodayView(BaseModel):
    """The home page's view of today.

    Carries the question, today's date, whether *this* caller has answered, and —
    when they have — *their own* answer (for pre-fill and edit, Stories 2.2/2.3).
    It never carries the pool of *other* users' answers: that reveal is gated
    behind answer-to-reveal in Epic 3, so a curious client cannot read it here
    (FR-10). A caller's own answer is not a leak.
    """

    date: str
    question: Question
    answered: bool
    my_answer: Answer | None = None


class AnswerRequest(BaseModel):
    """Body for `PUT /today/answer`.

    Exactly one of `text` / `rating` is expected, matched to the day's question
    type (the service enforces it). There is deliberately **no** user field:
    attribution is the JWT username, never anything a client can send, so an
    extra `username` in the body is ignored rather than trusted (FR-2).
    """

    text: str | None = None
    rating: int | None = None


class FeedAnswer(BaseModel):
    """One answer as it appears in a feed — attributed to its author."""

    username: str
    text: str | None = None
    rating: int | None = None
    created_at: str
    updated_at: str


class TodayFeed(BaseModel):
    """Today's answers, gated behind answer-to-reveal (FR-10).

    Until the caller has answered, `revealed` is false and `answers` is empty —
    only `count` is offered as a teaser, never any contents. Once they have
    answered, every answer is returned, attributed and ordered stably.
    """

    revealed: bool
    count: int
    answers: list[FeedAnswer] = Field(default_factory=list)


class HistoryRow(BaseModel):
    """One past day in the history list — date and its question, resolved.

    The `question_text` is resolved at read time from the stored `question_id`
    (AR-3), so wording edits reflect everywhere. Kept lean; a day's answers are
    fetched by the detail view (Story 3.3).
    """

    date: str
    question_text: str
    type: QuestionType


class PastDayView(BaseModel):
    """A past day in full: its question and everyone's answers, read-only.

    Past days are the archive — **always visible** to any logged-in caller,
    never gated behind answer-to-reveal (that is a today-only rule, FR-12).
    """

    date: str
    question: Question
    answers: list[FeedAnswer] = Field(default_factory=list)
