# Gongfu Session Timer — Design Spec

Date: 2026-09-26
App id: `tea`
Status: approved in brainstorming, pending implementation plan

## Problem

The Cabinet knows what tea is on the shelf and the Almanac knows what it is, but nothing in the
app is used *at the table*. The user still reaches for a phone stopwatch for gongfu infusions, and
nothing remembers how a tea was brewed last time or how much leaf went into it. The Session Timer
is that instrument: first a good steep timer, and — when a tea is attached — a record of the
sitting that feeds back into the next one.

## Intent

Both halves matter equally (user's answer: "both"):

- **A better stopwatch.** Opening the timer gives a timer immediately. Picking a tea is optional
  and can happen at any point; with no tea it is *just a timer* and nothing is saved.
- **Learning the curve per tea.** With a tea attached, every steep is recorded, the session can be
  rated, and the best-rated session becomes the next session's suggestion. Finishing deducts the
  leaf used from the tea's grams.

Success: the user stops using a separate stopwatch (PRD SM-2), and a tea's detail page starts
accumulating a trustworthy history of sittings (SM-3/SM-4).

## Scope

**In scope (this implementation):**

- A count-up infusion timer at `/tea/timer`, drawn as a Chinese teacup filling with the tea's
  liquor colour up to a dashed target line.
- Optional tea attachment at any point before finishing; a plain run is never persisted.
- A per-infusion target from the Brewing Curve: best-rated session → the tea's own brewing
  parameters → nearest Almanac entry → a generic gongfu curve, labelled with its source.
- Editable brewing parameters on a Tea (leaf grams, water °C, steep times).
- Phone-first live state with one-way snapshot sync to the server after every steep; recovery of
  an unfinished server-side session.
- Finishing with an optional 1–5 star rating, deducting leaf grams exactly once.
- Wake lock while a session is live; an optional chime at the target.
- A Brew entry point on the Cabinet and tea detail, and a compact Sessions list on tea detail.

**Explicitly out of scope, with the reason:**

- **Teaware and the Seasoning Log (FR-7, FR-9's "teaware used").** The Teaware Cabinet doesn't
  exist yet. `TeaSession` gains a `teaware_ids` field when it does; nothing here blocks it.
- **Cha Xi, the Journal, journal-only sessions (§4.7).** The tea detail Sessions list is the only
  place a finished session appears in this round.
- **Steep Metronome, Meditation, Flavor Wheel (§4.4–4.6).** Future additions to a running or
  finished session.
- **Deleting or editing a finalised session.** Belongs with the Journal's detail view.
- **Saving plain (tea-less) runs.** User decision: a plain run is a scratch timer.
- **Cross-device live resume.** The phone owns a live session; the server copy exists for
  durability and recovery only.

## Relationship to the Tea PRD

PRD: [`prd-tea-2026-09-06/prd.md`](../../planning-artifacts/prds/prd-tea-2026-09-06/prd.md) §4.3,
FR-9–FR-12. **Where they disagree, this spec (the later decision) wins:**

- **A Session no longer always starts from a Tea.** PRD FR-9 starts a Session by picking a Tea.
  Here the timer opens without one; a Session (the persisted record) only exists once a tea is
  attached. A plain run is not a Session.
- **Count-up, not countdown.** PRD FR-10 describes a countdown to the suggested Steep Time. The
  user chose count-up with the target shown as a marker: the recorded actual time is simply when
  the user stopped, and pouring early or late needs no correction.
- **Fallback chain.** FR-11's "Almanac family default" becomes "nearest Almanac entry up the
  catalogue tree" (the Almanac is keyed to named teas, see
  `2026-09-25-tea-almanac-design.md`), and a fourth, generic step is added so plain mode and teas
  with no Almanac ancestor still get a target.
- **Best session's curve = its actual times.** FR-11 prefills "Steep Times" from the best session;
  this spec uses that session's recorded `actual_seconds`, i.e. what the user really did.
- **Rating scale** (PRD open question 6): 1–5 stars, optional; ties broken by most recent.
- **Seasoning Log and Journal (FR-12 consequences)** are deferred — see Scope.
- **Persistence** (PRD assumption on FR-12, NFR-8): in-progress and finalised sessions share one
  record with a `status` field inside the tea doc, not archery's filename split. Live timing is
  held on the phone and synced as whole snapshots, satisfying NFR-8 without offline-PWA machinery.

## Requirements

### Functional

- **FR-1** — The timer opens ready to steep with no tea attached, using the generic curve.
- **FR-2** — Each infusion counts up from a single large tap; a second tap stops it and records
  `actual_seconds`. The target for the upcoming infusion can be nudged ±5 s.
- **FR-3** — The user can redo the last infusion: the pending next infusion is removed and the
  last brewed infusion's `actual_seconds` is cleared, so it can be re-run at its target.
- **FR-4** — The user can attach or swap a tea at any time before finishing. Attaching fetches
  the tea's curve and re-targets all *unbrewed* infusions; brewed infusions keep their recorded
  times. Leaf grams and water °C are prefilled from the curve and editable.
- **FR-5** — The curve source is shown as a label ("from your best session (★5, 12 Sep)", "tea
  default", "almanac: Tieguanyin", "generic gongfu").
- **FR-6** — With a tea attached, the session is pushed to the server after every stopped steep
  and on attach/swap.
- **FR-7** — Finishing (tea attached) offers an optional 1–5 rating and a leaf-grams confirmation
  showing the resulting grams; saving finalises the session and deducts `leaf_grams` from the
  tea's `grams_remaining`, clamped at 0, exactly once. Without a tea, "End" clears the timer.
- **FR-8** — Discard removes a live session locally and, if it was ever pushed, on the server.
  A discarded or abandoned session never deducts grams.
- **FR-9** — Opening the timer with no local live session checks the server for in-progress
  sessions and offers Resume / Discard for each.
- **FR-10** — A Tea can hold brewing parameters (leaf grams, water °C, steep seconds list),
  editable on the tea form.
- **FR-11** — A tea's detail page lists its finalised sessions newest first (date, rating,
  infusion count, leaf grams) and offers a Brew button that opens the timer with that tea
  attached.

### Non-functional

- **NFR-1 — One-handed.** Start/Stop is the bottom thumb-zone band of the screen; Finish sits
  above it, out of the thumb zone, so it cannot be hit mid-pour.
- **NFR-2 — Survives interruption.** Elapsed time is derived from wall-clock timestamps, not
  tick counting, so a backgrounded or throttled tab reads correctly on return. Live state is
  persisted to `localStorage` on every change and rehydrated on reload — in plain mode too.
- **NFR-3 — Network-tolerant.** No network call blocks timing. Only the finalise push must
  succeed before local state is cleared.
- **NFR-4 — Screen awake.** A Screen Wake Lock is held while a session is live and re-acquired on
  `visibilitychange`; unsupported browsers degrade silently.
- **NFR-5 — Visual cue is primary.** The cup reaching the dashed line is always the cue; the
  chime is an addition, toggled per device, and never the only signal (PRD NFR-7).
- **NFR-6 — Atomic writes.** Finalising writes the session status and the grams deduction in one
  `doc_transaction`.

### Architecture

Strict 3-layer, as the rest of the tea backend:

- `app/routers/tea.py` — new session and curve routes; translates stdlib exceptions to HTTP.
- `app/services/tea_session_service.py` — upsert, finalise (with grams deduction), discard,
  listing.
- `app/services/tea_curve_service.py` — the fallback chain.
- `app/repositories/tea_repo.py` — unchanged I/O; `migrate` gains the v1 → v2 step.

## Data model

### `Tea` (changed)

Gains one optional field, reusing the Almanac's `BrewingParameters`
(`leaf_grams: float | None`, `water_temp_c: int | None`, `steep_seconds: list[int]`):

```
brewing: BrewingParameters | None = None
```

Mirrored on `TeaWriteRequest`, validated: `leaf_grams > 0`, `water_temp_c` in 1–100,
every `steep_seconds` value > 0.

### `Infusion`

```
number: int            1..N, contiguous
target_seconds: int    > 0
actual_seconds: int | None    >= 0; null = not yet brewed
```

### `TeaSession`

```
id: str                          client-generated UUID
tea_id: str
status: "in_progress" | "finalised"
started_at: str                  ISO 8601, set by the client
updated_at: str                  server-set on every upsert
finished_at: str | None          server-set when status becomes "finalised"
leaf_grams: float | None         > 0
water_temp_c: int | None         1–100
rating: int | None               1–5
curve_source: "best_session" | "tea" | "almanac" | "generic"
curve_source_label: str
infusions: list[Infusion]
```

The curve is resolved once, when the tea is attached; `curve_source` records which link of the
chain supplied it. Past the end of the source's list, further targets extend by the generic step
(+5 s on the last target).

### `TeaDoc` (changed)

```
schema_version: int = 2
teas, catalogue_nodes      unchanged
sessions: list[TeaSession] = []
```

Sessions live in the per-user tea doc (`DATA_DIR/tea/users/{username}.json`) so that finalising
and the grams deduction are one atomic write, and a retried finalise can check "already
finalised" inside the same transaction. At roughly 1 KB per session, years of daily use stay in
the low hundreds of KB. `migrate` upgrades v1 by adding `sessions: []` and setting
`schema_version: 2`.

### Server rules

- Upsert of an unknown `tea_id` → `FileNotFoundError` → 404.
- Upsert of a session already stored as `finalised` → `SessionFinalisedError` → 409.
- Upsert that transitions to `finalised`: drop infusions with `actual_seconds: null` (the
  pending next steep); set `finished_at`; if `leaf_grams` is set,
  `grams_remaining = max(0, grams_remaining - leaf_grams)` on the tea; both in one transaction.
- Discard of a finalised session → 409; of an unknown id → 404.
- Deleting a tea deletes its sessions in the same transaction.

## Brewing Curve

`GET /api/tea/teas/{tea_id}/curve` returns
`{ leaf_grams, water_temp_c, steep_seconds, source, source_label }`, resolved in order:

1. **Best session** — finalised sessions of this tea with a rating and at least one brewed
   infusion; highest rating, ties → latest `finished_at`. `steep_seconds` = its brewed
   infusions' `actual_seconds`; grams and temperature from that session.
   Label: `from your best session (★{rating}, {d MMM})`.
2. **Tea** — the tea's `brewing`, if `steep_seconds` is non-empty. Label: `tea default`.
3. **Almanac** — walk from the tea's `catalogue_node_id` up through `parent_id` until a node has
   an Almanac entry; use its `brewing` if its `steep_seconds` is non-empty. Label:
   `almanac: {node name}`.
4. **Generic** — `10, 15, 20, 25, …` (+5 s). Label: `generic gongfu`.

`steep_seconds` comes from the first link that has any. `leaf_grams` and `water_temp_c` each fall
through the chain independently (first non-null wins), so a tea with its own steep list but no
temperature still gets the Almanac's temperature.

The generic curve is duplicated as a constant in the frontend because plain mode needs it with no
tea and possibly no network.

## API

All under `/api/tea`, behind the existing auth dependency; snake_case, direct serialisation.

```
GET    /sessions?status=in_progress   in-progress sessions (recovery check)
GET    /teas/{tea_id}/sessions        finalised sessions of a tea, newest first
PUT    /sessions/{session_id}         snapshot upsert; body = TeaSession minus server fields;
                                      returns the stored TeaSession; 404 unknown tea,
                                      409 already finalised, 422 invalid
DELETE /sessions/{session_id}         discard in-progress; 204; 404 unknown, 409 finalised
GET    /teas/{tea_id}/curve           the resolved curve; 404 unknown tea
```

## Frontend

### Route and entry points

`/tea/timer` (optional `?tea=<id>` attaches that tea on open). Entry points: a Brew action in the
Cabinet header, and a Brew button on tea detail.

### Units

- **`useSteepClock`** (composable) — takes the running steep's `startedAt` (epoch ms, held in the
  timer store so it survives a reload) and returns reactive `elapsed`, derived from
  `Date.now() - startedAt`. Knows nothing of sessions.
