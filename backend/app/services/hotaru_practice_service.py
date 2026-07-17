"""Business logic for Hotaru practice sessions (F3/F4).

Calls repositories + the pure SRS engine; raises stdlib exceptions. No
HTTPException here. Queue-not-debt: nothing this module returns carries a
due-count/overdue/next_review_at.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.repositories import progress_repo
from app.schemas.hotaru import (
    DrillCap,
    GradeItem,
    PracticeOverview,
    ProgressEntry,
    QueueItem,
    Word,
)
from app.services import hotaru_vocab_service, notes_service, srs
from app.services.srs import MAX_TIER

# Calm session bound — the queue is soft-capped to this many cards (tunable).
DEFAULT_SESSION_SIZE = 20

# Sentinel "most-due" instant for never-reviewed words, so they sort ahead of
# any word that has an actual due time.
_EPOCH = datetime.min.replace(tzinfo=UTC)


def _words_for_scope(scope: str, user: str) -> list[Word]:
    """Resolve an `all`, `lesson:{lesson}`, or `topic:{id}` scope to the active
    user's visible words. Raises ValueError on a malformed scope."""
    if scope == "all":
        return hotaru_vocab_service.list_words(user=user)
    kind, sep, value = scope.partition(":")
    if not sep:
        raise ValueError(f"Invalid scope {scope!r}.")
    if kind == "lesson":
        return hotaru_vocab_service.list_words(user=user, lesson=value)
    if kind == "topic":
        return hotaru_vocab_service.list_words(user=user, topic=value)
    raise ValueError(f"Invalid scope {scope!r}.")


def overview(scope: str, user: str) -> PracticeOverview:
    """Word count + the active user's familiarity distribution for a scope.

    Familiarity is a length-5 list indexed by tier; an unreviewed word counts
    as New (tier 0). Privacy is inherited from `list_words` (only the active
    user's private words are included).
    """
    words = _words_for_scope(scope, user)
    progress = progress_repo.read_progress(user)
    familiarity = [0] * (MAX_TIER + 1)
    for w in words:
        entry = progress.get(w.id)
        familiarity[entry.tier if entry else 0] += 1
    return PracticeOverview(scope=scope, word_count=len(words), familiarity=familiarity)


def study_words(scope: str, user: str) -> list[Word]:
    """Every word in a scope, in natural (lesson/list) order — for the un-graded
    Study browse. No SRS weighting, no session cap (the deliberate difference
    from `build_queue`). Privacy is inherited from the scope resolution. Raises
    ValueError on a malformed scope."""
    return _words_for_scope(scope, user)


def familiarity_map(user: str) -> dict[str, int]:
    """The active user's per-word familiarity tier, for surfacing on the library.

    Only reviewed words appear; a word absent from the map is New (tier 0),
    resolved client-side. Tiers are familiarity, not due-debt, so nothing
    debt-like leaves the API.
    """
    return {word_id: entry.tier for word_id, entry in progress_repo.read_progress(user).items()}


def build_queue(
    scope: str,
    user: str,
    direction: DrillCap = "r2m",
    now: datetime | None = None,
    limit: int = DEFAULT_SESSION_SIZE,
    lessons: list[str] | None = None,
    tiers: list[int] | None = None,
) -> list[QueueItem]:
    """Build an ordered, soft-capped drill queue for a scope.

    Words are filtered to those whose `drill_caps` include `direction`, then
    ordered most-worth-reviewing first (weakest tier first, then most-due), and
    the first `limit` are returned. "Due" only orders the queue — it never
    leaves the API (queue-not-debt).

    Optional `lessons`/`tiers` narrow the set further (Quick Practice, Story
    2.9): keep only words in those lessons and/or at those familiarity tiers (an
    unreviewed word counts as tier 0). Both default `None` (no extra filtering),
    so a normal scoped drill is unaffected.

    `now` is injected here (defaulting to the current UTC time) so the pure
    `srs` engine stays clock-free; tests pass a fixed `now`.
    """
    now = now or datetime.now(UTC)
    words = [w for w in _words_for_scope(scope, user) if direction in w.drill_caps]
    progress = progress_repo.read_progress(user)

    if lessons:
        allowed = set(lessons)
        words = [w for w in words if w.lesson in allowed]
    if tiers is not None:
        wanted = set(tiers)
        words = [w for w in words if (progress[w.id].tier if w.id in progress else 0) in wanted]

    def sort_key(w: Word) -> tuple[int, int, datetime, str]:
        entry = progress.get(w.id) or ProgressEntry()
        due_first = 0 if srs.is_due(entry, now) else 1
        return (entry.tier, due_first, srs.due_at(entry) or _EPOCH, w.id)

    ordered = sorted(words, key=sort_key)
    # limit <= 0 means "no cap" (Quick Practice's "All"); otherwise soft-cap.
    capped = ordered if limit <= 0 else ordered[:limit]
    # Attach each card's privacy-filtered notes (shared + this user's own private)
    # so the drill renders them without a second fetch (Story 3.3, FR-24). Batched
    # over just the capped words — one read of each notes file, not one per card.
    notes_map = notes_service.notes_for_words([w.id for w in capped], user)
    return [QueueItem(word=w, notes=notes_map.get(w.id, [])) for w in capped]


def apply_grades(
    user: str,
    grades: list[GradeItem],
    now: datetime | None = None,
) -> dict[str, ProgressEntry]:
    """Apply a batch of grades to the user's progress via the pure SRS engine.

    Read-modify-write the user's progress map once. Grades apply in order, so a
    repeated word builds on its earlier result. `now` is injected here (default
    current UTC) so `srs` stays clock-free. Returns just the updated entries;
    `ProgressEntry` has no due field, so nothing debt-like leaves the API.
    """
    now = now or datetime.now(UTC)
    progress = progress_repo.read_progress(user)
    updated: dict[str, ProgressEntry] = {}
    for item in grades:
        entry = progress.get(item.word_id) or ProgressEntry()
        entry = srs.next_review(entry, item.grade, now)
        progress[item.word_id] = entry
        updated[item.word_id] = entry
    progress_repo.write_progress(user, progress)
    return updated
