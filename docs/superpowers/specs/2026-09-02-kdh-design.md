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

**Admins** — anyone with their own dock account — create **calendars** — one per occasion: a
long-running DnD campaign, an ad-hoc movie night, a birthday party. Creating a calendar means
naming it and listing who is invited. The admin then hands out the calendar's link.

Everyone else opens that link behind **one shared dock login** — a single configured **guest
account** that can read, claim a name and vote, and nothing else. They see the month, the list of
invitees, and they **claim a name** — that is the whole of identity in
this app; there are no per-person accounts. Having claimed a name they click days to set their
availability, marking as many days as they like.

A day carries one of three states per person: **available**, **if needed** (they can make it work
if it's the day that saves the session, but it isn't a free evening), or nothing at all. Each day
cell shows, in small text, who is on it and which of them are only there if needed. The more
people a day covers the stronger its highlight, and a day everyone is freely available for burns
brightest of all. Arrows move between months. Past days keep their votes but are greyed and
frozen. Admins **mark days as chosen** — several per calendar, accumulating over the life of a
long-running one — and can **add or remove invitees** at any time.

**In v1:** the guest account and the admins-are-everyone-else rule, calendar create/rename/delete, invitee add/remove, claim-a-name
identity, month grid with prev/next navigation, three-state day availability
(available / if needed / none), overlap wash highlighting, a **day sheet** listing who is on a
date, chosen-day marking, greyed-out past. **Phone only.**

**Not in v1** (candidates for a later epic): **a secret share link** (`/kdh/j/{token}`) that opens
a calendar vote-only with no login at all — the friction-free alternative to handing out guest
credentials, deferred because it would add the platform's first unauthenticated endpoint;
time-of-day or partial-day availability,
notifications or reminders of any kind, iCal export or calendar
subscription, per-invitee logins, recurring events, comments or chat, managing the guest
list from the UI, week or agenda views, an availability deadline.

## Requirements

### Functional

**F1 — App integration & identity**
- FR-1: Registered in the Application Dock shell (landing-page card + its own route).
- FR-2: Every route sits behind `Depends(get_current_user)`. Unlike the other dock apps, KDH's
  data is **shared, not per-user** — the group logs in with one shared account, so every
  authenticated user sees the same calendars. No `user` field is accepted in any path or body.
- FR-3: Capability is decided by **which account you logged in as**, inverted from an allowlist of
  admins to a denylist of one: a username in the configured **guest list** is a guest, and **every
  other authenticated user is an admin**. The guest account is the shared credential handed to the
  group; a guest may read any calendar, claim a name, set their own votes and change their own
  and nothing else. Admin-only routes reject a guest with `403`; the frontend hides admin
  controls rather than offering them and failing.

**F2 — Calendars**
- FR-4: An admin creates a **calendar** with a **name** and an initial **list of invitee names**.
- FR-5: The app's landing screen lists all calendars, newest first, and opens one on selection.
  Each row shows the calendar's **name with a headcount beside it** (a person icon and the number)
  and, in the subtext, **the invitees' names** — trailing off after the sixth, since a phone row
  holds no more. An empty state prompts the first calendar (with the create action shown only to
  admins).
- FR-6: An admin can **rename** and **delete** a calendar (delete requires confirmation).
- FR-7: A calendar has a **stable deep link** (`/kdh/c/{calendar_id}`) that an admin can copy
  and hand out; opening it lands directly on that calendar's month view.

**F3 — Invitees & claiming a name**
- FR-8: An admin can **add** and **remove** invitees on an existing calendar. Removing one
  confirms first and **prunes that person's votes from today onward only** — their votes on past
  dates stay exactly as they were, so a long-running calendar keeps an honest record of who was
  actually around for the sessions already played. A removed invitee therefore still renders on
  past day cells, under their own name, but is gone from the roster, from the claimable names,
  and from the availability denominator (FR-14).
- FR-10: A visitor **claims a name** by picking an invitee from the roster. The claim is remembered
  in `localStorage` keyed by calendar id, survives a reload, and can be **switched** at any time by
  picking someone else. There is no "release to nobody" — switching is the real case, and an
  unclaimed state a person chose would only make the app read-only for them. It is a convenience,
  not a security boundary.
- FR-11: Until a name is claimed the calendar is **read-only** — all the overlap is visible, but
  clicking a day prompts the visitor to say who they are first.

**F4 — The month view**
- FR-12: The calendar renders the **current month** as a day grid, with **arrows** to the
  previous and next month and a control to jump back to today.
