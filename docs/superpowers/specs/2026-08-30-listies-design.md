# Listies — Design Spec

**Date:** 2026-08-30
**Status:** Approved (brainstorming complete)
**App id:** `listies`

## Problem

The dock has no place to keep structured, tabular information. Spreadsheets are the obvious
tool for it, but a general spreadsheet is heavy and looks like a spreadsheet. Listies is a
list-maker with spreadsheet mechanics — typed columns, inline editing, keyboard navigation,
tabs — presented as a dense but deliberately designed grid rather than a grey office table.

## Scope

A user keeps multiple named **sheets**. The main screen lists their sheets and lets them create
a new one (name + a set of custom columns, each with a type) or delete an old one. Opening a
sheet shows a **grid** of rows for the currently selected **tab**; tabs are switched from a bar
at the **bottom** of the screen.

Each **tab owns its own columns** — a sheet is a container, not a fixed table shape. When
creating a new tab the user can copy an existing tab's column setup instead of defining columns
from scratch.

Column types: **text**, **number**, **date**, and **place** — a place cell holds a location
found through Google Places, and a tab's places can be shown together on a map beside the grid.

**In v1:** sheet CRUD, tab create/rename/delete, column add/rename/retype/reorder/delete,
row add/edit/delete, inline keyboard-driven cell editing, view-only sort by column, place
columns with Google Places search, and the map pane.

**Not in v1** (candidates for a later epic): drag-to-reorder rows, duplicate a row, formulas,
cell formatting, CSV import/export, filtering, more column types (checkbox, select, currency),
multi-cell selection and copy/paste, undo, directions/routing between places, place photos or
live ratings.

## Requirements

### Functional

**F1 — App integration & identity**
- FR-1: Registered in the Application Dock shell (landing-page card + its own route).
- FR-2: All data is bound to the logged-in user — scoped by the JWT username via
  `get_current_user`. No `user` field is accepted in any path or body.

**F2 — Sheets**
- FR-3: A user can create a sheet with a **name** and a set of **custom columns**, each with a
  name and a type (`text` | `number` | `date`). Those columns seed the sheet's first tab.
- FR-4: The main screen lists the user's sheets and opens one on selection; an empty state
  prompts the first sheet.
- FR-5: A user can rename a sheet and delete one (delete requires confirmation).

**F3 — The grid**
- FR-6: The selected tab renders as a dense grid — sticky header row, gridlines, zebra rows —
  and the user can add rows.
- FR-7: Cells are edited **inline** with a type-aware editor; a commit persists the changed
  cells of that row.
- FR-8: The grid is keyboard-navigable: Tab / Shift-Tab move across, Enter moves down, Esc
  cancels; typing in the trailing empty row appends a real row.
- FR-9: A row can be deleted.
- FR-10: A tab's columns can be added, renamed, retyped, reordered and deleted after creation
  (deleting confirms first; a tab always keeps at least one column).
- FR-11: Rows can be sorted by a column — type-aware, ascending / descending / none. The sort
  is a **view**; it does not rewrite stored row order.

**F5 — Places & maps**
- FR-15: A **`place` column type** whose cell holds a structured snapshot of a location —
  `place_id`, `name`, `address`, `lat`, `lng`.
- FR-16: Editing a place cell **searches Google Places by text**; picking a result fills the cell.
- FR-17: A tab with at least one place column can open a **map pane beside the grid**, toggled
  from the tab toolbar, showing a pin per non-empty place cell.
- FR-18: While the pane is open the grid carries a per-row **"on map" checkbox** (with all / none
  controls) choosing which places are currently plotted.
- FR-19: **Marker ↔ row selection** — clicking a marker highlights and scrolls to its row;
  selecting a row pans the map to its pin.
- FR-20: Maps credentials come from **server configuration**; with them unset the place type and
  the map are simply unavailable and the rest of the app is unaffected.

**F4 — Tabs**
- FR-12: A sheet has a bottom-anchored **tab bar**; the user switches tabs there and creates a
  new named tab with its own columns.
- FR-13: When creating a tab, the user can **copy the column setup** of an existing tab in the
  same sheet.
- FR-14: A tab can be renamed and deleted (confirmation; the last remaining tab cannot be
  deleted).

### Non-functional

- NFR-1: **Desktop / wide-first.** The grid is designed for a laptop screen; on narrow screens
  it scrolls horizontally rather than reflowing.
