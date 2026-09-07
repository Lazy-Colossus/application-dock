"""Story 1.2 — deterministic daily selection."""

from __future__ import annotations

from datetime import date, timedelta

from app.services import qotd_service as service


def test_same_date_same_question() -> None:
    day = date(2026, 9, 6)
    first = service.question_id_for_date(day)
    second = service.question_id_for_date(day)
    assert first == second
    # And resolving the full question is stable too.
    assert service.question_for_date(day).id == first


def test_selection_walks_the_whole_set() -> None:
    """Over `len(set)` consecutive days every question is surfaced exactly once."""
    n = len(service.load_questions())
    start = date(2026, 1, 1)
    seen = {service.question_id_for_date(start + timedelta(days=i)) for i in range(n)}
    assert len(seen) == n  # full coverage, no fixation on one entry


def test_both_types_appear_across_a_range() -> None:
    n = len(service.load_questions())
    start = date(2026, 1, 1)
    types = {service.question_for_date(start + timedelta(days=i)).type for i in range(n)}
    assert types == {"text", "scale"}


def test_consecutive_days_advance_through_the_set() -> None:
    day = date(2026, 5, 20)
    a = service.question_id_for_date(day)
    b = service.question_id_for_date(day + timedelta(days=1))
    # Adjacent days map to adjacent (distinct) entries — a visible walk, not a
    # stuck pointer.
    assert a != b


def test_selection_is_pure_of_wall_clock() -> None:
    # A fixed historical date must always resolve identically, independent of
    # "now" — proven by comparing to the known modular index.
    questions = service.load_questions()
    day = date(2020, 2, 29)
    expected = questions[day.toordinal() % len(questions)].id
    assert service.question_id_for_date(day) == expected
