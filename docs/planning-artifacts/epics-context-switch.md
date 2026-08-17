---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - CLAUDE.md
  - docs/stories/application-dock-general/done/1.5.jwt-authentication.story.md
  - docs/stories/application-dock-general/done/1.6.multi-user-management.story.md
  - docs/planning-artifacts/epics-hotaru.md
---

# Context-Switch (Todo Board) — Epic Breakdown

## Overview

This document is the complete epic and story breakdown for **Context-Switch**, a per-user
todo-board app shipped as a new self-contained app inside the Application Dock platform.

A user keeps multiple named **lists**. Opening the app lands on a picker where they choose an
existing list or create a new one. A list is a **grid of big colored pill blocks**, each a todo
with a header and body text. A plus button adds a todo; each todo gets a color (preset palette or
a custom color). Clicking a todo opens it to edit its text, append timestamped **updates**, or
**close it as done** (archived). The list page lets the user choose how many **columns and rows**
the grid shows. Everything is **bound to the logged-in user** — the JWT username scopes a single
JSON file per user; log in with the same account anywhere and the same lists are there.

Platform-wide architecture is inherited, not re-built (3-layer backend, `useApi` HTTP boundary,
registry + lazy routes, JWT auth, atomic JSON file persistence). Stories live under
`docs/stories/context-switch/`.

## Requirements Inventory

### Functional Requirements

**F1 — App Integration & Identity**
- FR-1: App registered in the Application Dock shell (card on the landing page + its own route).
- FR-2: All data is bound to the logged-in user — scoped by the JWT username via
  `get_current_user`; a user only ever sees and mutates their own lists/todos. No `user` field is
  accepted in any request path or body (it is derived from the token).

**F2 — Lists**
- FR-3: A user can create multiple **lists**; a list has just a **name**.
- FR-4: Opening the app shows a **picker** — choose an existing list to open, or create a new one.
- FR-5: A user can **rename** a list and **delete** a list (delete requires a confirmation).

**F3 — Todos on the board**
- FR-6: A **plus button** adds a todo with a **header** and **body text**.
- FR-7: Each todo has a **color** chosen from a preset palette **or** a custom color; the todo
  renders as a large colored **pill block** on the board.
- FR-8: The list page lets the user choose **columns and rows** — a fixed C×R grid; todos beyond
  the visible page paginate. The chosen grid shape is **remembered per list**.
- FR-9: Todos can be **reordered** within a list by drag-and-drop; the order persists.

**F4 — Todo lifecycle**
- FR-10: Clicking an existing todo **opens** it; its **header and body are editable** in place.
- FR-11: A todo carries an append-only **updates log** — the user can add timestamped update
  entries without altering the original text; updates accumulate in order.
- FR-12: The user can **close a todo as done** → it is **archived** and removed from the active
  board (kept in the file, not deleted).
- FR-13: An **archive view** lists archived todos for a list and lets the user **delete** them
  **permanently**. (Archived is terminal — there is no reopen in v1.)

### NonFunctional Requirements

- NFR-1: **Desktop / wide-first** — the board is designed for a laptop/desktop grid; it degrades
  gracefully (fewer columns) on narrower screens but is not a mobile-first app.
- NFR-2: **Per-user isolation** — one JSON file per user at
  `DATA_DIR/context-switch/users/{username}.json`; a user's file is never read or written on
  behalf of another user (enforced by deriving the filename from the JWT, not from input).
- NFR-3: **JSON files on disk, atomic writes, no database** — all writes go through the platform's
  `_atomic_write_json` (write-`.tmp`-then-`os.replace`); repo-only file I/O.
- NFR-4: **Platform conformance** — strict 3-layer backend (router → service → repo, stdlib
  exceptions become `HTTPException` only in routers); `useApi` single HTTP boundary; registry +
  lazy routes; Pinia store exposes `loading`/`error`; snake_case JSON, direct serialization
  (no envelopes), `{detail}` errors, ISO-8601 timestamps; all routes behind `Depends(get_current_user)`.

### Additional (Architecture) Requirements

