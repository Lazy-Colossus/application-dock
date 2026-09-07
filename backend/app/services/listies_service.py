"""Business logic for Listies.

Raises stdlib exceptions only — routers translate them into HTTP responses.
`coerce_value` guards every write of a cell; `recoerce_column` reuses it so a
column retype and an ordinary edit can never disagree about what a type means.
"""

from __future__ import annotations

import re
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, date, datetime

from pydantic import ValidationError as PydanticValidationError

from app.repositories import listies_repo as repo
from app.schemas.listies import (
    HEX_COLOR_PATTERN,
    CellValue,
    Column,
    ColumnSpec,
    ColumnType,
    Place,
    PlaceGroup,
    Row,
    SharedSheetDoc,
    Sheet,
    SheetSummary,
    SheetView,
    Tab,
)
from app.services import auth_service
from app.services import listies_events as events


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

    if column_type == "place":
        return _as_place(value)

    # A place is never a valid scalar: it would silently become "Place(...)".
    if isinstance(value, Place) or _looks_like_place(value):
        raise ValueError(f"expected {column_type}, got a place")

    if column_type == "place_group":
        # A group cell holds a group id (a string). Whether that id still names
        # a live group is not checked here — a dangling id reads as ungrouped,
        # not an error (Story 4.6). Empty is `None`, like every other type.
        if not isinstance(value, str):
            raise ValueError(f"expected a group id, got {type(value).__name__}")
        return value if value.strip() else None

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


def _looks_like_place(value: object) -> bool:
    return isinstance(value, dict) and "place_id" in value


def _as_place(value: object) -> Place | None:
    """Accept a `Place` or the dict form; reject anything else."""
    if value is None:
        return None
    if isinstance(value, Place):
        return value
    if not isinstance(value, dict):
        raise ValueError(f"expected a place, got {type(value).__name__}")
    try:
        return Place.model_validate(value)
    except PydanticValidationError as exc:
        # Pydantic's message names every failing field; keep it short instead.
        raise ValueError("expected a place with place_id, name, lat and lng") from exc


def _group_name(group_id: object, groups: list[PlaceGroup] | None) -> str | None:
    """Resolve a group id to its name, or `None` for a dangling/absent id."""
    for group in groups or []:
        if group.id == group_id:
            return group.name
    return None


def _reparse(
    value: CellValue,
    new_type: ColumnType,
    *,
    old_type: ColumnType | None = None,
    groups: list[PlaceGroup] | None = None,
) -> CellValue:
    """Best-effort conversion used by a retype: keep what parses, else `None`."""
    if value is None:
        return None
    # A group id cannot be reconstructed from a scalar or a place.
    if new_type == "place_group":
        return None
    # Leaving a group: only text survives, carrying the group's name; a dangling
    # id (no longer among the tab's groups) blanks. Everything else blanks too.
    if old_type == "place_group":
        return _group_name(value, groups) if new_type == "text" else None
    if new_type == "place":
        # A place cannot be reconstructed from a string or a number.
        return value if isinstance(value, Place) else None
    if isinstance(value, Place):
        # Only text can hold a place, and it holds the name.
        return value.name if new_type == "text" else None
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


def recoerce_column(
    rows: list[Row],
    column_id: str,
    new_type: ColumnType,
    *,
    old_type: ColumnType | None = None,
    groups: list[PlaceGroup] | None = None,
) -> None:
    """Convert every row's value for `column_id` in place, blanking what cannot.

    `old_type` and `groups` are only consulted when leaving a `place_group`
    column, so a `place_group` → text retype can keep each group's name.
    """
    for row in rows:
        if column_id not in row.cells:
            continue
        converted = _reparse(row.cells[column_id], new_type, old_type=old_type, groups=groups)
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


