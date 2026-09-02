# KDH — Design Spec

**Date:** 2026-09-02
**Status:** Approved (2026-09-02) — revised after review
**App id:** `kdh`

## Problem

A small, fixed group — six friends with full calendars — needs to find the days they can all
make a session. General scheduling tools (Doodle, When2meet, shared Google calendars) are a
hassle for this: they want accounts, they want time-of-day granularity nobody needs, they email
people, and they are built for strangers coordinating once. What the group actually wants is a
month on a wall that everybody scribbles on, where the days most people can make are simply the
brightest ones.

KDH is that wall. Each occasion gets its own calendar; each invitee clicks the days they are
free; the overlap lights up; an admin circles the day that won.

## Scope

Two **admins** — the fixed pair of dock accounts — create **calendars** — one per occasion: a
long-running DnD campaign, an ad-hoc movie night, a birthday party. Creating a calendar means
naming it and listing who is invited. The admin then hands out the calendar's link.

Everyone else opens that link behind **one shared dock login**. They see the month, the list of
invitees each in their own colour, and they **claim a name** — that is the whole of identity in
this app; there are no per-person accounts. Having claimed a name they click days to set their
availability, marking as many days as they like.

A day carries one of three states per person: **available**, **if needed** (they can make it work
if it's the day that saves the session, but it isn't a free evening), or nothing at all. Each day
cell shows, in small text, who is on it and which of them are only there if needed. The more
people a day covers the stronger its highlight, and a day everyone is freely available for burns
brightest of all. Arrows move between months. Past days keep their votes but are greyed and
frozen. Admins **mark days as chosen** — several per calendar, accumulating over the life of a
long-running one — and can **add or remove invitees** at any time.

**In v1:** the fixed admin pair, calendar create/rename/delete, invitee add/remove, claim-a-name
identity with a colour, month grid with prev/next navigation, three-state day availability
(available / if needed / none), overlap heat highlighting, per-day attendee names, chosen-day
marking, greyed-out past.

**Not in v1** (candidates for a later epic): time-of-day or partial-day availability,
notifications or reminders of any kind, iCal export or calendar
subscription, per-invitee logins, recurring events, comments or chat, managing the admin
allowlist from the UI, a public no-login share token, week or agenda views, an availability
deadline.

## Requirements

### Functional

**F1 — App integration & identity**
- FR-1: Registered in the Application Dock shell (landing-page card + its own route).
- FR-2: Every route sits behind `Depends(get_current_user)`. Unlike the other dock apps, KDH's
  data is **shared, not per-user** — the group logs in with one shared account, so every
  authenticated user sees the same calendars. No `user` field is accepted in any path or body.
- FR-3: A user is an **admin** if their JWT username is one of the **two fixed admin accounts**
  (`jake`, `dani`). This is a closed set, not a managed list — nobody can be promoted from inside
  the app. Admin-only routes reject non-admins with `403`; the frontend hides admin controls
  rather than offering them and failing.

**F2 — Calendars**
- FR-4: An admin creates a **calendar** with a **name** and an initial **list of invitee names**.
- FR-5: The app's landing screen lists all calendars, newest first, and opens one on selection;
  an empty state prompts the first calendar (with the create action shown only to admins).
- FR-6: An admin can **rename** and **delete** a calendar (delete requires confirmation).
- FR-7: A calendar has a **stable deep link** (`/kdh/c/{calendar_id}`) that an admin can copy
  and hand out; opening it lands directly on that calendar's month view.

**F3 — Invitees & claiming a name**
- FR-8: An admin can **add** and **remove** invitees on an existing calendar. Removing one
  confirms first and **prunes that person's votes from today onward only** — their votes on past
  dates stay exactly as they were, so a long-running calendar keeps an honest record of who was
  actually around for the sessions already played. A removed invitee therefore still renders on
  past day cells, in their own name and colour, but is gone from the roster, from the claimable
  names, and from the availability denominator (FR-14).