- AR-1: **App registration** — registry entry + lazy routes + backend `routers/context_switch.py`
  mounted under `/api/context-switch` + `apps/context-switch/` frontend skeleton +
  `docs/stories/context-switch/{for-review,done}/` (already created).
- AR-2: **Data layout** — writable per-user file under `DATA_DIR/context-switch/users/{username}.json`;
  the repo `mkdir(parents=True, exist_ok=True)` on write and returns an empty document
  (`{schema_version, lists: []}`) when a user has no file yet.
- AR-3: **Repository / service / schemas split** — `repositories/context_switch_repo.py` (only FS
  access, atomic writes), `services/context_switch_service.py` (list/todo logic, raises stdlib
  exceptions), `schemas/context_switch.py` (Pydantic v2 models). Stable IDs: lists `l-{uuid8}`,
  todos `t-{uuid8}`, updates `u-{uuid8}`. Top-level `schema_version` with a `migrate()` on read.
- AR-4: **API contract** — `/api/context-switch/*`, every route `Depends(get_current_user)`; the
  username scopes the file and never appears in a path/body. Direct serialization; `{detail}` errors.

### Data Model

One JSON file per user — `DATA_DIR/context-switch/users/{username}.json`:

```jsonc
{
  "schema_version": 1,
  "lists": [
    {
      "id": "l-ab12cd34",
      "name": "Sprint work",
      "grid": { "columns": 3, "rows": 2 },        // saved page shape (FR-8)
      "created_at": "2026-08-13T10:00:00Z",
      "todos": [
        {
          "id": "t-9f8e7d6c",
          "header": "Wire up auth",
          "body": "editable notes…",
          "color": "#ffcc00",                       // preset hex or custom hex (FR-7)
          "status": "active",                       // active | archived (FR-12)
          "order": 0,                               // drag-reorder position (FR-9)
          "created_at": "…",
          "updated_at": "…",
          "archived_at": null,
          "updates": [                              // append-only log (FR-11)
            { "id": "u-…", "text": "blocked on API key", "created_at": "…" }
          ]
        }
      ]
    }
  ]
}
```

### FR Coverage Map

- FR-1: Epic 1 — app registered in the shell
- FR-2: Epic 1 — per-user scoping via JWT username
- FR-3: Epic 1 — create multiple lists
- FR-4: Epic 1 — list picker (open existing / create new)
- FR-5: Epic 1 — rename / delete a list
- FR-6: Epic 2 — add a todo (plus button, header + body)
- FR-7: Epic 2 — per-todo color → pill block
- FR-8: Epic 2 — columns/rows grid control (saved per list)
- FR-9: Epic 2 — drag reorder
- FR-10: Epic 2 — open & edit a todo
- FR-11: Epic 2 — timestamped updates log
- FR-12: Epic 2 — close as done (archive)
- FR-13: Epic 2 — archive view + permanent delete
- FR-14: Epic 3 — switch lists from the board (arrows beside the list name)
- FR-15: Epic 3 — move a todo to another list by dragging it onto the list name

## Epic List

### Epic 1: Foundation & Lists
Register Context-Switch in the dock, stand up the per-user data layer, and let a user create,
pick, rename, and delete named lists. Delivers app registration, the repository/service/schemas,
the JWT-scoped per-user file, and the list-picker home.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5
**Supporting:** AR-1, AR-2, AR-3, AR-4; NFR-1, NFR-2, NFR-3, NFR-4.

### Epic 2: The Board — Todos, Grid & Lifecycle
Inside a list, add todos as big colored pills, arrange them in a chosen columns×rows grid, reorder
by drag, then open a todo to edit it, log timestamped updates, close it as done (archive), and
manage the archive. The whole todo experience.
**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-10, FR-11, FR-12, FR-13
**Supporting:** NFR-1, NFR-4.

### Epic 3: Moving Between Lists
Once a user keeps several lists, the board becomes the place they live — so let them change context
without going back to the picker: arrows beside the list name walk their lists, and a todo can be
dragged onto that name to be moved into another list, keeping its whole history.
**FRs covered:** FR-14, FR-15
**Supporting:** NFR-1, NFR-3, NFR-4.

