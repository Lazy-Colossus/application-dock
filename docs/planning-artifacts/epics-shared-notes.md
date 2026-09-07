---
stepsCompleted: [1, 2, 3]
inputDocuments:
  - CLAUDE.md
  - docs/planning-artifacts/epics-listies.md
---

# Shared Notes — Epic Breakdown

## Overview

This document is the complete epic and story breakdown for **Shared Notes**, a collaborative
scratchpad app shipped as a new self-contained app inside the Application Dock platform.

A user creates a **note** — a title and a single free-text **body** — and chooses which other dock
users to **share** it with. Every person a note is shared with edits the **same** body: it is one
shared scratchpad, not a copy each of them drifts out of sync. The home screen is a flat list of the
notes I own plus the notes shared with me. Edits propagate **live** over Server-Sent Events: a
member's change appears to every other member with the note open within a moment. The **owner** alone
manages the member list and can delete the note; every member edits the title and body. Editing is a
single shared body with **last-write-per-save** semantics — deliberately simple, no character-level
merge (see the concurrency note under Epic 2).

Platform-wide architecture is inherited, not re-built (3-layer backend, `useApi` HTTP boundary,
registry + lazy routes, JWT auth, atomic JSON file persistence). Stories live under
`docs/stories/shared-notes/`.

## Requirements Inventory

### Functional Requirements

**F1 — App Integration & Identity**
- FR-1: App registered in the Application Dock shell (card on the landing page + its own route).
- FR-2: All data is bound to the logged-in user — the JWT username identifies the caller via
  `get_current_user`; ownership and membership are derived from the token, never accepted in a
  request path or body. A user only ever sees and mutates notes they own or are a member of.

**F2 — Notes**
- FR-3: A user can **create a note** with a **title**; the note starts with an empty body, the
  creator as its **owner**, and the owner as its sole member.
- FR-4: The home screen **lists the notes the user is a member of** (owned + shared-with-me) newest
  activity first, and opens one on selection; with none yet it shows a calm empty state.
- FR-5: Any member can **rename** a note (edit its title). A blank title is rejected.
- FR-6: Any member can **edit the shared body**; a save persists the whole body with
  **last-write-per-save** semantics — the most recent save of the body wins.
- FR-7: The **owner** can **delete** a note (delete requires a confirmation); the note and its file
  are removed for everyone.

**F3 — Sharing & Live Collaboration**
- FR-8: A note's **owner** can **share** it with chosen dock users and **add / remove** members.
  Sharing produces one shared document that every member edits, not a copy.
- FR-9: **Flat editor permissions**: every member (owner included) edits the title and body; only the
  **owner** manages membership and deletes the note. A non-owner's manage/delete attempt is `403`.
- FR-10: **Live propagation via SSE**: a member's title or body change reaches every other member with
  the note open within a moment; a member's own change never triggers a redundant refetch
  (`actor`/`rev` guard).
- FR-11: **Membership / lifecycle changes propagate live**: an added member sees the note appear; a
  removed member (or on delete) has their open view closed with a reason.
- FR-12: The home lists notes **distinctly** — a note shared **with** me shows the owner's name; a
  note shared **by** me carries a shared indicator.

### NonFunctional Requirements

- NFR-1: **JSON files on disk, atomic writes, no database** — all writes go through the platform's
  `_atomic_write_json` (write-`.tmp`-then-`os.replace`); repo-only file I/O.
- NFR-2: **Access isolation** — a note file is named from its own id (validated as a safe bare
  filename), never from input; the caller identity comes from the JWT. A caller who is not a member of
  a note gets the identical `404` as for a note that does not exist, so sharing never leaks a note's
  existence.
- NFR-3: **Platform conformance** — strict 3-layer backend (router → service → repo; stdlib
  exceptions become `HTTPException` only in routers); `useApi` single HTTP boundary; registry + lazy
  routes; Pinia store exposes `loading`/`error`; snake_case JSON, direct serialization (no
  envelopes), `{detail}` errors, ISO-8601 timestamps; all routes behind `Depends(get_current_user)`.
- NFR-4: **The editor never blocks on the network** — body edits stay responsive; saves are debounced
  and their in-flight/failed state is surfaced through the store's `error`, never a bare
  `console.error`.
