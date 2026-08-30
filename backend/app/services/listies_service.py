"""Business logic for Listies.

Raises stdlib exceptions only — routers translate them into HTTP responses.
`coerce_value` guards every write of a cell; `recoerce_column` reuses it so a
column retype and an ordinary edit can never disagree about what a type means.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from app.repositories import listies_repo as repo
from app.schemas.listies import (
    CellValue,
    Column,
    ColumnSpec,
    ColumnType,
    Row,
    Sheet,
    SheetSummary,
    Tab,
)


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


# ── sheets ────────────────────────────────────────────────────────────────────

_FIRST_TAB_NAME = "Tab 1"


def _clean_name(name: str, what: str) -> str:
    cleaned = name.strip()
    if not cleaned:
        raise ValueError(f"{what} must not be blank")
    return cleaned


def build_columns(specs: list[ColumnSpec]) -> list[Column]:
    """Mint columns from client-supplied specs, rejecting blank/duplicate names.

    Shared by sheet creation and tab creation so both enforce the same rules.
    """
    if not specs:
        raise ValueError("a tab needs at least one column")

    columns: list[Column] = []
    seen: set[str] = set()
    for order, spec in enumerate(specs):
        name = _clean_name(spec.name, "column name")
        if name.casefold() in seen:
            raise ValueError(f"duplicate column name: {name}")
        seen.add(name.casefold())
        columns.append(Column(id=new_id("c"), name=name, type=spec.type, order=order))
    return columns


def list_sheets(username: str) -> list[SheetSummary]:
    return [
        SheetSummary(
            id=sheet.id,
            name=sheet.name,
            tab_count=len(sheet.tabs),
            row_count=sum(len(tab.rows) for tab in sheet.tabs),
            created_at=sheet.created_at,
        )
        for sheet in repo.read_doc(username).sheets
    ]


def create_sheet(username: str, name: str, columns: list[ColumnSpec]) -> Sheet:
    """Create a sheet whose first tab carries `columns`.

    Columns belong to the tab, not the sheet (FR-13) — these seed "Tab 1".
    """
    sheet = Sheet(
        id=new_id("s"),
        name=_clean_name(name, "sheet name"),
        created_at=now_iso(),
        tabs=[
            Tab(
                id=new_id("tb"),
                name=_FIRST_TAB_NAME,
                order=0,
                columns=build_columns(columns),
                rows=[],
            )
        ],
    )
    doc = repo.read_doc(username)
    doc.sheets.append(sheet)
    repo.write_doc(username, doc)
    return sheet


def update_sheet(username: str, sheet_id: str, name: str) -> Sheet:
    doc = repo.read_doc(username)
    sheet = find_sheet(doc.sheets, sheet_id)
    sheet.name = _clean_name(name, "sheet name")
    repo.write_doc(username, doc)
    return sheet


def delete_sheet(username: str, sheet_id: str) -> None:
    doc = repo.read_doc(username)
    sheet = find_sheet(doc.sheets, sheet_id)
    doc.sheets.remove(sheet)
    repo.write_doc(username, doc)


# ── rows ──────────────────────────────────────────────────────────────────────


def get_sheet(username: str, sheet_id: str) -> Sheet:
    return find_sheet(repo.read_doc(username).sheets, sheet_id)


def _coerce_cells(tab: Tab, cells: dict[str, object]) -> dict[str, CellValue]:
    """Validate a partial cell payload against the tab's columns.

    An unknown column id is a client error, not a silently-ignored key, so it
    raises. Empty values are pruned — an absent key is exactly `None`.
    """
    by_id = {column.id: column for column in tab.columns}
    coerced: dict[str, CellValue] = {}
    for column_id, value in cells.items():
        column = by_id.get(column_id)
        if column is None:
            raise ValueError(f"unknown column: {column_id}")
        result = coerce_value(value, column.type)
        if result is not None:
            coerced[column_id] = result
    return coerced


def create_row(
    username: str,
    sheet_id: str,
    tab_id: str,
    cells: dict[str, object] | None = None,
) -> Row:
    doc = repo.read_doc(username)
    tab = find_tab(find_sheet(doc.sheets, sheet_id).tabs, tab_id)

    stamp = now_iso()
    row = Row(
        id=new_id("r"),
        # Past the highest existing order, not `len(rows)`: a deletion leaves
        # gaps, and `len` would collide with a surviving row's order.
        order=max((r.order for r in tab.rows), default=-1) + 1,
        cells=_coerce_cells(tab, cells or {}),
        created_at=stamp,
        updated_at=stamp,
    )
    tab.rows.append(row)
    repo.write_doc(username, doc)
    return row


def update_row_cells(
    username: str,
    sheet_id: str,
    tab_id: str,
    row_id: str,
    cells: dict[str, object],
) -> Row:
    """Merge `cells` into a row — only the provided keys are touched.

    A provided key whose value is empty clears that cell (the key is removed);
    keys that are absent from the payload keep whatever they held. Validation
    runs over the whole payload before anything is applied, so a rejected
    update leaves the row exactly as it was.
    """
    doc = repo.read_doc(username)
    tab = find_tab(find_sheet(doc.sheets, sheet_id).tabs, tab_id)
    row = find_row(tab.rows, row_id)

    by_id = {column.id: column for column in tab.columns}
    validated: dict[str, CellValue] = {}
    for column_id, value in cells.items():
        column = by_id.get(column_id)
        if column is None:
            raise ValueError(f"unknown column: {column_id}")
        validated[column_id] = coerce_value(value, column.type)

    for column_id, value in validated.items():
        if value is None:
            row.cells.pop(column_id, None)
        else:
            row.cells[column_id] = value

    row.updated_at = now_iso()
    repo.write_doc(username, doc)
    return row


def delete_row(username: str, sheet_id: str, tab_id: str, row_id: str) -> None:
    doc = repo.read_doc(username)
    tab = find_tab(find_sheet(doc.sheets, sheet_id).tabs, tab_id)
    tab.rows.remove(find_row(tab.rows, row_id))
    repo.write_doc(username, doc)