- FR-9: Each invitee is assigned a **distinct colour** from a fixed palette when added; a person
  who has claimed that name may change it to another colour that is still free on that calendar.
- FR-10: A visitor **claims a name** by picking an invitee from the list. That claim is
  remembered in the browser (`localStorage`, keyed by calendar id) so it survives a reload, and
  can be released or switched at any time. It is a convenience, not a security boundary.
- FR-11: Until a name is claimed the calendar is **read-only** — all the overlap is visible, but
  clicking a day prompts the visitor to say who they are first.

**F4 — The month view**
- FR-12: The calendar renders the **current month** as a day grid, with **arrows** to the
  previous and next month and a control to jump back to today.
- FR-13: Each day cell lists, in small text, the **names of the invitees on it**, with the
  **if-needed names visually distinguished** from the freely-available ones (weight/style, not
  colour alone). Above a per-calendar overflow threshold the cell shows the first few names plus
  a `+N` remainder, with the full list on hover/tap.
- FR-14: Cells are **heat-highlighted by coverage** — how many invitees could be there at all
  (available + if needed) — scaled against the number of **active** invitees. Full coverage is
  the brightest step, one short is a clear step down, and the scale fades to no highlight at zero.
  A day at full coverage that **relies on any if-needed** is marked as provisional rather than
  given a step of its own, so "everyone is free" and "everyone can be made to work" are both
  visible at a glance and never confused. The scale re-computes when the invitee list changes.
- FR-15: A claimed visitor **sets their own availability** by clicking a day, which cycles
  **none → available → if needed → none**. The change is immediate and optimistic; a failure
  rolls the day back and surfaces the error. There is no limit on how many days one person marks
  — for a one-off occasion the expectation is that everybody offers several.
- FR-16: **Past days are frozen and dimmed** — their votes and any chosen marking remain visible
  and correctly coloured, but at reduced emphasis, and they cannot be toggled. "Past" means
  strictly before the server's current date.
- FR-17: An admin can **mark a day as chosen** and unmark it. Any number of days may be chosen
  (a long-running campaign accumulates them), and the marking is visually distinct from the
  availability heat — it survives into the past, which is what makes the calendar a record of
  sessions actually held.

### Non-functional

- NFR-1: **Concurrent voting is the normal case, so writes must not lose updates.** Six people
  share one login and click days on the same calendar at the same time. The platform's current
  read-modify-write over a whole JSON document (see Story 1.8, *Concurrency-safe JSON
  persistence*, still Draft) would silently clobber votes here. KDH must serialize mutations
  **per calendar file** — either by landing 1.8 first, or by carrying an equivalent lock in its
  own foundation story. This is the single biggest risk in the app.
