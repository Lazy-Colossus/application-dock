"""Story 1.3 — the QotD data layer.

Storage is keyed by date, not by username: the whole dock shares the day, and a
day is selected by the date alone. Days are bucketed into one file per month
(`qotd/months/{YYYY-MM}.json`); callers still work a day at a time.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import qotd_repo as repo
from app.schemas.qotd import Answer, Day
from app.services import qotd_service as service


@pytest.fixture(autouse=True)
def isolate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setattr("app.core.config.settings.data_dir", tmp_path)
    return tmp_path


def make_answer(text: str = "hello") -> Answer:
    stamp = service.now_iso()
    return Answer(text=text, created_at=stamp, updated_at=stamp)


def make_day(day: str = "2026-09-06", **answers: Answer) -> Day:
    return Day(
        schema_version=repo.CURRENT_SCHEMA_VERSION,
        date=day,
        question_id="q-highlight",
        answers=dict(answers),
    )


def test_round_trips_a_day() -> None:
    original = make_day(alice=make_answer("hi"))
    repo.write_day(original)
    assert repo.read_day("2026-09-06") == original


def test_unseen_date_reads_as_an_empty_day() -> None:
    day = repo.read_day("2026-01-01")
    assert day.date == "2026-01-01"
    assert day.answers == {}
    assert day.schema_version == repo.CURRENT_SCHEMA_VERSION


def test_write_creates_the_months_directory(isolate: Path) -> None:
    assert not (isolate / "qotd" / "months").exists()
    repo.write_day(make_day())
    assert (isolate / "qotd" / "months" / "2026-09.json").is_file()


def test_day_is_stored_in_its_month_file(isolate: Path) -> None:
    # No username enters path selection — the day is shared — and the file is the
    # month bucket, not a per-day file.
    repo.write_day(make_day("2026-07-04", bob=make_answer()))
    assert (isolate / "qotd" / "months" / "2026-07.json").is_file()
    assert not (isolate / "qotd" / "months" / "2026-07-04.json").exists()


def test_many_days_in_one_month_share_a_file(isolate: Path) -> None:
    repo.write_day(make_day("2026-09-04", a=make_answer()))
    repo.write_day(make_day("2026-09-06", b=make_answer()))
    repo.write_day(make_day("2026-09-20", c=make_answer()))
    # One file for the whole month...
    assert list((isolate / "qotd" / "months").glob("*.json")) == [
        isolate / "qotd" / "months" / "2026-09.json"
    ]
    # ...and every day survives the merge (a later write does not drop earlier ones).
    assert {"2026-09-04", "2026-09-06", "2026-09-20"} == {d.date for d in repo.list_days()}


def test_list_days_returns_written_days_newest_first() -> None:
    # Spanning two months, to prove the sort is global across files.
    repo.write_day(make_day("2026-08-31"))
    repo.write_day(make_day("2026-09-06"))
    repo.write_day(make_day("2026-09-05"))
    assert [d.date for d in repo.list_days()] == [
        "2026-09-06",
        "2026-09-05",
        "2026-08-31",
    ]


def test_list_days_empty_when_nothing_written() -> None:
    assert repo.list_days() == []


def test_list_days_ignores_non_json(isolate: Path) -> None:
    repo.write_day(make_day("2026-09-06"))
    stray = isolate / "qotd" / "months" / "notes.txt"
    stray.write_text("not a month", encoding="utf-8")
    assert [d.date for d in repo.list_days()] == ["2026-09-06"]


def test_migrate_is_a_passthrough() -> None:
    raw = {"schema_version": 1, "month": "2026-09", "days": {}}
    assert repo.migrate(raw) == raw


@pytest.mark.parametrize(
    "bad",
    [
        "2026-9-6",  # not zero-padded
        "2026/09/06",  # wrong separator
        "2026-09-06.json",  # trailing junk
        "../secret",  # traversal
        "..",
        "2026-13-01",  # impossible month
        "2026-02-30",  # impossible day
        "20260906",  # no separators
        "",
    ],
)
def test_unsafe_dates_are_rejected(bad: str) -> None:
    with pytest.raises(ValueError):
        repo._month_path(bad)


def test_traversal_date_neither_reads_nor_writes() -> None:
    with pytest.raises(ValueError):
        repo.read_day("../../etc/passwd")


def test_traversal_date_leaks_nothing_outside_the_store(isolate: Path) -> None:
    with pytest.raises(ValueError):
        repo.read_day("../../etc/passwd")
    assert list(isolate.rglob("passwd")) == []


def test_day_exists_distinguishes_never_surfaced_from_empty() -> None:
    assert repo.day_exists("2026-09-06") is False
    # A surfaced-but-empty day (a file entry with no answers) exists.
    repo.write_day(make_day("2026-09-06"))
    assert repo.day_exists("2026-09-06") is True
    # A different day in the same month that was never written does not exist.
    assert repo.day_exists("2026-09-07") is False


def test_day_transaction_round_trips_and_persists() -> None:
    with repo.day_transaction("2026-09-06") as day:
        day.question_id = "q-highlight"
        day.answers["carol"] = make_answer("yo")
    assert repo.read_day("2026-09-06").answers["carol"].text == "yo"


def test_day_transaction_writes_nothing_when_the_block_raises() -> None:
    with pytest.raises(RuntimeError):
        with repo.day_transaction("2026-09-06") as day:
            day.answers["dan"] = make_answer("oops")
            raise RuntimeError("abort")
    # The failed transaction left no entry behind.
    assert repo.read_day("2026-09-06").answers == {}


def test_day_transaction_preserves_other_days_in_the_month() -> None:
    repo.write_day(make_day("2026-09-04", a=make_answer("first")))
    with repo.day_transaction("2026-09-06") as day:
        day.answers["b"] = make_answer("second")
    # The earlier day in the same month file is untouched by the later write.
    assert repo.read_day("2026-09-04").answers["a"].text == "first"
    assert repo.read_day("2026-09-06").answers["b"].text == "second"