- NFR-2: **Per-user isolation.** One JSON file per user at
  `DATA_DIR/listies/users/{username}.json`, its name derived from the JWT, never from input.
- NFR-3: **JSON files on disk, atomic writes, no database.** All writes go through
  `_atomic_write_json`; only the repository touches the filesystem.
- NFR-4: **Platform conformance.** Strict 3-layer backend (stdlib exceptions become
  `HTTPException` only in routers); `useApi` as the single HTTP boundary; registry + lazy
  routes; Pinia store exposing `loading`/`error`; snake_case JSON, direct serialization, no
  envelopes, `{detail}` errors, ISO-8601 timestamps; every route behind
  `Depends(get_current_user)`.
- NFR-6: **External API cost and exposure are controlled.** Place search is proxied server-side
  so the server key never reaches the browser; the browser key is referrer-restricted and served
  at runtime rather than baked into the bundle; search is debounced client-side and cached
  server-side by query, so retyping does not re-bill. Places are stored as snapshots — nothing is
  re-fetched in the background.
- NFR-5: **The grid never blocks on the network.** Cell commits are optimistic — the grid
  updates immediately, the store reconciles on success and rolls the cell back on failure,
  surfacing the message in `error`.

### Architecture

- AR-1: **App registration** — `registry.ts` entry, lazy routes, `_APPS` entry in
  `routers/shell.py`, backend `routers/listies.py` under `/api/listies`,
  `frontend/src/apps/listies/`, `docs/stories/listies/{for-review,done}/`.
- AR-2: **Data layout** — one file per user at `DATA_DIR/listies/users/{username}.json`; the
  repo `mkdir(parents=True, exist_ok=True)` on write and returns an empty document
  (`{schema_version, sheets: []}`) for a user with no file.
- AR-3: **Layer split** — `repositories/listies_repo.py` (only FS access, atomic writes),
  `services/listies_service.py` (all logic, stdlib exceptions), `schemas/listies.py`
  (Pydantic v2). Stable ids: sheets `s-{uuid8}`, tabs `tb-{uuid8}`, columns `c-{uuid8}`, rows
  `r-{uuid8}`. Top-level `schema_version` with `migrate()` on read.
- AR-4: **API contract** — `/api/listies/*`, every route `Depends(get_current_user)`.
- AR-6: **Places integration** — `services/places_service.py` (the only module that calls
  Google), `httpx` promoted from a dev dependency to a runtime one, `settings.google_maps_server_key`
  and `settings.google_maps_browser_key` from env, passed through in `docker-compose.yml`.
- AR-7: **The cell value union widens** to include a `Place` object. This is additive — a document
  written before places still validates — so `schema_version` stays `1`.
- AR-5: **Cells are keyed by column id**, never by index or name — so renaming, reordering and
  deleting columns never disturbs row data.

## Data model

One JSON file per user — `DATA_DIR/listies/users/{username}.json`:

```jsonc
{
  "schema_version": 1,
  "sheets": [
    {
      "id": "s-ab12cd34",
      "name": "Trip planning",
      "created_at": "2026-08-30T10:00:00Z",
      "tabs": [
        {
          "id": "tb-1f2e3d4c",
          "name": "Packing",
          "order": 0,
          "columns": [
            { "id": "c-9a8b7c6d", "name": "Item", "type": "text",   "order": 0 },
            { "id": "c-4d5e6f70", "name": "Qty",  "type": "number", "order": 1 },
            { "id": "c-11223344", "name": "Due",  "type": "date",   "order": 2 }
          ],
          "rows": [
            {
              "id": "r-5e6f7a8b",
              "order": 0,
              "cells": {                       // keyed by column id (AR-5)
                "c-9a8b7c6d": "Tent",
                "c-4d5e6f70": 1,
                "c-11223344": "2026-09-02",
                "c-7f8e9d0a": {                // a `place` cell (FR-15)
                  "place_id": "ChIJ…",
                  "name": "Blue Bottle",
                  "address": "Rua Nova 12, Lisboa",
                  "lat": 38.7107,
                  "lng": -9.1373
                }
              },
              "created_at": "…",
              "updated_at": "…"
            }
          ]
        }
      ]
    }
  ]
}
```

**Cell value representation by column type:**

