"""Story 1.2 — the shared helpers every later Kalendariq story depends on."""

from datetime import UTC, date, datetime

import pytest

from app.services import kalendariq_service as service


def test_new_id_has_the_documented_shape() -> None:
    generated = service.new_id("cal")
    prefix, _, suffix = generated.partition("-")
    assert prefix == "cal"
    assert len(suffix) == 8
    assert all(c in "0123456789abcdef" for c in suffix)


def test_new_ids_are_unique() -> None:
    assert len({service.new_id("inv") for _ in range(500)}) == 500


def test_now_iso_is_utc_and_second_precision() -> None:
    stamp = service.now_iso()
    assert stamp.endswith("Z")
    parsed = datetime.strptime(stamp, "%Y-%m-%dT%H:%M:%SZ")
    assert abs((parsed.replace(tzinfo=UTC) - datetime.now(UTC)).total_seconds()) < 5


def test_today_comes_from_the_server_clock() -> None:
    assert service.today() == datetime.now(UTC).date()


@pytest.mark.parametrize("offset,expected", [(-1, True), (0, False), (1, False)])
def test_is_past_treats_today_as_still_votable(
    monkeypatch: pytest.MonkeyPatch, offset: int, expected: bool
) -> None:
    """Today is never past — the whole point of the boundary is that today can
    still be voted on (FR-16)."""
    fixed = date(2026, 9, 3)
    monkeypatch.setattr(service, "today", lambda: fixed)
    day = date.fromordinal(fixed.toordinal() + offset).isoformat()
    assert service.is_past(day) is expected


def test_is_past_rejects_a_malformed_date() -> None:
    with pytest.raises(ValueError):
        service.is_past("03-09-2026")