**Dependencies:** Epic 2 builds on Epic 1 (needs the data layer and an open list). Epic 3 builds on
both (needs several lists and a board of draggable pills). No epic depends on a later epic.

---

## Epic 1: Foundation & Lists

A logged-in user can open Context-Switch and manage their own named lists — everything scoped to
their account.

### Story 1.1: Register Context-Switch in the Application Dock shell

As a user,
I want Context-Switch to appear as an app in the dock and open to its own home,
so that I can launch it like any other app in the platform.

**Acceptance Criteria:**

**Given** the dock landing page
**When** it renders the app registry
**Then** a Context-Switch card appears (label "Context-Switch", icon `swap_horiz`) alongside the
existing apps, and selecting it routes to `/context-switch` (FR-1).

**Given** `GET /api/apps`
**When** called
**Then** the response includes a Context-Switch `AppDescriptor`
(`id: "context-switch"`, `label: "Context-Switch"`, `icon: "swap_horiz"`, `route: "/context-switch"`).

**Given** the new app module
**When** the project is set up
**Then** `src/apps/context-switch/` exists (self-contained; the shell imports it only via
`registry.ts`), a backend `routers/context_switch.py` is mounted under `/api/context-switch`
behind `Depends(get_current_user)`, and `docs/stories/context-switch/{for-review,done}/` exist.
Existing `pytest`/`npm test` stay green; formatters/linters clean.

### Story 1.2: Per-user data model, repository & schemas

As the platform,
I want a JSON file per user with an atomic-write repository and typed schemas,
so that every user's lists and todos are stored and isolated correctly.

**Acceptance Criteria:**

**Given** `repositories/context_switch_repo.py`
**When** a user's document is read and they have no file yet
**Then** it returns an empty document `{ schema_version, lists: [] }` (no error); the repo is the
only module that touches the filesystem, `mkdir(parents=True, exist_ok=True)` on write, and all
writes go through `_atomic_write_json` (AR-2, AR-3, NFR-3).

**Given** `schemas/context_switch.py`
**When** models are defined
**Then** Pydantic v2 models exist for `TodoUpdate`, `Todo` (`status: active|archived`), `TodoList`
(with `grid: {columns, rows}`), and the top-level document with `schema_version`; a `migrate()`
runs on read so future schema bumps are handled.

**Given** the write path
**When** a list/todo/update is created
**Then** it is stamped with a stable id (`l-{uuid8}` / `t-{uuid8}` / `u-{uuid8}`) and ISO-8601
timestamps; ids are unique within the document.

**Given** the service layer (`services/context_switch_service.py`)
**When** it operates on a document
**Then** it raises stdlib exceptions (`FileNotFoundError` for a missing list/todo, `ValueError`
for invalid input) and never raises `HTTPException` (NFR-4).

### Story 1.3: Create and pick a list

As a user,
I want to pick an existing list or create a new one when I open the app,
so that I can keep separate boards of todos.

**Acceptance Criteria:**

**Given** the Context-Switch home (`/context-switch`)
**When** it loads
**Then** it calls `GET /api/context-switch/lists` (scoped to me via the token) and shows my lists
(name + a todo count); with no lists yet it shows a calm empty state prompting me to create one
(FR-2, FR-4).

**Given** the home
**When** I create a list by entering a name
**Then** `POST /api/context-switch/lists` persists a new list with a `l-{uuid8}` id to my file and
I am taken to that list's board `/context-switch/lists/:listId` (FR-3).

**Given** an existing list in the picker
**When** I select it
**Then** I navigate to its board page.

**Given** a create request with an empty/whitespace name
**When** submitted
**Then** the client disables submit (no request) and/or the API rejects with a `{detail}` error.

### Story 1.4: Rename and delete a list

As a user,
I want to rename a list or delete one I no longer need,
so that I can keep my set of boards tidy.

**Acceptance Criteria:**

