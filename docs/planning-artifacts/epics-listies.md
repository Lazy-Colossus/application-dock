---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - CLAUDE.md
  - docs/superpowers/specs/2026-08-30-listies-design.md
  - docs/planning-artifacts/epics-context-switch.md
---

# Listies (Stylised Sheets) — Epic Breakdown

## Overview

This document is the complete epic and story breakdown for **Listies**, a per-user list/sheet app
shipped as a new self-contained app inside the Application Dock platform.

A user keeps multiple named **sheets**. The main screen lists them and lets the user create a new
one — giving it a name and a set of **custom columns**, each with a type (`text`, `number`,
`date`) — or delete an old one. Opening a sheet shows a **dense, deliberately styled grid**:
sticky header, gridlines, zebra rows, type-aware cells. Rows are filled in **inline** with
spreadsheet keyboard movement (Tab / Shift-Tab / Enter / Esc), and typing in the trailing empty
row appends a new one. A sheet holds several **tabs**, switched from a bar at the **bottom** of
the screen; **each tab owns its own columns**, and a new tab can copy an existing tab's column
setup instead of defining columns from scratch. Everything is **bound to the logged-in user** —
the JWT username scopes a single JSON file per user.

Platform-wide architecture is inherited, not re-built (3-layer backend, `useApi` HTTP boundary,
registry + lazy routes, JWT auth, atomic JSON file persistence). Stories live under
`docs/stories/listies/`.

## Requirements Inventory

### Functional Requirements

**F1 — App Integration & Identity**
- FR-1: App registered in the Application Dock shell (card on the landing page + its own route).
- FR-2: All data is bound to the logged-in user — scoped by the JWT username via
  `get_current_user`; a user only ever sees and mutates their own sheets. No `user` field is
  accepted in any request path or body (it is derived from the token).

**F2 — Sheets**
- FR-3: A user can create a **sheet** with a **name** and a set of **custom columns**, each with a
  name and a type (`text` | `number` | `date`). Those columns seed the sheet's first tab.
- FR-4: The main screen **lists the user's sheets** and opens one on selection; with none yet it
  shows a calm empty state.
- FR-5: A user can **rename** a sheet and **delete** a sheet (delete requires a confirmation).

**F3 — The Grid**
- FR-6: The selected tab renders as a **dense grid** — sticky header row, gridlines, zebra rows —
  and the user can **add rows**.
- FR-7: Cells are edited **inline** with a **type-aware editor**; a commit persists the changed
  cells of that row.
- FR-8: The grid is **keyboard-navigable**: Tab / Shift-Tab move across (wrapping between rows),
  Enter moves down, Esc cancels; typing in the **trailing empty row** appends a real row.
- FR-9: A row can be **deleted**.
- FR-10: A tab's **columns can be managed after creation** — add, rename, change type, reorder,
  delete (delete confirms, since it drops that column's data; a tab always keeps at least one
  column).
- FR-11: Rows can be **sorted by a column** — type-aware, ascending / descending / none. The sort
  is a **view**; it never rewrites stored row order.

**F4 — Tabs**
- FR-12: A sheet has a **bottom-anchored tab bar**; the user switches tabs there and creates a new
  **named tab with its own columns**.
- FR-13: When creating a tab, the user can **copy the column setup** of an existing tab in the same
  sheet.
- FR-14: A tab can be **renamed** and **deleted** (confirmation; the **last remaining tab cannot be
  deleted**).

### NonFunctional Requirements

- NFR-1: **Desktop / wide-first** — the grid is designed for a laptop screen; on narrow screens it
  scrolls horizontally rather than reflowing into cards.
- NFR-2: **Per-user isolation** — one JSON file per user at
  `DATA_DIR/listies/users/{username}.json`; the filename is derived from the JWT, never from
  input.
- NFR-3: **JSON files on disk, atomic writes, no database** — all writes go through the platform's
  `_atomic_write_json` (write-`.tmp`-then-`os.replace`); repo-only file I/O.
