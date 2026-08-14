"""Pure spaced-repetition & familiarity engine (Story 2.1 / FR-20).

Deterministic and clock-free: `now` is always injected, never read from the
system. State per (user, word) is a `ProgressEntry`; "due" is derived on demand
here and NEVER persisted or exposed as a count (the calm / queue-not-debt
guardrail). No filesystem or repository access lives in this module.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from app.schemas.hotaru import Grade, ProgressEntry

# Five familiarity tiers, index 0–4.
TIER_LABELS = ["New", "Learning", "Familiar", "Strong", "Mastered"]
MAX_TIER = 4

# Points required to LEAVE tiers 0–3 (New→Learning→Familiar→Strong). Mastered is
# terminal, so there is no fifth threshold. Single tunable array.
THRESHOLDS = [1, 3, 9, 18]

# Review interval per tier 0–4; New is same-session (0).
INTERVALS = [
    timedelta(0),
    timedelta(days=1),
    timedelta(days=3),
    timedelta(days=7),
    timedelta(days=21),
]


def interval_for(tier: int) -> timedelta:
    return INTERVALS[tier]


def label_for(tier: int) -> str:
    return TIER_LABELS[tier]


def next_review(
    state: ProgressEntry,
    grade: Grade,
    now: datetime,
    *,
    replay: bool = False,
) -> ProgressEntry:
    """Return the updated state after a grade. Pure — does not mutate `state`.

    Correct: +1 point; on reaching the tier's threshold, +1 tier and reset
    points (Mastered holds). Close: holds. Incorrect: drop one tier, reset
    points. `last_reviewed_at` is set to the injected `now`.

    Tier 0 (New) means "never studied": since this function is only ever called
    on a review, its result floors at Learning (tier 1). So a first exposure —
    whatever the grade — graduates New → Learning, and a lapse (Incorrect) drops
    toward Learning but never back to New. (Standard SRS: New = novelty, not the
    bottom of mastery.)

    `replay=True` marks a grade from re-practising words already met earlier in
    the same session. Recalling an answer seen a minute ago is short-term memory,
    not retrieval, so a replay Correct earns ground toward the next tier but can
    never cross the threshold — repeated replays stall one point short, and only
    a later genuine review promotes. A replay Incorrect still drops as normal:
    the safety net is for inflated progress, not for lapses.
    """
    tier, points = state.tier, state.points

    if grade == "correct":
        if tier >= MAX_TIER:
            points = 0
        elif replay:
            points = min(points + 1, max(0, THRESHOLDS[tier] - 1))
        else:
            points += 1
            if points >= THRESHOLDS[tier]:
                tier += 1
                points = 0
    elif grade == "incorrect":
        tier -= 1
        points = 0
    # "close" holds tier and points unchanged.

    # A reviewed word is never New (tier 0) — floor at Learning.
    tier = max(1, tier)

    return ProgressEntry(tier=tier, points=points, last_reviewed_at=now)


def due_at(state: ProgressEntry) -> datetime | None:
    """When the word next becomes due, or None if it has never been reviewed
    (a never-reviewed word is always due). Compute-only — never persisted."""
    if state.last_reviewed_at is None:
        return None
    return state.last_reviewed_at + INTERVALS[state.tier]


def is_due(state: ProgressEntry, now: datetime) -> bool:
    due = due_at(state)
    return due is None or now >= due
