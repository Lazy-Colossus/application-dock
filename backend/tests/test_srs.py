from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.schemas.hotaru import ProgressEntry
from app.services import srs

NOW = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)


def entry(tier: int = 0, points: int = 0, last: datetime | None = None) -> ProgressEntry:
    return ProgressEntry(tier=tier, points=points, last_reviewed_at=last)


# --- next_review: correct / advancement ------------------------------------


def test_correct_below_threshold_adds_a_point_same_tier() -> None:
    # Tier 1 (Learning) needs 3 points to advance; 0 → 1 point, still tier 1.
    result = srs.next_review(entry(tier=1, points=0), "correct", NOW)
    assert (result.tier, result.points) == (1, 1)


@pytest.mark.parametrize(
    "tier,threshold",
    [(0, 1), (1, 3), (2, 9), (3, 18)],
)
def test_correct_at_threshold_advances_and_resets_points(tier: int, threshold: int) -> None:
    # One point short of the threshold; the grade that reaches it advances a tier.
    result = srs.next_review(entry(tier=tier, points=threshold - 1), "correct", NOW)
    assert (result.tier, result.points) == (tier + 1, 0)


def test_correct_at_mastered_holds_top_tier() -> None:
    result = srs.next_review(entry(tier=4, points=0), "correct", NOW)
    assert result.tier == 4
    assert result.points == 0


# --- next_review: close / incorrect ----------------------------------------


def test_close_holds_tier_and_points() -> None:
    result = srs.next_review(entry(tier=2, points=4), "close", NOW)
    assert (result.tier, result.points) == (2, 4)


def test_incorrect_drops_one_tier_and_resets_points() -> None:
    result = srs.next_review(entry(tier=3, points=5), "incorrect", NOW)
    assert (result.tier, result.points) == (2, 0)


# --- next_review: "a reviewed word is never New" (floors at Learning) -------


def test_incorrect_at_learning_floors_at_learning() -> None:
    # A lapse drops toward Learning but never back to New.
    result = srs.next_review(entry(tier=1, points=0), "incorrect", NOW)
    assert (result.tier, result.points) == (1, 0)


def test_incorrect_at_familiar_drops_to_learning() -> None:
    result = srs.next_review(entry(tier=2, points=0), "incorrect", NOW)
    assert result.tier == 1


def test_close_on_new_graduates_to_learning() -> None:
    # First exposure — even a Close — leaves New (a review is never New).
    result = srs.next_review(entry(tier=0, points=0), "close", NOW)
    assert (result.tier, result.points) == (1, 0)


def test_incorrect_on_new_graduates_to_learning() -> None:
    result = srs.next_review(entry(tier=0, points=0), "incorrect", NOW)
    assert (result.tier, result.points) == (1, 0)


# --- next_review: replay grades (re-practice within the same session) -------


def test_replay_correct_below_threshold_still_earns_its_point() -> None:
    # A replay credits progress — it just can't cash it in for a tier.
    result = srs.next_review(entry(tier=1, points=0), "correct", NOW, replay=True)
    assert (result.tier, result.points) == (1, 1)


@pytest.mark.parametrize("tier,threshold", [(1, 3), (2, 9), (3, 18)])
def test_replay_correct_at_threshold_does_not_promote(tier: int, threshold: int) -> None:
    # The same state that a genuine Correct would promote (see
    # test_correct_at_threshold_advances_and_resets_points) stalls one short.
    result = srs.next_review(entry(tier=tier, points=threshold - 1), "correct", NOW, replay=True)
    assert (result.tier, result.points) == (tier, threshold - 1)


def test_repeated_replays_cannot_stack_past_the_threshold() -> None:
    # Cramming the same word ten times parks it one point short, never over.
    state = entry(tier=1, points=0)
    for _ in range(10):
        state = srs.next_review(state, "correct", NOW, replay=True)
    assert (state.tier, state.points) == (1, srs.THRESHOLDS[1] - 1)


def test_a_genuine_correct_after_replays_promotes() -> None:
    # The ground a replay earned is real: the next non-replay Correct cashes it.
    state = srs.next_review(entry(tier=1, points=0), "correct", NOW, replay=True)
    state = srs.next_review(state, "correct", NOW, replay=True)
    assert (state.tier, state.points) == (1, 2)
    promoted = srs.next_review(state, "correct", NOW)
    assert (promoted.tier, promoted.points) == (2, 0)


def test_replay_incorrect_still_drops_a_tier() -> None:
    # The safety net is against inflated progress, not against lapses.
    result = srs.next_review(entry(tier=3, points=5), "incorrect", NOW, replay=True)
    assert (result.tier, result.points) == (2, 0)


def test_replay_close_holds_like_a_normal_close() -> None:
    result = srs.next_review(entry(tier=2, points=4), "close", NOW, replay=True)
    assert (result.tier, result.points) == (2, 4)


def test_replay_at_mastered_holds_top_tier() -> None:
    result = srs.next_review(entry(tier=4, points=0), "correct", NOW, replay=True)
    assert (result.tier, result.points) == (4, 0)


def test_replay_defaults_to_false() -> None:
    # The keyword is opt-in: every existing caller keeps promoting normally.
    result = srs.next_review(entry(tier=1, points=2), "correct", NOW)
    assert (result.tier, result.points) == (2, 0)


# --- next_review: shared behaviour -----------------------------------------


def test_next_review_stamps_injected_now() -> None:
    result = srs.next_review(entry(tier=1, points=0), "close", NOW)
    assert result.last_reviewed_at == NOW


def test_next_review_does_not_mutate_input() -> None:
    original = entry(tier=2, points=4, last=None)
    srs.next_review(original, "incorrect", NOW)
    assert (original.tier, original.points, original.last_reviewed_at) == (2, 4, None)


# --- due derivation ---------------------------------------------------------


def test_never_reviewed_word_is_due_and_has_no_due_at() -> None:
    e = entry()
    assert srs.due_at(e) is None
    assert srs.is_due(e, NOW) is True


@pytest.mark.parametrize(
    "tier,days",
    [(0, 0), (1, 1), (2, 3), (3, 7), (4, 21)],
)
def test_is_due_respects_the_interval_per_tier(tier: int, days: int) -> None:
    e = entry(tier=tier, points=0, last=NOW)
    due = NOW + timedelta(days=days)
    assert srs.due_at(e) == due
    # At and after the interval it is due.
    assert srs.is_due(e, due) is True
    assert srs.is_due(e, due + timedelta(days=1)) is True
    # For tiers with a real interval, it is not yet due just before it elapses.
    if days > 0:
        assert srs.is_due(e, due - timedelta(seconds=1)) is False


def test_interval_and_label_helpers() -> None:
    assert srs.interval_for(0) == timedelta(0)
    assert srs.interval_for(4) == timedelta(days=21)
    assert srs.label_for(0) == "New"
    assert srs.label_for(4) == "Mastered"


# --- purity guard -----------------------------------------------------------


def test_srs_module_has_no_clock_or_io() -> None:
    source = Path(srs.__file__).read_text(encoding="utf-8")
    assert "datetime.now(" not in source
    assert "import time" not in source
    # No repository import — the engine touches no filesystem.
    assert "from app.repositories" not in source
    assert "import app.repositories" not in source