- **`useWakeLock`** — acquire while live, re-acquire on `visibilitychange`, no-op if unsupported.
- **`useTargetChime`** — plays a soft chime once when `elapsed` crosses the target, if the
  device-local toggle (in `localStorage`) is on. Audio is unlocked on the first Start tap.
- **`useTeaTimerStore`** (Pinia) — the live session and the source of truth: tea (optional),
  infusions, curve and label, grams, temperature, `unsynced`, plus `loading` / `error`. Persists
  to `localStorage` on every change and validates on rehydrate (invalid → dropped, fresh start).
  Actions: `start`, `stop`, `nudgeTarget`, `redoLast`, `attachTea`, `finish`, `end`, `discard`,
  `resume`, `push`.
- **`useTeaSessionsStore`** (Pinia) — server reads: in-progress sessions for recovery, finalised
  sessions per tea. `loading` / `error` as usual.
- **`TeaCup.vue`** — the SVG cup (below).
- **`TimerPage.vue`**, **`PickTeaSheet.vue`**, **`FinishSheet.vue`**, **`RecoveryCard.vue`**,
  **`TeaSessionsList.vue`**; brewing fields added to **`TeaForm.vue`**; Brew button and Sessions
  list added to **`TeaDetailPage.vue`**.

All HTTP through `useApi.ts`.

