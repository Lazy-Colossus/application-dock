"""Business logic for Hotaru practice sessions (F3/F4).

Calls repositories + the pure SRS engine; raises stdlib exceptions. No
HTTPException here. Queue-not-debt: nothing this module returns carries a
due-count/overdue/next_review_at.
"""

from __future__ import annotations

from app.repositories import progress_repo
from app.schemas.hotaru import PracticeOverview, Word
from app.services import hotaru_vocab_service
from app.services.srs import MAX_TIER


def _words_for_scope(scope: str, user: str) -> list[Word]:
    """Resolve a `lesson:{lesson}` or `topic:{id}` scope to the active user's
    visible words. Raises ValueError on a malformed scope."""
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