- FR-13: **How many names a cell shows depends on how much cell there is.** On a phone
  a day cell carries only the date and the coverage **count** — a ~44px cell cannot hold
  a name — and the names live in a **day sheet** opened by tapping the day. On the web
  layout the cell is large enough, so it also lists the voters beneath the count,
  comma-separated in the cell's own ink, trailing off past the sixth, and **ellipsised**
  when they do not fit the two lines available. On the phone layout, where no name fits,
  On the phone layout, where no name fits, the cell carries the date and the count
  alone; the day sheet is the answer to *who*. Either way the
  **if-needed people are visually distinguished** by weight and style, and the sheet
  remains the complete list.
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
- FR-16: **Past days are frozen and dimmed** — votes and chosen markings stay visible and correctly
  coloured at reduced emphasis, and **cannot be voted on**. They can still be opened: a past day
  shows who was there, and an admin can still mark or unmark it chosen, because that is a record
  rather than an answer. "Past" means strictly before the **server's** current date.
- FR-17: An admin can **mark a day as chosen** and unmark it. Any number of days may be chosen
  (a long-running campaign accumulates them), and the marking is visually distinct from the
  availability heat — it survives into the past, which is what makes the calendar a record of
  sessions actually held.

### Non-functional

- NFR-0: **Two layouts, phone and web.** The phone layout is the primary one and the
  constraint the interface was designed against; the web layout is the same app given
  room. The breakpoint is **700px**. Below it the calendar is the full width of the
  screen with a ~44px day cell; above it the calendar is a centred band at 66% of the
  window (with a floor so a narrow window keeps its content, and a cap so it stays
  readable on a very wide monitor), the day cells are square, and the numerals scale
  fluidly with the viewport rather than jumping at a second breakpoint.
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
- NFR-6: **Legible at a glance is the whole product.** At arm's length, one-handed, on a phone —
  the bar is a glance on a bus, not a shared screen. The wash must stay distinguishable for group
  sizes from 2 to ~12 and must never rely on colour alone: the count is in every cell, and chosen
  and provisional days are marked by **shape**. Every text/background pair meets 4.5:1, which is
  why the ink flips dark at the top of the ramp.

### Architecture

- AR-1: **App registration** — `registry.ts` entry, lazy routes, `_APPS` entry in
  `routers/shell.py`, backend `routers/kdh.py` under `/api/kdh`, `frontend/src/apps/kdh/`,
  `docs/stories/kdh/{for-review,done}/`.
- AR-2: **Guests are configured; admins are everyone else** — `settings.kdh_guests`, a
  comma-separated `KDH_GUESTS` env var defaulting to `players`. The operator creates that account
  from the dock's existing Settings page and shares its credentials with the group. There is no UI,
  no API and no promotion path. `GET /api/kdh/me` returns `{ username, is_admin }` so the frontend
  renders the right controls without guessing.

  **This fails open, deliberately.** An allowlist of admins would fail closed — a misspelled or
  unknown username silently leaves nobody able to administer anything — and it requires knowing the
  real account names up front. The denylist inverts that: a misconfiguration grants the shared
  account more than it should, rather than locking the owners out, and any dock account added later
  is an admin without further configuration. For a six-person self-hosted dock behind a login that
  is the right direction; it would not be for a public deployment.
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
  `removed_at` stamp so past cells still render their name correctly. An invitee removed while
  holding no past votes at all is dropped outright, so the common "added by mistake" case leaves
  no residue.
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
| `GET` | `/api/kdh/me` | `{ username, is_admin, today }` — which controls render (AR-2), and the server's date as the only past/future boundary (NFR-5) |
| `GET` | `/api/kdh/calendars` | Summaries (id, name, invitee count, invitee names, next chosen date), newest first |
| `POST` | `/api/kdh/calendars` | **[A]** Create from `{ name, invitee_names: [] }` |
| `GET` | `/api/kdh/calendars/{id}` | The full calendar document |
| `PUT` | `/api/kdh/calendars/{id}` | **[A]** Rename |
| `DELETE` | `/api/kdh/calendars/{id}` | **[A]** Delete |
| `POST` | `/api/kdh/calendars/{id}/invitees` | **[A]** Add `{ name }` |
| `DELETE` | `/api/kdh/calendars/{id}/invitees/{inv}` | **[A]** Remove; prune votes from today onward, keep the past (FR-8) |
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
app/core/config.py             + `kdh_guests: str` from KDH_GUESTS
```

## Frontend structure

```
src/apps/kdh/
  pages/CalendarListPage.vue    the picker / landing screen (FR-5)
  pages/CalendarPage.vue        month view for one calendar (FR-7, deep-linkable)
  components/MonthGrid.vue      the month, arrows, today control (FR-12)
  components/DayCell.vue        date, count, wash, chosen mark, past dimming (FR-14, 16, 17)
  components/DaySheet.vue       who is on this date + the three-state control (FR-13, 15)
  components/NameDropdown.vue   claim / switch a name (FR-10, 11)
  components/AdminMenu.vue      create/rename/delete, manage invitees, mark chosen
  composables/useClaimedName.ts localStorage-backed claim per calendar (FR-10)
  composables/useWashScale.ts   (yes, if_needed, active total) -> wash step + provisional flag,
                                pure and unit-testable (FR-14)
  stores/kdhStore.ts           Pinia; loading/error; optimistic vote toggle with rollback
  types.ts