| Type | Stored as | Empty |
|---|---|---|
| `text` | JSON string | `null` (an empty/whitespace string normalizes to `null`) |
| `number` | JSON number (int or float) | `null` |
| `date` | `YYYY-MM-DD` string | `null` |
| `place` | object — `place_id`, `name`, `address`, `lat`, `lng` | `null` |

`null` means "not filled in" and is distinct from `0` or `""` — the same rule the archery app
applies to unentered shots. A cell key that is absent from `cells` is equivalent to `null`;
the service prunes keys whose value is `null` so files stay small, and prunes keys for columns
that no longer exist.

**Type coercion on a column type change** (FR-10) — keep what still parses, blank the rest:

| From → To | Rule |
|---|---|
| any → `text` | `str(value)`, or the place's `name` — nothing is silently mangled |
| `text`/`date` → `number` | parse as a number; unparseable → `null` |
| `text`/`number` → `date` | parse as `YYYY-MM-DD`; unparseable → `null` |
| `place` → `number`/`date` | always `null` |
| anything → `place` | always `null` — a place cannot be reconstructed from a string |

## API

All routes under `/api/listies`, all `Depends(get_current_user)`, all returning direct
serializations and `{detail}` on error.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/sheets` | — | `list[SheetSummary]` (`id`, `name`, `tab_count`, `row_count`, `created_at`) |
| POST | `/sheets` | `{name, columns: [{name, type}]}` | `Sheet` (with a first tab, default name "Tab 1") |
| GET | `/sheets/{sheet_id}` | — | `Sheet` (tabs, columns and rows) |
| PUT | `/sheets/{sheet_id}` | `{name?}` | `Sheet` |
| DELETE | `/sheets/{sheet_id}` | — | `204` |
| POST | `/sheets/{sid}/tabs` | `{name, columns?, copy_columns_from?}` | `Tab` |
| PUT | `/sheets/{sid}/tabs/{tid}` | `{name?}` | `Tab` |
| DELETE | `/sheets/{sid}/tabs/{tid}` | — | `204` (`422` if it is the last tab) |
| POST | `/sheets/{sid}/tabs/{tid}/columns` | `{name, type}` | `Tab` |
| PUT | `/sheets/{sid}/tabs/{tid}/columns/order` | `{column_ids: [...]}` | `Tab` |
| PUT | `/sheets/{sid}/tabs/{tid}/columns/{cid}` | `{name?, type?}` | `Tab` |
| DELETE | `/sheets/{sid}/tabs/{tid}/columns/{cid}` | — | `204` (`422` if it is the last column) |
| POST | `/sheets/{sid}/tabs/{tid}/rows` | `{cells?}` | `Row` |
| PUT | `/sheets/{sid}/tabs/{tid}/rows/{rid}` | `{cells}` | `Row` (merges only the provided keys) |
| DELETE | `/sheets/{sid}/tabs/{tid}/rows/{rid}` | — | `204` |
| GET | `/maps-config` | — | `{enabled}` — plus `browser_key` when enabled |
| GET | `/places/search?q=&near=` | — | `list[PlaceResult]` (`place_id`, `name`, `address`, `lat`, `lng`) |

Column-mutating endpoints return the whole `Tab` because a rename, retype or reorder can change
several rows and the column list at once; the client replaces the tab wholesale.

**Route ordering note:** `/columns/order` must be declared *before* `/columns/{column_id}` or
FastAPI will match `order` as a column id.

**Places endpoints.** `/places/search` proxies the Google Places **Text Search** endpoint with
the server key, normalizes the response to the five fields above, and caches by `(q, near)` with
a TTL. `near` (a `lat,lng` pair) biases results toward the places already in that column, so
"cafe" means the right cafés. With the keys unconfigured both endpoints answer honestly —
`/maps-config` returns `{enabled: false}` and `/places/search` returns `503` — and nothing else
in the app changes. An upstream failure or timeout is a `502` `{detail}`; a blank `q` is a `422`.
The server key never appears in any response body.

**Status codes:** `404` for a sheet / tab / column / row id not present in the caller's
document (which also covers another user's ids — the file comes from the token). `422` for a
blank name, a column name duplicated within its tab, an unknown column type, a value that does
not fit its column's type, deleting the last tab or the last column, a `column_ids` reorder
payload that is not a permutation of the tab's current columns, or a tab creation supplying both
or neither of `columns` and `copy_columns_from`.

## Backend structure

```
routers/listies.py        HTTP only; stdlib exceptions → HTTPException here
services/listies_service.py   sheet/tab/column/row logic, id minting, type coercion,
                              validation; raises ValueError / FileNotFoundError
