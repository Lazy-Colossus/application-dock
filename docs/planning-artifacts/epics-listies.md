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
setup instead of defining columns from scratch. A fourth column type, **place**, holds a location
found through **Google Places** search, and a tab's places can be plotted together on a **map
beside the grid** — a row per café you want to visit becomes a map of that city. Everything is
**bound to the logged-in user** — the JWT username scopes a single JSON file per user.

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

**F5 — Places & Maps**
- FR-15: A **`place` column type** — a fourth type alongside text / number / date — whose cell
  holds a structured snapshot of a location: `place_id`, `name`, `address`, `lat`, `lng`.
- FR-16: Editing a place cell **searches Google Places by text**; picking a result fills the cell.
- FR-17: A tab with at least one place column can open a **map pane beside the grid**, toggled
  from the tab toolbar, plotting a pin per non-empty place cell.
- FR-18: While the pane is open the grid carries a per-row **"on map" checkbox** (with all / none
  controls) choosing which places are currently plotted.
- FR-19: **Marker ↔ row selection** — clicking a marker highlights and scrolls to its row;
  selecting a row pans the map to its pin.
- FR-20: Maps credentials come from **server configuration**; with them unset the place type and
  the map are unavailable and the rest of the app is unaffected.

**F4 — Tabs**
- FR-12: A sheet has a **bottom-anchored tab bar**; the user switches tabs there and creates a new
  **named tab with its own columns**.
- FR-13: When creating a tab, the user can **copy the column setup** of an existing tab in the same
  sheet.
- FR-14: A tab can be **renamed** and **deleted** (confirmation; the **last remaining tab cannot be
  deleted**). The controls are reachable from a **visible** affordance on the chip — not a
  right-click-only context menu (corrected in Story 3.4).
- FR-21: A tab can be given an **accent colour** from a small preset palette, or none. The chip is
  tinted and the grid's header picks up the accent, so the tab you are in is legible without
  looking down at the bar.

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
- NFR-6: **External API cost and exposure are controlled** — place search is proxied server-side
  so the Google **server key never reaches the browser**; the **browser key** is
  referrer-restricted and served to the SPA at runtime rather than baked into the build; search is
  debounced client-side and cached server-side by query so retyping does not re-bill; places are
  stored as **snapshots** and nothing is re-fetched in the background.
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
- AR-6: **Places integration** — `services/places_service.py` is the only module that calls
  Google; `httpx` is promoted from a dev dependency to a runtime one;
  `settings.google_maps_server_key` and `settings.google_maps_browser_key` come from env and are
  passed through in `docker-compose.yml`.
- AR-7: **The cell value union widens** to include a `Place` object. This is purely additive — a
  document written before places still validates — so `schema_version` stays `1`.
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
                "c-11223344": "2026-09-02",
                "c-7f8e9d0a": {                     // a `place` cell (FR-15)
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

**Cell values by column type** — `text` → JSON string, `number` → JSON number, `date` →
`YYYY-MM-DD` string, `place` → an object (`place_id`, `name`, `address`, `lat`, `lng`). `null` means "not filled in" and is distinct from `0` or `""` (an
empty/whitespace text value normalizes to `null`). An absent key is equivalent to `null`; the
service prunes `null` keys and keys for columns that no longer exist.

**Type coercion on a column retype (FR-10)** — keep what still parses, blank the rest: any →
`text` is `str(value)` (a place contributes its `name`); → `number` parses the value as a number,
unparseable → `null`; → `date` parses `YYYY-MM-DD`, unparseable → `null`; a place → `number`/`date`
is always `null`; anything → `place` is always `null`, since a place cannot be reconstructed from
a string.

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
- FR-21: Epic 3 (Story 3.4) — a per-tab accent colour
- FR-15: Epic 4 — the `place` column type
- FR-16: Epic 4 — Google Places search inside a place cell
- FR-17: Epic 4 — the map pane beside the grid
- FR-18: Epic 4 — per-row "on map" checkbox, all / none
- FR-19: Epic 4 — marker ↔ row selection
- FR-20: Epic 4 — server-side maps configuration and graceful degradation

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

### Epic 4: Places & Maps
A sheet stops being only text. A `place` column is filled by searching Google Places from inside
the cell, and a tab's places are plotted together on a map that opens beside the grid — a row per
café becomes a map of the city. Credentials live in server configuration, search is proxied and
cached so the key never reaches the browser, and with no key configured the whole feature is
simply absent rather than broken.
**FRs covered:** FR-15, FR-16, FR-17, FR-18, FR-19, FR-20
**Supporting:** AR-6, AR-7; NFR-1, NFR-4, NFR-5, NFR-6.

### Epic 5: Live Collaboration
A sheet stops being one person's. The owner shares a sheet with chosen dock users, and it becomes a
single **shared document** they all edit at once — not a copy each of them drifts out of sync.
Changes propagate **live** over Server-Sent Events: a member's edit appears to every other member
with the sheet open within a moment. The owner alone manages the member list and can delete the
sheet; every member edits all content. A shared sheet is promoted out of its owner's per-user file
into a shared, per-sheet store so multiple users can safely resolve and write the same sheet.
**FRs covered:** FR-22, FR-23, FR-24, FR-25, FR-26
**Supporting:** NFR-2, NFR-3, NFR-4, NFR-5.

**New requirements introduced by this epic:**
- FR-22 — A sheet's owner can **share** it with chosen dock users, **add/remove** members, and
  **stop sharing** (demoting it back to a private sheet). Sharing produces one shared document, not
  a copy.
- FR-23 — **Flat editor permissions**: every member (owner included) edits all content
  (rows/cells/columns/tabs); only the **owner** manages membership and deletes the sheet. A
  non-owner's manage/delete attempt is `403`.
- FR-24 — **Live propagation via SSE**: a member's change reaches every other member with the sheet
  open within a moment; a member's own change never triggers a redundant refetch (`actor`/`rev`
  guard).
