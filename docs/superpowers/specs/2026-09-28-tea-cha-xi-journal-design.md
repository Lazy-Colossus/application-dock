# Cha Xi Journal — Design Spec

Date: 2026-09-28
App id: `tea`
Status: approved in brainstorming, pending implementation plan

## Problem

The timer records the precision half of a sitting (tea, vessel, grams, water, infusion timings,
rating) but nothing of the reflective half: who was at the table, the mood, what it tasted like,
what the table looked like. A finished session is only visible as a row on its tea's detail page,
it cannot be corrected or deleted, and a tea drunk away from the app (a teahouse, a friend's
table) cannot be recorded at all.

## Intent

User's answers:

- **Cha xi is written during the sitting, not after.** While brewing, a **Cha Xi** button opens
  the entry for the current session, and the user moves freely between it and the timer as they
  fill it in.
- **The running steep stays in reach on the Cha Xi page** — a brew strip shows it, can
  start/stop it, and it still chimes.
- **Mood:** several picks from a fixed vocabulary.
- **One photo** per sitting, the table setup.
- **The Journal shows every finished session**, with a **Cha xi only** toggle.
- **A journal-only entry** may be for a Cabinet tea or for a tea named in free text that the user
  does not own.
- This round also delivers **editing and deleting finished sessions**.

Success (PRD SM-3): a year in, the Journal is a complete, pleasant history the user chooses to
revisit — and filling in cha xi at the table never costs a missed pour.

## Scope

**In scope:**

- A `cha_xi` layer (moods, guests, notes, one photo) on `TeaSession`.
- A Cha Xi page reachable from the live timer, with a brew strip and a chime that survives the
  page change.
- The Journal at `/tea/journal`: month-grouped wall of photo and compact cards, Cha xi only
  toggle, entry detail.
- Editing a finished session (cha xi, rating, grams, water, vessel; date and tea for
  journal-only) with grams corrected by the difference.
- Deleting a finished session, returning its grams and removing its photo.
- Journal-only entries (`timed: false`) for a Cabinet tea or an away tea.
- A Journal tile on the tea home.

**Out of scope:**

- Search and filters (FR-20) beyond the Cha xi only toggle — deferred by the user.
- Flavor Wheel / Fingerprint (FR-15–17) and Meditation (FR-14) — the detail page is where they
  will appear later.
- Several photos per entry.
- Editing or deleting another household member's sessions.
- Pitchers and cups attached to a session (the vessel stays the single brewing vessel).

## Relationship to the Tea PRD

- **FR-18** delivered, with teaware already on sessions since the Teaware Cabinet. Mood is a
  fixed multi-select vocabulary rather than open text.
- **FR-19** delivered; the detail page omits Flavor Fingerprint and Meditation until those
  features exist.
- **FR-20** deferred except the Cha xi only toggle.
- **FR-21** delivered, extended with away teas (no Cabinet tea). Its assumption holds: grams are
  deducted only if the user enters leaf used, and only for a Cabinet tea.
- **Open question 1 (photo storage)** was settled by the tea-photo work; sessions reuse it.
- Timer spec deferrals picked up here: editing/deleting a finalised session, journal-only
  sessions.

## Requirements

### Functional

1. On the live timer, once a tea is attached, a **Cha Xi** header button opens
   `/tea/timer/cha-xi`. It shows a filled marker once the session has any cha xi.
2. The Cha Xi page edits photo, moods, guests and notes of the live session. Edits persist
   locally at once and reach the server through the snapshot sync.
3. The Cha Xi page shows a sticky **brew strip**: infusion number, elapsed / target, and a
   start/stop button that behaves exactly like the timer's main tap. Tapping elsewhere on the
   strip, or back, returns to the timer.
4. A steep started on the timer page chimes at its target while the user is on the Cha Xi page,
   with no further tap.
5. With no live session, `/tea/timer/cha-xi` redirects to the timer.
6. Finishing is unchanged and happens on the timer page; the session keeps whatever cha xi it
   has. Discarding a session deletes its photo.
7. `/tea/journal` lists every finished session in the cabinet, newest first by `started_at`,
   under month headings. A session with a photo gets a photo card; others get a compact card.
   Sessions brewed by another member show their name.
8. **Cha xi only** narrows the wall to sessions whose cha xi has a photo, a mood, guests or
   notes. The choice is kept for the browser session.
9. `/tea/journal/:id` shows the full sitting: photo, tea (linked to the Cabinet tea if any),
   date, brewer, vessel, leaf grams, water temperature, moods, guests, notes, infusion timeline
   (actual vs target), rating.
10. For the brewer, the detail page offers **Edit** and **Delete**. Delete confirms, naming the
    grams returned when there are any.
11. `/tea/journal/:id/edit` edits cha xi, rating, leaf grams, water temperature and vessel, and
    for a journal-only entry also its date and tea. Saving a grams change adjusts the tea's
    grams remaining by the difference.