**Given** a list
**When** I rename it (`PATCH /api/context-switch/lists/{list_id}` with a new name)
**Then** the name updates in my file and everywhere it is shown; an empty name is rejected (FR-5).

**Given** a list
**When** I choose delete and confirm (`DELETE /api/context-switch/lists/{list_id}`)
**Then** the whole list (and its todos) is removed from my file and disappears from the picker; the
action requires an explicit confirmation first (FR-5).

**Given** a delete/rename for a list id that isn't in my file
**When** requested
**Then** the API returns `404` with a `{detail}` message (a user cannot touch another user's list —
the file is chosen from the token, not from input) (FR-2).

---

## Epic 2: The Board — Todos, Grid & Lifecycle

Inside a list, a user builds and works their board of colored todo pills, arranges the grid, and
runs each todo through its lifecycle to done.

### Story 2.1: Add a todo as a colored pill

As a user,
I want a plus button that adds a todo with a header, text, and a color,
so that it appears as a big colored pill block on my board.

**Acceptance Criteria:**

**Given** a list board
**When** I click the **plus** button and enter a header and body text
**Then** `POST /api/context-switch/lists/{list_id}/todos` creates the todo (status `active`,
appended at the end of the order) and it renders as a large **pill block** showing its header and
text (FR-6).

**Given** the add form
**When** I choose a color
**Then** I can pick from a **preset palette** or set a **custom** color, and the pill renders in
that color with readable contrast for its text (FR-7).

**Given** a submission with an empty header
**When** submitted
**Then** it is rejected with a `{detail}` error and the form shows the problem (body may be empty;
header is required).

### Story 2.2: Choose the grid — columns and rows

As a user,
I want to choose how many columns and rows the board shows,
so that I can size the grid to my screen and how much I want to see at once.

**Acceptance Criteria:**

**Given** the list board
**When** I set the number of **columns** and **rows**
**Then** the active todos render in that fixed C×R grid of pills; todos beyond the visible page
paginate (a way to move between pages), and no active todo is silently hidden (FR-8, NFR-1).

**Given** a changed grid setting
**When** I set it
**Then** it is saved for that list (`PATCH …/lists/{list_id}` `grid: {columns, rows}`) and is
still in effect when I reopen the list later (remembered per list) (FR-8).

**Given** a narrow screen
**When** the chosen column count doesn't fit
**Then** the grid degrades gracefully to fewer columns rather than overflowing (desktop-first, but
not broken on smaller screens) (NFR-1).

### Story 2.3: Reorder todos by drag

As a user,
I want to drag todos to reorder them,
so that I can arrange my board by priority.

**Acceptance Criteria:**

**Given** a board with several todos
**When** I drag a pill to a new position
**Then** the order updates on screen and persists (`POST …/lists/{list_id}/todos/reorder` with the
new ordered ids, or per-todo `order`), and the new order is intact after reload (FR-9).

