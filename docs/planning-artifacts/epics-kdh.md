

### Story 2.5: Make the roster visible and the name control unmissable

As anyone opening a calendar,
I want to see who is invited without opening anything, and to be told plainly when I have not said
who I am,
so that the app does not sit quietly read-only while I wonder why nothing responds.

**Acceptance Criteria:**

**Given** the calendar list
**When** a row renders
**Then** the calendar's name carries a **headcount beside it** — a person icon and the number of
active invitees — and the subtext lists **the invitees' names** in roster order, trailing off with
an ellipsis past the sixth. A calendar with nobody on it says so rather than showing an empty line
(FR-5).

**Given** `GET /api/kdh/calendars`
**When** summaries are built
**Then** each carries `invitee_names` — the active roster in order — so the list needs no request
per row. Tombstoned invitees appear in neither the names nor the count (FR-5, AR-7).

**Given** an open calendar
**When** the header renders
**Then** a headcount of active invitees sits beside the calendar's name (FR-5).

**Given** nobody has claimed a name on this device
**When** the header renders
**Then** the name control is styled as a **required field left blank** — negative border and text
with a warning glyph — and is large enough to read as the thing to answer first. Claiming a name
drops the treatment and the control settles into a quiet pill carrying that person's colour
(FR-10, FR-11).

---
stepsCompleted: [1, 2, 3, 4]
inputDocuments:
  - docs/superpowers/specs/2026-09-02-kdh-design.md
  - docs/planning-artifacts/ux-designs/ux-kdh-2026-09-03/DESIGN.md
  - docs/planning-artifacts/ux-designs/ux-kdh-2026-09-03/EXPERIENCE.md
  - docs/brainstorming/brainstorming-session-2026-09-02-0129.md
  - CLAUDE.md
  - docs/stories/application-dock-general/1.8.concurrency-safe-json-persistence.story.md
  - docs/planning-artifacts/epics-listies.md
---

# KDH (Shared Availability Calendar) — Epic Breakdown

## Overview

This document is the complete epic and story breakdown for **KDH**, a shared availability
calendar shipped as a new self-contained app inside the Application Dock platform.

A small, fixed group needs to find the days they can all make a session. **Admins** — anyone with
their own dock account — create a **calendar** per occasion (a long-running DnD campaign, a one-off
movie night, a birthday party), name it, list who is invited, and hand out its link. Everyone else
opens that link behind **one shared dock login** — a single configured **guest account** —
**claims a name** from the invitee roster, and clicks days. Each day carries one of three states per person: **available**,
**if needed**, or nothing. Day cells show who is on them and light up by **coverage**, brightest
where everyone is freely available. Admins **mark days as chosen**, accumulating over the life of a
calendar. Past days keep their votes but are frozen and dimmed.

Platform-wide architecture is inherited, not re-built (3-layer backend, `useApi` HTTP boundary,
registry + lazy routes, JWT auth, atomic JSON file persistence). Stories live under
`docs/stories/kdh/`.

**Two things make KDH different from every dock app before it, and both shape Epic 1:**

1. **Its data is shared, not per-user.** Listies, Context-Switch and Hotaru scope one JSON file per
   username. KDH's six voters share a single login, so the username selects nothing — calendars
   are global to the deployment and the file is chosen by calendar id.
2. **It is the platform's first genuinely multi-writer app.** Six people click days on the same
   calendar on the same evening. The unguarded read-modify-write documented in Story 1.8
   (*Concurrency-safe JSON persistence*, still **Draft**) would silently drop votes. KDH cannot
   ship on top of it unchanged — see NFR-1 and Story 1.2.

## Requirements Inventory

### Functional Requirements

**F1 — App integration & identity**
- FR-1: Registered in the Application Dock shell (landing-page card + its own route).
- FR-2: Every route sits behind `Depends(get_current_user)`. Data is **shared, not per-user** —
  every authenticated user sees the same calendars. No `user` field is accepted in any path or body.
- FR-3: Capability is decided by **which account you logged in as**: a username in the configured
  **guest list** is a guest, and **every other authenticated user is an admin**. A guest may read
  any calendar, claim a name, set their own votes and change their own colour, and nothing else.
  Admin-only routes reject a guest with `403`; the frontend hides admin controls rather than
  offering them and failing.

**F2 — Calendars**
- FR-4: An admin creates a **calendar** with a **name** and an initial **list of invitee names**.
- FR-5: The landing screen lists all calendars, newest first, and opens one on selection. Each row
  shows the calendar's **name with a headcount beside it** (a person icon and the number) and, in
  the subtext, **the invitees' names** — trailing off after the sixth, since a phone row holds no
  more. An empty state prompts the first calendar, with the create action shown only to admins.
- FR-6: An admin can **rename** and **delete** a calendar (delete requires confirmation).
- FR-7: A calendar has a **stable deep link** (`/kdh/c/{calendar_id}`) an admin can copy and hand
  out; opening it lands directly on that calendar's month view.

**F3 — Invitees & claiming a name**
- FR-8: An admin can **add** and **remove** invitees. Removal confirms first and **prunes that
  person's votes from today onward only** — past votes stay, so a long-running calendar keeps an
  honest record of who was around for sessions already played. A removed invitee still renders on
  past day cells in their own name and colour, but is gone from the roster, the claimable names,
  and the availability denominator.
- FR-9: Each invitee is assigned a **distinct colour** from a fixed palette when added; a person
  who has claimed that name may change it to another colour still free on that calendar.