- FR-25 — The home lists shared sheets **distinctly** — shared-with-me shows the owner's name;
  shared-by-me carries a shared indicator.
- FR-26 — **Membership/lifecycle changes propagate live**: an added member sees the roster update; a
  removed member (or on stop-sharing / delete) has their open view closed with a reason.

**Data & architecture notes:**
- A shared sheet is promoted to `DATA_DIR/listies/shared/{sheet_id}.json` — the existing `Sheet`
  wrapped with `owner`, `members`, `rev`, timestamps and its own `schema_version`. The owner's
  per-user doc stays schema v1 (the sheet is simply removed from its `sheets` list).
- Every existing sheet/tab/column/row operation resolves a `sheet_id` to either the caller's private
  doc or a shared file they are a member of; a non-member gets the same `404` as a non-existent id
  (preserves FR-2/NFR-2 isolation).
- Liveness is a process-local `asyncio` event bus + an SSE endpoint (`GET
  /api/listies/sheets/{sheet_id}/events`), authenticated via `?token=` because `EventSource` cannot
  send a header. Single-worker deployment assumption (per CLAUDE.md). Coarse `sheet.changed { rev }`
  events drive a client refetch rather than delta replay.
- Concurrency is atomic-write, last-write-wins per operation — an accepted limitation at this scale;
  see `docs/stories/application-dock-general/1.8.concurrency-safe-json-persistence.story.md`.

**Dependencies:** Epic 2 builds on Epic 1 (needs the data layer and an open sheet). Epic 3 builds
on both (needs a sheet whose grid already renders one tab). Epic 4 builds on Epics 1–2 (needs
columns and a rendered grid) but not on Epic 3. **Epic 5 builds on Epics 1–2** (needs the data
layer and a working grid to collaborate on) and is independent of Epics 3–4. No epic depends on a
later epic.

**Epic 5 stories (implemented in order, each depends on the previous):**
- **Story 5.1 — Shared storage and the sharing lifecycle (backend).** Promote a shared sheet to its
  own per-sheet file, add the resolver that routes every existing operation to the right store, and
  the owner-only share/add-member/remove-member/stop-sharing endpoints. After 5.1, sharing works
  end-to-end via the API and members edit one document; other members' edits are seen on the next
  fetch. Covers FR-22, FR-23, FR-25 (backend); NFR-2, NFR-3.
- **Story 5.2 — Live propagation over SSE.** An in-process event bus + an authenticated
  `text/event-stream` endpoint, `sheet.changed`/`members.changed`/`sheet.closed` emission, and the
  client `useSheetEvents` composable + store reconciliation so a member's edit appears on every open
  member's screen within a moment. Covers FR-24, FR-26 (live channel); NFR-5.
- **Story 5.3 — Sharing UI and live membership.** The share dialog, home badges (shared-by-me /
  shared-with-me), the sheet-page collaborators affordance, and live reactions to membership/lifecycle
  events. Covers FR-22, FR-23, FR-25, FR-26 (user-facing).

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

---

## Epic 4: Places & Maps

A `place` column turns a row into somewhere you can go, and a tab into a map of them.