# ── sheet resolution: private user doc vs shared store (Story 5.1) ───────────────
#
# A sheet_id may live in the caller's own user doc (private) or in the shared
# store (`shared/{sheet_id}.json`) where the caller is a member. Every existing
# tab/column/row operation resolves through here so it need not learn about two
# storage backends. A sheet the caller cannot reach is an indistinguishable 404,
# so sharing never leaks a sheet's existence (FR-2, NFR-2).


def _read_sheet_ctx(username: str, sheet_id: str) -> tuple[Sheet, SharedSheetDoc | None]:
    """Resolve a sheet for reading: caller's private doc → shared store → 404.

    Returns the `Sheet` and its `SharedSheetDoc` (``None`` when private).
    """
    for sheet in repo.read_doc(username).sheets:
        if sheet.id == sheet_id:
            return sheet, None
    shared = repo.read_shared(sheet_id)
    if shared is not None and username in shared.members:
        return shared.sheet, shared
    raise FileNotFoundError(f"sheet not found: {sheet_id}")


@contextmanager
def _write_sheet_txn(username: str, sheet_id: str) -> Iterator[tuple[Sheet, SharedSheetDoc | None]]:
    """Read-modify-write a sheet in whichever store holds it.

    Yields `(sheet, meta)`; `meta` is ``None`` for a private sheet or the
    `SharedSheetDoc` for a shared one. On a shared write, `rev`/`updated_at` are
    bumped after the block succeeds (consumed by Story 5.2). Nothing is written
    if the block raises (the underlying transactions skip their write on error).
    """
    for sheet in repo.read_doc(username).sheets:
        if sheet.id == sheet_id:
            with repo.doc_transaction(username) as doc:
                yield find_sheet(doc.sheets, sheet_id), None
            return
    shared = repo.read_shared(sheet_id)
    if shared is not None and username in shared.members:
        with repo.shared_transaction(sheet_id) as sdoc:
            yield sdoc.sheet, sdoc
            sdoc.rev += 1
            sdoc.updated_at = now_iso()
        # Persisted — tell every other open member to reconcile (Story 5.2).
        events.publish(
            sheet_id,
            {"type": "sheet.changed", "sheet_id": sheet_id, "rev": sdoc.rev, "actor": username},
        )
        return
    raise FileNotFoundError(f"sheet not found: {sheet_id}")


def _sheet_view(sheet: Sheet, meta: SharedSheetDoc | None, username: str) -> SheetView:
    """Project a resolved sheet into the client-facing collaboration view."""
    if meta is None:
        return SheetView(id=sheet.id, name=sheet.name, created_at=sheet.created_at, tabs=sheet.tabs)
    return SheetView(
        id=sheet.id,
        name=sheet.name,
        created_at=sheet.created_at,
        tabs=sheet.tabs,
        shared=True,
        owner=meta.owner,
        members=meta.members,
        rev=meta.rev,
        can_manage=meta.owner == username,
    )


def _require_managed_shared(caller: str, sheet_id: str) -> SharedSheetDoc:
    """Fetch a shared sheet the caller **owns**, for a management operation.

    A caller who is not a member gets `FileNotFoundError` (404 — never leak the
    sheet's existence); a member who is not the owner gets `PermissionError`
    (403). Only the owner manages membership and deletes the sheet (FR-23).
    """
    shared = repo.read_shared(sheet_id)
    if shared is None or caller not in shared.members:
        raise FileNotFoundError(f"sheet not found: {sheet_id}")
    if shared.owner != caller:
        raise PermissionError("only the owner can manage this sheet")
    return shared


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


def _summary(sheet: Sheet, *, shared: bool = False, owner: str | None = None) -> SheetSummary:
    return SheetSummary(
        id=sheet.id,
        name=sheet.name,
        tab_count=len(sheet.tabs),
        row_count=sum(len(tab.rows) for tab in sheet.tabs),
        created_at=sheet.created_at,
        shared=shared,
        owner=owner,
    )