### The cup

A pinming-style Chinese teacup in SVG: short and wide, flared rim, small foot, drawn in the
Cabinet's palette (`#17120e` ground, `#e4d9c6` line). A dashed target line in `#d9a45b` with the
target seconds beside it.

- Liquor rises from the bottom and meets the dashed line exactly at the target time.
- Past the target it keeps rising above the line toward the rim and slowly deepens in colour,
  stopping at the rim, so an over-steep is visible at a glance.
- On Stop the cup drains with a short animation and the next target moves onto the line.
- Liquor colour by the attached tea's class:

  | class | colour |
  |---|---|
  | green | `#d6cf86` |
  | yellow | `#e3c65e` |
  | white | `#ead9a4` |
  | oolong | `#d49a3f` |
  | red | `#a8492a` |
  | dark | `#5e2e17` |
  | other / no tea | `#bdb56a` |

### Screen layout (top to bottom)

Tea name + "change tea" (or "+ pick a tea / just a timer") top-left; chime toggle and `⋯` menu
(Redo last infusion, Discard) top-right; the cup; elapsed `m:ss` beneath it; ±5 s nudges;
infusion chips (`1 · 10s`, `2 · 16s`, current highlighted); the curve source label; a small
"Finish" (or "End" in plain mode) text action; the full-width Start/Stop band at the bottom
("tap to start" / "tap to stop · pour"). A "not synced" dot appears next to the tea name while
`unsynced` is true.