### Story 4.1: Maps configuration and the place-search endpoint

As the platform,
I want Google credentials in server configuration and place search proxied through our own API,
so that the server key never reaches the browser, searches are cached, and an unconfigured
deployment degrades cleanly instead of breaking.

**Acceptance Criteria:**

**Given** `app/core/config.py`
**When** settings load
**Then** `google_maps_server_key` and `google_maps_browser_key` are read from the environment
(defaulting to empty), and `docker-compose.yml` passes both through (AR-6, FR-20).

**Given** `GET /api/listies/maps-config`
**When** called by an authenticated user
**Then** it returns `{ enabled: true, browser_key: "…" }` when both keys are configured and
`{ enabled: false }` otherwise — and never returns the **server** key under any circumstances
(NFR-6).

**Given** `GET /api/listies/places/search?q=…`
**When** maps are configured
**Then** `services/places_service.py` calls the Google Places **Text Search** endpoint with the
server key and returns a normalized `list[PlaceResult]` (`place_id`, `name`, `address`, `lat`,
`lng`) — it is the only module in the codebase that talks to Google (AR-6, FR-16).

**Given** a repeated `(q, near)` search within the cache TTL
**When** it is requested
**Then** it is served from an in-process cache without a second upstream call; the cache is
bounded in size and its entries expire (NFR-6).

**Given** a `near=lat,lng` parameter
**When** searching
**Then** results are biased toward that location.

**Given** maps are **not** configured
**When** `/places/search` is called
**Then** it returns `503` with a `{detail}` naming the missing configuration — no crash, and no
other app is affected (FR-20).

**Given** an upstream error, non-2xx or timeout
**When** searching
**Then** the endpoint returns `502` with a `{detail}`, never a stack trace and never the key.

**Given** a blank or whitespace `q`
**When** requested
**Then** the endpoint returns `422` `{detail}` without calling Google.

**Given** the test suite
**When** it runs
**Then** no test performs a real network call — `httpx` is stubbed — and `httpx` has moved from
`requirements-dev.txt` into `requirements.txt`.

### Story 4.2: The `place` column type

As a user,
I want a column whose cells hold a real location,
so that a row can be somewhere I intend to go rather than just its name.

**Acceptance Criteria:**

**Given** the column types
**When** a column is created or retyped
**Then** `place` is available as a fourth type alongside text / number / date — offered only when
`maps-config` reports `enabled` (FR-15, FR-20).

**Given** `schemas/listies.py`
**When** a place cell is validated
**Then** a `Place` model (`place_id`, `name`, `address`, `lat`, `lng`) is accepted for a `place`
column and rejected for any other column type; a scalar in a `place` column is a `422` (AR-7).

**Given** an existing document written before places
**When** it is read
**Then** it still validates unchanged — the union widened additively and `schema_version` stays
`1` (AR-7).

**Given** a retype touching a place column
**When** it is applied
**Then** `place` → `text` keeps the place's `name`; `place` → `number`/`date` blanks to `null`;
anything → `place` blanks to `null`; and the existing "this will empty N cells" warning covers it
(FR-10).

**Given** a place cell in the grid
**When** it renders
**Then** it shows a 📍 glyph with the place name and the address muted beneath; an empty place
cell shows the same muted `—` as every other type.

**Given** a sort on a place column
**When** applied
**Then** it compares by place **name** using the text comparator, with empties last (FR-11).

### Story 4.3: Search Google and fill a place cell

As a user,
I want to type a place name into a cell and pick the real place from Google,
so that filling in a location takes one search rather than a copy-paste of coordinates.

**Acceptance Criteria:**

**Given** a place cell
**When** I click it
**Then** it opens a search field in place, pre-filled with the current place's name if it has one
(FR-16).

**Given** the search field
**When** I have typed at least two characters
**Then** after a debounce the client calls `GET /api/listies/places/search` through `useApi` and
shows a result list beneath the cell — name in full, address muted (NFR-6).

**Given** the result list
**When** I move through it with the arrow keys and press Enter (or click a result)
**Then** the chosen place is written to the cell through the ordinary row-cells `PUT` as a whole
place object, and the grid shows it immediately with the same optimistic-then-reconcile behaviour
as every other cell (FR-16, NFR-5).

**Given** the column already holds places
**When** a search is issued
**Then** it passes `near` as the centroid of those places, so results are local to what is already
in the column.

**Given** the search
**When** it is loading, returns nothing, or fails
**Then** the cell shows a loading indicator, a "no places found" line, or the error — never a
silent empty dropdown.