12. `/tea/journal/new` (from **+ Entry** on the wall) creates a journal-only entry: date, tea
    (Cabinet tea, or an away tea by name with an optional class), optional vessel, grams, water,
    rating, and cha xi.
13. The tea home shows a **Journal** tile between Brew and Almanac.
14. Rows in a tea's Sessions list open that session's Journal entry. The timer's saved
    confirmation links to it.
15. Deleting a tea's confirmation mentions that its Journal entries go with it; their photos are
    removed.

### Non-functional

- No network wait blocks typing on the Cha Xi page; a failed sync shows the existing
  "not synced" marker on the brew strip and retries.
- A photo upload failure keeps the preview and offers Try again.
- All HTTP through `useApi`; stores expose `loading` and `error`.

## Data model

### `ChaXi` (new, `app/schemas/tea_session.py`)

```python
Mood = Literal[
    "calm", "bright", "contemplative", "cosy", "social", "focused", "tired", "restless"
]

class ChaXi(BaseModel):
    moods: list[Mood] = Field(default_factory=list)
    guests: str = ""
    notes: str = ""
```

A validator rejects duplicate moods and stores them in the vocabulary's order. The photo is not
a body field: the server knows whether one exists from the images folder, and the session view
exposes `photo_url` (with `?token=`, as tea images do) or `null`.

### `TeaSessionWrite` / `TeaSession` (changed)

| Field | Where | Notes |
|---|---|---|
| `cha_xi: ChaXi \| None = None` | write body | null until the user first opens Cha Xi |
| `timed: bool = True` | write body | `false` = journal-only: no infusions, written straight as `finalised` |
| `tea_id: str \| None` | write body | was required; null only for an away tea |
| `away_tea_name: str = ""` | write body | required when `tea_id` is null |
| `away_class_id: TeaClass \| None = None` | write body | optional card colour for an away tea |
| `photo_url: str \| None` | view only | derived, never stored |

Validation: exactly one of `tea_id` / `away_tea_name` is set; an away tea requires
`timed = False`; `timed = False` requires `status = "finalised"` and no infusions.

### `TeaDoc` (changed — schema v5)

`migrate()` v4 → v5 is a version bump only: every new field has a default, and existing
sessions become timed Cabinet-tea sessions with no cha xi.

### Live session (frontend, `LiveSession`)

Gains `chaXi: ChaXi | null`. `hydrate()` accepts a stored session without it (treated as
`null`), so a sitting in progress during the upgrade survives.

### Photos

One per session, stored with the existing cabinet image functions under `images/{cabinet_id}/`
keyed by session id (`s-…` cannot collide with `t-…` or `w-…`), and downscaled on the phone
with `image.ts` like tea photos.

## Services

`tea_session_service`:

- `upsert` — unchanged for timed sessions, now carrying `cha_xi`. For `timed = False` it creates
  a finalised entry directly; grams are deducted only for a Cabinet tea with `leaf_grams` set.
  An existing finalised session still refuses a snapshot (`SessionFinalisedError`).
- `edit_journal(username, session_id, req: JournalEdit)` — finalised sessions only
  (`ValueError` otherwise); brewer only (`PermissionError`). Applies cha xi, rating, leaf grams,
  water, vessel; and `started_at` and tea for journal-only. Grams: the old deduction is
  returned to the old tea and the new one taken from the new tea (so a changed tea on a
  journal-only entry is handled by the same rule), each clamped to `[0, grams_purchased]`
  where `grams_purchased` is known, else at 0 only.
- `discard` — now also accepts a finalised session: returns its leaf grams to its Cabinet tea
  (same clamp) and deletes its photo. In-progress behaviour unchanged, plus photo deletion.
- `save_image` / `delete_image` / `image_path` for sessions, brewer-only for writes, any member
  for reads.
- `list_journal(username)` — finalised sessions of the caller's cabinet, newest first by
  `started_at`, each resolved to a `JournalEntry` view: the session plus `tea_name`,
  `class_id` (from the tea, or `away_class_id`, else `"other"`), `tea_image_url`, `photo_url`.

`JournalEdit` (write body): `cha_xi`, `rating`, `leaf_grams`, `water_temp_c`, `teaware_id`, and
optional `started_at`, `tea_id`, `away_tea_name`, `away_class_id` — the last four refused
(`ValueError`) on a timed session.

Consumers of sessions skip away-tea sessions (`tea_id is None`): `tea_curve_service`,
`list_for_tea`, and teaware usage / off-dedication. Journal-only Cabinet-tea sessions have no
infusions and therefore never become a brewing curve; `tea_curve_service` also skips
`timed = False` explicitly.

`tea_service.delete_tea` also deletes the photos of the sessions it removes.

## API

All under `/api/tea`; routers translate `FileNotFoundError` → 404, `PermissionError` → 403,
`ValueError` / `SessionFinalisedError` → 422 / 409 as today.

