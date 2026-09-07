"""Question of the Day business logic.

Raises stdlib exceptions only (`ValueError`, `KeyError`, `FileNotFoundError`);
the router translates them. Never raises `HTTPException`.

Holds the **question set** and its **daily selection** (a bundled, validated set
and a pure date→question function), the shared **server clock** helpers, and the
view/answer logic the endpoints call. It reads and writes days through
`qotd_repo`; the router translates its exceptions.

**Determinism is the point (FR-4).** The day's question is a pure function of the
date and the set — no `random`, no wall clock — so two processes agree and a
restart never shifts today's question.

**Store the id, never the text (AR-3).** A day file records only a `question_id`;
the text is always resolved from the set here, so editing wording in the asset
reflects everywhere and there is one source of truth.
"""

from __future__ import annotations

import json
from datetime import UTC, date, datetime
from pathlib import Path

from app.repositories import qotd_repo as repo
from app.schemas.qotd import (
    Answer,
    FeedAnswer,
    HistoryRow,
    PastDayView,
    Question,
    TodayFeed,
    TodayView,
)

_QUESTIONS_PATH = Path(__file__).resolve().parent.parent / "data" / "qotd_questions.json"

# The set never changes for the life of the process, so it is read and validated
# once. `None` means "not yet loaded".
_questions_cache: list[Question] | None = None


def _read_and_validate(path: Path) -> list[Question]:
    """Read the set from `path`, validate every entry, and check id uniqueness.

    Raises `ValueError` on an empty/malformed file or duplicate ids, and lets a
    `Question` validation error (a scale missing bounds, a text carrying a scale)
    propagate. Takes the path so tests can point it at a bad fixture.
    """
    raw = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(raw, list) or not raw:
        raise ValueError("qotd question set must be a non-empty list")

    questions = [Question.model_validate(entry) for entry in raw]

    ids = [q.id for q in questions]
    if len(set(ids)) != len(ids):
        raise ValueError("qotd question ids must be unique")

    return questions


def load_questions() -> list[Question]:
    """The curated set, loaded and validated once and cached thereafter."""
    global _questions_cache
    if _questions_cache is None:
        _questions_cache = _read_and_validate(_QUESTIONS_PATH)
    return _questions_cache


def get_question(question_id: str) -> Question:
    """Resolve a question by id.

    Raises `KeyError` if the id is not in the set — the append-mostly failure
    mode where a stored day references a question that has since been removed
    (AC-5). The router maps that to a 5xx; it must never return a half-built
    question.
    """
    for question in load_questions():
        if question.id == question_id:
            return question
    raise KeyError(question_id)


def question_id_for_date(day: date) -> str:
    """The id of the day's question — pure, deterministic, no I/O beyond the set.

    Ordinal-of-date modulo set length: the simplest reproducible mapping that
    walks the whole set over consecutive days rather than fixating on one entry
    (FR-4). Same date + same set → same id in any process and after a restart.
    """
    questions = load_questions()
    return questions[day.toordinal() % len(questions)].id


def question_for_date(day: date) -> Question:
    """The day's question, resolved from its deterministic id."""
    return get_question(question_id_for_date(day))


# ── The server clock — the one source of "now" for every past/present decision ──


