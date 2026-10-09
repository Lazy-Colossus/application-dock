---
stepsCompleted: [1]
recutOn: '2026-09-10'
recutReason: 'Re-cut against the final UX spines, which did not exist when this document was first written.'
inputDocuments:
  - docs/planning-artifacts/prds/prd-kitchencraft-2026-09-09/prd.md
  - CLAUDE.md
  - docs/planning-artifacts/architecture.md
  - docs/planning-artifacts/ux-designs/ux-kitchencraft-2026-09-10/DESIGN.md
  - docs/planning-artifacts/ux-designs/ux-kitchencraft-2026-09-10/EXPERIENCE.md
  - docs/planning-artifacts/ux-designs/ux-kitchencraft-2026-09-10/.decision-log.md
missingInputs:
  - 'No KitchenCraft architecture document exists; the platform architecture is used instead. See "Architecture Gaps".'
  - 'The PRD refers to an addendum.md that has never been written.'
---

# KitchenCraft — Epic Breakdown

## Overview

This document is the complete epic and story breakdown for **KitchenCraft**, a household recipe
collection shipped as a new self-contained app inside the Application Dock platform.

A user captures a recipe by pasting text and giving it a name — that alone is a complete, valid
recipe, forever. Every other field is optional: meal type, total time, servings, source, free tags,
and **ingredients** (an optional amount and unit plus the ingredient itself, as free text). The
collection is browsable, full-text searchable, and filterable by meal type and tag. Recipes can be favourited, and their ingredients pushed onto the household's single
**shopping list** that opens as a modal from anywhere and behaves like a shopping companion.

Structure that the user never enters by hand is filled in later by an **offline enrichment pass** —
an LLM-assisted maintenance script run by the builder from Claude Code, writing **directly to the
data volume through the repository layer** so it inherits the app's atomic writes and per-file
locks. The captured body is never altered by anything, and deliberate user input is never
overwritten by a pass.

Platform-wide architecture is inherited, not re-built (3-layer backend, `useApi` HTTP boundary,
registry + lazy routes, JWT auth, atomic JSON file persistence). Stories live under
`docs/stories/kitchencraft/`.

## Requirements Inventory

### Functional Requirements

**F1 — App Integration & Identity**
- FR-1: KitchenCraft is registered in the Application Dock shell — a card on the landing page
  (`src/apps/registry.ts`), lazy-loaded route(s) (`src/router/routes.ts`), and an entry in the
  backend `_APPS` list (`app/routers/shell.py`) with its own router under `/api/kitchencraft`.
- FR-2: All data sits behind the dock's login — every route requires `get_current_user` — and is
  **shared by the household**: one collection file and one shopping-list file, read and written by
  every signed-in user. Who is signed in never selects a file, and no `user` field is accepted in
  any request path or body. *(Revised 2026-09-23; see "Amendments".)*

**F2 — Capture & Edit** *(PRD FR-1 – FR-3)*
- FR-3: A recipe can be created from a **name and a body alone**. No other field is required, and
  no other field blocks saving. Save is rejected only for an empty name or empty body, and the
  error names which.
- FR-4: Any field of a recipe can be edited; a recipe can be deleted behind a confirmation (no
  undo, no trash).
- FR-5: The body is stored **verbatim** — trimmed at the ends only, internal line breaks and blank
  lines preserved — and is never reformatted by the app or by an enrichment pass.

**F3 — Structured Fields** *(PRD FR-4 – FR-7)*
- FR-6: A recipe may optionally carry meal type (breakfast / dinner / dessert — exactly the
  folder dividers), total time in minutes, servings, and source (free text). Each is independently settable
  and clearable; time and servings accept positive integers only. *(Revised 2026-09-23; see "Amendments".)*
- FR-7: An **ingredient** is an optional **amount**, an optional **unit**, and the ingredient
  itself as free text. Only the name is required. Ingredients display one per line, in entry order,
  with amount and unit in their own column. *(Revised 2026-09-15; see "Amendments".)*
- FR-8: Ordinary tags and ingredient tags are entered in **two separate inputs**; a value typed in
  one never lands in the other's namespace, and each suggests only from its own namespace.
- FR-9: Tag and ingredient entry suggests values already present in the collection, matched
  case-insensitively and stored in one normalised casing, so the wording converges. A genuinely
  new value can still be committed. *(Revised 2026-09-15: the "visibly distinct act" for coining an
  ingredient category is void — there is no controlled vocabulary. Convergence on one casing still
  holds, and is what stops `Feta` and `feta` becoming two things.)*

**F4 — Browse, Search, Filter** *(PRD FR-8 – FR-10)*
- FR-10: The collection renders as a scannable list, creation date descending, **favourites first**,
  each entry showing at minimum the name plus meal type and time where present. An empty collection
  prompts for the first capture.
- FR-11: A single search box matches case-insensitively and on partial words against recipe **names
  and bodies**, and combines with active filters rather than replacing them.
- FR-12: The list can be filtered by meal type and by tag — a plain tag
  filter (selecting two tags returns recipes carrying both, regardless of what else those
  recipes need, and the UI never implies completeness). Filters combine, each is individually
  clearable, the result count is visible, and a zero-result state offers to clear.

**F5 — Favourites** *(PRD FR-11)*
- FR-13: A favourite flag can be toggled on any recipe, from the list without navigating or losing
  scroll position. Favourites sort first, stay marked inside filtered results, and a favourites-only
  view is one interaction from the collection screen.

**F6 — Shopping List** *(PRD FR-12 – FR-16)*
- FR-14: Exactly **one shopping list for the household**, opened as a modal by a button in the app's
  top-right corner, present on every KitchenCraft screen. Opening and closing it never navigates
  away from or loses the state of the current screen. There is no list-management surface.
  *(Revised 2026-09-23; see "Amendments".)*
- FR-15: List items can be added by hand, ticked as purchased (struck through, staying in place),
  unticked, and deleted. Ticking is a single tap on the row. A **clear** action empties the list
  behind a confirmation. An empty list says so and offers hand-entry.