### Flows

- **Pick a tea** — bottom sheet: search the Cabinet (photo, name, grams; 0 g teas last), then leaf
  grams and water °C prefilled from the curve.
- **Stop a steep** — record `actual_seconds`, append the next infusion with the next curve target,
  push if a tea is attached.
- **Push** — PUT the full snapshot. On failure set `unsynced`; retry on the next steep, on Finish,
  and on the browser `online` event. Never blocks the timer.
- **Finish** — sheet with optional stars and "−5 g from Tieguanyin (42 g → 37 g)". Save PUTs with
  `status: "finalised"`, then navigates to the tea's detail. Failure keeps the sheet open with the
  error and Retry; local state is kept until the server confirms. A 409 is treated as success
  (the earlier attempt landed but its response was lost): fetch, clear, navigate.
- **Discard** — confirm, DELETE if ever pushed, clear local state.
- **Recovery** — on open with no local live session, `GET /sessions?status=in_progress`; one card
  per result above the cup ("Unfinished Tieguanyin session · yesterday 19:40 · 4 infusions",
  Resume / Discard). Resume loads the snapshot into the store; the phone owns it from then on.

### Error handling

- Curve fetch fails → stay on the generic curve, label "generic gongfu (couldn't load tea curve)".
- Upsert 404 (tea deleted elsewhere) → detach the tea, fall back to plain mode with a notice,
  keep recorded timings.
- Errors from store actions go to `error.value`, never bare `console.error`.

## Testing

**Backend** (`test_tea_sessions.py`, `test_tea_curve.py`):

- Upsert creates then replaces; upsert of a finalised session → 409; discard of finalised → 409;
  unknown `tea_id` → 404; invalid snapshot (rating 6, non-contiguous numbers) → 422.
- Finalise drops unbrewed infusions; deducts grams exactly once across a retried finalise, clamps at 0, skips without
  `leaf_grams`, sets `finished_at`.
- Deleting a tea removes its sessions.
- Curve: 5-rated beats 3-rated; ties → most recent; unrated and in-progress ignored; tea brewing
  next; nearest Almanac ancestor next; generic last; grams and temperature fall through
  independently.
- `migrate` v1 → v2 adds `sessions: []`.
- `TeaWriteRequest.brewing` validation.

**Frontend** (co-located `*.spec.ts`):

- `useSteepClock` with fake timers, including a simulated background gap.
- `useTeaTimerStore`: attach re-targets only unbrewed infusions; stop appends the next target;
  push failure sets `unsynced` and a later success clears it; finish 409 treated as success;
  rehydrate from `localStorage`, invalid data dropped.
- `TeaCup`: fill level at 0 / half / target / past target, rim cap, colour per class.
- `TeaForm` brewing fields; `FinishSheet` grams preview; `RecoveryCard` resume / discard;
  `TeaSessionsList` ordering.

## Epics

- **Epic A — Session Timer.** Data model and migration, curve and session services, API, tea
  brewing fields, timer store and composables, cup, timer page and sheets, recovery, tea detail
  Brew + Sessions list, tests. This is the implementation plan's entire scope.