def list_sheets(username: str) -> list[SheetSummary]:
    """The caller's private sheets plus every shared sheet they belong to."""
    summaries = [_summary(sheet) for sheet in repo.read_doc(username).sheets]
    summaries.extend(
        _summary(sdoc.sheet, shared=True, owner=sdoc.owner)
        for sdoc in repo.list_shared_for(username)
    )
    return summaries


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
    with repo.doc_transaction(username) as doc:
        doc.sheets.append(sheet)
    return sheet


def update_sheet(username: str, sheet_id: str, name: str) -> SheetView:
    """Rename a sheet — private or shared. Any member may rename a shared sheet."""
    with _write_sheet_txn(username, sheet_id) as (sheet, meta):
        sheet.name = _clean_name(name, "sheet name")
    return _sheet_view(sheet, meta, username)


def delete_sheet(username: str, sheet_id: str) -> None:
    """Delete a sheet. On a shared sheet this is owner-only (FR-23)."""
    for sheet in repo.read_doc(username).sheets:
        if sheet.id == sheet_id:
            with repo.doc_transaction(username) as doc:
                doc.sheets.remove(find_sheet(doc.sheets, sheet_id))
            return
    _require_managed_shared(username, sheet_id)
    repo.delete_shared(sheet_id)
    # Close every open member's view — the sheet is gone (Story 5.2).
    events.publish(sheet_id, {"type": "sheet.closed", "sheet_id": sheet_id, "reason": "deleted"})


# ── rows ──────────────────────────────────────────────────────────────────────


def get_sheet(username: str, sheet_id: str) -> SheetView:
    sheet, meta = _read_sheet_ctx(username, sheet_id)
    return _sheet_view(sheet, meta, username)


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
    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        tab = find_tab(sheet.tabs, tab_id)

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
    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        tab = find_tab(sheet.tabs, tab_id)
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
    return row


def delete_row(username: str, sheet_id: str, tab_id: str, row_id: str) -> None:
    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        tab = find_tab(sheet.tabs, tab_id)
        tab.rows.remove(find_row(tab.rows, row_id))


# ── columns ───────────────────────────────────────────────────────────────────


def _check_name_is_free(tab: Tab, name: str, *, except_id: str | None = None) -> None:
    """Column names are unique within a tab, compared case-insensitively.

    Case-sensitive matching would happily allow "Item" beside "item", which is
    indistinguishable at a glance in a header row.
    """
    folded = name.casefold()
    for column in tab.columns:
        if column.id != except_id and column.name.casefold() == folded:
            raise ValueError(f"duplicate column name: {name}")


def add_column(
    username: str, sheet_id: str, tab_id: str, name: str, column_type: ColumnType
) -> Tab:
    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        tab = find_tab(sheet.tabs, tab_id)
        cleaned = _clean_name(name, "column name")
        _check_name_is_free(tab, cleaned)

        tab.columns.append(
            Column(
                id=new_id("c"),
                name=cleaned,
                type=column_type,
                # Past the highest existing order — a deletion leaves gaps, so
                # `len(columns)` would collide with a survivor.
                order=max((c.order for c in tab.columns), default=-1) + 1,
            )
        )
    return tab


def update_column(
    username: str,
    sheet_id: str,
    tab_id: str,
    column_id: str,
    name: str | None = None,
    column_type: ColumnType | None = None,
) -> Tab:
    """Rename and/or retype a column.

    A retype re-coerces every row: values that still parse are kept, the rest
    are blanked. Returns the whole tab because one change can touch many rows.
    """
    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        tab = find_tab(sheet.tabs, tab_id)
        column = find_column(tab.columns, column_id)

        if name is not None:
            cleaned = _clean_name(name, "column name")
            _check_name_is_free(tab, cleaned, except_id=column_id)
            column.name = cleaned

        if column_type is not None and column_type != column.type:
            old_type = column.type
            column.type = column_type
            recoerce_column(
                tab.rows, column_id, column_type, old_type=old_type, groups=tab.place_groups
            )

    return tab


