"""Cell type coercion and id/timestamp minting for Listies (Story 1.2).

`coerce_value` guards the write path; `recoerce_column` is what a column retype
(Story 2.5) uses. Both share one implementation so the two paths can never drift.
"""

from __future__ import annotations

import re

import pytest

from app.schemas.listies import Column, Row
from app.services import listies_service as service

# ── coerce_value: text ────────────────────────────────────────────────────────


def test_text_keeps_a_string() -> None:
    assert service.coerce_value("Tent", "text") == "Tent"


def test_text_normalises_empty_and_whitespace_to_none() -> None:
    assert service.coerce_value("", "text") is None
    assert service.coerce_value("   ", "text") is None


def test_text_rejects_a_number() -> None:
    with pytest.raises(ValueError):
        service.coerce_value(3, "text")


# ── coerce_value: number ──────────────────────────────────────────────────────


def test_number_keeps_an_int_as_an_int() -> None:
    value = service.coerce_value(3, "number")
    assert value == 3
    assert isinstance(value, int)


def test_number_keeps_a_float() -> None:
    assert service.coerce_value(1.5, "number") == 1.5


def test_number_keeps_zero_distinct_from_empty() -> None:
    assert service.coerce_value(0, "number") == 0


def test_number_rejects_a_string_even_a_numeric_one() -> None:
    with pytest.raises(ValueError):
        service.coerce_value("12", "number")


def test_number_rejects_a_bool() -> None:
    with pytest.raises(ValueError):
        service.coerce_value(True, "number")


# ── coerce_value: date ────────────────────────────────────────────────────────


def test_date_keeps_an_iso_date() -> None:
    assert service.coerce_value("2026-09-02", "date") == "2026-09-02"


def test_date_rejects_a_non_iso_string() -> None:
    with pytest.raises(ValueError):
        service.coerce_value("02/09/2026", "date")


def test_date_rejects_an_impossible_date() -> None:
    with pytest.raises(ValueError):
        service.coerce_value("2026-02-31", "date")


def test_date_normalises_empty_to_none() -> None:
    assert service.coerce_value("", "date") is None


# ── coerce_value: empty is empty for every type ───────────────────────────────


@pytest.mark.parametrize("column_type", ["text", "number", "date"])
def test_none_stays_none(column_type: str) -> None:
    assert service.coerce_value(None, column_type) is None


# ── recoerce_column ───────────────────────────────────────────────────────────


def _rows(values: list[object]) -> list[Row]:
    return [
        Row(id=f"r-{i}", order=i, cells={"c-1": v}, created_at="x", updated_at="x")
        for i, v in enumerate(values)
    ]


def test_retype_to_text_keeps_everything_as_a_string() -> None:
    rows = _rows([3, 1.5, "2026-09-02"])
    service.recoerce_column(rows, "c-1", "text")
    assert [r.cells.get("c-1") for r in rows] == ["3", "1.5", "2026-09-02"]


def test_retype_to_number_keeps_what_parses_and_blanks_the_rest() -> None:
    rows = _rows(["12", "3.5", "abc", "2026-09-02"])
    service.recoerce_column(rows, "c-1", "number")
    assert [r.cells.get("c-1") for r in rows] == [12, 3.5, None, None]


def test_retype_to_date_keeps_what_parses_and_blanks_the_rest() -> None:
    rows = _rows(["2026-09-02", "not a date", 3])
    service.recoerce_column(rows, "c-1", "date")
    assert [r.cells.get("c-1") for r in rows] == ["2026-09-02", None, None]


def test_retype_prunes_blanked_cells_rather_than_storing_null() -> None:
    rows = _rows(["abc"])
    service.recoerce_column(rows, "c-1", "number")
    assert "c-1" not in rows[0].cells


def test_retype_leaves_other_columns_untouched() -> None:
    rows = [
        Row(
            id="r-1",
            order=0,
            cells={"c-1": "abc", "c-2": "keep me"},
            created_at="x",
            updated_at="x",
        )
    ]
    service.recoerce_column(rows, "c-1", "number")
    assert rows[0].cells["c-2"] == "keep me"


# ── id minting and timestamps ─────────────────────────────────────────────────


@pytest.mark.parametrize("prefix", ["s", "tb", "c", "r"])
def test_new_id_is_prefixed_with_eight_hex_chars(prefix: str) -> None:
    value = service.new_id(prefix)
    assert re.fullmatch(rf"{prefix}-[0-9a-f]{{8}}", value)


def test_new_id_is_unique() -> None:
    assert len({service.new_id("r") for _ in range(200)}) == 200


def test_now_iso_is_utc_iso8601() -> None:
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z", service.now_iso())


# ── lookup helpers raise stdlib exceptions, never HTTPException ───────────────


def test_find_column_raises_file_not_found_for_an_unknown_id() -> None:
    columns = [Column(id="c-1", name="Item", type="text", order=0)]
    with pytest.raises(FileNotFoundError):
        service.find_column(columns, "c-nope")