- FR-10: A visitor **claims a name** by picking an invitee from the roster. The claim is remembered
  in `localStorage` keyed by calendar id, survives a reload, and can be **switched** at any time by
  picking someone else. There is no "release to nobody" — switching is the real case, and an
  unclaimed state a person chose would only make the app read-only for them. It is a convenience,
  not a security boundary.
- FR-11: Until a name is claimed the calendar is **read-only** — all overlap is visible, but
  clicking a day prompts the visitor to say who they are first.

**F4 — The month view**
- FR-12: The calendar renders the **current month** as a day grid, with **arrows** to the previous
  and next month and a control to jump back to today.
- FR-13: **How many names a cell shows depends on how much cell there is.** On a phone
  a day cell carries only the date and the coverage **count** — a ~44px cell cannot hold
  a name — and the names live in a **day sheet** opened by tapping the day. On the web
  layout the cell is large enough, so it also lists the voters beneath the count,
  comma-separated in the cell's own ink — not in each person's colour, since six
  colours on one line is a smear — trailing off past the sixth, and **ellipsised**
  when they do not fit the two lines available. Either way the
  **if-needed people are visually distinguished** by weight and style, and the sheet
  remains the complete list.
- FR-14: Cells are **heat-highlighted by coverage** (available + if needed), scaled against the
  number of **active** invitees. Full coverage is the brightest step, one short a clear step down,
  fading to no highlight at zero. A day at full coverage that **relies on any if-needed** is marked
  **provisional** rather than given a step of its own. The scale re-computes when the roster changes.
- FR-15: A claimed visitor **sets their availability** by clicking a day, cycling **none →
  available → if needed → none**. The change is optimistic; a failure rolls it back and surfaces
  the error. There is no limit on how many days one person marks — for a one-off occasion the
  expectation is that everybody offers several.
- FR-16: **Past days are frozen and dimmed** — votes and chosen markings stay visible and correctly
  coloured at reduced emphasis, and **cannot be voted on**. They can still be opened: a past day
  shows who was there, and an admin can still mark or unmark it chosen, because that is a record
  rather than an answer. "Past" means strictly before the **server's** current date.
- FR-17: An admin can **mark a day as chosen** and unmark it. Any number of days may be chosen, and
  the marking is visually distinct from the availability heat. It survives into the past, which is
  what makes the calendar a record of sessions actually held.

### NonFunctional Requirements

- NFR-0: **Two layouts, phone and web.** The phone layout is the primary one and the
  constraint the interface was designed against; the web layout is the same app given
  room. The breakpoint is **700px**. Below it the calendar is the full width of the
  screen with a ~44px day cell; above it the calendar is a centred band at 66% of the
  window (with a floor so a narrow window keeps its content, and a cap so it stays
  readable on a very wide monitor), the day cells are square, and the numerals scale
  fluidly with the viewport rather than jumping at a second breakpoint.
- NFR-1: **Concurrent voting is the normal case, so writes must not lose updates.** Six people share
  one login and click days on the same calendar at the same time. The platform's current
  read-modify-write over a whole JSON document (Story 1.8, still Draft) would silently clobber
  votes. KDH must serialize mutations **per calendar file** — either by landing 1.8 first or by
  carrying an equivalent lock in its own foundation story. This is the single biggest risk in the app.