def reorder_columns(username: str, sheet_id: str, tab_id: str, column_ids: list[str]) -> Tab:
    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        tab = find_tab(sheet.tabs, tab_id)

        if sorted(column_ids) != sorted(c.id for c in tab.columns):
            raise ValueError("column_ids must be a permutation of the tab's columns")

        positions = {column_id: index for index, column_id in enumerate(column_ids)}
        for column in tab.columns:
            column.order = positions[column.id]

    return tab


def delete_column(username: str, sheet_id: str, tab_id: str, column_id: str) -> None:
    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        tab = find_tab(sheet.tabs, tab_id)
        column = find_column(tab.columns, column_id)

        if len(tab.columns) == 1:
            raise ValueError("a tab must keep at least one column")

        tab.columns.remove(column)
        for row in tab.rows:
            row.cells.pop(column_id, None)


# ── tabs ──────────────────────────────────────────────────────────────────────


def _copied_columns(sheet: Sheet, source_tab_id: str) -> list[Column]:
    """Snapshot another tab's columns with **fresh ids**.

    Fresh ids matter: cells are keyed by column id, so reusing the source's
    ids would make two tabs share keys and turn a later retype in one tab into
    an action at a distance in the other. The copy is structural only.
    """
    source = find_tab(sheet.tabs, source_tab_id)
    return [
        Column(id=new_id("c"), name=column.name, type=column.type, order=column.order)
        for column in sorted(source.columns, key=lambda c: c.order)
    ]


def create_tab(
    username: str,
    sheet_id: str,
    name: str,
    columns: list[ColumnSpec] | None = None,
    copy_columns_from: str | None = None,
) -> Tab:
    """Add a tab with its own columns and no rows.

    Tab names are NOT required to be unique — a tab is identified by its id,
    and two tabs called "Notes" are the user's business, not an error.
    """
    if (columns is None) == (copy_columns_from is None):
        raise ValueError("provide exactly one of columns or copy_columns_from")

    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        new_columns = (
            _copied_columns(sheet, copy_columns_from)
            if copy_columns_from is not None
            else build_columns(columns or [])
        )

        tab = Tab(
            id=new_id("tb"),
            name=_clean_name(name, "tab name"),
            order=max((t.order for t in sheet.tabs), default=-1) + 1,
            columns=new_columns,
            rows=[],
        )
        sheet.tabs.append(tab)
    return tab


def _clean_color(color: str) -> str | None:
    """`#rrggbb`, or `None` when the colour is being cleared."""
    cleaned = color.strip()
    if not cleaned:
        return None
    if not re.fullmatch(HEX_COLOR_PATTERN, cleaned):
        raise ValueError(f"expected a #rrggbb colour, got {color!r}")
    return cleaned.lower()


def update_tab(
    username: str,
    sheet_id: str,
    tab_id: str,
    name: str | None = None,
    color: str | None = None,
    place_groups: list[PlaceGroup] | None = None,
) -> Tab:
    """Rename, recolour and/or set a tab's place groups — only provided fields.

    Setting `place_groups` does NOT rewrite cells: a cell holding the id of a
    now-deleted group simply reads as ungrouped (Story 4.6), so there is no
    cascade write here.
    """
    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        tab = find_tab(sheet.tabs, tab_id)

        if name is not None:
            tab.name = _clean_name(name, "tab name")
        if color is not None:
            tab.color = _clean_color(color)
        if place_groups is not None:
            tab.place_groups = place_groups

    return tab


def delete_tab(username: str, sheet_id: str, tab_id: str) -> None:
    """Remove a tab, its columns and all its rows.

    A sheet always keeps at least one tab — an empty sheet would have nowhere
    to put a row and no columns to define one.
    """
    with _write_sheet_txn(username, sheet_id) as (sheet, _meta):
        tab = find_tab(sheet.tabs, tab_id)

        if len(sheet.tabs) == 1:
            raise ValueError("a sheet must keep at least one tab")

        sheet.tabs.remove(tab)