| Method & path | Body | Returns |
|---|---|---|
| `PUT /sessions/{id}` | `TeaSessionWrite` | `TeaSession` — unchanged path, new fields |
| `PUT /sessions/{id}/journal` | `JournalEdit` | `JournalEntry` |
| `DELETE /sessions/{id}` | — | 204 — now also for finalised sessions |
| `POST /sessions/{id}/image` | multipart `file` | `TeaSession` (201) |
| `GET /sessions/{id}/image?token=` | — | the image |
| `DELETE /sessions/{id}/image` | — | `TeaSession` |
| `GET /journal` | — | `list[JournalEntry]` |

## Frontend

### Routes

| Path | Name | Page |
|---|---|---|
| `/tea/timer/cha-xi` | `tea-timer-chaxi` | `ChaXiPage.vue` |
| `/tea/journal` | `tea-journal` | `JournalPage.vue` |
| `/tea/journal/new` | `tea-journal-new` | `JournalFormPage.vue` |
| `/tea/journal/:id` | `tea-journal-entry` | `JournalEntryPage.vue` |
| `/tea/journal/:id/edit` | `tea-journal-edit` | `JournalFormPage.vue` |

Back arrows: Cha Xi → timer; Journal → tea home; entry → Journal; form → where it came from.

### Units

- `ChaXiFields.vue` — photo tile, mood chips, guests, notes; `v-model` of a `ChaXi` plus
  photo events. Shared by the Cha Xi page and the form page.
- `BrewStrip.vue` — sticky readout and start/stop, driven by the timer store, using
  `useSteepClock`, `useTargetChime` and `useWakeLock`; shows the not-synced marker.
- `ChaXiPage.vue` — `BrewStrip` + `ChaXiFields` bound to `timer.live.chaXi`; debounces
  `timer.push()` (~1.5 s) while typing and flushes on leave; uploads the photo, pushing the
  session first if it has not synced.
- `JournalPage.vue` — month-grouped wall, `JournalCard.vue` (photo / compact variants), Cha xi
  only toggle, + Entry.
- `JournalEntryPage.vue` — full detail, Edit / Delete for the brewer.
- `JournalFormPage.vue` — new journal-only entry and edit; reuses `PickTeaSheet` (plus an Away
  tea option) and `PickVesselSheet`.
- `journal.ts` — pure helpers: `groupByMonth`, `hasChaXi`, `gramsReturned`.
- `useTeaJournalStore` — `entries`, `loading`, `error`, `fetchJournal`, `create`, `edit`,
  `remove`, `uploadPhoto`, `removePhoto`.
- `useTeaTimerStore` — `chaXi` on the live session, `setChaXi`, included in `snapshot()`.
- `useTargetChime` — the `AudioContext` moves to module scope so one unlock serves every page.
- `SectionIcon.vue` — a Journal icon: stitched thread-bound notebook with a small cup seal, in
  the tiles' solid-amber style. `TeaHomePage` gains the Journal section.
- `TeaSessionsList` rows link to `tea-journal-entry`; the timer's saved toast links there too.

## Testing

Backend (`backend/tests/test_tea_journal.py`, plus extended session tests):

- `cha_xi` round-trips through snapshots; mood validation (unknown, duplicate, ordering).
- Validator rules for `timed`, `tea_id` / away tea, status and infusions.
- Journal-only: Cabinet tea with and without grams, away tea (no deduction).
- `edit_journal`: grams up, down, cleared, changed tea; clamps; refusal on in-progress; brewer
  only; tea fields refused on timed sessions.
- Deleting finalised: grams returned, photo removed; in-progress discard removes the photo.
- `list_journal`: order, resolved fields, class fallback, other members' sessions included.
- Away-tea sessions skipped by curves, per-tea list and teaware usage.
- `delete_tea` removes its sessions' photos. v4 → v5 migration.

Frontend (co-located `*.spec.ts`): `ChaXiFields`, `BrewStrip`, `ChaXiPage` (store writes,
debounced push, flush on leave, redirect), `JournalPage` (grouping, card variants, toggle),
`JournalEntryPage` (brewer-only actions, delete confirmation), `JournalFormPage` (new with Cabinet
or away tea, edit), `journal.ts`, `useTeaJournalStore`, timer store `chaXi` hydration and
snapshot, `useTargetChime` (second instance chimes after one unlock), routes, tea home tile.

## Docs

- A story in `docs/stories/tea/`, moved to `for-review/` when built.
- PRD §4.7 gains a pointer to this spec, noting the mood vocabulary, away teas and deferred FR-20.

## Delivery

Three commits on `main`, each shippable:

1. Backend: schema v5, services, endpoints, tests.
2. Cha xi while brewing: timer store, `ChaXiFields`, `BrewStrip`, `ChaXiPage`, chime fix.
3. The Journal: wall, detail, form, journal-only entries, store, home tile, links.