- NFR-4: **Platform conformance** — strict 3-layer backend (router → service → repo, stdlib
  exceptions become `HTTPException` only in routers); `useApi` single HTTP boundary; registry +
  lazy routes; Pinia store exposes `loading`/`error`; snake_case JSON, direct serialization (no
  envelopes), `{detail}` errors, ISO-8601 timestamps; all routes behind
  `Depends(get_current_user)`.
- NFR-5: **The grid never blocks on the network** — cell commits are optimistic: the grid updates
  immediately, the store reconciles on success and rolls the cell back on failure, surfacing the
  message in `error`.

### Additional (Architecture) Requirements

- AR-1: **App registration** — registry entry + lazy routes + backend `routers/listies.py` mounted
  under `/api/listies` + `apps/listies/` frontend skeleton + `_APPS` entry in `routers/shell.py` +
  `docs/stories/listies/{for-review,done}/`.
- AR-2: **Data layout** — writable per-user file under `DATA_DIR/listies/users/{username}.json`;
  the repo `mkdir(parents=True, exist_ok=True)` on write and returns an empty document
  (`{schema_version, sheets: []}`) when a user has no file yet.
- AR-3: **Repository / service / schemas split** — `repositories/listies_repo.py` (only FS access,
  atomic writes), `services/listies_service.py` (sheet/tab/column/row logic, type coercion; raises
  stdlib exceptions), `schemas/listies.py` (Pydantic v2 models). Stable IDs: sheets `s-{uuid8}`,
  tabs `tb-{uuid8}`, columns `c-{uuid8}`, rows `r-{uuid8}`. Top-level `schema_version` with a
  `migrate()` on read.
- AR-4: **API contract** — `/api/listies/*`, every route `Depends(get_current_user)`; the username
  scopes the file and never appears in a path/body. Direct serialization; `{detail}` errors.
- AR-5: **Cells are keyed by column id** — never by index or column name — so renaming, reordering
  and deleting columns never disturbs row data.

