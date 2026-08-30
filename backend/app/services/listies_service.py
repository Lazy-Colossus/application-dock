"""Business logic for Listies.

Raises stdlib exceptions only — routers translate them into HTTP responses.
`coerce_value` guards every write of a cell; `recoerce_column` reuses it so a
column retype and an ordinary edit can never disagree about what a type means.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from app.schemas.listies import CellValue, Column, ColumnType, Row, Sheet, Tab


def now_iso() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


# ── cell values ───────────────────────────────────────────────────────────────


def coerce_value(value: object, column_type: ColumnType) -> CellValue:
    """Validate a value against its column's type, normalising empty to `None`.

    Raises `ValueError` for a value that does not fit — the router turns that
    into a 422. Empty is `None` for every type, never `0` or `""`.
    """
    if value is None:
        return None

    if column_type == "text":
        if not isinstance(value, str):
            raise ValueError(f"expected text, got {type(value).__name__}")
        return value if value.strip() else None

    if column_type == "number":
        # bool is an int subclass; a checkbox value is not a number here.
        if isinstance(value, bool) or not isinstance(value, int | float):
            raise ValueError(f"expected a number, got {value!r}")
        return value

    if not isinstance(value, str):
        raise ValueError(f"expected a YYYY-MM-DD date, got {value!r}")
    if not value.strip():
        return None
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise ValueError(f"expected a YYYY-MM-DD date, got {value!r}") from exc
    return value


def _reparse(value: CellValue, new_type: ColumnType) -> CellValue:
    """Best-effort conversion used by a retype: keep what parses, else `None`."""
    if value is None:
        return None
    if new_type == "text":
        return str(value)
    if new_type == "number":
        if isinstance(value, int | float) and not isinstance(value, bool):
            return value
        try:
            return int(value)
        except (TypeError, ValueError):
            pass
        try:
            return float(value)
        except (TypeError, ValueError):
            return None
    if isinstance(value, str):
        try:
            date.fromisoformat(value)
        except ValueError:
            return None
        return value
    return None


def recoerce_column(rows: list[Row], column_id: str, new_type: ColumnType) -> None:
    """Convert every row's value for `column_id` in place, blanking what cannot."""
    for row in rows:
        if column_id not in row.cells:
            continue
        converted = _reparse(row.cells[column_id], new_type)
        if converted is None:
            del row.cells[column_id]
        else:
            row.cells[column_id] = converted


# ── lookups ───────────────────────────────────────────────────────────────────


def find_sheet(sheets: list[Sheet], sheet_id: str) -> Sheet:
    for sheet in sheets:
        if sheet.id == sheet_id:
            return sheet
    raise FileNotFoundError(f"sheet not found: {sheet_id}")


def find_tab(tabs: list[Tab], tab_id: str) -> Tab:
    for tab in tabs:
        if tab.id == tab_id:
            return tab
    raise FileNotFoundError(f"tab not found: {tab_id}")


def find_column(columns: list[Column], column_id: str) -> Column:
    for column in columns:
        if column.id == column_id:
            return column
    raise FileNotFoundError(f"column not found: {column_id}")


def find_row(rows: list[Row], row_id: str) -> Row:
    for row in rows:
        if row.id == row_id:
            return row
    raise FileNotFoundError(f"row not found: {row_id}")