def now_iso() -> str:
    """Current UTC instant as an ISO-8601 timestamp."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def today() -> date:
    """The server's current date — the ONLY source of "today" in this app.

    Every past-versus-present decision routes through here: which question is
    shown, whether an answer may still be edited (Story 2.3), and what history
    lists (Story 3.2). They must agree, and none may trust the client's clock
    (NFR-5). Made trivially monkeypatchable so the day rolling over is testable
    without waiting for midnight.
    """
    return datetime.now(UTC).date()


def is_past(day: str) -> bool:
    """True if `day` (YYYY-MM-DD) is strictly before the server's today.

    Today itself is never past — it is still answerable.
    """
    return date.fromisoformat(day) < today()


# ── Today ─────────────────────────────────────────────────────────────────────


def today_view(username: str) -> TodayView:
    """Assemble the home page's view of today for `username`.

    Resolves today's date server-side, selects the day's question
    deterministically, and reports whether *this* caller has already answered —
    read from the stored day, not a client flag. Never returns other users'
    answers (that reveal is Epic 3). Reads the day without writing it, so a first
    visitor materialises nothing and never sees a stale question id (FR-5).

    Raises `KeyError` if the day's question id is no longer in the set — the
    append-mostly failure the router maps to a 5xx.
    """
    day = today()
    day_str = day.isoformat()
    question = question_for_date(day)
    stored = repo.read_day(day_str)
    return TodayView(
        date=day_str,
        question=question,
        answered=username in stored.answers,
        my_answer=stored.answers.get(username),
    )


# ── Answering ─────────────────────────────────────────────────────────────────


def _validated_answer(
    question: Question, text: str | None, rating: int | None
) -> tuple[str | None, int | None]:
    """Validate a payload against the day's question type.

    The question type is authoritative (FR-6/FR-7): a `text` question requires a
    non-empty written answer and rejects a rating; a `scale` question requires a
    rating within `[min, max]` and rejects text. Exactly one field may be set.
    Returns the normalised `(text, rating)`; raises `ValueError` otherwise.
    """
    has_text = text is not None
    has_rating = rating is not None
    if has_text == has_rating:
        raise ValueError("an answer must set exactly one of text / rating")

    if question.type == "text":
        if not has_text:
            raise ValueError("this question expects a written answer")
        cleaned = text.strip() if text is not None else ""
        if not cleaned:
            raise ValueError("an answer must not be empty")
        return cleaned, None

    # scale
    if not has_rating:
        raise ValueError("this question expects a rating")
    assert question.scale is not None  # a scale question always carries its scale
    if not question.scale.min <= rating <= question.scale.max:
        raise ValueError(f"rating must be between {question.scale.min} and {question.scale.max}")
    return None, rating


def _assert_answerable(day_str: str) -> None:
    """Guard the write boundary: only *today* may be answered (FR-9, NFR-5).

    The boundary is the server's, decided by `today()`/`is_past` — never the
    client's clock, and `today` itself is still writable all day. A past day
    raises `PermissionError` (the router maps it to 403); any other non-today
    date raises `ValueError`. This is defence in depth: even if a client is
    bypassed to aim a write at a day that has passed, the service refuses it and
    nothing is written.
    """
    if day_str == today().isoformat():
        return
    if is_past(day_str):
        raise PermissionError("That day has passed and can no longer be answered")
    raise ValueError("You can only answer today's question")


def _upsert_answer(username: str, day_str: str, *, text: str | None, rating: int | None) -> Answer:
    """Upsert `username`'s answer on `day_str`, guarding the write boundary.

    One answer per user per day: a resubmit overwrites the value in place,
    stamping a new `updated_at` while preserving the original `created_at`
    (FR-8). The write runs inside `day_transaction` so concurrent answers by
    different users all survive (NFR-1).
    """
    _assert_answerable(day_str)
    question = question_for_date(date.fromisoformat(day_str))
    clean_text, clean_rating = _validated_answer(question, text, rating)

    with repo.day_transaction(day_str) as document:
        if not document.question_id:
            document.question_id = question.id
        stamp = now_iso()
        existing = document.answers.get(username)
        document.answers[username] = Answer(
            text=clean_text,
            rating=clean_rating,
            created_at=existing.created_at if existing else stamp,
            updated_at=stamp,
        )
        return document.answers[username]


def upsert_today_answer(
    username: str, *, text: str | None = None, rating: int | None = None
) -> Answer:
    """Record `username`'s answer to today's question, upserting.

    Always targets `today()`; the boundary guard in `_upsert_answer` makes a
    past-day write impossible even if a caller reaches the write path with a
    stale date. Attribution is the caller's username. Raises `ValueError` on a
    payload that does not match the question type.
    """
    return _upsert_answer(username, today().isoformat(), text=text, rating=rating)


# ── Today's feed (answer-to-reveal) ───────────────────────────────────────────


def _ordered_feed_answers(answers: dict[str, Answer]) -> list[FeedAnswer]:
    """Answers attributed to their authors, ordered stably by `created_at`.

    The username breaks ties so the order does not depend on dict insertion
    order across reads.
    """
    ordered = sorted(answers.items(), key=lambda kv: (kv[1].created_at, kv[0]))
    return [
        FeedAnswer(
            username=name,
            text=answer.text,
            rating=answer.rating,
            created_at=answer.created_at,
            updated_at=answer.updated_at,
        )
        for name, answer in ordered
    ]


def today_feed(username: str) -> TodayFeed:
    """Today's answers for `username`, gated behind answer-to-reveal (FR-10).

    "Has answered" is read from the stored day, never a client flag, so a caller
    who has not answered cannot obtain the contents even by calling the API
    directly — they get `revealed=False` and a bare count. Once they have
    answered, every answer is returned, attributed and ordered.
    """
    stored = repo.read_day(today().isoformat())
    count = len(stored.answers)
    if username not in stored.answers:
        return TodayFeed(revealed=False, count=count)
    return TodayFeed(revealed=True, count=count, answers=_ordered_feed_answers(stored.answers))


# ── History ───────────────────────────────────────────────────────────────────


def history() -> list[HistoryRow]:
    """Past days, newest-first, each with its resolved question text and type.

    Built from `list_days()` scanning the months directory (no index, AR-2), which
    already returns newest-first. Today and any future date are dropped via
    `is_past` (NFR-5). Each `question_id` is resolved to its current text/type.

    **No-answer-day rule (AC-2):** every past day that has a stored file appears,
    including one whose file has no answers — the question is still part of the
    record. Days never surfaced have no file and so no row; because the list is a
    directory scan rather than a trimmed index, nothing is silently truncated. A
    stored `question_id` no longer in the set raises `KeyError` (surfaced as a
    5xx) rather than dropping the row — losing a row would violate
    no-silent-truncation.
    """
    rows: list[HistoryRow] = []
    for day in repo.list_days():
        if not is_past(day.date):
            continue
        question = get_question(day.question_id)
        rows.append(HistoryRow(date=day.date, question_text=question.text, type=question.type))
    return rows


def past_day_view(day_str: str) -> PastDayView:
    """A past day in full — its question and everyone's answers, always visible.

    The archive is not gated behind answer-to-reveal (that is today-only): any
    logged-in caller sees every answer for a past day (FR-12). Only the past is
    served here — today belongs to the `/today` flow (which carries the reveal
    gate), so today/future is refused.

    Raises `PermissionError` for today/future, `ValueError` for a malformed date
    (the repo re-validates on the path too, blocking traversal),
    `FileNotFoundError` for a past date never surfaced, and `KeyError` if the
    stored question id is gone from the set.
    """
    if not is_past(day_str):
        raise PermissionError("That day is not in the past")
    if not repo.day_exists(day_str):
        raise FileNotFoundError(day_str)
    stored = repo.read_day(day_str)
    question = get_question(stored.question_id)
    return PastDayView(
        date=day_str,
        question=question,
        answers=_ordered_feed_answers(stored.answers),
    )