- NFR-2: **Shared, not per-user, storage** — one file per calendar at
  `DATA_DIR/kdh/calendars/{calendar_id}.json`. The listing is a directory scan (precedent:
  archery's session listing), so there is no index file to become a second contention point.
- NFR-3: **JSON files on disk, atomic writes, no database.** All writes go through
  `_atomic_write_json`; only the repository touches the filesystem.
- NFR-4: **Platform conformance.** Strict 3-layer backend (stdlib exceptions become `HTTPException`
  only in routers); `useApi` as the single HTTP boundary; registry + lazy routes; Pinia store
  exposing `loading`/`error`; snake_case JSON, direct serialization, no envelopes, `{detail}`
  errors, ISO-8601 dates.
- NFR-5: **Dates are calendar dates, never timestamps.** Availability is stored as `YYYY-MM-DD`
  with no timezone; "today" for the past/future boundary is resolved **server-side**, so a
  traveller's laptop clock cannot unfreeze a past day for them alone.
- NFR-6: **Legible at a glance is the whole product.** At arm's length, one-handed, on a phone.
  The wash stays distinguishable for group sizes from 2 to ~12 and never relies on colour alone:
  the count is in every cell, and chosen and provisional days are marked by **shape**. Every
  text/background pair meets 4.5:1, which is why the ink flips dark at the top of the ramp.

### Additional (Architecture) Requirements

- AR-1: **App registration** — `registry.ts` entry, lazy routes, `_APPS` entry in `routers/shell.py`,
  backend `routers/kdh.py` under `/api/kdh`, `frontend/src/apps/kdh/`,
  `docs/stories/kdh/{for-review,done}/`.
- AR-2: **Guests are configured; admins are everyone else** — `settings.kdh_guests`, a
  comma-separated `KDH_GUESTS` env var defaulting to `players`. The operator creates that account
  from the dock's existing Settings page and shares its credentials with the group.
  `GET /api/kdh/me` returns `{ username, is_admin }`. **This fails open by design:** an admin
  allowlist fails closed — one wrong username and nobody can administer anything — and needs the
  real account names up front. The denylist instead over-grants the shared account on
  misconfiguration and needs no knowledge of who the owners are.
- AR-3: **Layer split** — `repositories/kdh_repo.py` (only FS access, atomic writes, per-file
  locking), `services/kdh_service.py` (all logic, stdlib exceptions), `schemas/kdh.py`
  (Pydantic v2). Stable ids: calendars `cal-{uuid8}`, invitees `inv-{uuid8}`. Top-level
  `schema_version` with `migrate()` on read.
- AR-4: **Votes are keyed by date, not by person** —
  `votes: { "YYYY-MM-DD": { invitee_id: "yes" | "if_needed" } }`. The month view needs exactly this
  shape, so rendering is a lookup per cell rather than a scan over people. Absence means "not
  available"; the third state is never stored.
- AR-5: **Setting one vote is its own narrow endpoint**, not a whole-document PUT. The request says
  only "this invitee, this date, this status", which keeps the write small, the lock window short,
  and makes a lost update impossible to express in the API.
- AR-6: **Claimed identity never reaches the server as authority.** The client sends an
  `invitee_id`; the server validates it exists and is active on that calendar, and nothing more.
  The trust boundary is the shared login, and the app should not imply otherwise.
- AR-7: **Removed invitees are tombstoned, not erased.** The record keeps name and colour with a
  `removed_at` stamp so past cells still render, and its colour stays reserved while it does. An
  invitee removed while holding no past votes at all is dropped outright.

### Data Model

One JSON file per calendar — `DATA_DIR/kdh/calendars/{calendar_id}.json`:

```jsonc
{
  "schema_version": 1,
  "id": "cal-ab12cd34",
  "name": "DnD — Curse of Strahd",
  "created_at": "2026-09-02T01:29:00Z",
  "created_by": "jakub",           // audit only; confers no ongoing rights (AR-2)
  "updated_at": "2026-09-02T01:44:00Z",
  "invitees": [
    { "id": "inv-1a2b3c4d", "name": "Dani",  "color": "#e8643a", "order": 0, "removed_at": null },
    { "id": "inv-5e6f7a8b", "name": "Jakub", "color": "#3a86e8", "order": 1, "removed_at": null },
    { "id": "inv-9c0d1e2f", "name": "Tom",   "color": "#6f4ae8", "order": 2,
      "removed_at": "2026-08-20T18:00:00Z" }        // tombstoned (AR-7)
  ],
  "votes": {                       // ISO date -> invitee id -> status (AR-4)
    "2026-08-10": { "inv-9c0d1e2f": "yes" },        // past; survived Tom's removal
    "2026-09-14": { "inv-1a2b3c4d": "yes", "inv-5e6f7a8b": "yes" },
    "2026-09-21": { "inv-5e6f7a8b": "if_needed" }
  },
  "chosen_dates": ["2026-08-10", "2026-09-14"]      // admin-marked; any number, ascending
}
```

**Statuses.** `"yes"` is freely available; `"if_needed"` is "I can make this work if it's the day
that saves the session". Every other state — declined, undecided, never looked — is **absence**.

**Rules.** A date key with an empty map is pruned; an invitee id appears at most once per date.
Removing an invitee deletes their entries on dates **>= today** only, drops any date left empty, and
stamps `removed_at`; if that leaves them with no entries anywhere, the record is dropped entirely.
Removal never touches `chosen_dates`. Colours are unique within a calendar, including against
tombstones still holding past votes.

### API Surface

All routes behind `Depends(get_current_user)`; admin-only marked **[A]**.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/kdh/me` | `{ username, is_admin, today }` — which controls render, and the server's date as the past/future boundary |
| `GET` | `/api/kdh/calendars` | Summaries (id, name, invitee count, next chosen date), newest first |
| `POST` | `/api/kdh/calendars` | **[A]** Create from `{ name, invitee_names: [] }` |
| `GET` | `/api/kdh/calendars/{id}` | The full calendar document |
| `PUT` | `/api/kdh/calendars/{id}` | **[A]** Rename |
| `DELETE` | `/api/kdh/calendars/{id}` | **[A]** Delete |
| `POST` | `/api/kdh/calendars/{id}/invitees` | **[A]** Add `{ name }`, colour auto-assigned |
| `DELETE` | `/api/kdh/calendars/{id}/invitees/{inv}` | **[A]** Remove; prune today onward, keep past |
| `PUT` | `/api/kdh/calendars/{id}/invitees/{inv}/color` | Recolour to a free palette colour |
| `PUT` | `/api/kdh/calendars/{id}/votes` | Set one vote: `{ invitee_id, date, status }` |
| `PUT` | `/api/kdh/calendars/{id}/chosen` | **[A]** Mark/unmark a date: `{ date, chosen }` |

`404` unknown calendar or invitee · `403` admin route without admin · `422` blank name, duplicate
invitee name, malformed date, unknown status, exhausted palette, a vote on a past date, or a vote
cast as a removed invitee.

### FR Coverage Map

| FR | Epic | Delivered as |
|---|---|---|
| FR-1 | Epic 1 | The app card, route and backend router exist |
| FR-2 | Epic 1 | Every route authenticated; storage shared, not per-user |
| FR-3 | Epic 1 | The guest denylist, the `403` gate, and `GET /me` |
| FR-4 | Epic 1 | Create a calendar with a name and initial invitee names |
| FR-5 | Epic 1 | The landing list, newest first, with its empty state |
| FR-6 | Epic 1 | Rename and delete a calendar |
| FR-7 | Epic 1 | The stable deep link and the copy control |
| FR-8 | Epic 2 | Add an invitee; remove one with today-onward pruning and tombstoning |
| FR-9 | Epic 2 | Palette colour on add, and recolouring to a free colour |
| FR-10 | Epic 2 | Claiming a name, remembered per calendar in `localStorage` |
| FR-11 | Epic 2 | The read-only state before a name is claimed |
| FR-12 | Epic 3 | The month grid, prev/next arrows and the jump-to-today control |
| FR-13 | Epic 3 | The day sheet — who is on a date, with if-needed styling |
| FR-14 | Epic 3 | The coverage wash and its provisional marking |
| FR-15 | Epic 3 | The none → available → if needed cycle, set optimistically |
| FR-16 | Epic 3 | Past days frozen server-side and dimmed in the grid |
| FR-17 | Epic 4 | Marking and unmarking chosen days, and surfacing them on the list |

All 17 FRs are covered. NFR-1 to NFR-5 and AR-1 to AR-5 land in Epic 1 (they are the foundation
the other epics build on); NFR-6 is exercised by Epic 3; AR-6 and AR-7 land in Epic 2.

## Epic List

### Epic 1: Foundation & Calendars
Admins can create a calendar for an occasion, name it, seed it with who is invited, find it again
in a list, rename or delete it, and copy a link to hand out. Non-admins can open that link and see
the calendar exists. This epic also stands up everything the later epics rest on: the shared
(not per-user) data layer, the guest/admin rule, and — critically — **write serialization per
calendar file**, without which the voting in Epic 3 silently loses votes.
**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-6, FR-7
**Also lands:** NFR-1, NFR-2, NFR-3, NFR-4, NFR-5, AR-1, AR-2, AR-3, AR-4, AR-5

### Epic 2: Invitees & Claiming a Name
The roster becomes real and personal. Admins add and remove invitees, each getting their own
colour; removal keeps the past intact and only clears the future. Anyone opening the calendar says
which of those people they are, and the app remembers — so the month knows who is clicking before
Epic 3 gives them anything to click.
**FRs covered:** FR-8, FR-9, FR-10, FR-11
**Also lands:** AR-6, AR-7

### Epic 3: The Month and Voting
The product arrives. A month grid with arrows, day cells carrying the date and the coverage count,
a day sheet one tap away for who is actually on a date, a three-state tap cycle for setting your
own availability, and the wash that makes the viable days obvious at a glance. Past days are frozen
and dimmed, so the grid is honest about what can still change.
**FRs covered:** FR-12, FR-13, FR-14, FR-15, FR-16
**Also lands:** NFR-6

### Epic 4: Chosen Days
The loop closes. Admins mark the days that won, as many as the calendar accumulates, in a marking
that outlives the availability heat and survives into the greyed past — turning a scheduling tool
into a record of the sessions actually held. Those chosen dates then surface on the landing list so
a calendar's next (or last) session reads without opening it.
**FRs covered:** FR-17

### Dependencies

Epic 2 depends on Epic 1 (it needs a calendar to hold a roster). Epic 3 depends on both — it has
nothing to vote as until a name can be claimed. Epic 4 depends on Epic 3 for the grid it decorates.
**No epic depends on a later one**, and each is shippable on its own: Epic 1 alone gives admins
working calendars, Epic 2 alone gives a usable guest list, Epic 3 alone is a working availability
poll, and Epic 4 is purely additive.

### Deferred to a later epic

**Secret share links.** A per-calendar token behind `/kdh/j/{token}`, opening a calendar vote-only
with **no login at all** — so the group needs no credentials, only a URL. Chosen against for v1
because it would add the platform's first unauthenticated endpoint; the guest account delivers the
same capability split behind the existing login. If it is built later it slots in beside Epic 1
without disturbing anything: the guest account and the token would simply be two routes to the same
vote-only capability.

## Epic 1: Foundation & Calendars

Admins can create a calendar for an occasion, name it, seed it with who is invited, find it again
in a list, rename or delete it, and copy a link to hand out. This epic also stands up the shared
(not per-user) data layer, the guest/admin rule, and write serialization per calendar file.

### Story 1.1: Register KDH in the Application Dock shell

As a user of the Application Dock,
I want KDH to appear as a card on the landing page and open at its own route,
so that I can reach it the same way I reach every other app.

**Acceptance Criteria:**

**Given** `frontend/src/apps/registry.ts`
**When** the shell landing page renders
**Then** a card appears with `id: "kdh"`, `label: "KDH"`, `icon: "event_available"` and
`route: "/kdh"`, rendered by the generic `AppCard` with no shell changes beyond the registry entry
(FR-1, AR-1).

**Given** `frontend/src/router/routes.ts`
**When** the routes are defined
**Then** `/kdh` and `/kdh/c/:calendarId` both resolve behind the app's existing auth guard, each
lazy-loading a **minimal page shell** that later stories fill in — so this story stands alone with
no reference to work not yet done (FR-1, FR-7).

**Given** `backend/app/routers/kdh.py` and `backend/app/routers/shell.py`
**When** the API boots
**Then** a router is mounted at `/api/kdh`, every route declares `Depends(get_current_user)`, and
KDH is listed in the `_APPS` registry served by `GET /api/apps` (FR-1, FR-2, AR-1).

**Given** `routers/kdh.py`
**When** it is created
**Then** it declares `Depends(get_current_user)` as the pattern every route will carry and records
in its docstring that the username is for the **admin check only**, never to select a file. The
router carries no routes yet, so the live `401` assertion belongs to Story 1.3 with the first real
endpoint — a placeholder endpoint invented only to test it would be dead code (FR-2).

**Given** the docs tree
**When** this story lands
**Then** `docs/stories/kdh/for-review/` and `docs/stories/kdh/done/` exist, `frontend/src/apps/kdh/`
exists as a self-contained module the shell imports only via `registry.ts`, and existing `pytest` /
`npm test` stay green with formatters and linters clean (AR-1).

### Story 1.2: Shared data model, repository & per-calendar write serialization

As the platform,
I want calendars stored as one JSON file each, with every read-modify-write on a calendar
serialized against concurrent writers,
so that six people voting on the same evening never silently erase each other's votes.

**Acceptance Criteria:**

**Given** `repositories/kdh_repo.py`
**When** it reads and writes calendars
**Then** it is the only module touching the filesystem, stores one file per calendar at
`DATA_DIR/kdh/calendars/{calendar_id}.json`, does `mkdir(parents=True, exist_ok=True)` on write,
routes every write through `_atomic_write_json`, and lists calendars by scanning the directory
with no index file (NFR-2, NFR-3, AR-3).

**Given** two concurrent requests that both toggle a vote on the **same** calendar
**When** they interleave on the threadpool
**Then** **both votes survive** — the repo serializes read-modify-write per calendar file, and the
`.tmp` path used by the atomic write is unique per writer so two writers cannot clobber each
other's temp payload (NFR-1).

**Given** platform Story 1.8 (*Concurrency-safe JSON persistence*)
**When** it has already landed
**Then** this story **consumes its per-file lock helper** rather than duplicating it; when it has
not, this story implements the equivalent lock scoped to KDH and leaves the platform fix
unblocked (NFR-1).

**Given** `schemas/kdh.py`
**When** models are defined
**Then** Pydantic v2 models exist for `Invitee` (`name`, `color`, `order`, `removed_at`),
`VoteStatus` (`yes` | `if_needed`), and the calendar document (`schema_version`, `id`, `name`,
`created_at`, `created_by`, `updated_at`, `invitees`, `votes` keyed date → invitee id → status,
`chosen_dates`), with `migrate()` running on read (AR-3, AR-4).

**Given** the write path
**When** a calendar or invitee is created
**Then** it is stamped with a stable id (`cal-` / `inv-` + `{uuid8}`) and ISO-8601 timestamps; ids
are unique within the document (AR-3).

**Given** a calendar id containing a path separator or a parent reference
**When** the repo derives a path from it
**Then** it raises rather than writing outside `calendars/` (NFR-2).

**Given** `services/kdh_service.py`
**When** it operates on a document
**Then** it raises stdlib exceptions only — `FileNotFoundError` for a missing calendar or invitee,
`ValueError` for invalid input, `PermissionError` for a non-admin action — and never raises
`HTTPException` (NFR-4).

**Given** dates anywhere in the document
**When** they are stored or compared
**Then** they are `YYYY-MM-DD` strings with no timezone, and "today" is resolved server-side
(NFR-5).

### Story 1.3: Create a calendar with invitees, and see the list

As an admin,
I want to create a calendar by naming it and listing who is invited, and to see all calendars,
so that each occasion gets its own place and I can find it again.

**Acceptance Criteria:**

**Given** `settings.kdh_guests`
**When** the API boots with no `KDH_GUESTS` env var set
**Then** it defaults to the single guest account `players`, every other authenticated username is
an admin, and `GET /api/kdh/me` returns `{ username, is_admin }` for the caller (FR-3, AR-2).

**Given** an unauthenticated request to any `/api/kdh/*` route
**When** it is made
**Then** it is rejected with `401`, matching every other app on the platform. This is the first
story with a real endpoint to assert it against, deferred here from Story 1.1 (FR-2).

**Given** an authenticated **guest**
**When** they call any admin-only route
**Then** it is rejected with `403` and a `{detail}` body; the frontend hides admin controls rather
than rendering them and letting them fail (FR-3).

**Given** the KDH home (`/kdh`)
**When** it loads
**Then** it calls `GET /api/kdh/calendars` and shows every calendar — newest first — with its name
and invitee count; the same list is shown to admins and non-admins alike, because the data is
shared, not per-user (FR-2, FR-5).

**Given** the home with no calendars yet
**When** it renders for an admin
**Then** it shows a calm empty state prompting the first calendar; for a non-admin it shows an
empty state that says to ask an admin, with no disabled create control dangling (FR-5).

**Given** the create-calendar dialog
**When** an admin enters a name and a list of invitee names and submits
**Then** `POST /api/kdh/calendars` persists a calendar with a `cal-{uuid8}` id, an invitee record
per name each carrying a distinct palette colour, empty `votes` and empty `chosen_dates`, and the
admin lands on `/kdh/c/:calendarId` (FR-4).

**Given** a create request with a blank calendar name, zero invitees, a blank invitee name, or two
identical invitee names
**When** it is submitted
**Then** the client disables submit and the API rejects it with `422` `{detail}` as a backstop.

**Given** an unknown calendar id
**When** `GET /api/kdh/calendars/{id}` is called
**Then** it returns `404` with `{detail}`.

### Story 1.4: Rename, delete, and share a calendar

As an admin,
I want to rename a calendar, delete one that is finished, and copy its link,
so that I can keep the list tidy and get the right people to the right calendar.

**Acceptance Criteria:**

**Given** a calendar open at `/kdh/c/:calendarId`
**When** an admin renames it
**Then** `PUT /api/kdh/calendars/{id}` persists the new name, `updated_at` is refreshed, and the
name updates in place without a reload (FR-6).

**Given** a calendar an admin wants gone
**When** they choose delete
**Then** a confirmation names the calendar first; on confirming, `DELETE /api/kdh/calendars/{id}`
removes the file and the admin returns to the list (FR-6).

**Given** any calendar page
**When** an admin uses the share control
**Then** the full `/kdh/c/:calendarId` URL is copied to the clipboard with a confirmation, and
opening that URL in a fresh session lands directly on that calendar after login (FR-7).

**Given** a non-admin viewing a calendar
**When** the page renders
**Then** no rename, delete or create control is present at all (FR-3).

**Given** a rename to a blank or whitespace-only name
**When** submitted
**Then** the client disables submit and the API rejects it with `422`.

## Epic 2: Invitees & Claiming a Name

The roster becomes real and personal. Admins add and remove invitees, each with their own colour;
removal keeps the past intact and only clears the future. Anyone opening the calendar says which of
those people they are, and the app remembers.

### Story 2.1: Add an invitee, with a colour of their own

As an admin,
I want to add someone to a calendar and have them get a distinct colour,
so that a latecomer can join in and be told apart from everyone else at a glance.

**Acceptance Criteria:**

**Given** an open calendar
**When** an admin adds an invitee by name
**Then** `POST /api/kdh/calendars/{id}/invitees` appends an invitee with an `inv-{uuid8}` id, the
next free colour from the fixed palette, `order` after the current last, and `removed_at: null`
(FR-8, FR-9).

**Given** a calendar whose invitees already hold some palette colours
**When** a new invitee is added
**Then** the assigned colour is one not held by any invitee on that calendar, **including
tombstoned ones still holding past votes** (FR-9, AR-7).

**Given** a calendar where every palette colour is taken
**When** an admin tries to add another invitee
**Then** the API rejects it with `422` and a `{detail}` explaining the palette is exhausted.

**Given** an invitee name that is blank, whitespace-only, or already used on that calendar
**When** submitted
**Then** the client disables submit and the API rejects it with `422`.

**Given** the roster panel
**When** it renders
**Then** it lists the active invitees in `order`, each as a chip in their own colour, and shows the
add control only to admins (FR-3, FR-9).

### Story 2.2: Remove an invitee without erasing the past

As an admin,
I want removing someone to clear only their upcoming availability,
so that a long-running calendar still records who was actually around for the sessions we played.

**Acceptance Criteria:**

**Given** an invitee holding votes on both past and future dates
**When** an admin removes them and confirms
**Then** `DELETE /api/kdh/calendars/{id}/invitees/{inv}` deletes their entries on dates **>= today**
only, leaves every entry on dates **< today** untouched, drops any date left with an empty map, and
stamps `removed_at` on their record while keeping their name and colour (FR-8, AR-7).

**Given** an invitee holding **no** votes on any past date
**When** they are removed
**Then** their record is dropped from the document entirely, leaving no residue for the common
"added by mistake" case (AR-7).

**Given** a removal of any kind
**When** it completes
**Then** `chosen_dates` is untouched — a session that happened still happened (FR-8).

**Given** a tombstoned invitee
**When** the roster, the claimable names, and the availability denominator are computed
**Then** they are excluded from all three, while their colour stays reserved for as long as they
hold past votes (FR-8, FR-14, AR-7).

**Given** the remove control
**When** an admin uses it
**Then** a confirmation names the person and states plainly that their upcoming availability will
be cleared and their past kept, before anything is written (FR-8).

**Given** a vote request naming a removed invitee
**When** it reaches the API
**Then** it is rejected with `422` (AR-6).

### Story 2.3: Claim your name on a calendar

As an invitee opening a shared link,
I want to say which of these people I am and have it remembered,
so that my clicks are mine without anybody needing an account.

**Acceptance Criteria:**

**Given** a calendar opened with no claim yet
**When** the page renders
**Then** the **name dropdown in the month header** reads "Who are you?"; opening it lists every
active invitee as a row — colour dot, name — each at least 44px tall. The month stays visible
behind it, which is why this won over a bottom sheet (FR-10).

**Given** the unclaimed state
**When** anything asks whether I may vote
**Then** the store reports that I may not, and any attempt to set a vote is refused before a
request is made — the calendar is fully readable but read-only. The month grid's own handling of
this state is Story 3.2's, which consumes this flag rather than re-deciding it (FR-11).

**Given** the unclaimed state
**When** I tap a day
**Then** the **name dropdown opens** rather than the tap being rejected — the first tap teaches the
model instead of refusing the user (FR-11).

**Given** I pick a name
**When** the claim is made
**Then** it is stored in `localStorage` keyed by calendar id, the roster settles into a quiet
roster with my name marked, and the month becomes interactive (FR-10, FR-11).

**Given** a claim already stored for this calendar
**When** I reload or return later
**Then** I am still that person, with no re-pick (FR-10).

**Given** a stored claim naming an invitee who has since been removed, or a corrupt/absent
`localStorage` value
**When** the page loads
**Then** the claim is discarded silently and the unclaimed state is shown, with no error and no
crash (FR-10, FR-8).

**Given** a claim
**When** I choose to release or switch it
**Then** a control does so at any time, and the app never treats the claim as a security boundary —
the server validates only that the `invitee_id` exists and is active on that calendar (FR-10, AR-6).

### Story 2.4: Change your colour

As an invitee,
I want to swap my colour for another one that is free,
so that I am not stuck with a colour I cannot tell apart from someone else's.

**Acceptance Criteria:**

**Given** I have claimed a name
**When** I open the **name dropdown**
**Then** the colour swatches sit inside it, below the roster: colours already held by others on
this calendar — tombstones included — are dimmed to 24%, and mine is ringed. There is no separate
colour surface (FR-9, AR-7).

**Given** I pick a free colour
**When** it is submitted
**Then** `PUT /api/kdh/calendars/{id}/invitees/{inv}/color` persists it and every place my colour
appears updates without a reload (FR-9).

**Given** a colour already held by another invitee on that calendar, or one outside the palette
**When** it is submitted
**Then** the API rejects it with `422` and the chip keeps its previous colour.

## Epic 3: The Month and Voting

The product arrives. A month grid with arrows, day cells carrying the date and the coverage count,
a day sheet one tap away for who is actually on a date, a three-state tap cycle for setting your
own availability, and the wash that makes the viable days obvious at a glance. Past days are frozen
and dimmed, so the grid is honest about what can still change.

### Story 3.1: The month grid and moving between months

As an invitee,
I want the current month laid out as a grid I can page backwards and forwards through,
so that I can look at the days we might actually meet on.

**Acceptance Criteria:**

**Given** a calendar page
**When** it loads
**Then** it renders the **current month** as a day grid with weekday headers, correct leading and
trailing blanks for the month's shape, and today visibly marked (FR-12).

**Given** the month header
**When** I use the previous or next arrow
**Then** the grid moves one month and the heading names the month and year; navigation works across
a year boundary in both directions (December → January and back). **Arrows only — no swipe**: on a
7×5 grid of tap targets a swipe is too easily triggered while aiming for a Tuesday (FR-12).

**Given** I have navigated away from the current month
**When** I use the jump-to-today control
**Then** the grid returns to the current month; the control is inert or hidden when already there
(FR-12).

**Given** the whole calendar document is already loaded
**When** I page between months
**Then** no further request is made — month navigation is a pure view change over data in the store
(NFR-4).

**Given** a calendar with no votes at all
**When** the month renders
**Then** every cell renders correctly as an empty day with no highlight and no names.

### Story 3.2: Set your availability on a day

As an invitee who has claimed a name,
I want to click a day to say I am free, or free if needed, and click again to take it back,
so that I can offer my availability in one gesture and change my mind just as easily.

**Acceptance Criteria:**

**Given** `PUT /api/kdh/calendars/{id}/votes` with `{ invitee_id, date, status }`
**When** it is called with `yes`, `if_needed` or `none`
**Then** it sets exactly that one entry — writing the status, or deleting the entry for `none` —
prunes the date key if its map is left empty, refreshes `updated_at`, and touches nothing else in
the document (FR-15, AR-4, AR-5).

**Given** a claimed invitee clicking a day
**When** they click repeatedly
**Then** the state cycles **none → available → if needed → none**, and the same click is idempotent
in effect — sending the status it is already at leaves the document unchanged (FR-15).

**Given** a click
**When** it is registered
**Then** the cell updates **immediately** and optimistically, the store reconciles on success, and
on failure the cell rolls back to its previous state with the message surfaced in `error` (FR-15,
NFR-4).

**Given** any day cell
**When** it renders
**Then** it carries the **date and the coverage count only** — never names, which do not fit at a
phone's ~44px and live in the day sheet instead (Story 3.3). The count is not decoration: adjacent
wash steps are genuinely close, and the number is what separates them (FR-13, FR-14, NFR-6).

**Given** nobody has claimed a name on this calendar yet
**When** I tap a day
**Then** nothing is written and the **name dropdown opens** — the first tap teaches the model
rather than refusing the user — using the flag from Story 2.3 (FR-11).

**Given** a vote on a date **strictly before the server's today**
**When** it reaches the API
**Then** it is rejected with `422`; "today" comes from the server, never the client (FR-16, NFR-5).

**Given** a request with a malformed date, an unknown status, an unknown `invitee_id`, or an
`invitee_id` belonging to a removed invitee
**When** it reaches the API
**Then** it is rejected — `422` for the bad input, `404` for an unknown calendar (AR-6).

**Given** several invitees voting on the same calendar at the same moment
**When** their requests interleave
**Then** every vote survives, per the serialization from Story 1.2 (NFR-1).

### Story 3.3: The day sheet — who is on this date

As anyone looking at the calendar,
I want tapping a day to show me who can make it, marking who is only there if needed,
so that I can read the shape of a day without the names having to fit inside a 44px cell.

**Acceptance Criteria:**

**Given** any day cell
**When** I tap it
**Then** a **day sheet** opens over the month showing that date in full, and it can be dismissed
without changing anything (FR-13).

**Given** a day with people on it
**When** the sheet renders
**Then** it lists them by the roster's `order`, each with their own colour as a dot beside their
name — never as the row's background, so a person's colour is never mistaken for a wash step
(FR-13, FR-9).

**Given** a day carrying both freely-available and if-needed people
**When** the sheet renders
**Then** the if-needed rows are **italic and slightly recessed** — set apart by weight and style,
never by tinting that person's colour, which has to keep meaning *that person* (FR-13, NFR-6).

**Given** a past day carrying a vote from an invitee who has since been removed
**When** the sheet renders
**Then** that person still appears, in their own name and colour, because their past was preserved
(FR-8, AR-7).

**Given** a day nobody has picked
**When** the sheet renders
**Then** it says so plainly rather than showing an empty list.

**Given** the sheet is open on a future day and I have claimed a name
**When** I look for my own answer
**Then** the three states are **explicit labelled controls** — Free / If needed / Can't — showing
my current answer, because this is where a person deliberately answers. (The grid's cycling tap is
Story 3.2; both write the same vote.) (FR-15)

### Story 3.4: Light up the days that work

As anyone looking at the calendar,
I want the days most people can make to be the brightest thing on the screen,
so that the answer is obvious before I have read a single name.

**Acceptance Criteria:**

**Given** `composables/useWashScale.ts`
**When** it is given the available count, the if-needed count and the number of **active** invitees
**Then** it returns a wash step and a provisional flag as a pure, side-effect-free function
(FR-14, NFR-6).

**Given** a day's coverage (available + if needed)
**When** the cell is painted
**Then** the wash step scales against the active invitee total, using the `wash-0`…`wash-6` tokens
in `DESIGN.md`: full coverage is the lightest step (pastel lilac), falling through eggplant to the
empty-cell ground at zero. Ink flips from pale to `ink-on-light` at the top two steps, where the
field is too light for pale text (FR-14, NFR-6).

**Given** a day at **full coverage that relies on at least one if-needed**
**When** it is painted
**Then** it takes the **same wash step** as an all-available day but is marked **provisional** — a
1px inset hairline in `wash-6`, never a fourth colour — so "everyone is free" and "everyone can be
made to work" are equally loud and never confused (FR-14, NFR-6).

**Given** an invitee is added or removed
**When** the roster changes
**Then** the scale re-computes against the new active total, and tombstoned invitees are excluded
from the denominator (FR-14, AR-7).

**Given** group sizes from 2 to 12
**When** the scale is exercised across every count
**Then** adjacent steps stay distinguishable, and a count is always present in the cell so the
reading never depends on colour alone (NFR-6).

### Story 3.5: The frozen, dimmed past

As anyone looking at the calendar,
I want past days to stay visible but plainly finished,
so that the grid is honest about what can still change without throwing away what happened.

**Acceptance Criteria:**

**Given** a day strictly before the server's today
**When** it renders
**Then** it keeps its votes, names, colours and heat, but at reduced emphasis, and reads clearly as
past (FR-16).

**Given** a past day
**When** anyone clicks it
**Then** nothing happens and no request is sent — the client mirrors the server's rejection rather
than relying on it (FR-16).

**Given** the server's today
**When** the client decides which days are past
**Then** it uses the **server's** date, so a wrong or travelling laptop clock cannot unfreeze a day
for one person only (FR-16, NFR-5).

**Given** a month entirely in the past
**When** I navigate to it
**Then** every day renders in the frozen state and the month is fully readable (FR-16).

**Given** today itself
**When** it renders
**Then** it is **not** past — it is votable, and it is marked as today (FR-16, FR-12).

## Epic 4: Chosen Days

The loop closes. Admins mark the days that won, in a marking that outlives the availability heat
and survives into the greyed past — turning a scheduling tool into a record of the sessions
actually held.

### Story 4.1: Mark the day that won

As an admin,
I want to mark a day as the one we are doing, and unmark it if plans change,
so that everyone can see the decision on the calendar instead of in a message thread.

**Acceptance Criteria:**

**Given** `PUT /api/kdh/calendars/{id}/chosen` with `{ date, chosen }`
**When** it is called
**Then** the date is added to or removed from `chosen_dates`, the list is kept sorted ascending and
free of duplicates, `updated_at` is refreshed, and votes are untouched (FR-17).

**Given** an admin on a day cell
**When** they use the mark-as-chosen control in that day's own context
**Then** the marking applies without entering a separate mode, and the cell updates immediately
(FR-17).

**Given** a calendar over its lifetime
**When** several days are marked
**Then** **any number** of chosen days coexist — a long-running calendar accumulates them (FR-17).

**Given** a chosen day
**When** it renders
**Then** its marking keeps a **shape as well as a colour** — a gold ring around the cell and a gold
crown above the date, whose slot is reserved in every cell so the dates stay aligned — so it stays
legible at every step of the ramp and through past-day dimming (FR-17, NFR-6).

**Given** a **past** day
**When** an admin marks or unmarks it
**Then** it is allowed — unlike voting, chosen marking is a record and may be corrected after the
fact (FR-16, FR-17).

**Given** a non-admin
**When** the calendar renders
**Then** chosen days are fully visible but no marking control is present (FR-3, FR-17).

**Given** a malformed date
**When** it is submitted
**Then** the API rejects it with `422`.

### Story 4.2: See a calendar's sessions from the list

As anyone opening KDH,
I want each calendar in the list to tell me when its next or last session is,
so that I know which one needs my attention without opening any of them.

**Acceptance Criteria:**

**Given** `GET /api/kdh/calendars`
**When** summaries are built
**Then** each carries the calendar's **next chosen date** if one is upcoming, otherwise its **most
recent past** chosen date, otherwise nothing (FR-5, FR-17).

**Given** a calendar with an upcoming chosen date
**When** it renders in the list
**Then** the subtext names that date as the next session, alongside the invitee count (FR-5).

**Given** a calendar whose chosen dates are all in the past
**When** it renders in the list
**Then** the subtext names the most recent one as the last session (FR-5, FR-17).

**Given** a calendar with no chosen dates at all
**When** it renders in the list
**Then** the subtext shows only the invitee count, with no empty or placeholder date text (FR-5).

**Given** the "next or last" decision
**When** it is computed
**Then** it uses the **server's** today, consistent with every other past/future boundary in the
app (NFR-5).