services/places_service.py    the ONLY module that calls Google; search + TTL cache +
                              config reporting; raises ValueError / RuntimeError
repositories/listies_repo.py  the only filesystem access; read_doc / write_doc / migrate
schemas/listies.py        Pydantic v2 models + request bodies
```

The service holds the coercion helpers (`coerce_value(value, type)` and
`recoerce_column(rows, column, new_type)`) so both the write path and the retype path share one
implementation.

## Frontend structure

```
src/apps/listies/
├── types.ts                     Sheet, Tab, Column, Row, ColumnType, CellValue
├── coerce.ts (+ spec)           parse/format per type; date display "02 Sep 26"
├── maps.ts (+ spec)             lazy Maps JS SDK loader (loads once), marker helpers
├── sort.ts (+ spec)             type-aware comparator + sortRowIds()
├── composables/
│   └── useGridNavigation.ts (+ spec)   focus model, Tab/Enter/Esc semantics
├── stores/useListiesStore.ts (+ spec)  loading/error, all HTTP via useApi
├── pages/
│   ├── ListiesHomePage.vue (+ spec)    sheet list, create, rename, delete
│   └── SheetPage.vue (+ spec)          grid + tab bar for /listies/sheets/:sheetId
└── components/
    ├── SheetGrid.vue (+ spec)          the grid, sticky header, zebra rows
    ├── GridCell.vue (+ spec)           one cell: display + type-aware editor
    ├── ColumnBuilder.vue (+ spec)      name/type rows, reusable by sheet & tab creation
    ├── PlaceCell.vue (+ spec)          place search dropdown + selected-place display
    ├── MapPane.vue (+ spec)            the split-view map: markers, bounds, selection
    ├── ColumnHeaderMenu.vue (+ spec)   rename / retype / move / delete a column
    ├── CreateSheetDialog.vue (+ spec)  name + ColumnBuilder
    ├── CreateTabDialog.vue (+ spec)    name + (copy columns from tab | ColumnBuilder)
    └── TabBar.vue (+ spec)             bottom-anchored tab chips, +, per-tab menu
```

Pure logic (`coerce.ts`, `sort.ts`, `useGridNavigation.ts`) is deliberately outside components
so the fiddly parts — type parsing, comparators, focus movement — are unit-tested without
mounting a grid.

**Store shape.** One `useListiesStore` exposing `sheets` (summaries), `currentSheet`,
`activeTabId`, `loading`, `error`, and actions for every endpoint. Every async action sets
`loading` in a `try/finally` and routes errors into `error.value`. Cell commits are optimistic:
the store writes the new value into `currentSheet` immediately, fires the request, and on
failure restores the previous value and sets `error` (NFR-5).

## Interaction design

**Editing.** Click a cell to edit in place. The editor matches the column type: a plain input
for text, a numeric input for number, a date picker for date. A commit (Tab, Enter, or blur)
sends only that row's changed cells; Esc reverts the cell and leaves edit mode.

**Keyboard model** (`useGridNavigation`):

| Key | Behaviour |
|---|---|
| `Tab` | commit, move one cell right; from the last column, wrap to the first cell of the next row |
| `Shift+Tab` | commit, move one cell left; from the first column, wrap to the last cell of the previous row |
| `Enter` | commit, move one cell down; from the last row, move into the trailing empty row |
| `Esc` | revert the cell, leave edit mode, keep focus |
| `↑ ↓ ← →` | move between cells when *not* editing |

**The trailing empty row.** The grid always renders one empty "ghost" row after the last real
row. Typing into it creates a real row (`POST .../rows`) with that value and a fresh ghost row
appears beneath. This is what makes continuous data entry work without reaching for a button;
an explicit "+ row" button also exists for discoverability.

**Sorting.** Clicking a header cycles none → ascending → descending → none. The sort produces a
**display order of row ids**, recomputed only when the sort spec changes — so editing a cell
never makes the row jump out from under the cursor. Added rows append to the end of the display
order; deleted rows are removed from it. Nulls sort last in both directions. Comparators are
type-aware: numeric for `number`, chronological for `date`, locale-aware case-insensitive for
`text`.

**Filling a place cell.** Clicking a place cell opens a search field; typing at least two
characters, debounced, queries `/places/search` and drops a result list below the cell (name in
full, address muted). Arrow keys and Enter pick one — the same keyboard grammar as the rest of
the grid — and the chosen place is written through the ordinary row-cells `PUT`. Esc closes the
list without changing the cell.

**The map pane.** A `Map` toggle in the tab toolbar (shown only when the tab has a place column
and maps are configured) splits the view: grid left, map right. Closing it returns the grid to
full width, and the Maps SDK is only loaded the first time a pane is opened. Open state is
remembered per tab for the session. The pane fits its bounds to the shown pins when it opens,
plots one marker per non-empty place cell — colour-coded per column when a tab has more than one
place column — and labels each marker with the row's first text value, falling back to the
place's own name. Clicking a marker highlights its row and scrolls the grid to it; selecting a
row pans to its pin.

**Choosing what's plotted.** While the pane is open the grid grows a leading checkbox column,
one tick per row that holds at least one place, all ticked by default, with all / none in the
pane header and a "4 of 7 shown" counter. Like sorting, this is view state: it is never written
to the file and resets when the tab changes. Toggling a pin does not re-fit the bounds (that
would make the map jump under the cursor); an explicit "fit to shown" control does it on demand.

## Visual direction

Dense grid, deliberately styled — not a soft card list:

- Sticky header row that stays put while rows scroll; the sheet name and tab bar frame it.
- Real gridlines and subtle zebra striping, tuned for the shell's dark theme.
- Numbers right-aligned in tabular figures; dates rendered `02 Sep 26`; empty cells show a
  muted `—` rather than blank space.
- A small type glyph in each column header (`Aa`, `#`, `▤`) so the shape of the table is
  readable at a glance.