# ── sharing lifecycle (Story 5.1) ───────────────────────────────────────────────
#
# Only the owner shares, manages membership, and stops sharing. A caller who is
# not a member of a shared sheet is told it does not exist (404); a member who is
# not the owner is refused (403). Target usernames are validated against the
# platform roster before any write, so a bad name leaves membership unchanged.


def _dedupe(usernames: list[str]) -> list[str]:
    """Order-preserving de-duplication (the owner stays first)."""
    seen: set[str] = set()
    return [u for u in usernames if not (u in seen or seen.add(u))]


def _validate_targets(usernames: list[str]) -> None:
    known = set(auth_service.list_usernames())
    for username in usernames:
        if username not in known:
            raise ValueError(f"unknown user: {username}")


def _publish_members(sheet_id: str, members: list[str]) -> None:
    events.publish(sheet_id, {"type": "members.changed", "sheet_id": sheet_id, "members": members})


def share_sheet(owner: str, sheet_id: str, usernames: list[str]) -> SheetView:
    """Share a private sheet the caller owns, or add members to a shared one.

    Promoting a private sheet moves it out of the owner's user doc into
    `shared/{sheet_id}.json`. Re-sharing an already-shared sheet unions the new
    usernames into `members` (FR-22).
    """
    _validate_targets(usernames)

    shared = repo.read_shared(sheet_id)
    if shared is not None:
        # Already shared: gate as a management op, then union the new members.
        _require_managed_shared(owner, sheet_id)
        with repo.shared_transaction(sheet_id) as sdoc:
            for username in usernames:
                if username not in sdoc.members:
                    sdoc.members.append(username)
            sdoc.updated_at = now_iso()
            result = sdoc.model_copy(deep=True)
        _publish_members(sheet_id, result.members)
        return _sheet_view(result.sheet, result, owner)

    # Private → shared: promote out of the owner's user doc.
    with repo.doc_transaction(owner) as doc:
        sheet = find_sheet(doc.sheets, sheet_id)
        doc.sheets.remove(sheet)
        stamp = now_iso()
        shared_doc = SharedSheetDoc(
            sheet=sheet,
            owner=owner,
            members=_dedupe([owner, *usernames]),
            rev=0,
            created_at=stamp,
            updated_at=stamp,
        )
        repo.write_shared(shared_doc)
    return _sheet_view(shared_doc.sheet, shared_doc, owner)


def remove_member(owner: str, sheet_id: str, username: str) -> SheetView:
    """Remove a member from a shared sheet the caller owns (owner-only, FR-22).

    Removing the last non-owner is allowed and leaves the sheet
    shared-with-only-owner; it does not auto-demote. Removing the owner is
    rejected — demotion is only via `stop_sharing`.
    """
    _require_managed_shared(owner, sheet_id)
    if username == owner:
        raise ValueError("the owner cannot be removed; use stop-sharing instead")
    with repo.shared_transaction(sheet_id) as sdoc:
        if username in sdoc.members:
            sdoc.members.remove(username)
        sdoc.updated_at = now_iso()
        result = sdoc.model_copy(deep=True)
    # Remaining members refresh their roster; the removed member's view closes.
    _publish_members(sheet_id, result.members)
    events.publish(
        sheet_id,
        {"type": "sheet.closed", "sheet_id": sheet_id, "reason": "removed", "member": username},
    )
    return _sheet_view(result.sheet, result, owner)


def stop_sharing(owner: str, sheet_id: str) -> SheetView:
    """Demote a shared sheet back into the owner's user doc (owner-only, FR-22).

    The sheet itself survives — this is distinct from deleting it. The shared
    file is removed after the sheet is written back.
    """
    shared = _require_managed_shared(owner, sheet_id)
    with repo.doc_transaction(owner) as doc:
        doc.sheets.append(shared.sheet)
    repo.delete_shared(sheet_id)
    # Members (everyone but the owner) lose access; their open views close.
    events.publish(sheet_id, {"type": "sheet.closed", "sheet_id": sheet_id, "reason": "unshared"})
    return _sheet_view(shared.sheet, None, owner)