- FR-16: **Add to shopping list** on a recipe opens a modal listing that recipe's ingredients as
  checkboxes — everything checked by default **except staples** (salt, black pepper), which start
  unchecked but can be checked. Entries show the specific where one exists. Confirming with nothing
  checked is a no-op. Items arrive as ordinary editable text. A recipe with no ingredient tags
  explains there is nothing structured to send rather than opening an empty modal.
- FR-17: Adding to a **non-empty** list prompts the user to **add** (append, no case-insensitive
  duplicates) or **overwrite** (discard previous contents including ticked items, behind its own
  confirmation). Adding to an empty list is silent.
- FR-18: After a successful add, the user is told how many items were added and offered a way
  through to the shopping list, and is equally free to stay on the recipe. Never navigated
  automatically.

**F7 — Offline Enrichment** *(PRD FR-17 – FR-20)*
- FR-19: The enrichment script (in `backend/scripts/`, run from Claude Code against the data
  volume) goes through the **repository layer** — its atomic write path and per-file locking —
  never reading and rewriting JSON on its own. A pass cannot tear a file or lose a concurrent user
  edit, and fails loudly without changing anything if the data does not match the expected schema.
- FR-20: Structured fields and tags can be updated for **many recipes in one operation**, addressed
  by stable recipe **id** (never by name), without supplying or touching bodies. An unknown id fails
  that entry and is reported without abandoning the batch; every recipe is left in a valid state;
  re-running an identical batch is a no-op.
- FR-21: An enrichment pass **never overwrites deliberate user input** — it fills empty fields and
  adds tags; user-set values and user-added tags survive.
- FR-22: A pass reuses the **ingredient wording already present in the collection** rather than
  inventing a near-synonym, and reports newly introduced wording at the end of the run
  so vocabulary drift is caught early.

### NonFunctional Requirements

- NFR-1: **Persistence** — JSON files on disk (one for the collection, one for the shopping
  list), every write atomic
  (write-`.tmp`-then-`os.replace`), per-file locking around read-modify-write. No database, no new
  backend dependency.
- NFR-2: **Layering** — strict router → service → repository; the repository is the only code
  touching the filesystem; stdlib exceptions translated to `HTTPException` in routers only.
- NFR-3: **Data safety** — the body is the irreplaceable asset. No operation (edit, enrichment,
  bulk update, migration) may lose or silently alter a body. Offline enrichment is held to the same
  standard as the app.
- NFR-4: **Mobile-first** — every screen usable one-handed at phone width; the recipe reading view
  legible at arm's length without pinch-zoom.
- NFR-5: **Auth** — behind the dock's existing JWT auth; an anonymous caller reaches nothing, and
  every signed-in user reaches the one shared collection. *(Revised 2026-09-23; see "Amendments".)*
- NFR-6: **Performance** — search and filter stay instant at personal scale (hundreds of recipes);
  client-side filtering over the loaded collection is acceptable.
- NFR-7: **Capture cost** — clipboard to saved recipe in under 10 seconds and no more than three
  interactions.
- NFR-8: **Aesthetic** — calm and uncluttered; the body text is the hero. Structure sits quietly at
  the edges. Empty fields render as absent, never as gaps waiting to be filled.

### Additional Requirements

*(From `CLAUDE.md` and the platform architecture — inherited, not re-decided.)*

- All frontend HTTP goes through `src/composables/useApi.ts`; no raw `fetch`/`axios` in components
  or stores. `ApiError` carries `.status` and `.detail`.
- Pinia stores expose `loading` and `error` refs; every async action sets `loading` in a
  `try/finally` and routes errors into `error.value`.
- API contract: snake_case JSON fields, direct serialization (no `{ data, status }` envelopes),
  ISO 8601 dates, errors as `{ detail }`.
- Frontend app code is self-contained under `src/apps/kitchencraft/` (pages, components,
  composables, stores, `types.ts`); shared primitives only in `src/components/`.
- Adding the app is a two-file shell change (registry + routes) plus a backend router and an entry
  in `_APPS`.
- Backend tests in `backend/tests/` as `test_*.py` using `tmp_path` + `monkeypatch` on
  `settings.data_dir`; frontend `*.spec.ts` co-located next to the unit.
- Story files live under `docs/stories/kitchencraft/` with `for-review/` and `done/` subfolders.
- Data lives in the `archery-data` named volume at `/data` in production; `DATA_DIR` must be set
  outside Docker.

### UX Design Requirements

Source: [`ux-designs/ux-kitchencraft-2026-09-10/`](ux-designs/ux-kitchencraft-2026-09-10/) — the UX
pass of 2026-09-10. `DESIGN.md` is the visual contract (identity **"Beige Ledger"**),
`EXPERIENCE.md` the behavioural one. Both are `final`, and **both win on conflict with any mock**.
`.decision-log.md` carries the reasoning, including two struck aesthetic directions and why they
were struck. Visual reference for one surface:
[`mockups/key-collection.html`](ux-designs/ux-kitchencraft-2026-09-10/mockups/key-collection.html).

These are first-class requirements, at the same rigour as the FRs above.

**Foundation**

- **UX-DR1** — Implement the "Beige Ledger" token layer, scoped to KitchenCraft: 8 colours, 5 type
  roles, 2 radii (3px / 6px), the inherited 4-point spacing grid, `measure` 62ch, `touch-min` 44px.
  It overrides Quasar/Roboto **at the app layer only** — the dock's Carbon tokens are not touched,
  and no font payload is added to the platform.
- **UX-DR2** — Serif type ramp, system stack, no webfont. `recipe` at 18px/1.75 is a **hard floor**
  at every surface and every breakpoint — never smaller, never compressed to fit more on screen.
  Counts and times set `tabular-nums`. The system font scale is honoured at every role.
- **UX-DR3** — No-shadow depth model. The `beige` → `beige-raise` step is only **1.14:1**, so the
  fill step alone must never carry a boundary: every raised surface takes a 1px `taupe` hairline.
  No component may depend on the surface step for separation.
- **UX-DR4** — Contrast conformance, measured not assumed. Text on a moss fill is `on-moss`
  (5.28:1); **`ink` on moss is 3.09:1 and fails** and must never ship. `taupe` is non-text only
  (3.17:1); all quiet text is `taupe-ink` (5.31:1). Needs a guard — a test or lint rule — not just
  a note, because it is the one rule a well-meaning implementer will break.