- The focused cell gets a crisp accent ring, not a browser default outline.
- The active tab chip at the bottom is filled; the others are outlined.
- A place cell shows a 📍 glyph and the place name on the first line, the address muted beneath
  it; an empty place cell is the same muted `—` as every other type.

## Testing

**Backend** (`backend/tests/test_listies_*.py`, `tmp_path` + `monkeypatch` on
`settings.data_dir`): repo round-trip and the empty-document case; per-user isolation at the API
layer (a second user's token sees nothing); sheet/tab/column/row CRUD; validation (`422` for a
blank name, a bad type, a value that does not fit its column, the last tab, the last column, a
bad reorder payload); type-coercion behaviour on retype; `404` for unknown ids.

**Places** — no test ever calls Google. `places_service` is tested against a stubbed `httpx`
transport: normalization of the upstream payload, the cache hit/miss/expiry paths, `503` when
unconfigured, `502` on an upstream error or timeout, `422` on a blank query, and the assertion
that no response body contains the server key.

**Frontend** (co-located `*.spec.ts`): `coerce.spec.ts` and `sort.spec.ts` cover the pure logic
exhaustively (each type, nulls, unparseable input); `useGridNavigation.spec.ts` covers the focus
model including wrapping and the ghost row; the store spec covers `loading`/`error` and the
optimistic rollback; component specs cover rendering, the empty states, the create dialogs, the
header menu, and the tab bar.

## Epics

Full breakdown in `docs/planning-artifacts/epics-listies.md`; stories in `docs/stories/listies/`.

- **Epic 1 — Foundation & Sheets** (1.1–1.4): register the app, stand up the per-user data
  layer, create a sheet with custom columns, pick one, rename and delete.
- **Epic 2 — The Grid** (2.1–2.6): render a tab as a grid, add rows, edit cells inline, keyboard
  navigation, delete rows, manage columns, sort by column.
- **Epic 3 — Tabs** (3.1–3.3): the bottom tab bar and creating tabs, copying another tab's
  columns, renaming and deleting tabs.
- **Epic 4 — Places & Maps** (4.1–4.5): maps configuration and the proxied search endpoint, the
  `place` column type, searching Google to fill a place cell, the map pane beside the grid, and
  choosing which places are plotted.

Epic 2 depends on Epic 1 (needs the data layer and an open sheet). Epic 3 depends on both. Epic 4
depends on Epics 1–2 (needs columns and the grid) but not on Epic 3. No epic depends on a later
one.