- NFR-2: **Shared, not per-user, storage** — one file per calendar at
  `DATA_DIR/kdh/calendars/{calendar_id}.json`. The listing is a directory scan (the precedent is
  archery's session listing), so there is no index file to become a second contention point.
- NFR-3: **JSON files on disk, atomic writes, no database.** All writes go through
  `_atomic_write_json`; only the repository touches the filesystem.
- NFR-4: **Platform conformance.** Strict 3-layer backend (stdlib exceptions become
  `HTTPException` only in routers); `useApi` as the single HTTP boundary; registry + lazy routes;
  Pinia store exposing `loading`/`error`; snake_case JSON, direct serialization, no envelopes,
  `{detail}` errors, ISO-8601 dates.
- NFR-5: **Dates are calendar dates, never timestamps.** Availability is stored as `YYYY-MM-DD`
  strings with no timezone attached; "today" for the past/future boundary is resolved
  **server-side** so a traveller's laptop clock cannot unfreeze a past day for them alone.
- NFR-6: **Legible at a glance is the whole product.** The heat scale must stay distinguishable
  for group sizes from 2 to ~12, must not rely on colour alone (a count is always present, and
  provisional coverage is marked by shape/texture), and must keep invitee names — in both
  availability states — readable against every step of the scale.

### Architecture

- AR-1: **App registration** — `registry.ts` entry, lazy routes, `_APPS` entry in
  `routers/shell.py`, backend `routers/kdh.py` under `/api/kdh`, `frontend/src/apps/kdh/`,
  `docs/stories/kdh/{for-review,done}/`.
- AR-2: **The admin pair is a closed set** — `settings.kdh_admins`, whose **default is
  `["jake", "dani"]`**. A `KDH_ADMINS` env var can override it, but only so tests and dev can
  run as somebody else; there is no UI, no API and no promotion path, and an unset environment
  yields the two real admins rather than an open door. `GET /api/kdh/me` returns
  `{ username, is_admin }` so the frontend renders the right controls without guessing.
  The two usernames must match the actual dock accounts **exactly** — confirm them against
  `_auth.json` in the deployed volume before Epic 1 lands.
- AR-3: **Layer split** — `repositories/kdh_repo.py` (only FS access, atomic writes, per-file
  locking), `services/kdh_service.py` (all logic, stdlib exceptions), `schemas/kdh.py`
  (Pydantic v2). Stable ids: calendars `cal-{uuid8}`, invitees `inv-{uuid8}`. Top-level
  `schema_version` with `migrate()` on read.
- AR-4: **Votes are keyed by date, not by person** —
  `votes: { "YYYY-MM-DD": { invitee_id: "yes" | "if_needed" } }`. The month view needs exactly
  this shape, so rendering is a lookup per cell rather than a scan over people. Absence means
  "not available"; the third state is never stored, which keeps files small and makes "unset" and
  "declined" the same thing, as they are for this group.
- AR-5: **Setting one vote is its own narrow endpoint**, not a whole-document PUT. The request
  says only "this invitee, this date, this status", which keeps the write small, makes the lock
  window short, and makes a lost update impossible to express in the API.
- AR-7: **Removed invitees are tombstoned, not erased** (FR-8). The record keeps its name and
  colour with a `removed_at` stamp so past cells still render correctly, and its colour stays
  reserved for as long as it does. An invitee removed while holding no past votes at all is
  dropped outright, so the common "added by mistake" case leaves no residue.
- AR-6: **Claimed identity never reaches the server as authority.** The client sends an
  `invitee_id`; the server validates it exists on that calendar and nothing more. There is no
  pretence that a person cannot vote as someone else — the trust boundary is the shared login,
  and the spec should not imply otherwise.

## Data model

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
    // tombstoned (AR-7): off the roster, still rendered on the past days they hold
    { "id": "inv-9c0d1e2f", "name": "Tom",   "color": "#6f4ae8", "order": 2,
      "removed_at": "2026-08-20T18:00:00Z" }
  ],
  "votes": {                       // ISO date -> invitee id -> status (AR-4)
    "2026-08-10": { "inv-9c0d1e2f": "yes" },              // past; survived Tom's removal
    "2026-09-14": { "inv-1a2b3c4d": "yes", "inv-5e6f7a8b": "yes" },
    "2026-09-21": { "inv-5e6f7a8b": "if_needed" }
  },
  "chosen_dates": ["2026-08-10", "2026-09-14"]   // admin-marked; any number, ascending
}
```

**Statuses.** `"yes"` is freely available; `"if_needed"` is "I can make this work if it's the day
that saves the session". Any third state — declined, undecided, never looked — is represented by
**absence**, so nothing is written for the overwhelmingly common case.

**Rules.** A date key with an empty map is pruned, so `votes` only ever holds days somebody
picked; an invitee id appears at most once per date. Removing an invitee (FR-8) deletes their
entries on dates **>= today** only, drops any date left empty, and stamps `removed_at` on the
record; if that leaves them with no entries anywhere, the record is dropped entirely (AR-7).
Removal never touches `chosen_dates` — a session that happened still happened. Colours are unique
within a calendar, including against tombstoned invitees still holding past votes, and are drawn
from a fixed palette sized to comfortably exceed a realistic group.

## API

All routes behind `Depends(get_current_user)`; admin-only routes marked **[A]**.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/kdh/me` | `{ username, is_admin }` — drives which controls render (AR-2) |
| `GET` | `/api/kdh/calendars` | Summaries (id, name, invitee count, next chosen date), newest first |
| `POST` | `/api/kdh/calendars` | **[A]** Create from `{ name, invitee_names: [] }` |
| `GET` | `/api/kdh/calendars/{id}` | The full calendar document |
| `PUT` | `/api/kdh/calendars/{id}` | **[A]** Rename |
| `DELETE` | `/api/kdh/calendars/{id}` | **[A]** Delete |
| `POST` | `/api/kdh/calendars/{id}/invitees` | **[A]** Add `{ name }`, colour auto-assigned |
| `DELETE` | `/api/kdh/calendars/{id}/invitees/{inv}` | **[A]** Remove; prune votes from today onward, keep the past (FR-8) |
| `PUT` | `/api/kdh/calendars/{id}/invitees/{inv}/color` | Recolour to a free palette colour (FR-9) |
| `PUT` | `/api/kdh/calendars/{id}/votes` | Set one vote: `{ invitee_id, date, status: "yes" \| "if_needed" \| "none" }` (AR-5) |
| `PUT` | `/api/kdh/calendars/{id}/chosen` | **[A]** Mark/unmark a date: `{ date, chosen }` |