**Components** *(12 in `EXPERIENCE.md § Component Patterns`, each with a visual peer in `DESIGN.md § Components`)*

- **UX-DR5** — Build the components to their paired contract: `field`, `button-primary`,
  `button-quiet`, `button-danger`, `chip`, `chip-unconfirmed`, `recipe-row`, `list-row`,
  `typeahead`, `modal`, `rule`. A chip that is a **control** takes moss when
  selected; a chip merely **displaying** a value is never moss, because it is not pressable.
  *(`new-category-row` removed 2026-09-15 with the category vocabulary; 11 components.)*
- **UX-DR6** — Typeahead suggests from **its own namespace only** — a tag never appears under
  Ingredients or vice versa. Case-insensitive match on any substring, six suggestions then scroll,
  no spinner. The highlighted row takes a moss focus ring, never a fill, because a fill would read
  as *selected* when it is only *highlighted*. *(Revised 2026-09-15: Tags is now the typeahead's
  only caller. The ingredient and unit fields use a native datalist — "offer a list, accept
  anything" — which is what free text needs.)*
- **UX-DR7** — ~~The new-category row is distinct by position, rule, icon and wording~~ **Void
  2026-09-15** — there is no coining ceremony, because there is no controlled vocabulary to protect.
  A new ingredient is simply typed.
- **UX-DR8** — Unconfirmed chip for enrichment-written values: **unfilled** where a confirmed chip
  is filled, plus lighter ink. Two signals, neither of them colour alone. No icon, no badge, and the
  whole tell drops the moment the user touches the value.

**Behaviour**

- **UX-DR9** — **The absence rule.** An empty structured field renders as absent: not a gap, a
  placeholder, a dash, an "unknown", a greyed chip or a labelled empty slot. A collection row with
  no meal type and no time is a genuine **one-line row**. The reading view has no fixed structural
  frame. Nothing anywhere counts how much structure a recipe has, compares it to another, or invites
  the user to add more. The edit screen is the sole exception.
- **UX-DR10** — **The verbatim body contract.** Mixed bullet characters, inconsistent casing, stray
  pasted site boilerplate, blank lines and ragged breaks all read back exactly as pasted. Nothing
  re-flows, re-wraps or tidies the body — not the app, not an enrichment pass.
- **UX-DR11** — ~~**The pantry filter never implies completeness.**~~ **Void 2026-09-15** — there is no pantry filter. The PRD's counter-metric made the
  *wording* the requirement. Counts read "6 of 42 recipes call for chicken + onion", never "6 you
  can make"; the verb is always *call for* or *use*. No match percentage, no "2 of 9 ingredients"
  ratio, no completeness bar, no tick, no sort by how close a recipe is to cookable. See the
  write-this/never-this table in the spine.
- **UX-DR12** — The zero-result state lists **each active filter with its own count**
  ("chickpeas — 7 on its own"), each line clearing that one filter, so it explains *why* nothing
  matched instead of only offering the exit.
- **UX-DR13** — Four empty states, carried by type, rule and spacing and **never a bare panel**:
  empty collection, empty favourites-only, empty shopping list, and "nothing to send yet". Copy is
  specified verbatim in the spine.
- **UX-DR14** — Modal discipline. Modals stack **one level deep**; escape and the backdrop close a
  modal but **never** a confirmation, which requires an explicit choice. Closing returns the user to
  the exact surface, scroll position and filter state it opened over. The overwrite confirmation
  replaces the add-vs-overwrite prompt in place rather than layering on it.
- **UX-DR15** — Validation happens **at the field, not at save**: non-numeric time or servings is
  rejected on entry, and a rejected save names which field is empty. Capture opens focused in the
  body textarea — clipboard to saved in under 10s and no more than three interactions (NFR-7).

**Cross-cutting**

- **UX-DR16** — Responsive: phone and wide as **peers**, split at 700px. Two-column collection
  rows, a quiet right rail for structure in the reading view, the shopping list as a full-height
  sheet on phone and a centred ≤480px dialog on wide. `recipe` size and `measure` are **identical
  on both sides** — a wide window buys margin, never a longer line. *This exceeds NFR-4, which is
  phone-only; drafted to be strikable without touching the rest of the spine.*
- **UX-DR17** — Accessibility floor, inherited from the house since the PRD is silent: 44px targets
  holding at the **largest** system font setting, `prefers-reduced-motion` respected, and **colour
  is never the sole signal** — which bites twice here, since moss carries active state and
  favourites are ink-marked by shape and fill. Focus is a 2px moss ring at 1px offset.
- **UX-DR18** — Voice and tone: plain English, no fantasy register in the words. Meal types are
  verbatim from PRD FR-4 and are **never re-worded, re-cased or re-ordered**. No exclamation marks,
  encouragement, emoji, streaks, or nagging to fill in fields. The app never implies a recipe is
  unfinished.
- **UX-DR19** — ~~A **shipped starter vocabulary** of ingredient categories~~ **Superseded
  2026-09-15**: a shipped starter list of **units** instead, so the unit field does useful work
  against the very first recipe. Deliberately open — anything typed is accepted. Follows the
  Hotaru shipped-seed precedent (commits `24422ce`, `f95697c`). **Revised 2026-09-15**: the shipped
  seed is now a list of **units**, not ingredient categories. Story 4.4 guards ingredient *wording*
  rather than a controlled vocabulary, and the Ingredients input suggests from the collection's
  own history, so it does have a genuine first-run empty state.

### Architecture Gaps

**No KitchenCraft architecture document exists.** The platform architecture
(`docs/planning-artifacts/architecture.md`) and `CLAUDE.md` supply the chassis — strict
router → service → repository layering, `_atomic_write_json`, `DATA_DIR`, JSON files, JWT
scoping — and those are inherited, not re-decided. The PRD also refers to an `addendum.md` that has
never been written.

The following are therefore **assumed by the stories below rather than cited from a decision**. Each
is a genuine architecture question and should be settled before or during the story it first bites:

1. **Recipe schema and stable id.** FR-20 requires bulk updates addressed by stable recipe **id**,
   never by name. The id's shape, how it is generated, and where it lives in the JSON are
   undecided. First bites **Story 1.2**.
2. ~~**Shared ingredient-category vocabulary storage.**~~ **Closed 2026-09-15** — moot; there is no
   shared vocabulary. The ingredient field suggests from the user's own history, derived on read.
   Previously: the vocabulary was shared across a user's whole collection and read by the typeahead,
   the pantry filter and the enrichment pass. Whether it was
   a separate `_`-prefixed file (as `_recurring_players.json` is for archery), a derived index, or
   computed on read is undecided — and UX-DR19 now requires it to ship **seeded**. First bites
   **Story 2.3**.
3. **Per-field provenance persistence.** UX-DR8 requires the UI to distinguish an
   enrichment-written value from a user-set one, so provenance must be stored **per structured
   field** and exposed through the API — not merely tracked inside the enrichment script. This
   promotes PRD FR-19 from an open question to a requirement. First bites **Story 4.1**, but the
   schema decision lands in **Story 1.2**.

### FR Coverage Map

FR-1: Epic 1 — Shell registration (card, route, `_APPS`, `/api/kitchencraft` router)
FR-2: Epic 1 — Login required via `get_current_user`; one shared collection file (revised 2026-09-23)
FR-3: Epic 1 — Create a recipe from name and body alone
FR-4: Epic 1 — Edit any field; delete behind a confirmation
FR-5: Epic 1 — Body stored verbatim, never reformatted
FR-6: Epic 2 — Optional meal type, time, servings, source
FR-7: Epic 2 — Ingredients as amount + unit + name (Story 2.8)
FR-8: Epic 2 — Separate Tags and Ingredients inputs
FR-9: Epic 2 — Suggestion from existing vocabulary; normalised casing
FR-10: Epic 1 — Browse the collection, newest first, favourites first
FR-11: Epic 2 — Full-text search over names and bodies
FR-12: Epic 2 — Filter by meal type and tag
FR-13: Epic 2 — Favourite toggle, favourites-first ordering, favourites-only view
FR-14: Epic 3 — One list for the household, opened as a modal from the top-right
FR-15: Epic 3 — Tick / untick / delete / clear behaviour
FR-16: Epic 3 — Add-from-recipe modal, staples unchecked by default
FR-17: Epic 3 — Add-vs-overwrite prompt on a non-empty list
FR-18: Epic 3 — Post-add confirmation offering the list without forcing it
FR-19: Epic 4 — Enrichment writes through the repository layer
FR-20: Epic 4 — Bulk, id-addressed, idempotent structured updates
FR-21: Epic 4 — Never overwrite deliberate user input
FR-22: Epic 4 — Reuse the ingredient wording already in use; report new wording

## Epic List

### Epic 1: Foundation & the capture loop

A user can open KitchenCraft from the dock, paste a recipe with a name, see it in the household's
collection, open it, edit it, and delete it. Nothing else is required to save, and the pasted text
comes back exactly as it went in. This epic is the whole app in miniature — after it, KitchenCraft
is genuinely usable as a recipe store, and everything later is about finding and shopping.

**FRs covered:** FR-1, FR-2, FR-3, FR-4, FR-5, FR-10

**Consolidation considered:** Epics 1 and 2 both touch the recipe model and the collection screen,
which is the file-churn pattern that usually argues for merging. They are kept separate deliberately:
Epic 1 alone is a shippable, useful recipe store, and Epic 2 is the genuine feedback boundary — if
optional structure turns out not to earn its keep in real use, that changes what Epic 2 should be.
Favourites (FR-13) was *not* given its own epic for exactly this reason, and sits inside Epic 2 with
the filter work it shares files with.

### Epic 2: Structure & finding what to cook

A user can add optional structure to recipes — meal type, time, servings, source, tags, and
ingredients with amounts — and then use it: search the full text, filter by meal type and tag,
and keep the recipes they actually cook one tap away as favourites. This is the
epic that turns a pile of text into a collection you can ask questions of.

**FRs covered:** FR-6, FR-7, FR-8, FR-9, FR-11, FR-12, FR-13, FR-23 (rating)

#### Story 2.7: A star rating alongside favourites

*Added 2026-09-15, after Epic 2 shipped. Covered by PRD FR-21, written after the
fact from the built behaviour.*

A recipe can carry a 1–5 star rating, independent of the favourite flag in both
directions. The rating took the star, so the favourite moved to a heart. Rating
stays out of the collection order. Full acceptance criteria live in
`docs/stories/kitchencraft/for-review/2.7.star-rating-alongside-favourites.story.md`.

### Story 2.8: Ingredients become amount + unit + name

*Added 2026-09-15. Replaces Story 2.3 and the pantry half of Story 2.5.*

An ingredient becomes an optional amount, an optional unit and a required
free-text name, displayed one per line with the quantities in their own column.
The schema goes to v2 and existing recipes migrate on read. The shared category
vocabulary, the pantry filter and the coining ceremony are removed. Full
acceptance criteria live in
`docs/stories/kitchencraft/for-review/2.8.ingredients-as-amount-unit-and-name.story.md`.

## Epic 3: The shopping list

A user can push a recipe's ingredients onto a single running shopping list — choosing which ones,
with staples excluded by default — and carry that list to the shop, ticking things off as they go.
The list is reachable from anywhere in the app without losing what they were doing.

**FRs covered:** FR-14, FR-15, FR-16, FR-17, FR-18

### Epic 4: Offline enrichment

The builder can run an LLM-assisted pass over stored recipe bodies from Claude Code, filling in the
structure users never entered by hand — safely, against live data, without touching bodies,
without overwriting deliberate user input, and without fragmenting the ingredient vocabulary. This
epic is what makes Epic 2's structure viable for a user who never tags anything.

**FRs covered:** FR-19, FR-20, FR-21, FR-22

## Epic 1: Foundation & the capture loop

A logged-in user can open KitchenCraft from the dock, paste a recipe, see it in the household's
collection, read it, edit it and delete it. *(Originally scoped to each account; shared since
2026-09-23 — see "Amendments".)*

### Story 1.1: Register KitchenCraft in the Application Dock shell

As a user,
I want KitchenCraft to appear as an app in the dock and open to its own home,
so that I can launch it like any other app in the platform.

**Acceptance Criteria:**

**Given** the dock landing page
**When** it renders the app registry
**Then** a KitchenCraft card appears (label "KitchenCraft", icon `menu_book`) alongside the existing
apps, and selecting it routes to `/kitchencraft` (FR-1).

**Given** `GET /api/apps`
**When** called
**Then** the response includes a KitchenCraft `AppDescriptor`
(`id: "kitchencraft"`, `label: "KitchenCraft"`, `icon: "menu_book"`, `route: "/kitchencraft"`).

**Given** the new app module
**When** the project is set up
**Then** `src/apps/kitchencraft/` exists (self-contained; the shell imports it only via
`registry.ts`), a backend `routers/kitchencraft.py` is mounted under `/api/kitchencraft` behind
`Depends(get_current_user)`, and `docs/stories/kitchencraft/{for-review,done}/` exist. Existing
`pytest` / `npm test` stay green; `black`, `ruff` and `eslint` clean.

### Story 1.2: Per-user recipe store — repository, schemas, service — PARTLY SUPERSEDED 2026-09-23

> **The store is no longer per user.** There is one collection file for the household
> (`kitchencraft/recipes.json`); the legacy per-user files are merged into it on first read. The
> repository, the atomic writer, the schemas and the service layer all still stand. The
> path-safety AC is void: no path is built from a username any more.

As the platform,
I want a JSON file per user with an atomic-write repository and typed schemas,
so that every user's recipes are stored, isolated and safe from concurrent writes.

**Acceptance Criteria:**

**Given** `repositories/kitchencraft_repo.py`
**When** a user's document is read and they have no file yet
**Then** it returns an empty document (`{ schema_version, recipes: [] }`) rather than erroring; the
repo is the only module touching the filesystem, and every write goes through the shared atomic
writer with `key_lock` held across each read-modify-write (NFR-1, NFR-2).

**Given** `schemas/kitchencraft.py`
**When** models are defined
**Then** a `Recipe` carries a stable id (`r-` + `{uuid8}`), `name`, `body`, ISO-8601 `created_at`
and `updated_at`, and nullable structured fields; the top-level document carries `schema_version`
and a `migrate()` runs on read so later schema bumps are handled.

~~**Given** the per-user filename / **When** it is derived from the authenticated username /
**Then** it is validated as a bare filename so a crafted username cannot escape the app's
directory~~ — **void 2026-09-23**, no filename comes from a username. No `user` field is accepted in
any request path or body still holds (FR-2, NFR-5).

**Given** the service layer
**When** it operates on the document
**Then** it raises stdlib exceptions (`FileNotFoundError` for an unknown recipe, `ValueError` for
invalid input) and never raises `HTTPException`; the router performs that translation (NFR-2).

### Story 1.3: Capture a recipe from a name and pasted text

As a cook,
I want to save a recipe by giving it a name and pasting the text,
so that I can keep something I found without filling in a form.

**Acceptance Criteria:**

**Given** the capture screen
**When** it opens
**Then** focus is in the body text area, and a paste-plus-save completes in no more than three
interactions (NFR-7).

**Given** a name and a body and no other field
**When** the recipe is saved
**Then** it persists and appears in the collection; no other field is required and none blocks
saving (FR-3).

**Given** an empty name, or an empty body
**When** a save is attempted
**Then** it is rejected and the message names which one is missing — and no other validation can
block a save (FR-3).

**Given** a body pasted with mixed bullet characters, blank lines and site boilerplate
**When** it is saved and read back
**Then** it is byte-identical apart from trimmed leading/trailing whitespace; internal line breaks
and blank lines survive exactly (FR-5, NFR-3).

**Given** the frontend
**When** it talks to the API
**Then** it does so only through `useApi`, and the Pinia store exposes `loading` / `error`, setting
`loading` in a `try/finally` and routing failures into `error.value`.

### Story 1.4: Browse the collection

As a cook,
I want to see all my recipes in one scannable list,
so that I can find the one I want to cook.

**Acceptance Criteria:**

**Given** a collection with recipes
**When** the collection screen renders
**Then** recipes are listed creation-date descending, each showing its name. The optional meal type
and total time arrive with Story 2.1 and are surfaced in this list at that point; until then the
name is the whole entry, and this story is complete without them (FR-10).

**Given** a user with no recipes
**When** the collection screen renders
**Then** it prompts them to capture their first recipe rather than showing a blank screen (FR-10).

**Given** two different authenticated users
**When** each opens the collection
**Then** both see the same recipes (FR-2). *(Reversed 2026-09-23: originally "neither sees any
recipe belonging to the other".)*

**Given** this story
**When** ordering is implemented
**Then** it sorts by creation date only — favourites-first ordering arrives with Story 2.6 and is
explicitly out of scope here, so this story stands alone.

### Story 1.5: Read, edit and delete a recipe

As a cook,
I want to open a recipe to cook from it, correct it, or throw it away,
so that my collection stays accurate and useful at the stove.

**Acceptance Criteria:**

**Given** a recipe with a multi-line body
**When** it is opened
**Then** the body renders with its line breaks and blank lines intact, legible one-handed at phone
width without pinch-zoom (NFR-4, NFR-8).

**Given** an existing recipe
**When** any field is edited and saved
**Then** the change persists and `updated_at` advances (FR-4).

**Given** an edit that changes only fields other than the body
**When** it is saved
**Then** the stored body is byte-identical to what it was before (FR-5, NFR-3).

**Given** a recipe the user wants gone
**When** delete is chosen
**Then** a confirmation is required first, and on confirming the recipe disappears from the
collection in one action; there is no undo and no trash (FR-4).

**Given** a request for an unknown recipe id
**When** it reaches the API
**Then** it returns 404 with `{ detail }`, translated from the service's `FileNotFoundError`
(NFR-2).

## Epic 2: Structure & finding what to cook

A user can add optional structure to any recipe and then use it — searching the full text, filtering
by meal type and tag, and keeping the recipes they actually cook one tap away.

### Story 2.1: Optional meal type, time, servings and source

As a cook,
I want to record a few facts about a recipe when I feel like it,
so that I can later narrow my collection down to what fits tonight.

**Acceptance Criteria:**

**Given** a recipe
**When** it is edited
**Then** meal type (breakfast / dinner / dessert — six until 2026-09-23), total time in minutes,
servings and source can each be set and cleared independently, and clearing one leaves the others
untouched (FR-6).

**Given** a non-numeric or non-positive time or servings
**When** it is entered
**Then** it is rejected at the field rather than at save, and the API rejects it with `{ detail }`
if it arrives anyway (FR-6).

**Given** a recipe with none of these fields set
**When** it is displayed in the list or opened
**Then** the missing fields are absent from the layout entirely — no "unknown" placeholders, no gaps
implying the recipe is unfinished (NFR-8).

### Story 2.2: Free tags with suggestions

As a cook,
I want to label recipes with my own words,
so that I can group them the way I actually think about them.

**Acceptance Criteria:**

**Given** the tag input
**When** the user types
**Then** tags already present elsewhere in their collection are offered before a new one is created
(FR-9).

**Given** tags entered as `Chicken` and `chicken`
**When** they are stored
**Then** they resolve to a single normalised tag; the two never coexist as separate tags (FR-9).

**Given** a value that matches nothing existing
**When** the user commits it
**Then** it is accepted as a new tag (FR-9).

### Story 2.3: Two-level ingredient tags — SUPERSEDED 2026-09-15

> **Superseded by Story 2.8** (ingredients as amount + unit + name). Shipped as
> written, then replaced. Kept for the record; do not build from it.


As a cook,
I want to record what a recipe uses as a broad category plus the specific thing,
so that the app can match my pantry without losing the detail I care about.

**Acceptance Criteria:**

**Given** the recipe edit screen
**When** it renders
**Then** Tags and Ingredients are two separate inputs; a value typed into one never lands in the
other's namespace, and each suggests only from its own namespace (FR-8).

**Given** an ingredient being added
**When** it is stored
**Then** it carries a category from the shared vocabulary, optionally with a free-text specific —
`cheese` alone, or `cheese` → `feta` (FR-7).

**Given** a category that does not yet exist in the vocabulary
**When** the user introduces it
**Then** doing so is a visibly distinct act from picking an existing category, so the vocabulary is
not extended by accident (FR-9, FR-22).

**Given** a recipe tagged `cheese` → `feta`
**When** it is displayed
**Then** the view shows `feta`, and shows the bare category only where no specific exists — never
both stacked as two ingredients (FR-7).

### Story 2.4: Search the full text

As a cook,
I want to search for a word I remember from a recipe,
so that I can find it again without remembering what I called it.

**Acceptance Criteria:**

**Given** a recipe whose body mentions paprika but carries no paprika tag
**When** the user searches `paprika`
**Then** that recipe is returned (FR-11).

**Given** any search term
**When** it is matched
**Then** matching is case-insensitive and matches partial words, across both names and bodies
(FR-11).

**Given** active filters
**When** a search is entered
**Then** the two combine — the search narrows within the filtered set rather than replacing it
(FR-11).

**Given** a collection of a few hundred recipes
**When** the user types
**Then** results update without perceptible delay (NFR-6).

### Story 2.5: Filter by meal type, tag and pantry ingredients — PARTLY SUPERSEDED 2026-09-15

> **The pantry-ingredient half was removed** with the category vocabulary (Story
> 2.8). Meal type and tag filtering, the combining rule, the visible count and
> the zero-result state all still stand.


As a cook deciding what to make,
I want to narrow my collection by what kind of meal it is and what I have in the house,
so that I can pick something without reading every recipe.

**Acceptance Criteria:**

~~**Given** two ingredient categories selected / **When** the list is filtered / **Then** only
recipes carrying both categories are shown~~ — **void 2026-09-15**, no pantry filter.

~~**Given** a recipe tagged `cheese` → `feta` / **When** the user selects the `cheese` category /
**Then** the recipe matches~~ — **void 2026-09-15**, no categories.

**Given** filters of different kinds
**When** several are active
**Then** meal type and tags combine, each is individually clearable, and the number of
matching recipes is visible (FR-12).

**Given** a filter combination that matches nothing
**When** it is applied
**Then** the empty state offers to clear the filters (FR-12).

~~**Given** any pantry filter result / **Then** no wording implies the user can fully cook the
listed recipes~~ — **void 2026-09-15**, no pantry filter. The counter-metric it guarded is gone
with it.

### Story 2.6: Favourites

As a cook,
I want the recipes I actually cook kept at the top,
so that my weeknight staples are always one tap away.

**Acceptance Criteria:**

**Given** a recipe in the collection list
**When** its favourite toggle is tapped
**Then** the flag persists, and the action neither navigates away nor loses scroll position
(FR-13).

**Given** a collection containing favourites
**When** it is listed
**Then** favourites sort above everything else, with creation-date descending within each group —
completing the ordering left partial by Story 1.4 (FR-10, FR-13).

**Given** an active filter or search
**When** results are shown
**Then** favourites among them remain visibly marked (FR-13).

**Given** the collection screen
**When** the user wants only favourites
**Then** a favourites-only view is reachable in one interaction (FR-13).

### Story 2.7: A star rating alongside favourites

*Added 2026-09-15, after Epic 2 shipped. Covered by PRD FR-21, written after the
fact from the built behaviour.*

A recipe can carry a 1–5 star rating, independent of the favourite flag in both
directions. The rating took the star, so the favourite moved to a heart. Rating
stays out of the collection order. Full acceptance criteria live in
`docs/stories/kitchencraft/for-review/2.7.star-rating-alongside-favourites.story.md`.

### Story 2.8: Ingredients become amount + unit + name

*Added 2026-09-15. Replaces Story 2.3 and the pantry half of Story 2.5.*

An ingredient becomes an optional amount, an optional unit and a required
free-text name, displayed one per line with the quantities in their own column.
The schema goes to v2 and existing recipes migrate on read. The shared category
vocabulary, the pantry filter and the coining ceremony are removed. Full
acceptance criteria live in
`docs/stories/kitchencraft/for-review/2.8.ingredients-as-amount-unit-and-name.story.md`.

## Epic 3: The shopping list

A user can push a recipe's ingredients onto a single running list — choosing which ones, with
staples excluded by default — and carry that list to the shop, ticking things off as they go.

### Story 3.1: One shopping list, one tap away

As a cook,
I want a single shopping list I can open from anywhere in the app,
so that I can add to it or check it without losing what I was doing.

**Acceptance Criteria:**

**Given** any KitchenCraft screen
**When** it renders
**Then** a shopping list button is present in the top-right corner (FR-14).

**Given** the user is mid-scroll on the collection or reading a recipe
**When** the shopping list is opened and then closed
**Then** it opens as a modal over the current screen and closing returns them exactly where they
were, scroll position intact (FR-14).

**Given** the shopping list
**When** the user types an item by hand and commits it
**Then** it is added to the list and persists across a refresh, a new session, and another device
(FR-15).

**Given** a user with an empty list
**When** they open it
**Then** it says so plainly and offers hand-entry rather than showing a bare panel (FR-15).

**Given** the app
**When** a user looks for list management
**Then** there is exactly one list for the household and no surface for creating, naming or
deleting lists (FR-14). *(One per user until 2026-09-23.)*

**Given** the persistence layer
**When** the list is stored
**Then** it is written through the repository's atomic path under its own lock, like every other
document, and requires a signed-in caller (FR-2, NFR-1, NFR-5). *(Revised 2026-09-23: it was
scoped to the authenticated username.)*

### Story 3.2: Tick things off in the shop

As a cook at the shop,
I want to cross off what I have already picked up,
so that I can see at a glance what is left.

**Acceptance Criteria:**

**Given** an item on the list
**When** its row is tapped
**Then** it is struck through and stays in place — not removed, not reordered (FR-15).

**Given** a ticked item
**When** it is tapped again
**Then** it returns to unticked (FR-15).

**Given** any item
**When** the user deletes it
**Then** it is removed individually, whether ticked or not (FR-15).

**Given** a list with items
**When** clear is chosen
**Then** a confirmation is required, and on confirming the list is emptied (FR-15).

**Given** a phone held one-handed with a basket in the other
**When** the list is used
**Then** the tap target for ticking is the whole row and is sized for that grip (NFR-4).

### Story 3.3: Send a recipe's ingredients to the list

As a cook planning the week,
I want to push a recipe's ingredients onto my shopping list,
so that I can buy what I need without copying it out by hand.

**Acceptance Criteria:**

**Given** a recipe with ingredients
**When** "Add to shopping list" is chosen
**Then** a modal lists one checkbox per ingredient, reading as it reads on the recipe — amount, unit
and name (FR-16). *(Revised 2026-09-15.)*

**Given** that modal
**When** it opens
**Then** every ingredient is checked except salt and black pepper, which start unchecked and can be
checked by the user (FR-16).

**Given** the modal with nothing checked
**When** it is confirmed
**Then** nothing is added and the modal simply closes (FR-16).

**Given** a confirmed add
**When** the items land on the list
**Then** they arrive as ordinary editable text, so `chicken thighs` can be amended to
`2 packs chicken thighs` (FR-16).

**Given** a recipe with no ingredients
**When** "Add to shopping list" is chosen
**Then** it explains there is nothing structured to send yet rather than opening an empty modal
(FR-16).

**Given** a successful add
**When** it completes
**Then** the user is told how many items were added and offered a way through to the shopping list,
is equally free to stay on the recipe, and is never navigated automatically (FR-18).

### Story 3.4: Adding to a list that already has items

As a cook,
I want to decide whether new ingredients join my existing list or replace it,
so that I never lose a list I was still shopping from.

**Acceptance Criteria:**

**Given** an empty shopping list
**When** ingredients are added from a recipe
**Then** they are added silently with no prompt (FR-17).

**Given** a list that already holds items
**When** ingredients are added from a recipe
**Then** the user is asked whether to add to the list or overwrite it (FR-17).

**Given** the user chooses add
**When** the items are merged
**Then** items already present are not duplicated, matched case-insensitively (FR-17).

**Given** the user chooses overwrite
**When** they confirm the second, explicit confirmation
**Then** the previous contents — including ticked items — are discarded and replaced (FR-17).

**Given** either prompt
**When** the user cancels
**Then** the list is left exactly as it was (FR-17).

## Epic 4: Offline enrichment

The builder can run an LLM-assisted pass over stored recipe bodies from Claude Code, filling in the
structure users never entered by hand — safely, against live data, without touching bodies, without
overwriting deliberate input, and without fragmenting the ingredient vocabulary.

### Story 4.1: Record provenance for structured fields

As the builder,
I want to know which structured values a user set by hand and which a machine inferred,
so that an enrichment pass can fill gaps without ever overwriting a deliberate choice.

**Acceptance Criteria:**

**Given** the two open questions carried from the PRD
**When** this story starts
**Then** the chosen provenance mechanism and the chosen means of reaching the data volume from the
host are both recorded in writing before implementation begins — these are the decisions Epic 4
depends on (PRD §8).

**Given** a structured field or tag
**When** it is stored
**Then** its origin (user-set or machine-set) is recorded alongside it, and the record survives a
read-write round trip (FR-21).

**Given** a user editing any structured field
**When** they save
**Then** that field is marked user-set, whatever it was before (FR-21).

**Given** recipes that exist before this story ships
**When** the migration runs
**Then** their existing values are marked user-set — the safe default, since the only writer so far
has been the user (FR-21, NFR-3).

### Story 4.2: An enrichment script that reads safely and changes nothing

As the builder,
I want a script that reads the live collection and reports what it would change,
so that I can trust it before I ever let it write.

**Acceptance Criteria:**

**Given** the script in `backend/scripts/`
**When** it accesses data
**Then** it goes through the repository layer — its atomic write path and its per-file locking —
rather than reading or rewriting JSON itself (FR-19, NFR-1).

**Given** both environments
**When** the script is run
**Then** reaching the data is documented for dev (`DATA_DIR`) and for production (the container
volume), with the runbook checked in beside the script (FR-19).

**Given** a run with no explicit write flag
**When** it completes
**Then** it has written nothing and has reported what it would have changed (FR-19).

**Given** a document whose `schema_version` is unknown or whose contents fail validation
**When** the script runs
**Then** it exits non-zero, having changed nothing, and says what it found (FR-19, NFR-3).

**Given** a pass running while the app is serving traffic
**When** it reads a user's document
**Then** it takes the same lock the app takes, so neither a torn read nor a lost concurrent edit is
possible (FR-19, NFR-1).

### Story 4.3: Apply bulk structured updates safely

As the builder,
I want to apply inferred structure to many recipes in one run,
so that a collection of pasted text becomes filterable without anyone doing data entry.

**Acceptance Criteria:**

**Given** a batch of updates addressed by recipe id
**When** it is applied
**Then** the named structured fields and tags are updated and every body is byte-identical
afterwards (FR-20, FR-5, NFR-3).

**Given** a recipe the user has renamed since the batch was generated
**When** the batch is applied
**Then** it still lands correctly, because recipes are addressed by stable id and never by name
(FR-20).

**Given** a batch entry naming an unknown id
**When** it is applied
**Then** that entry fails and is reported, and the rest of the batch still applies (FR-20).

**Given** any interruption mid-batch
**When** the run stops
**Then** every individual recipe is left in a valid state — none half-written (FR-20, NFR-1).

**Given** an identical batch
**When** it is run a second time
**Then** it is a no-op: no duplicated tags, no churned timestamps (FR-20).

**Given** a field or tag marked user-set
**When** the batch would change it
**Then** it is left alone and the skip is reported (FR-21).

### Story 4.4: Keep the ingredient wording from drifting

> **Re-cut 2026-09-15.** This story was *"Keep the ingredient vocabulary from
> drifting"* and guarded a shared category vocabulary that no longer exists
> (Story 2.8). The duty survives against a different shape of data: there is
> still wording to keep consistent, it is just free text now rather than a
> controlled set.

As the builder,
I want each pass to reuse the ingredient wording that already exists in the collection,
so that the ingredient wording does not quietly fragment as the collection grows.

**Acceptance Criteria:**

**Given** the ingredient wording already present in the collection
**When** a pass writes ingredients
**Then** it reuses that wording where it fits, introducing new wording only where nothing existing
does (FR-22).

**Given** two passes over similar recipes
**When** both have run
**Then** the collection does not contain near-synonyms such as `chicken` and `chicken meat`, nor
casing variants such as `Feta` and `feta`, for the same thing (FR-22).

**Given** a completed pass
**When** it reports
**Then** it lists every newly introduced ingredient with the number of recipes that received it, so
drift is visible immediately rather than discovered months later (FR-22).

**Given** an ingredient a pass writes
**When** it carries a quantity
**Then** the amount and unit go in their own fields rather than into the ingredient name, so
`2 tsp smoked paprika` is not stored as one opaque string.

## Amendments

### 2026-09-15 — The ingredient model changed shape

Story 2.8 replaced the two-level ingredient tag with **amount + unit + free-text
name**. The category was load-bearing for more than itself, so this document
changed in eleven places:

| Changed | Effect |
|---|---|
| FR-7 | Rewritten to the new shape |
| FR-9 | The coining "visibly distinct act" clause voided; casing convergence kept |
| FR-12 | Pantry filtering removed; meal type and tag kept |
| FR-22 | Reuse the *wording* in use, rather than a controlled vocabulary |
| UX-DR5 | `new-category-row` dropped; 12 components → 11 |
| UX-DR6 | Tags is the typeahead's only caller; ingredients use a datalist |
| UX-DR7 | Void — no coining ceremony |
| UX-DR11 | Void — no pantry filter to imply completeness |
| UX-DR19 | Seeded vocabulary of categories → seeded list of units |
| Architecture Gap 2 | Closed as moot |
| Stories 2.3, 2.5, 4.4 | Superseded, partly superseded, and re-cut respectively |

**Stories are marked, not deleted.** 2.3 and 2.5 shipped as written and were then
replaced; their text stays as the record of what was built, with a banner saying
so. Story 4.4's duty survived the change and was re-cut rather than dropped — the
wording still needs keeping consistent, it is just free text now.

### 2026-09-15 — Two stories added after their epic shipped

Stories 2.7 (star rating) and 2.8 were both built before this document described
them, and PRD FR-21 was written after the fact from the built behaviour. Recorded
plainly because the direction of travel matters: the code led and the specs
followed, which is the opposite of how the rest of this document was produced.

### 2026-09-23 — Meal types cut to the three dividers

FR-6's meal types went from six to **breakfast, dinner and dessert**, the
folder dividers the Notebook retheme introduced (commit `4c5867a`, schema v3).
`lunch` migrates to `dinner` and keeps its provenance mark; `snack` and `other`
are cleared. This closes the trade-off Story 2.5 recorded, where three meal
types could be set but had no divider to filter on. Now they can't be set at all.

| Changed | Effect |
|---|---|
| FR-6 | Three meal types, matching the dividers |
| Story 2.1 | AC 1's list revised; the story is marked, not rewritten |
| Story 2.5 | The "dividers cost three meal types" trade-off is resolved |

### 2026-09-23 — One collection and one shopping list for the household

KitchenCraft stopped keeping data per user (commit `34b23f4`). There is one
`kitchencraft/recipes.json` and one `kitchencraft/shopping.json`. Every
signed-in user reads and writes both, and the favourite and the rating are one
value per recipe. The legacy per-user files are merged on first read, and a
recipe whose id clashes with one already merged gets its owner's name appended
to the id rather than being dropped. The enrichment script no longer takes
`--user`.

| Changed | Effect |
|---|---|
| FR-2 | Login still required; the user no longer selects the data |
| FR-14 | One list for the household, not one per user |
| NFR-1, NFR-5 | Two shared files; every signed-in user reaches them |
| Story 1.2 | Partly superseded: the path-safety AC is void |
| Story 1.4 | The isolation AC is reversed: two users see the same collection |
| Story 3.1 | One list for the household; stored in a shared file, not per user |