### Data Model

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
          "order": 0,                               // position in the bottom tab bar (FR-12)
          "columns": [                              // per-tab, not per-sheet (FR-13)
            { "id": "c-9a8b7c6d", "name": "Item", "type": "text",   "order": 0 },
            { "id": "c-4d5e6f70", "name": "Qty",  "type": "number", "order": 1 },
            { "id": "c-11223344", "name": "Due",  "type": "date",   "order": 2 }
          ],
          "rows": [
            {
              "id": "r-5e6f7a8b",
              "order": 0,                           // stored order; sorting is a view (FR-11)
              "cells": {                            // keyed by column id (AR-5)
                "c-9a8b7c6d": "Tent",
                "c-4d5e6f70": 1,
                "c-11223344": "2026-09-02"
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

**Cell values by column type** — `text` → JSON string, `number` → JSON number, `date` →
`YYYY-MM-DD` string. `null` means "not filled in" and is distinct from `0` or `""` (an
empty/whitespace text value normalizes to `null`). An absent key is equivalent to `null`; the
service prunes `null` keys and keys for columns that no longer exist.

**Type coercion on a column retype (FR-10)** — keep what still parses, blank the rest: any →
`text` is `str(value)`; → `number` parses the value as a number, unparseable → `null`; → `date`
parses `YYYY-MM-DD`, unparseable → `null`.

### FR Coverage Map

- FR-1: Epic 1 — app registered in the shell
- FR-2: Epic 1 — per-user scoping via JWT username
- FR-3: Epic 1 — create a sheet with a name and custom typed columns
- FR-4: Epic 1 — main screen lists sheets and opens one
- FR-5: Epic 1 — rename / delete a sheet
- FR-6: Epic 2 — the dense grid + adding rows
- FR-7: Epic 2 — inline type-aware cell editing
- FR-8: Epic 2 — keyboard navigation + the trailing empty row
- FR-9: Epic 2 — delete a row
- FR-10: Epic 2 — column management (add / rename / retype / reorder / delete)
- FR-11: Epic 2 — sort by column (view-only)
- FR-12: Epic 3 — bottom tab bar, switching, creating a tab
- FR-13: Epic 3 — create a tab copying another tab's columns
- FR-14: Epic 3 — rename / delete a tab

## Epic List

### Epic 1: Foundation & Sheets
Register Listies in the dock, stand up the per-user data layer, and let a user create a sheet with
its own custom typed columns, pick one, rename it, and delete it. Delivers app registration, the
repository/service/schemas, the JWT-scoped per-user file, and the sheet-list home.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5
**Supporting:** AR-1, AR-2, AR-3, AR-4, AR-5; NFR-2, NFR-3, NFR-4.

### Epic 2: The Grid
Inside a sheet, the selected tab becomes a working grid: rows render densely with type-aware
cells, cells are edited inline and persist optimistically, the keyboard moves the way it does in a
spreadsheet, rows can be deleted, columns can be reshaped after the fact, and any column can sort
the view. The whole data-entry experience.
**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-10, FR-11
**Supporting:** NFR-1, NFR-4, NFR-5.

### Epic 3: Tabs
One sheet stops being one table. A bar at the bottom of the sheet holds the sheet's tabs; the user
switches between them, adds a new one with its own columns or with a copy of an existing tab's
setup, and renames or removes tabs as the sheet evolves.
**FRs covered:** FR-12, FR-13, FR-14
**Supporting:** NFR-1, NFR-4.

**Dependencies:** Epic 2 builds on Epic 1 (needs the data layer and an open sheet). Epic 3 builds
on both (needs a sheet whose grid already renders one tab). No epic depends on a later epic.

---

## Epic 1: Foundation & Sheets

A logged-in user can open Listies and manage their own named sheets — everything scoped to their
account.

### Story 1.1: Register Listies in the Application Dock shell

As a user,
I want Listies to appear as an app in the dock and open to its own home,
so that I can launch it like any other app in the platform.

**Acceptance Criteria:**

**Given** the dock landing page
**When** it renders the app registry
**Then** a Listies card appears (label "Listies", icon `table_chart`) alongside the existing apps,
and selecting it routes to `/listies` (FR-1).

**Given** `GET /api/apps`
**When** called
**Then** the response includes a Listies `AppDescriptor`
(`id: "listies"`, `label: "Listies"`, `icon: "table_chart"`, `route: "/listies"`).

**Given** the new app module
**When** the project is set up
**Then** `src/apps/listies/` exists (self-contained; the shell imports it only via `registry.ts`),
a backend `routers/listies.py` is mounted under `/api/listies` behind `Depends(get_current_user)`,
and `docs/stories/listies/{for-review,done}/` exist. Existing `pytest`/`npm test` stay green;
formatters/linters clean.

### Story 1.2: Per-user data model, repository & schemas

As the platform,
I want a JSON file per user with an atomic-write repository and typed schemas,
so that every user's sheets, tabs, columns and rows are stored and isolated correctly.

**Acceptance Criteria:**

**Given** `repositories/listies_repo.py`
**When** a user's document is read and they have no file yet
**Then** it returns an empty document `{ schema_version, sheets: [] }` (no error); the repo is the
only module that touches the filesystem, `mkdir(parents=True, exist_ok=True)` on write, and all
writes go through `_atomic_write_json` (AR-2, AR-3, NFR-3).

**Given** `schemas/listies.py`
**When** models are defined
**Then** Pydantic v2 models exist for `Column` (`type: text|number|date`), `Row` (`cells` keyed by
column id), `Tab` (columns + rows + order), `Sheet`, and the top-level document with
`schema_version`; a `migrate()` runs on read so future schema bumps are handled (AR-5).

**Given** the write path
**When** a sheet / tab / column / row is created
**Then** it is stamped with a stable id (`s-` / `tb-` / `c-` / `r-` + `{uuid8}`) and ISO-8601
timestamps; ids are unique within the document.

**Given** the service layer (`services/listies_service.py`)
**When** it operates on a document
**Then** it raises stdlib exceptions (`FileNotFoundError` for a missing sheet/tab/column/row,
`ValueError` for invalid input) and never raises `HTTPException` (NFR-4).

**Given** a username containing a path separator or a parent reference
**When** the repo derives a path from it
**Then** it raises rather than writing outside `users/` (NFR-2).

### Story 1.3: Create a sheet with custom columns, and pick one

As a user,
I want to create a sheet by naming it and defining its columns, and to open an existing one,
so that I can keep separate, differently-shaped lists.

**Acceptance Criteria:**

**Given** the Listies home (`/listies`)
**When** it loads
**Then** it calls `GET /api/listies/sheets` (scoped to me by the token) and shows my sheets with
their name and a row count; with none yet it shows a calm empty state prompting me to create my
first sheet (FR-2, FR-4).

**Given** the create-sheet dialog
**When** I enter a name and define columns (each a name + a type from text / number / date)
**Then** `POST /api/listies/sheets` persists a sheet with an `s-{uuid8}` id and a first tab
("Tab 1") carrying those columns and no rows, and I am taken to `/listies/sheets/:sheetId` (FR-3).

**Given** the create-sheet dialog
**When** I add, remove or reorder column definitions before submitting
**Then** the builder reflects it, and a sheet cannot be created with zero columns, a blank column
name, or duplicate column names within the tab.

**Given** an existing sheet on the home
**When** I select it
**Then** I navigate to `/listies/sheets/:sheetId`.

**Given** a create request with a blank name or an unknown column type
**When** submitted
**Then** the client disables submit (no request) and the API rejects it with a `422` `{detail}`
error as a backstop.

### Story 1.4: Rename and delete a sheet

As a user,
I want to rename a sheet or delete one I no longer need,
so that I can keep my set of sheets tidy.

**Acceptance Criteria:**

**Given** a sheet
**When** I rename it (`PUT /api/listies/sheets/{sheet_id}` with a new name)
**Then** the name updates in my file and everywhere it is shown; a blank name is rejected with a
`422` (FR-5).

**Given** a sheet
**When** I choose delete and confirm (`DELETE /api/listies/sheets/{sheet_id}`)
**Then** the whole sheet — its tabs, columns and rows — is removed from my file and disappears
from the home; the action requires an explicit confirmation first (FR-5).

**Given** a rename or delete for a sheet id that isn't in my file
**When** requested
**Then** the API returns `404` with a `{detail}` message — a user cannot touch another user's
sheet, because the file is chosen from the token, not from input (FR-2).

---

## Epic 2: The Grid

Inside a sheet, the selected tab is a working grid the user fills in with the keyboard.

### Story 2.1: Render a tab as a grid and add rows

As a user,
I want to see my tab's columns and rows as a dense, readable grid I can add rows to,
so that the sheet is something I can actually put data in.

**Acceptance Criteria:**

**Given** `/listies/sheets/:sheetId`
**When** it loads
**Then** it calls `GET /api/listies/sheets/{sheet_id}` and renders the first tab as a grid: a
sticky header row of column names in column order, one row per stored row in `order`, zebra
striping and gridlines (FR-6, NFR-1).

**Given** a column of each type
**When** cells render
**Then** text is left-aligned, numbers are right-aligned in tabular figures, dates render as
`02 Sep 26`, an empty (`null`) cell shows a muted `—`, and each header carries a small glyph for
its type.

**Given** the grid
**When** I use the "+ row" control
**Then** `POST /api/listies/sheets/{sid}/tabs/{tid}/rows` appends an empty row (all cells `null`)
at the end of the stored order and it appears in the grid (FR-6).

**Given** a tab with no rows
**When** the grid renders
**Then** it shows the header row and an inviting empty state rather than a bare frame.

**Given** a sheet id that isn't mine or doesn't exist
**When** the page loads
**Then** the API returns `404` and the page shows a not-found state with a way back to the home.

### Story 2.2: Edit cells inline with type-aware editors

As a user,
I want to click a cell and type into it, with the editor matching the column's type,
so that filling the sheet in feels direct.

**Acceptance Criteria:**

**Given** a cell
**When** I click it
**Then** it enters edit mode in place with an editor matching the column type — a text input, a
numeric input, or a date picker (FR-7).

**Given** a cell in edit mode
**When** I commit it (blur, Tab or Enter)
**Then** `PUT /api/listies/sheets/{sid}/tabs/{tid}/rows/{rid}` sends only the changed cells of that
row, merging with the stored `cells` and stamping `updated_at`; unchanged cells are untouched
(FR-7).

**Given** a commit
**When** the request is in flight
**Then** the grid already shows the new value (optimistic) and stays interactive; on failure the
cell reverts to its previous value and the message surfaces via the store's `error` (NFR-5).

**Given** a value that does not fit its column's type (e.g. "abc" into a number column)
**When** I try to commit
**Then** the client rejects it inline without sending, and the API also rejects a bad value with a
`422` `{detail}` as a backstop.

**Given** a cell I clear
**When** I commit an empty value
**Then** it is stored as `null` (not `0`, not `""`) and renders as the muted `—`.

**Given** a cell in edit mode
**When** I press Esc
**Then** the cell reverts to its previous value, leaves edit mode, and nothing is sent.

### Story 2.3: Keyboard navigation across the grid

As a user,
I want to move around the grid with the keyboard the way I would in a spreadsheet,
so that I can enter a lot of data without touching the mouse.

**Acceptance Criteria:**

**Given** a cell in edit mode
**When** I press Tab / Shift-Tab
**Then** the cell commits and focus moves one cell right / left; from the last column Tab wraps to
the first cell of the next row, and from the first column Shift-Tab wraps to the last cell of the
previous row (FR-8).

**Given** a cell in edit mode
**When** I press Enter
**Then** the cell commits and focus moves one cell down, staying in the same column.

**Given** a focused cell that is not in edit mode
**When** I press an arrow key
**Then** focus moves one cell in that direction, stopping at the grid's edges.

**Given** the grid
**When** it renders
**Then** a trailing empty "ghost" row follows the last real row; typing into it creates a real row
carrying that value (`POST .../rows`) and a fresh ghost row appears beneath it (FR-8).

**Given** the focused cell
**When** it is focused
**Then** it shows a clear accent ring (not a default browser outline), and the focus model lives in
a `useGridNavigation` composable unit-tested without mounting the grid.

### Story 2.4: Delete a row

As a user,
I want to remove a row I no longer want,
so that the sheet stays accurate.

**Acceptance Criteria:**

**Given** a row
**When** I choose delete from its row control and confirm
**Then** `DELETE /api/listies/sheets/{sid}/tabs/{tid}/rows/{rid}` removes it from my file and it
disappears from the grid; remaining rows keep their relative order (FR-9).

**Given** a delete for a row id that isn't in that tab
**When** requested
**Then** the API returns `404` with a `{detail}` message.

**Given** a row deleted while a sort is active
**When** the grid re-renders
**Then** the row is removed from the display order without re-sorting the rest.

### Story 2.5: Manage a tab's columns

As a user,
I want to add, rename, retype, reorder and delete columns after creating a tab,
so that the sheet can change shape as I learn what I actually need.

**Acceptance Criteria:**

**Given** a tab
**When** I add a column (`POST .../columns` with a name and type)
**Then** it is appended in column order with a fresh `c-{uuid8}` id, and every existing row shows
it as empty (`—`) without any change to their stored cells (FR-10, AR-5).

**Given** a column header
**When** I open its menu and rename the column (`PUT .../columns/{cid}`)
**Then** the header updates and no row data changes — cells are keyed by column id, not name.

**Given** a column header
**When** I change its type
**Then** the API returns the whole updated tab with each cell coerced by the documented rules —
any → text keeps everything as a string; → number keeps values that parse as numbers and blanks
the rest; → date keeps values that parse as `YYYY-MM-DD` and blanks the rest.

**Given** a column header
**When** I move it left or right (`PUT .../columns/order` with the full `column_ids` list)
**Then** the grid re-renders in the new order and the order persists; a `column_ids` payload that
is not a permutation of the tab's current columns is rejected with a `422`.

**Given** a column header
**When** I delete the column and confirm
**Then** the column and every row's value for it are removed; deleting the **last remaining
column** is rejected with a `422` `{detail}`.

**Given** a rename to a blank or duplicate name within the tab
**When** submitted
**Then** it is rejected with a `422` `{detail}`.

### Story 2.6: Sort rows by a column

As a user,
I want to click a column header to sort the rows by it,
so that I can see the list in the order that's useful right now.

**Acceptance Criteria:**

**Given** a column header
**When** I click it repeatedly
**Then** the sort cycles none → ascending → descending → none, and the header shows the current
direction (FR-11).

**Given** an active sort
**When** rows render
**Then** the comparison is type-aware — numeric for `number`, chronological for `date`,
locale-aware case-insensitive for `text` — and empty (`null`) cells sort last in both directions.

**Given** an active sort
**When** I edit a cell
**Then** the row does **not** jump: the display order is a list of row ids recomputed only when
the sort spec changes (FR-11).

**Given** an active sort
**When** I add a row
**Then** it appends to the end of the display order until the sort is changed or re-applied.

**Given** any sort
**When** it is applied
**Then** nothing is written to the file — stored `order` is untouched — and the comparator lives in
`sort.ts`, unit-tested per type including nulls and ties.

---

## Epic 3: Tabs

A sheet stops being one table: the bottom bar carries its tabs, and each tab is its own shape.

### Story 3.1: The bottom tab bar, and creating a tab

As a user,
I want a bar at the bottom of the sheet holding its tabs, with a way to add a new one,
so that one sheet can hold several related tables.

**Acceptance Criteria:**

**Given** an open sheet
**When** it renders
**Then** a tab bar is anchored at the **bottom** of the screen showing every tab in `order` as a
chip; the active tab's chip is filled, the others outlined (FR-12).

**Given** the tab bar
**When** I select another tab
**Then** the grid switches to that tab's columns and rows without a page reload, any active sort
resets, and the selection is reflected in the bar.

**Given** the tab bar
**When** I use its `+` control and enter a name and columns
**Then** `POST /api/listies/sheets/{sid}/tabs` creates a tab with a `tb-{uuid8}` id at the end of
the tab order, its own columns and no rows, and the grid switches to it (FR-12).

**Given** the create-tab dialog
**When** submitted with a blank tab name or zero columns
**Then** the client disables submit and the API rejects it with a `422` `{detail}`.

### Story 3.2: Create a tab by copying another tab's columns

As a user,
I want a new tab to be able to start with the same columns as an existing tab,
so that I don't have to rebuild the same setup by hand.

**Acceptance Criteria:**

**Given** the create-tab dialog in a sheet that already has a tab
**When** I choose "same columns as…" and pick a tab
**Then** `POST .../tabs` with `copy_columns_from` creates the new tab with **copies** of that tab's
columns — same names, types and order, but **fresh `c-{uuid8}` ids** — and **no rows** (FR-13).

**Given** a tab created by copying
**When** I later rename, retype or delete a column in either tab
**Then** the other tab is unaffected — the copy is a snapshot, not a link.

**Given** a `copy_columns_from` naming a tab that isn't in this sheet
**When** submitted
**Then** the API returns `404` with a `{detail}` message.

**Given** a request supplying both `copy_columns_from` and explicit `columns`
**When** submitted
**Then** it is rejected with a `422` `{detail}` — the two are mutually exclusive.

### Story 3.3: Rename and delete a tab

As a user,
I want to rename a tab or remove one I no longer need,
so that the sheet's tabs keep matching what's actually in them.

**Acceptance Criteria:**

**Given** a tab chip
**When** I open its menu and rename it (`PUT .../tabs/{tid}`)
**Then** the name updates in my file and in the bar; a blank name is rejected with a `422` (FR-14).

**Given** a tab chip
**When** I choose delete and confirm (`DELETE .../tabs/{tid}`)
**Then** the tab, its columns and all its rows are removed from my file, and if it was the active
tab the grid switches to its neighbour (FR-14).

**Given** a sheet with exactly one tab
**When** I try to delete that tab
**Then** the API rejects it with a `422` `{detail}` and the client doesn't offer delete at all — a
sheet always has at least one tab (FR-14).

**Given** a rename or delete for a tab id that isn't in this sheet
**When** requested
**Then** the API returns `404` with a `{detail}` message.