`404` for an unknown calendar or invitee, `403` for an admin route without admin, `422` for a
blank name, a duplicate invitee name within a calendar, a malformed date, an unknown status, or
an exhausted palette. A vote on a **past** date is rejected with `422` (FR-16), as is a vote cast
as a **removed** invitee.

## Backend structure

```
app/routers/kdh.py            HTTP only; stdlib exceptions -> HTTPException here
app/services/kdh_service.py   all logic; raises FileNotFoundError / ValueError / PermissionError
app/repositories/kdh_repo.py  the only FS access; atomic writes; per-calendar lock (NFR-1)
app/schemas/kdh.py            Pydantic v2 models + request/response shapes
app/core/config.py             + `kdh_admins: list[str]` from KDH_ADMINS
```

## Frontend structure

```
src/apps/kdh/
  pages/CalendarListPage.vue    the picker / landing screen (FR-5)
  pages/CalendarPage.vue        month view for one calendar (FR-7, deep-linkable)
  components/MonthGrid.vue      the month, arrows, today control (FR-12)
  components/DayCell.vue        names, count, heat, chosen badge, past dimming (FR-13, 14, 16, 17)
  components/InviteePanel.vue   the roster, colours, claim-a-name (FR-9, 10)
  components/AdminBar.vue       create/rename/delete, manage invitees, mark chosen
  composables/useClaimedName.ts localStorage-backed claim per calendar (FR-10)
  composables/useHeatScale.ts   (yes, if_needed, active total) -> heat step + provisional flag,
                                pure and unit-testable (FR-14)
  stores/kdhStore.ts           Pinia; loading/error; optimistic vote toggle with rollback
  types.ts
```

## Interaction design

**Landing.** A plain list of calendars, each with its name and a one-line subtext (invitee count;
the next or most recent chosen date). Admins get a **New calendar** button; non-admins get only
the list, and an empty state that says to ask an admin rather than dangling a disabled control.

**Claiming a name.** On first open the invitee panel is the loudest thing on the screen —
"Who are you?" — with each name as a chip in its own colour. One click claims it, the panel
settles into a quiet roster with the claimed name marked, and the month becomes clickable. A
small control releases or switches the claim.

**Voting.** A click on a day cycles it: nothing → available → if needed → nothing. The change
lands instantly; the day's count, heat and name list update in place, and a failure snaps it back
with the error in a banner. No save button anywhere. The cycle order puts the common answer one
click away and the nuanced one two, and returning to blank never needs a separate control.