- NFR-5: **Concurrency is last-write-per-save, an accepted limitation at this scale** — each save is
  an independent read-modify-write of the note file with an atomic replace, which prevents a *corrupt*
  file but not a lost *concurrent* body update; the SSE channel reconverges open views. No locking, no
  database. See `docs/stories/application-dock-general/1.8.concurrency-safe-json-persistence.story.md`
  as the foundational follow-up.

### Additional (Architecture) Requirements

- AR-1: **App registration** — registry entry + lazy routes + backend `routers/shared_notes.py`
  mounted under `/api/shared-notes` + `apps/shared-notes/` frontend skeleton + `_APPS` entry in
  `routers/shell.py` + `docs/stories/shared-notes/{for-review,done}/`.
- AR-2: **Data layout — one file per note.** Because sharing is the whole point of this app, a note is
  **never** embedded in a per-user document (unlike Listies' private→shared promotion). Every note is
  its own file from creation at `DATA_DIR/shared-notes/notes/{note_id}.json`; the repo
  `mkdir(parents=True, exist_ok=True)` on write and returns `None` (not an error) when a note id has
  no file. There is no per-user index file — the note list is derived by scanning the notes directory
  for files where the caller is a member.
- AR-3: **Repository / service / schemas split** — `repositories/shared_notes_repo.py` (only FS
  access, atomic writes, note-id path safety), `services/shared_notes_service.py` (note lifecycle,
  membership, the access resolver; raises stdlib exceptions + `PermissionError`),
  `schemas/shared_notes.py` (Pydantic v2 models). Stable ids: notes `n-{uuid8}`. Top-level
  `schema_version` with a `migrate()` on read.
- AR-4: **API contract** — `/api/shared-notes/*`, every route `Depends(get_current_user)`; the
  username identifies the caller and never appears in a path/body. Direct serialization; `{detail}`
  errors.

### Data Model

One JSON file per note — `DATA_DIR/shared-notes/notes/{note_id}.json`:

```jsonc
{
  "schema_version": 1,
  "id": "n-ab12cd34",
  "title": "Weekend plan",
  "body": "- book train\n- pack tent\n(bob) I'll bring the stove",   // one shared free-text body
  "owner": "alice",
  "members": ["alice", "bob", "carol"],   // owner is always the first member
  "rev": 7,                               // bumped on every content write; consumed by SSE (Epic 2)
  "created_at": "2026-09-05T10:00:00Z",
  "updated_at": "2026-09-05T11:20:00Z"
}
```

- **`body`** is a single string — the shared scratchpad. There is no block/entry structure; a save
  replaces the whole body (FR-6). `""` is a legitimate empty body.
- **`members`** always contains `owner`; membership is the access control list. Access to a note ≡
  caller ∈ `members`; a non-member gets a `404` identical to a non-existent id (NFR-2).
- **`rev`** increments on every content write (title or body). Epic 2's SSE layer emits it so an open
  member can tell a change apart from its own echo.

### FR Coverage Map

- FR-1: Epic 1 — app registered in the shell
- FR-2: Epic 1 — caller identity + membership derived from the JWT
- FR-3: Epic 1 — create a note
- FR-4: Epic 1 — home lists my notes and opens one
- FR-5: Epic 1 — rename a note
- FR-6: Epic 1 — edit the shared body
- FR-7: Epic 1 — delete a note (owner-only)
- FR-8: Epic 2 — share / add member / remove member
- FR-9: Epic 2 — flat editor permissions, owner-only management (403)
- FR-10: Epic 2 — live title/body propagation over SSE
- FR-11: Epic 2 — live membership / lifecycle propagation
- FR-12: Epic 2 — home distinguishes shared-with-me / shared-by-me

## Epic List

### Epic 1: Foundation & the note loop
Register Shared Notes in the dock, stand up the one-file-per-note data layer with its access
resolver, and let a user create a note, see it on a list, open it, edit its title and shared body,
and delete it. Delivers app registration, the repository/service/schemas, and a working single-user
note the collaboration layer then opens up. Every note is a shared document from creation (owner as
sole member), so no storage rework is needed in Epic 2.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
**Supporting:** AR-1, AR-2, AR-3, AR-4; NFR-1, NFR-2, NFR-3, NFR-4, NFR-5.

### Epic 2: Sharing & live collaboration
A note stops being one person's. The owner shares it with chosen dock users and manages the member
list; every member edits the same title and body, and changes — content and membership — propagate
**live** over Server-Sent Events to every member with the note open. The owner alone manages
membership and can delete the note. The home distinguishes notes shared with me from notes I share
out.
**FRs covered:** FR-8, FR-9, FR-10, FR-11, FR-12
**Supporting:** NFR-2, NFR-3, NFR-4, NFR-5.

**Data & architecture notes:**
- No storage change is needed to start sharing: a note is already its own file with `owner`,
  `members` and `rev` from Epic 1. Epic 2's backend adds membership mutation + the owner guard on top
  of the existing resolver, and the SSE channel.
- Liveness is a process-local `asyncio` event bus + an SSE endpoint (`GET
  /api/shared-notes/notes/{note_id}/events`), authenticated via `?token=` because `EventSource`
  cannot send a header. Single-worker deployment assumption (per CLAUDE.md). Coarse
  `note.changed { rev, actor }` / `members.changed` / `note.closed` events drive a client refetch
  rather than delta replay of the body.
- Concurrency is atomic-write, last-write-per-save — an accepted limitation at this scale (NFR-5); see
  `docs/stories/application-dock-general/1.8.concurrency-safe-json-persistence.story.md`.

**Dependencies:** Epic 2 builds on Epic 1 (needs the data layer, the resolver, and a working editor
to collaborate on). No epic depends on a later epic.

**Epic 2 stories (implemented in order, each depends on the previous):**
- **Story 2.1 — Sharing lifecycle (backend).** Owner-only share / add-member / remove-member
  endpoints on top of the existing resolver, username validation against `auth_service`, and the
  `PermissionError → 403` mapping. After 2.1, sharing works end-to-end via the API; members' edits
  are seen on the next fetch. Covers FR-8, FR-9 (backend).
- **Story 2.2 — Live propagation over SSE.** An in-process event bus + an authenticated
  `text/event-stream` endpoint, `note.changed`/`members.changed`/`note.closed` emission, and the
  client `useNoteEvents` composable + store reconciliation so a member's title/body change appears on
  every open member's screen within a moment. Covers FR-10, FR-11 (live channel).
- **Story 2.3 — Sharing UI and live membership.** The share dialog, home badges (shared-by-me /
  shared-with-me), the note-page collaborators affordance, and live reactions to
  membership/lifecycle events. Covers FR-8, FR-11, FR-12 (user-facing).

---

## Epic 1: Foundation & the note loop

A logged-in user can open Shared Notes and manage their own notes — create, list, open, edit and
delete — with every note already stored as a shareable document.

### Story 1.1: Register Shared Notes in the Application Dock shell

As a user,
I want Shared Notes to appear as an app in the dock and open to its own home,
so that I can launch it like any other app in the platform.

**Acceptance Criteria:**

**Given** the dock landing page
**When** it renders the app registry
**Then** a Shared Notes card appears (label "Shared Notes", icon `sticky_note_2`) alongside the
existing apps, and selecting it routes to `/shared-notes` (FR-1).

**Given** `GET /api/apps`
**When** called
**Then** the response includes a Shared Notes `AppDescriptor`
(`id: "shared-notes"`, `label: "Shared Notes"`, `icon: "sticky_note_2"`, `route: "/shared-notes"`).

**Given** the new app module
**When** the project is set up
**Then** `src/apps/shared-notes/` exists (self-contained; the shell imports it only via
`registry.ts`), a backend `routers/shared_notes.py` is mounted under `/api/shared-notes` behind
`Depends(get_current_user)`, and `docs/stories/shared-notes/{for-review,done}/` exist. Existing
`pytest`/`npm test` stay green; formatters/linters clean.

### Story 1.2: One-file-per-note data model, repository & schemas

As the platform,
I want one JSON file per note with an atomic-write repository and typed schemas,
so that every note is stored as its own shareable document, isolated by membership.

**Acceptance Criteria:**

**Given** `repositories/shared_notes_repo.py`
**When** a note id has no file yet
**Then** the read returns `None` (no error); the repo is the only module that touches the filesystem,
`mkdir(parents=True, exist_ok=True)` on write, and all writes go through `_atomic_write_json` (AR-2,
NFR-1).

**Given** a note id containing a path separator or a parent reference
**When** the repo derives a path from it
**Then** it raises rather than writing outside `notes/` (NFR-2).

**Given** `schemas/shared_notes.py`
**When** models are defined
**Then** a Pydantic v2 `Note` model exists (`schema_version`, `id`, `title`, `body`, `owner`,
`members: list[str]`, `rev: int`, `created_at`, `updated_at`) with `body` defaulting to `""`, and a
`migrate()` runs on read so future schema bumps are handled (AR-3).

**Given** the write path
**When** a note is created
**Then** it is stamped with a stable `n-{uuid8}` id, `owner` and `members` seeded to the creator, and
ISO-8601 timestamps.

**Given** the service layer (`services/shared_notes_service.py`)
**When** it operates on a note
**Then** it raises stdlib exceptions (`FileNotFoundError` for a missing/inaccessible note,
`ValueError` for invalid input) and never raises `HTTPException` (NFR-3).

### Story 1.3: Create, list, rename, edit and delete a note (backend)

As a user,
I want an API to create a note, list the notes I can see, open one, change its title and body, and
delete one I own,
so that the note loop works end-to-end before any UI is built.

**Acceptance Criteria:**

**Given** `POST /api/shared-notes/notes` with a title
**When** called
**Then** a note file is created with an `n-{uuid8}` id, an empty body, `owner` = me and
`members = [me]`, and the created note is returned (FR-3).

**Given** the access resolver
**When** any note operation runs for `note_id`
**Then** it loads the note only if I am in its `members`; otherwise it raises `FileNotFoundError` —
a non-member gets the identical `404` as a non-existent note (FR-2, NFR-2).

**Given** `GET /api/shared-notes/notes`
**When** called
**Then** it returns the notes where I am a member, each summarised with `id`, `title`, `owner`,
`shared` (true when `members` has more than one), and `updated_at`, newest `updated_at` first (FR-4).

**Given** `GET /api/shared-notes/notes/{note_id}`
**When** I am a member
**Then** it returns the full note (`title`, `body`, `owner`, `members`, `rev`, `can_manage` — true
only for the owner); when I am not a member it returns `404` (FR-2, NFR-2).

**Given** `PUT /api/shared-notes/notes/{note_id}` with a title and/or body
**When** I am a member
**Then** the given fields are written, `rev` is bumped and `updated_at` stamped; a blank title is
rejected with `422`; the body may be any string including `""` (FR-5, FR-6).

**Given** `DELETE /api/shared-notes/notes/{note_id}`
**When** I am the owner
**Then** the note file is removed; a non-owner member gets `403` and a non-member gets `404` (FR-7,
FR-9).

### Story 1.4: Home — list my notes and open one

As a user,
I want a home screen listing the notes I can see, with a way to create one,
so that I can find a note and jump into it.

**Acceptance Criteria:**

**Given** the Shared Notes home (`/shared-notes`)
**When** it loads
**Then** it calls `GET /api/shared-notes/notes` through a Pinia store (exposing `loading`/`error`)
and shows my notes with their title, owner and a relative "edited" time, newest first; with none yet
it shows a calm empty state prompting me to create my first note (FR-4).

**Given** the home
**When** I use the "new note" control and enter a title
**Then** `POST /api/shared-notes/notes` creates the note and I am taken to
`/shared-notes/notes/:noteId`; a blank title disables submit (FR-3).

**Given** a note in the list
**When** I select it
**Then** I navigate to `/shared-notes/notes/:noteId`.

**Given** a note I own
**When** I choose delete from its list control and confirm
**Then** `DELETE /api/shared-notes/notes/{note_id}` removes it and it disappears from the list; the
control requires an explicit confirmation and is offered only for notes I own (FR-7).

_Note: this story lists notes where I am a member; until Epic 2 that is just my own notes. The
shared-with-me / shared-by-me distinction (FR-12) lands in Story 2.3._

### Story 1.5: Note editor — edit the shared title and body

As a user,
I want to open a note and edit its title and body,
so that I can actually write in the scratchpad.

**Acceptance Criteria:**

**Given** `/shared-notes/notes/:noteId`
**When** it loads
**Then** it calls `GET /api/shared-notes/notes/{note_id}` and renders the title and a full-height
body textarea; a note id that isn't mine or doesn't exist shows a not-found state with a way back to
the home (FR-2, NFR-2).

**Given** the body textarea
**When** I type and then pause
**Then** the change is saved via `PUT /api/shared-notes/notes/{note_id}` (debounced) through the
store, the editor stays responsive throughout, and a save error surfaces via the store's `error`
without losing my in-progress text (FR-6, NFR-4).

**Given** the title field
**When** I edit it and commit (blur / Enter)
**Then** it is saved via the same `PUT`; a blank title is rejected and the field reverts (FR-5).

**Given** a body I clear entirely
**When** it saves
**Then** an empty string is persisted and the note is not deleted.

---

## Epic 2: Sharing & live collaboration

A note becomes a shared, live document: the owner picks who is in, everyone edits the same body, and
every change shows up on every open screen.

### Story 2.1: Sharing lifecycle (backend)

As a note's owner,
I want to share it with chosen dock users and add or remove members,
so that the people I choose edit one shared note with me.

**Acceptance Criteria:**

**Given** a note I own
**When** I `POST /api/shared-notes/notes/{note_id}/share` with `{ usernames: [...] }`
**Then** those usernames are unioned into `members` and the updated member list is returned; the note
now resolves for each of them (FR-8).

**Given** a note I own
**When** I `DELETE /api/shared-notes/notes/{note_id}/share/{username}`
**Then** that user is removed from `members` and can no longer access the note; the owner cannot be
removed (FR-8).

**Given** a note I am a member of but do **not** own
**When** I attempt share / add-member / remove-member / delete
**Then** the API rejects it with `403 {detail}` — only the owner manages membership and deletes the
note (FR-9).

**Given** a share request naming a username that does not exist on the platform
**When** submitted
**Then** it is rejected with `422 {detail}` (validated against `auth_service.list_usernames()`), and
no partial membership change is persisted (FR-8).

**Given** a share / member endpoint for a note the caller cannot access
**When** called
**Then** it returns `404 {detail}` — identical to a non-existent note (NFR-2).

### Story 2.2: Live propagation over SSE (backend + client channel)

As a member of a note,
I want other members' changes to appear on my screen while I have the note open,
so that we are looking at the same scratchpad in real time.

**Acceptance Criteria:**

**Given** `GET /api/shared-notes/notes/{note_id}/events?token=…`
**When** a member connects (token in the query because `EventSource` sends no header)
**Then** it opens a `text/event-stream`; a non-member or bad token gets `403`/`401` and no stream
(FR-10, NFR-2).

**Given** any content write (title or body) to a shared note
**When** it persists
**Then** a `note.changed { rev, actor }` event is emitted on a process-local event bus to every open
member (FR-10).

**Given** a membership change or a delete
**When** it persists
**Then** a `members.changed` (add/remove) or `note.closed { reason }` (delete, or the removed member)
event is emitted to the affected members (FR-11).

**Given** the client `useNoteEvents` composable + store reconciliation
**When** a `note.changed` arrives whose `actor` is me or whose `rev` I already have
**Then** it is ignored (no redundant refetch); otherwise the store refetches the note and updates the
editor without clobbering text I am actively typing (FR-10, NFR-4).

### Story 2.3: Sharing UI and live membership

As a user,
I want to manage who a note is shared with and see the roster and shared state in the app,
so that sharing is something I do from the UI, live.

**Acceptance Criteria:**

**Given** a note I own
**When** I open its collaborators affordance
**Then** I can add members (picking from dock users) and remove members, wired to the Story 2.1
endpoints through `useApi`; a non-owner sees the roster read-only (FR-8, FR-9).

**Given** the home list
**When** it renders
**Then** a note shared **with** me shows the owner's name and a "shared with you" cue, and a note I
own that has other members carries a "shared" indicator (FR-12).

**Given** I am added to or removed from a note while the app is open
**When** the `members.changed` / `note.closed` event arrives
**Then** an added note appears in my home (or my roster updates), and a removed or deleted note has
my open view closed with a reason and drops from my home (FR-11).

**Given** the owner removes a member or deletes the note
**When** the change lands
**Then** the removed/all members' open editors close with an explanatory message rather than silently
failing on the next save (FR-11).