**Given** a filled place cell
**When** I clear it
**Then** the cell is stored as `null` and renders as `—`.

**Given** Esc while the result list is open
**When** pressed
**Then** the list closes and the cell keeps its previous value, consistent with every other editor
(FR-8).

**Given** maps are not configured
**When** a place cell is opened
**Then** it is read-only and explains that maps are not configured, rather than offering a search
that cannot work (FR-20).

### Story 4.4: The map pane beside the grid

As a user,
I want to open a map next to my grid showing every place in the tab,
so that a tab of cafés becomes a map of that city.

**Acceptance Criteria:**

**Given** a tab with at least one place column and maps configured
**When** the tab toolbar renders
**Then** it offers a `Map` toggle; the toggle is absent for a tab with no place column or when
maps are not configured (FR-17, FR-20).

**Given** the toggle
**When** I open it
**Then** the view splits — grid left, map right — and closing it returns the grid to full width;
the open state is remembered per tab for the session (FR-17).

**Given** the pane opens for the first time
**When** it loads
**Then** the Maps JS SDK is fetched **once, on demand**, using the browser key from
`GET /api/listies/maps-config` — never a key baked into the bundle (NFR-6).

**Given** the pane is open
**When** it renders
**Then** it plots one marker per non-empty place cell in the tab; when a tab has more than one
place column the markers are colour-coded per column with a small legend (FR-17).

**Given** the pane opens
**When** the markers are plotted
**Then** the map fits its bounds to them; a single place is centred at a sensible zoom.

**Given** a marker
**When** it renders
**Then** it is labelled by its row's first text value, falling back to the place's own name.

**Given** a marker
**When** I click it
**Then** its row is highlighted and the grid scrolls to it; selecting a row pans the map to that
row's pin (FR-19).

**Given** a tab whose place cells are all empty
**When** the pane opens
**Then** it shows an empty state inviting me to fill a place cell, not a blank world map.

**Given** the SDK fails to load or the key is rejected
**When** the pane opens
**Then** it shows an error state and the grid keeps working normally (FR-20).

### Story 4.5: Choose which places are on the map

As a user,
I want to tick and untick which places are currently plotted,
so that I can narrow the map to the handful I am actually deciding between.

**Acceptance Criteria:**

**Given** the map pane is open
**When** the grid renders
**Then** it grows a leading "on map" checkbox column, one tick per row holding at least one
non-empty place; rows with no place have no checkbox (FR-18).

**Given** the pane opens
**When** it first renders
**Then** every place row is ticked.

**Given** a ticked row
**When** I untick it
**Then** its marker disappears immediately, and re-ticking restores it — no request is made either
way (FR-18).

**Given** the pane header
**When** it renders
**Then** it offers **all** and **none** controls and a "4 of 7 shown" counter.

**Given** a tick change
**When** the markers update
**Then** the map does **not** re-fit its bounds (that would make it jump); an explicit "fit to
shown" control re-fits on demand.

**Given** the ticks
**When** I switch tab, reload, or close the pane
**Then** they reset to all-on — like sorting, this is view state and is never written to the file.

**Given** the map pane is closed
**When** the grid renders
**Then** the checkbox column is gone and the grid is back to full width.


### Story 3.4: Sheet layout fixes and tab colour

As a user,
I want the tab bar always on screen, a row always ready for input, room to name a new column, and
tabs I can visibly edit and colour,
so that the sheet is usable with real amounts of data rather than only with a few rows.

**Acceptance Criteria:**

**Given** a tab with more rows than fit the screen
**When** the sheet renders
**Then** the tab bar stays at the bottom of the viewport and the grid scrolls inside its own box —
the bar is never pushed below the fold (revises FR-12).

**Given** any tab
**When** the user fills the last row and it becomes real
**Then** a fresh empty row is immediately beneath it and the cursor follows down into it, so entry
never stalls on the row just filled (revises FR-8).

**Given** a tab with several columns
**When** the user adds a column
**Then** the name field opens in a popup with room to type; data columns are a fixed width and the
table scrolls horizontally rather than compressing (revises FR-10, NFR-1).

**Given** a tab chip
**When** it renders
**Then** a visible control opens its menu — rename, colour, delete — with no right-click required
(revises FR-14).

**Given** the tab menu
**When** a colour is picked from the preset palette (or cleared)
**Then** `PUT .../tabs/{tab_id}` persists `color` as `#rrggbb` or `null`, the chip is tinted, and
the grid header takes the accent (FR-21). The field is additive — a document written before
colours still reads, and `schema_version` stays `1`.