```

## Interaction design

Full contract: [`EXPERIENCE.md`](../../planning-artifacts/ux-designs/ux-kdh-2026-09-03/EXPERIENCE.md).
That spine wins over this summary and over any mock.

**Landing.** A plain list of calendars, each with its name and a one-line subtext (invitee count;
the next or most recent chosen date). Admins get a **New calendar** button; guests get only the
list, and an empty state that says to ask an admin rather than dangling a disabled control.

**Claiming a name.** A dropdown in the month header, and the loudest control on the page until it
is answered: unclaimed it is styled like a **required field left blank** — negative border and
text, with a warning glyph — because the calendar cannot be used until someone says who they are.
Once claimed it settles into a quiet pill carrying that person's name. Unclaimed it
reads "Who are you?"; open, it
lists every active invitee as a row with a tick on the claimed one. Chosen over a bottom sheet and a persistent
chip rail because **the month stays visible while you pick**. The claim is remembered per calendar
on that phone.

**The first tap teaches.** Tapping a day while unclaimed opens the name dropdown rather than
rejecting the tap — a newcomer learns the model by trying to use the app, not by reading a notice.

**Voting.** On the grid, a tap **cycles** `none → free → if needed → none`, for running down a
month quickly. In the day sheet the three states are **explicit, labelled controls**, because that
is where a person deliberately answers. Both write the same vote. Every write is optimistic and
reverts on failure, with the message under the month header. No save button anywhere.

**Reading the month.** The wash is the primary signal (how many could come), the count is the
confirmation, and the names are one tap away. A day at full coverage that leans on an *if needed*
takes the same wash step but carries a hairline, so an admin can see what they are about to ask of
people. A chosen day is ringed in gold and carries a crown above its date, both of which survive
every step of the ramp and the past dimming.

**Navigation is arrows only.** No swipe: on a 7×5 grid of tap targets, a swipe is too easily
triggered while aiming for a Tuesday.

**Admin actions** live in a header menu only admins see: rename, manage invitees, copy the share
link, delete. Marking a day chosen is a control in the day's own context, not a separate mode.

## Visual direction

Identity: **Eggplant Wash**. Full token set:
[`DESIGN.md`](../../planning-artifacts/ux-designs/ux-kdh-2026-09-03/DESIGN.md), which wins over
this summary.

KDH is its own world — not the dock's Carbon theme, and not Hotaru's Neon Yūgure. A **violet-black
field** (`#15111C`) on which the month washes from **deep eggplant** at one person to **pastel
lilac** at all six. Exactly one idea carries colour: how many people can come. Everything else —
chrome, labels, navigation — stays quiet enough that the month is the only thing with presence.

**One colour system, and only one.** The wash is the only colour with meaning: it answers *how
many can come*. Invitees have no colours — they had them, and every appearance turned out to be a
dot beside the name it identified, which is decoration rather than information.

**Two marks are shapes, never colours**, so they survive both the ramp and the past-day dimming: a
a gold ring and a crown for a chosen day, and a hairline inset for provisional full coverage. Ink flips from pale
to dark at the top two wash steps, where the field becomes too light for pale text.

No shadows (they read as mud on a near-black ground), no ambient motion, no second saturated
colour, and never the dock's gold — it means "interactive" everywhere else on the platform.

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

**Frontend** (co-located `*.spec.ts`): `useWashScale.spec.ts` covers the counts-to-step mapping
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

- **Epic 1 — Foundation & calendars:** register the app, the guest/admin rule and `me` endpoint,
  the shared data layer with per-calendar locking (NFR-1), create/list/open/rename/delete a
  calendar, the deep link.
- **Epic 2 — Invitees & identity:** add invitees and the colour palette, removal with
  today-onward pruning and tombstoning (FR-8, AR-7), claiming a name, the read-only state before
  a claim.
- **Epic 3 — The month:** the month grid and navigation, day cells with names and counts, the
  three-state availability cycle set optimistically, the day sheet, and the coverage wash with its
  provisional marking.
- **Epic 4 — Decisions & history:** marking a day chosen, the frozen and dimmed past, and the
  landing-page subtext that surfaces the next or most recent chosen date.

Epic 2 depends on Epic 1. Epic 3 depends on both (it needs invitees to vote as). Epic 4 depends
on Epic 3. No epic depends on a later one.