**Given** a reorder request referencing an unknown or archived todo id
**When** processed
**Then** it is rejected/ignored safely (only the list's active todos participate) with a `{detail}`
error where appropriate.

### Story 2.4: Open a todo and edit it

As a user,
I want to click a todo to open it and edit its header and body,
so that I can fix or expand what I wrote.

**Acceptance Criteria:**

**Given** a pill on the board
**When** I click it
**Then** a detail view opens showing the header, body, color, and its updates log (FR-10).

**Given** the detail view
**When** I edit the header and/or body and save
**Then** `PATCH …/lists/{list_id}/todos/{todo_id}` updates them in place, bumps `updated_at`, and
the pill reflects the change; the color can also be changed here (FR-10, FR-7).

### Story 2.5: Add timestamped updates to a todo

As a user,
I want to append dated updates to a todo without changing its original text,
so that I keep a running history of progress.

**Acceptance Criteria:**

**Given** an open todo
**When** I add an update entry (`POST …/lists/{list_id}/todos/{todo_id}/updates` with text)
**Then** a new `u-{uuid8}` entry with the text and an ISO-8601 timestamp is appended to the todo's
`updates` and shown in order; the original header/body are unchanged (FR-11).

**Given** the updates log
**When** the detail view renders
**Then** all updates display newest-appropriate order with their timestamps; an empty update text
is rejected.

### Story 2.6: Close a todo as done (archive)

As a user,
I want to close a todo as done,
so that it leaves my active board once it's finished.

**Acceptance Criteria:**

**Given** an open (or hovered) todo
**When** I close it as done (`PATCH …/lists/{list_id}/todos/{todo_id}` `status: archived`)
**Then** it is set `archived` with an `archived_at` timestamp, removed from the active board, and
kept in my file (not deleted) (FR-12).

**Given** the active board
**When** it renders
**Then** archived todos never appear among the active pills (they are reachable only via the
archive view) (FR-12, FR-13).

### Story 2.7: Archive view — browse and permanently delete

As a user,
I want to see a list's archived todos and delete them for good,
so that I can review finished work and clear it out.

**Acceptance Criteria:**

**Given** a list
**When** I open its archive view (`GET …/lists/{list_id}?include=archived`, or a dedicated archived
query)
**Then** I see the archived todos (header, text, color, `archived_at`) separate from the active
board (FR-13).

**Given** an archived todo
**When** I delete it (`DELETE …/lists/{list_id}/todos/{todo_id}`)
**Then** it is permanently removed from my file and disappears from the archive; this is terminal —
there is no reopen in v1 (FR-13).

**Given** a delete for a todo id not in my file
**When** requested
**Then** the API returns `404` with a `{detail}` message.

---

## Epic 3: Moving Between Lists

A user with several lists can change which one they are looking at, and move work between them,
without leaving the board.

### Story 3.1: Switch lists from the board

As a user,
I want arrows either side of the list name on the board,
so that I can flip between my lists without going back to the picker.

**Acceptance Criteria:**

**Given** a board and more than one list
**When** the header renders
**Then** a left and a right arrow sit either side of the list name, and the board I am on is the
one named between them (FR-14).

**Given** I am on a board
**When** I press the right (or left) arrow
**Then** I land on the next (or previous) list in the same order the picker shows, the URL becomes
that list's board, and its todos and grid are what I see (FR-14, FR-4).

**Given** I am on the last (or first) list
**When** I press the right (or left) arrow
**Then** it wraps around to the first (or last) list — the arrows are never a dead end (FR-14).

**Given** I have one list or none
**When** the header renders
**Then** no arrows are shown (there is nowhere to go).

### Story 3.2: Move a todo to another list by dragging it onto the list name

As a user,
I want to drag a todo onto the list name and drop it into another list,
so that I can move work between contexts without retyping it.

**Acceptance Criteria:**

**Given** I am dragging a todo pill
**When** I hold it over the list name
**Then** a popup opens under the name listing my other lists as drop targets (the list I am on is
not among them) (FR-15).

**Given** that popup is open mid-drag
**When** I drop the pill onto one of the lists
**Then** the todo leaves this board and belongs to that list, keeping its text, color, and its whole
updates log, and it is there when I open that list (FR-15, FR-11).

**Given** a moved todo
**When** the destination board renders
**Then** it sits last among that list's active todos, and neither list's remaining order is
disturbed (FR-15, FR-9).

**Given** a move naming a list or todo that is not mine
**When** requested
**Then** the API returns `404` with a `{detail}` message and nothing is written; a move that would
leave the todo where it already is, or that names an archived todo, is rejected with a `422`
(FR-2).

---

## Notes for story expansion

- These stories are defined at the epic-planning level (user story + acceptance criteria). Expand
  each into an implementation-ready `N.M.<slug>.story.md` under `docs/stories/context-switch/` (Draft
  in the app-folder root; move to `for-review/` then `done/` as it progresses) when picking it up —
  mirror the task/dev-notes shape of `docs/stories/hotaru/done/1.2.register-hotaru-app.story.md`.
- Use archery/hotaru as the reference implementation for the "add a new app" flow and the
  repository/service/router/schema layering.