**Reading the month.** Heat is the primary signal (how many could be there), the count is the
confirmation, the names are the detail, and the if-needed styling is the caveat. A cell where
everyone is freely available is unmistakable across a room; a cell that only reaches full
coverage on the back of an if-needed carries the same weight of colour but is visibly
provisional, so an admin choosing a day knows what they are asking of people. A chosen day
carries a distinct persistent marker that reads even at reduced past-day emphasis.

**Admin actions** live in a bar that only admins see: rename, manage invitees, copy the share
link, delete. Marking a day chosen is a control in the day's own context, not a separate mode.

## Visual direction

The month is the app; everything else recedes. A restrained dock-consistent frame around a grid
that carries all the colour. Heat runs as a single hue's intensity ramp (not a rainbow) so
"more people" reads as "more of the same thing" rather than "a different category" — full
attendance saturated and confident, each step below it more translucent, zero left as plain
background. Invitee colours are used for the small name text and the roster chips, never for the
cell background, so the two colour systems never fight; an if-needed name is set apart by weight
or style rather than by tinting its owner's colour. Provisional full coverage is drawn as a
treatment of the cell's edge — a broken or hatched border — never as a fourth colour, so it
stacks cleanly with both the heat ramp and past-day dimming. The chosen-day marker is likewise a
shape, not a colour, for the same reason.

## Testing

**Backend** — service-level tests over a `tmp_path` `DATA_DIR`: calendar CRUD; the admin gate
(`403` for a non-admin on every admin route, and the default pair applying with no env set); the
full vote state machine — every transition among `none`/`yes`/`if_needed`, idempotent repeats,
and the pruning of emptied dates; **invitee removal pruning today-onward votes while leaving past
ones and `chosen_dates` untouched**, the tombstone carrying name and colour, and the outright
drop when no past votes remain (AR-7); colour uniqueness holding against tombstones; palette
exhaustion; rejection of malformed dates, unknown statuses, past-date votes and votes cast as a
removed invitee; `404`s for unknown ids; and — the important one — a **concurrency test that
fires simultaneous vote writes at one calendar and asserts every vote survives** (NFR-1).

**Frontend** (co-located `*.spec.ts`): `useHeatScale.spec.ts` covers the counts-to-step mapping
exhaustively across group sizes — the 1-person and all-present edges, all-yes versus
full-coverage-with-an-if-needed (same step, provisional flag set), and the denominator excluding
tombstoned invitees; `useClaimedName.spec.ts` covers claim, release, switch and a corrupt/absent
`localStorage` value; the store spec covers `loading`/`error` and optimistic rollback through the
three-state cycle; `DayCell.spec.ts` covers the name overflow (`+N`), if-needed name styling, a
past cell still showing a removed invitee, the frozen state and the chosen badge;
`MonthGrid.spec.ts` covers month navigation across year boundaries; and a page spec covers the
read-only state before a name is claimed.

## Epics

Proposed shape — the authoritative breakdown will be generated into
`docs/planning-artifacts/epics-kdh.md`, with stories under `docs/stories/kdh/`.

- **Epic 1 — Foundation & calendars:** register the app, the fixed admin pair and `me` endpoint,
  the shared data layer with per-calendar locking (NFR-1), create/list/open/rename/delete a
  calendar, the deep link.
- **Epic 2 — Invitees & identity:** add invitees and the colour palette, removal with
  today-onward pruning and tombstoning (FR-8, AR-7), claiming a name, the read-only state before
  a claim.
- **Epic 3 — The month:** the month grid and navigation, day cells with names and counts, the
  three-state availability cycle set optimistically, and the coverage heat scale with its
  provisional marking.
- **Epic 4 — Decisions & history:** marking a day chosen, the frozen and dimmed past, and the
  landing-page subtext that surfaces the next or most recent chosen date.

Epic 2 depends on Epic 1. Epic 3 depends on both (it needs invitees to vote as). Epic 4 depends
on Epic 3. No epic depends on a later one.
