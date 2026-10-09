---
title: "KitchenCraft — Experience Spec (EXPERIENCE.md)"
status: final
created: 2026-09-10
updated: 2026-09-10
sources:
  - ../../prds/prd-kitchencraft-2026-09-09/prd.md
  - ../../epics-kitchencraft.md
  - .decision-log.md
  - ./DESIGN.md
design_ref: ./DESIGN.md
inherits_ui_system: "Vue 3 + Quasar v2 (Material-based)"
---

# KitchenCraft — Experience Spine

> The how-it-works contract. `DESIGN.md` is the peer document and owns the visual
> identity; tokens are referenced here by name as `{token}` and hex values are
> never restated. **Both spines win over any mock or import.** No mocks,
> wireframes or imports exist for this workspace.

**FR citations name their document.** The PRD and `epics-kitchencraft.md` use two
different, mutually incompatible FR numbering schemes (`.decision-log.md`
Entry 8). Every id below is written as **PRD FR-n** or **epics FR-n**.

## Foundation

- **What it is.** A private recipe collection, one per dock account, that "never
  punishes you for being in a hurry". A recipe is **a name and a block of text**,
  and that is complete and first-class forever. Structure is optional and
  additive; the payoff for structure is finding things again. *(The pantry filter
  was removed 2026-09-15; see Amendments.)*
- **UI system.** Vue 3 + Quasar v2, inherited from the dock. `DESIGN.md` defines
  KitchenCraft's own tokens over that chassis — it is the dock's **first
  light-ground app** — and keeps Carbon's spacing grid, 44px touch minimum and
  no-shadow rule.
- **Lives inside the shell.** One card on the dock landing page, one route
  (`/kitchencraft`), platform conventions for identity, persistence and the HTTP
  boundary. Registration is epics FR-1 / Story 1.1.
- **Two form factors as peers**, phone and wide — see § Responsive & Platform,
  which also flags that this **exceeds** PRD NFR-4.
- **Epic 4 contributes no UI at all.** Enrichment is a `backend/scripts/` script
  run from Claude Code; there is no export endpoint and no HTTP surface (PRD §4.6).
  Its only trace in the interface is the provenance mark in § Vocabulary and
  provenance. **Do not invent screens for it.**
- **Not in v1**, so no surface exists for any of it: images, in-app AI parsing,
  URL scraping, servings scaling, meal planning, nutrition, sharing or
  collaboration, rich-text or structured recipe editing, alternative sort orders,
  trash/restore, tag rename and merge, printing, a ratings *history*, a
  configurable staples list, or a second shopping list. *(Revised 2026-09-15: a
  current 1–5 star **rating** shipped in Story 2.7 and is in v1; only the history
  of past ratings stays out. See PRD FR-21.)*

## Information Architecture

> Visual reference for the **Collection**, **Search**, **Filter bar** and
> rows below: [`mockups/key-collection.html`](mockups/key-collection.html). *(Its
> pantry-filter row no longer reflects the app.)*
> Every other surface in this table is built from these tables alone.

One route. Everything else is a screen state or a modal over the current screen —
which is what lets the shopping list open and close without losing anyone's place.

| Surface | Reached from | Purpose | Realises |
|---|---|---|---|
| **Dock card** | Dock landing page | Label "KitchenCraft", icon `menu_book`, route `/kitchencraft` | epics FR-1 |
| **Collection** | Dock card; the app's home | Scannable list of every recipe, newest first, favourites above everything | PRD FR-8 |
| **Search** | Field at the head of the collection, always present | One box over names **and** bodies | PRD FR-9 |
| **Filter bar** | Under the search field on the collection | Meal type · tag · favourites-only. Each control individually clearable; result count always visible | PRD FR-10 |
| **Favourites-only view** | One tap on the filter bar's favourites control | The collection, favourites only | PRD FR-11 |
| **Capture screen** | Primary action on the collection | Name + body. Opens focused on the body | PRD FR-1, NFR-7 |
| **Recipe view** | Tapping a recipe row | The mid-cook reading surface. The body is the hero | PRD FR-3, NFR-4 |
| **Edit screen** | Recipe view → Edit | Every field, including the two separate `Tags` and `Ingredients` inputs | PRD FR-2, FR-4, FR-5, FR-6 |
| **Typeahead suggestions** | Typing in `Tags` or in `Ingredients` | Existing values from **that input's own namespace**, offered before creating | PRD FR-7 |

| **Delete confirmation** | Recipe view → Delete | The only safety net; there is no undo and no trash | PRD FR-2 |
| **Shopping list** | Top-right button on **every** screen | The one list. Modal over the current screen | PRD FR-12, FR-13 |
| **Hand-entry row** | Inside the shopping list, always present | Add an item by typing | PRD FR-13 |
| **Clear-list confirmation** | Shopping list → Clear | Empties the list | PRD FR-13 |
| **Add to shopping list** | Recipe view → Add to shopping list | One checkbox per ingredient tag | PRD FR-14 |
| **"Nothing to send yet"** | The add modal, when the recipe has no ingredient tags | Explains, and routes to Edit | PRD FR-14 |
| **Add-vs-overwrite prompt** | Confirming an add while the list is non-empty | Add · Replace · Cancel | PRD FR-15 |
| **Overwrite confirmation** | Choosing Replace | A second, explicit confirmation | PRD FR-15 |
| **Post-add confirmation** | After any successful add | "N items added", with a way through to the list | PRD FR-16 |

**20 surfaces.** The shopping-list button sits top-right on every one of them, the
modals included.

Modals stack one level deep. The single exception is the overwrite confirmation,
which replaces the add-vs-overwrite prompt in place rather than layering on it.
*(2026-09-15: `DESIGN.md` said the opposite — "modals never stack". This document
owns behaviour and wins; `DESIGN.md` is corrected.)*

## Voice and Tone

**Plain English throughout.** No fantasy or alchemical register: the folk quality
lives in `DESIGN.md`'s palette and serif and nowhere in the words. `[ASSUMPTION]`
— the user asked for the app to *look* folk; this spine reads that as visual only.

Labels are literal: `Ingredients`, `Tags`, `Shopping list`. Meal types are
verbatim from PRD FR-4 and are never re-worded, re-cased or re-ordered:
**breakfast · lunch · dinner · snack · dessert · other**.

| Do | Don't |
|---|---|
| "No recipes yet." | "Your cookbook awaits!" |
| "Give it a name." | "Validation error: name is required" |
| "6 of 42 recipes call for chicken + onion" | "6 recipes you can make" |
| "6 items added." | "Successfully added 6 items ✓" |
| "This can't be undone — there's no trash." | "Are you sure?" |
| "Minutes only." | "Please enter a valid number" |
| Short, complete sentences. Counts as digits. | Exclamation marks, encouragement, emoji, streaks, nagging to fill in fields. |

The app never asks the user to complete a recipe. No copy anywhere implies a
recipe is unfinished, partial, missing anything, or would be better with more
structure.

## Component Patterns

Behavioural. Visual specs live in `DESIGN.md § Components`.

| Component | Use | Behavioural rules |
|---|---|---|
| **Field** | Capture, edit, search, hand-entry | Label above, never a placeholder standing in for a label. Validation shows **at the field**, on blur or on keystroke, never held back to save time. |
| **Primary button** | One per surface | The action you came for: Save on capture, Add on the add modal, Edit on the recipe view. |
| **Quiet button** | Cancel, Close, Clear filters | Never carries the destructive verb. |
| **Danger button** | Delete, Replace, Clear list | Always inside a confirmation, never on the surface itself. |
| **Chip** | Tags, ingredients, meal type, filters | A chip that is a **control** takes `{colors.moss}` when selected. A chip merely **displaying** a value in the recipe view is never moss — it is not pressable. Chip rows **wrap** to as many lines as they need; they never truncate, scroll sideways or collapse behind a "+3 more". `[ASSUMPTION]` — PRD sets no cap on tag count. |
| **Unconfirmed chip** | Recipe view, edit screen | Enrichment-written and untouched. Drops to an ordinary chip the moment the user edits or explicitly confirms the value. |
| **Recipe row** | Collection, favourites-only | Whole row opens the recipe. The favourites glyph is a separate target inside the row: tapping it toggles the favourite **without opening the recipe and without moving the scroll position** (PRD FR-11). Shows the name always; meal type and time **only when present**. |
| **Typeahead** | `Tags` | Suggests from **its own namespace only** — a tag never appears under Ingredients or vice versa (PRD FR-6). Case-insensitive match on any part of the value. Six suggestions before anything is typed, then the cap lifts. *(Revised 2026-09-15: Tags is now the only typeahead. The ingredient and unit fields use a native datalist, which offers a list and accepts anything typed — what free text needs.)* |
| **Ingredient entry** | Edit screen | Three fields in the order they are spoken: amount, unit, ingredient. Only the ingredient is required. Units suggest from a shipped list; ingredients suggest from what this cook has typed before. *(Added 2026-09-15.)* |
| **Shopping-list row** | Shopping list | The **whole row** is the tick target, at `{spacing.touch-min}` or more, sized for one thumb on a phone held in a hand that is also holding a basket. Tap toggles ticked. Delete is a separate trailing target. *(In-place text editing is specified here but has no story: neither 3.2's nor 3.3's acceptance criteria ask for it. Unbuilt — see Open Questions.)* |
| **Ingredient row** | Recipe view, edit screen | One ingredient per line, in entry order. Amount and unit sit in a right-aligned column so quantities line up down the list; the name takes the rest. An ingredient with neither is just its name. *(Added 2026-09-15.)* |
| **Modal** | Shopping list, add, every confirmation | Opens over the current screen; the screen behind keeps its scroll position and its filter state, and **closing returns the user exactly where they were**. Escape and the backdrop close a modal; neither closes a confirmation, which requires an explicit choice. |
| **Result count** | Filter bar | Always rendered when any filter or search is active, in `{typography.meta}`. Never hidden, never a badge. |

## State Patterns

Every surface, every state that applies to it.

> [`mockups/key-collection.html`](mockups/key-collection.html) renders three of these
> states — Collection/Populated, Collection/Empty and Filter bar/Zero results — plus
> Search/Active and Favourites marking. **This spine wins on conflict.**

| Surface | State | Treatment |
|---|---|---|
| **Dock card** | Default | Label + `menu_book`, generic `AppCard`. No count, no badge, no preview. |
| **Collection** | Cold load | The rules and row skeletons at `{colors.beige-raise}`. No full-page spinner. |
| **Collection** | Empty | *"No recipes yet."* in `{typography.title}`, one line beneath — *"Paste a name and the text and it's saved. Nothing else is required."* — and the capture button. Type, rule and spacing carry it; **never a bare panel** (PRD FR-8). |
| **Collection** | Populated | Newest first. **Favourites sorted above everything**, creation-date descending within each group, each visibly marked with the ink glyph. Rows show the name, plus meal type and time when present. |
| **Collection** | Loaded, filtering | Filtering and search run client-side over the loaded collection. **No per-keystroke spinner, no loading state, no debounce message** (PRD NFR-6). |
| **Search** | Empty query | Field present, collection unfiltered by it. |
| **Search** | Active | Case-insensitive, partial-word, over names **and** bodies. **Combines with the active filters rather than replacing them** (PRD FR-9) — clearing the search leaves every filter as it was, and vice versa. |
| **Filter bar** | None active | Controls visible, no result count. |
| **Filter bar** | Active | AND semantics across kinds and within a kind. Each control clears on its own; a separate quiet **Clear filters** clears all. Count reads *"12 of 42 recipes"*. |
| **Filter bar** | Zero results | *"Nothing matches all of these."* Then **each active filter with its own count**, one per line: *"chickpeas — 7 on its own"*, *"dinner — 22 on its own"*. Each line clears that one filter; a quiet **Clear filters** clears all. It explains why nothing matched instead of only offering the exit. |

| **Favourites-only** | Active | The favourites control takes `{colors.moss}`; the count reads *"7 favourites"*. |
| **Favourites-only** | Empty | *"No favourites yet."* One line: *"Tap the star on any recipe."* No button — the action is on the rows behind. |
| **Capture** | On open | **Focus is in the body textarea**, keyboard up on phone. Paste, then Save: clipboard to saved in **under 10 seconds and no more than three interactions** (PRD NFR-7). |
| **Capture** | Empty name on save | Save rejected. *"Give it a name."* at the name field. The error **names which field**, and the body is never cleared. |
| **Capture** | Empty body on save | Save rejected. *"Paste or type the recipe text."* at the body field. |
| **Capture** | Both empty | Both messages, at both fields. |
| **Capture** | Saving | Button disabled for the duration. No overlay — this is the surface's whole reason to be fast. |
| **Capture** | Save failed | One line above the button: *"Couldn't save — nothing has been lost, try again."* Both fields retain everything. |
| **Recipe view** | Default | Name in `{typography.title}`; body in `{typography.recipe}` inside `{spacing.measure}`, line breaks and blank lines exactly as pasted. Structure quiet, above and below, never framing the body. |
| **Recipe view** | Fields absent | **Rendered absent.** See § The absence rule. |
| **Recipe view** | Ingredient with an amount or unit | Amount and unit in their own right-aligned column, the name beside them. *(Revised 2026-09-15.)* |
| **Recipe view** | Ingredient with neither | Just the name. No gap, no dash, no placeholder. |
| **Recipe view** | Unconfirmed value | `{components.chip-unconfirmed}`. |
| **Edit** | Default | Every field editable. `Tags` and `Ingredients` are **two separate inputs** and are never merged (PRD FR-6). |
| **Edit** | Non-numeric time or servings | Rejected **at the field, not at save** (PRD FR-4): *"Minutes only."* / *"A whole number of servings."* Zero and negatives are rejected the same way; empty is always valid. |
| **Edit** | Casing collision | `Chicken` typed where `chicken` exists resolves to the existing normalised casing silently. The two never coexist (PRD FR-7). |
| **Typeahead** | Field focused, nothing typed | The input's full namespace, most-used first. `[ASSUMPTION]` — the PRD does not order suggestions. |
| **Typeahead** | Typing, matches found | Matching existing values. No spinner: the namespace is already loaded. |
| **Typeahead** | Typing, no matches | The list is empty and the typed value commits on Enter — a free tag needs no ceremony. |
| **Ingredient entry** | Amount and unit left blank | Valid. The name alone is a complete ingredient (§ The absence rule). |
| **Hand-entry row** | Idle | Present at the foot of the list, labelled *Add an item*, always visible — including on an empty list. |
| **Hand-entry row** | Submitted blank | Silent no-op. No error, nothing added. |
| **Hand-entry row** | Submitted | Appends as ordinary editable text, clears, and **keeps focus** so a run of items can be typed without re-tapping. |
| **Edit** | Unsaved changes on back | Kept. `[ASSUMPTION]` — no discard prompt; the PRD says nothing, and a prompt is friction on a surface whose whole brief is the absence of friction. |
| **Delete confirmation** | Open | *"Delete {name}? This can't be undone — there's no trash."* Danger **Delete**, quiet **Cancel**. On delete the recipe leaves the collection, the favourites and every filter result at once. |
| **Shopping list** | Cold load | Rows skeleton inside the modal. The modal opens immediately; it never waits on the fetch. |
| **Shopping list** | Empty | *"The list is empty."* and the hand-entry row directly beneath, focused. **Not a bare panel** (PRD FR-13). |
| **Shopping list** | Populated | Items in the order added. Server-persisted, so it survives a new session, another device and **a refresh mid-shop**. |
| **Shopping list** | Item ticked | Struck through in `{colors.ink}` with a filled checkbox, and it **stays visible in place** — not removed, not reordered, not moved to a "done" group (PRD FR-13). Untick restores it. |
| **Shopping list** | Write failed | The row reverts and one line appears at the head of the modal: *"Couldn't save that — check your connection."* No toast. |
| **Clear-list confirmation** | Open | *"Clear all {n} items? This can't be undone."* Danger **Clear**, quiet **Cancel**. |
| **Add to shopping list** | Recipe has ingredients | One checkbox per ingredient, reading as it reads on the recipe — amount, unit and name. **All checked except the staples — salt and black pepper — which start unchecked** and can be checked (PRD FR-14). The staple match is on the full text, exact and case-insensitive, so `red peppers` and `salted butter` stay checked. *(Revised 2026-09-15.)* |
| **Add to shopping list** | Nothing checked, confirmed | **Silent no-op.** The modal closes; no message, no post-add confirmation, no change to the list. |
| **Add to shopping list** | Recipe has no ingredient tags | *"Nothing to send yet — this recipe has no ingredients listed."* One line: *"Add some on the edit screen and they can go to the list."* Quiet **Edit recipe**. No empty checkbox list. |
| **Add-vs-overwrite** | List already non-empty | *"The list already has {n} items."* Primary **Add to the list**, danger **Replace the list**, quiet **Cancel**. |
| **Add-vs-overwrite** | List empty | Never shown. The add is silent (PRD FR-15). |
| **Add** | Adding | Appends. **Case-insensitive duplicates are not added** — `Chicken` against an existing `chicken` is skipped, and the skipped items are not counted in the post-add total. |
| **Overwrite confirmation** | Open | *"Replace all {n} items, including the {m} you've ticked off? This can't be undone."* Danger **Replace**, quiet **Cancel**. The `{m}` clause is omitted when nothing is ticked. |
| **Overwrite** | Confirmed | Previous contents are discarded **including ticked items**. |
| **Add-vs-overwrite / Overwrite** | Cancelled | The list is **exactly as it was** — same items, same order, same ticks. |
| **Post-add** | After any successful add | *"{n} items added."* Quiet **Open the list**, quiet **Done**. **The user is never navigated away automatically** (PRD FR-16); the recipe view stays behind it, scrolled where it was. |
| **Every surface** | Offline | No offline mode. A failed write reverts optimistically and says so in one line on the surface. Reads already loaded stay readable. |
| **Every modal** | Closing | Returns to the exact surface, scroll position and filter state it opened over (PRD FR-12). |

## Interaction Primitives

- **Tap to act.** One tap opens a recipe, one tap ticks a shopping-list item, one
  tap toggles a favourite.
- **The shopping-list button is top-right on every screen**, modals included, and
  always opens the same one list. There is no list-management surface anywhere: no
  create, no name, no delete, no switch (PRD FR-12).
- **Filters are additive and independently clearable.** Nothing clears anything
  else. Search does not clear filters; filters do not clear search.
- Escape and the backdrop close the shopping list and the add modal. **Neither
  closes a confirmation** — a confirmation takes an explicit choice.
- **Banned:** long-press for anything (it is reserved for system text selection),
  swipe-to-delete, swipe-to-tick, drag-to-reorder, pull-to-refresh, infinite
  scroll, toasts, badges, and any animation on open.
- **No undo, anywhere.** Confirmation before a destructive act is the only safety
  net, by design (PRD FR-2).

## The absence rule

PRD NFR-8 and §11, and the counter-metric "capture friction reintroduced by field
creep", make this the single most load-bearing behaviour in the app.

**An empty structured field renders as absent.** Not as a gap, not as a
placeholder, not as a dash, not as "unknown", not as a labelled empty slot, not as
a greyed chip, not as a progress indicator of any kind.

- A recipe with a name and a body shows a name and a body. Nothing else appears.
- The reading view has **no fixed structural frame**: the meal-type line exists
  only if there is a meal type, the `Ingredients` label exists only if there are
  ingredients.
- A row in the collection with no meal type and no time is a **one-line row**, not
  a two-line row with an empty second line.
- Nothing on any surface counts how much structure a recipe has, or compares it to
  another recipe, or invites the user to add more.

The edit screen is the one exception, and only there: it shows every field,
because that is the surface for setting them.

## The verbatim body contract

PRD FR-3, and Story 1.5. **The body is never reformatted or re-flowed.**

- Mixed bullet characters (`-`, `*`, `•`, `–`) stay exactly as pasted. No
  normalisation, no list detection, no markdown rendering.
- Inconsistent casing stays. Stray pasted site boilerplate stays.
- Line breaks and blank lines are preserved exactly; the rendered body reproduces
  the paste character for character.
- On save, **only leading and trailing whitespace is trimmed** — internal
  whitespace, including blank lines, is untouched (PRD FR-1).
- The body is text. There is no rich-text editing, no ingredient rows, no step
  objects, and no "parse this for me" button.

## ~~The pantry filter never implies completeness~~

**Void 2026-09-15.** There is no pantry filter (Story 2.8). The section is
removed rather than kept as guidance, because the copy rules it carried —
"call for" not "you can make", "Ingredients" not "What's in my fridge" — guarded
a claim the app no longer makes at all.

The general principle it expressed is worth keeping loose: **no surface shows a
match percentage, a completeness ratio, a "you have 2 of 9 ingredients" bar, a
tick, or a sort by how close a recipe is to cookable.** Nothing in the app
claims to know whether you can cook something.

## Vocabulary and provenance

Both were open PRD questions, closed in `.decision-log.md` Entry 12.

**The unit list ships seeded.** *(Revised 2026-09-15 — this said "the ingredient
category vocabulary ships seeded". There is no category vocabulary.)* A starter
list of common units is shipped with the app, so the unit field does useful work
against the very first recipe. The **ingredient** field has a genuine first-run
empty state: it suggests from what this cook has typed before, which is nothing
on day one. The seed is a starting point, not a closed list — anything typed is
accepted and joins that user's own list, and no copy discourages adding to it.

**Provenance is quietly marked.** This **promotes PRD FR-19 from an open
architecture question to a requirement**: provenance is stored per structured
field and exposed through the API, not merely tracked inside the enrichment
script.

| From | To | Trigger | Treatment |
|---|---|---|---|
| — | unconfirmed | The offline enrichment script writes a value | `{components.chip-unconfirmed}` — unfilled where a confirmed chip is filled, `{colors.taupe}` outline, `{colors.taupe-ink}` text. Two signals, neither colour alone. |
| unconfirmed | confirmed | The user edits the value, or re-selects it in the edit screen | The mark **drops immediately and permanently**. Ordinary `{components.chip}` from then on. |
| confirmed | — | Never | A user-set value has no mark and cannot acquire one. |

The mark never shouts: no badge, no icon, no fill, no colour of its own, no count
of unconfirmed values, and **no review-and-confirm surface** — the heavier option
was offered and deliberately not taken. There is nothing to clear and nothing to
work through; the mark simply says *the app guessed this*, and touching it makes it
yours.

## Accessibility Floor

The KitchenCraft PRD and epics say **nothing** about accessibility, i18n, dark
mode, density or motion. **This spine inherits the house floor** — Carbon's rules,
restated by Hotaru and KDH — and says so rather than inventing a KitchenCraft
standard.

- **Touch targets ≥ `{spacing.touch-min}` (44px), held at the largest system font
  setting.** Nothing truncates and no control collapses at large type.
- **Honour the system font scale** at every `DESIGN.md` typography role.
  `{typography.recipe}` at 18px/1.75 is a floor, not a target.
- **`prefers-reduced-motion` respected.** There is almost nothing to disable:
  the only motion in the app is the modal transition, which it removes.
- **Colour is never the sole signal.** This bites in three specific places, and
  each carries a second signal:
  - **Active state** is `{colors.moss}`, so every moss control also states its
    state in its accessible name (`aria-pressed`, `aria-selected`) and the filter
    bar's visible result count changes with it.
  - **Favourites** are carried in `{colors.ink}` with a **shape** change — filled
    star versus outlined — not a colour change, and announce as
    *"Favourite, on" / "Favourite, off"*.
  - **A ticked shopping-list item** is a **line-through plus a filled checkbox**,
    both in ink, and announces as checked. It is never distinguished by colour.
  - **An unconfirmed value** is distinguished by a **missing fill** as well as
    lighter ink, and announces as *"{value}, not confirmed"*.
- **Contrast, measured in `DESIGN.md § Colors` and verified there:**
  `{colors.ink}` on `{colors.beige}` **14.29:1** and on `{colors.beige-raise}`
  **16.32:1** (AAA); `{colors.taupe-ink}` **5.31:1** / **6.07:1** (AA);
  `{colors.moss}` **4.62:1** against the page, and `{colors.on-moss}` **5.28:1**
  on a moss fill. **`{colors.taupe}` is 3.17:1 and is restricted to hairlines and
  marks** — it never carries text. Body text passes AA everywhere, and the primary
  reading surface passes AAA.
- Focus is always visible: a 2px `{colors.moss}` ring at 4.62:1 against the page.
  Tab order follows reading order. Escape closes the topmost modal.
- Every field has a real `<label>`; a placeholder never stands in for one. Field
  errors are associated with their field and announced via `aria-live`.
- The collection is a list, the shopping list is a list of checkboxes, and the
  recipe body is a single text block — so a screen reader reads a recipe as one
  continuous passage rather than as fragments.
- **No dark mode.** KitchenCraft is light-ground only (`.decision-log.md`
  Entry 14). It does not follow the system colour scheme, and the dock's dark
  shell does not bleed into it.
- **No i18n in v1.** British English, one locale. `[ASSUMPTION]`

## Responsive & Platform

> Both sides of the 700px split are rendered for the collection in
> [`mockups/key-collection.html`](mockups/key-collection.html) (frames 1 and 4).

**Phone and wide are designed as peers**, neither as a fallback. Split at
**700px**, matching the house precedent set by KDH. `[ASSUMPTION]`

> **This exceeds PRD NFR-4** (`.decision-log.md` Entry 4). The PRD is
> unambiguously phone-only: NFR-4 asks for "every screen usable one-handed at
> phone width", the success metric is arm's-length legibility on a phone, and **no
> desktop layout, wide layout or breakpoint guidance appears anywhere in the PRD
> or epics**. The breakpoint, the wide layouts and the desktop modal posture below
> are net-new scope, drafted so they can be struck without touching anything else
> in this spine. Note also that the desktop-weighted half of the rationale rests
> on **capture**, not enrichment — Epic 4 never becomes a screen.

| Surface | < 700px (phone, primary) | ≥ 700px (wide, peer) |
|---|---|---|
| **Collection** | Single column, full-bleed rows inside `{spacing.screen-pad-x}` | Centred band. Rows in **two columns**, still newest-first and favourites-first reading left-to-right then down. Search and filter bar span the band. |
| **Filter bar** | Chips wrap under the search field | Same, on one or two lines in the wider band |
| **Recipe view** | Single column. Structure above and below the body, all inside `{spacing.measure}` | **Two columns**: the body holds `{spacing.measure}` on the left; meal type, time, servings, source, tags and ingredients move to a **quiet right rail**. This is PRD §11's "structure at the edges" read literally — and the rail collapses back above and below the body under 700px. |
| **Capture / Edit** | Single column, body field fills the remaining height | Centred band at `{spacing.measure}`. The body field is taller, not wider. |
| **Shopping list** | **Full-height sheet** over the screen, hand-entry row at the foot within thumb reach | **Centred dialog**, max 480px wide, vertically centred, page dimmed behind. Not full-screen — the surface behind stays visible, which is what makes "closing returns you where you were" legible on a large display. |
| **Add** | Sheet from the bottom | Centred dialog, max 480px wide |
| **Confirmations** | **Centred dialog** with `{spacing.screen-pad-x}` of side room | Centred dialog, max 480px wide | *(Revised 2026-09-15 at the user request: a confirmation is a question that stops you, not a surface you work in, so it sits in the middle at every width rather than sliding off the bottom edge.)*

- **The `{typography.recipe}` size and `{spacing.measure}` are identical at both
  sizes.** A wide window gets more margin, never a longer line or smaller text.
- No third size. A tablet takes whichever side of the breakpoint it falls on.
- **Mobile-first web, the same Quasar SPA as every other dock app** — no native
  app and no offline mode (PRD assumption). The shopping list is server-persisted
  precisely so it survives a refresh mid-shop.
- One-handed phone use is the constraint the interface is designed against: the
  primary action and the shopping-list tick targets sit in the lower and upper
  thumb arcs, and nothing important requires a two-handed reach.

## Key Flows

`[ASSUMPTION]` **All protagonist names are invented.** The PRD defines no personas
— only "the builder and their household" — so Nell and Bram are stand-ins for the
two role voices the stories use ("as a cook", "as a cook at the shop"). Strike the
names freely; the beats are the specification.

### Flow 1 — Capture (Nell, 18:40, one browser tab and a hungry kitchen)

1. Nell has a recipe open in a browser tab. She selects the method and copies it.
2. She opens KitchenCraft from the dock and taps **Capture a recipe**.
3. The capture screen opens with **focus already in the body field**, keyboard up.
   She pastes. *(Interaction one.)*
4. She taps up to the name field and types `pumpkin dal`. *(Interaction two.)*
5. She taps **Save**. *(Interaction three.)*
6. **Climax:** the collection reappears with `pumpkin dal` at the top, one line,
   no meal type, no time, no chips, nothing greyed out and nothing asking her for
   anything. **Under ten seconds, three interactions** (PRD NFR-7) — and the
   recipe is complete and first-class exactly as it is.

*Failure — she taps Save with no name:* save is rejected, *"Give it a name."*
appears at the name field, and **the pasted body is still there**. Nothing about
the failure risks the paste.

*Failure — the save request fails:* one line above the button, *"Couldn't save —
nothing has been lost, try again."* Both fields keep everything.

### Flow 2 — Decide what to cook (Bram, Wednesday, standing at the open fridge)

1. Bram opens KitchenCraft on his phone. Forty-two recipes, newest first, three
   favourites starred at the top.
2. He types `chicken` into the search field. It matches names **and bodies**, so
   a recipe that never says "chicken" in its title still surfaces.
   *(Revised 2026-09-15: this flow used to walk the pantry filter, which no
   longer exists. Search and the tag filter carry it now.)*
3. The count reads *"11 of 42 recipes"*.
4. He taps the **batch-cook** tag. Now *"4 of 42 recipes"*.
5. He also taps **dinner**. Now *"3 of 42 recipes"*, with each filter shown as its
   own clearable control.
6. **Climax:** three rows. The app has not claimed he can cook any of them — it
   has only narrowed forty-two down to three, which is a claim it can keep.
   He opens the middle one, sees it needs a lemon he does not have, backs out
   without the filter having lied to him, and takes the first.

*Failure — he adds `chickpeas` as well and nothing matches:* *"Nothing matches all
of these."* Then, one line each: *"chicken — 11 on its own"*, *"onion — 19 on its
own"*, *"chickpeas — 7 on its own"*, *"dinner — 22 on its own"*. He taps the
`chickpeas` line, that one filter clears, and the three rows come back. He was
told **why** nothing matched, not just offered the exit.

### Flow 3 — Mid-cook reading (Nell, twenty minutes later, wet hands, pan going)

1. The phone is propped against the kettle at arm's length. She taps `pumpkin
   dal` in the collection.
2. The recipe view opens: the name, then the body at `{typography.recipe}` inside
   `{spacing.measure}` — **no pinch-zoom, no reflow, no two-handed reach**.
3. The body reads back **exactly as she pasted it**: the site's mixed bullets, its
   inconsistent capitals, the stray "Print Recipe" line at the bottom. She scans
   past the boilerplate the way she would past a smudge in a notebook.
4. There is no meal type on this recipe and no time, so there is **no meal-type
   line and no time line** — not a gap, not a dash, not an "add a time?" nudge.
5. **Climax:** she scrolls one-handed with a thumb, reads step four, and puts the
   phone down. The app asked her for nothing, offered her nothing, and did not
   reformat a single character of what she pasted (PRD FR-3).

*Failure — she scrolls too far and wants the top:* one thumb-scroll back. There is
no sticky header eating the reading area and no floating action button over the
text; the only persistent chrome is the shopping-list button top-right.

### Flow 4 — Shop for it (Bram, Saturday morning, basket in one hand)

1. At home, Bram opens the chicken recipe and taps **Add to shopping list**.
2. The modal lists one checkbox per ingredient tag, showing the specific where
   there is one — `chicken thighs`, `onion`, `tinned tomatoes` — **all checked
   except `salt` and `black pepper`, which start unchecked**.
3. He taps **Add**. The list already has nine items, so the prompt appears:
   *"The list already has 9 items."* He chooses **Add to the list**.
4. *"6 items added."* He taps **Done**. **He is not navigated anywhere** — he is
   back on the recipe, scrolled where he was (PRD FR-16). He repeats this for two
   more recipes.
5. At the shop, phone in one hand and a basket in the other, he taps the
   shopping-list button top-right. The list is there — server-persisted, so the
   refresh his browser did overnight cost him nothing.
6. He taps a **whole row** to tick `onion`. It is struck through in ink and
   **stays exactly where it is**, so the row he ticks next is the one below the
   one he just ticked, not two rows up.
7. He notices the list says `chicken thighs` where he wants two packs. He taps the
   text and edits it in place to `2 packs chicken thighs` — the items arrived as
   **ordinary editable text**, because quantities are never parsed.
8. **Climax:** at the till, seventeen items, all struck through, all still on
   screen in the order he walked the aisles — the list reads as a record of the
   shop rather than as an empty panel that ate his afternoon. On the way out he
   taps **Clear**, confirms *"Clear all 17 items? This can't be undone."*, and the
   list is empty and ready for next week.

*Failure — he taps **Replace the list** by mistake at step 3:* a **second,
explicit** confirmation appears — *"Replace all 9 items, including the 4 you've
ticked off? This can't be undone."* He taps **Cancel** and the list is **exactly
as it was**: same nine items, same order, same four ticks (PRD FR-15).

*Failure — the shop has no signal and a tick fails to save:* the row reverts and
one line appears at the head of the modal, *"Couldn't save that — check your
connection."* Nothing else changes, and the items already saved are still right.

### Flow 5 — Add structure later (Nell, Sunday, tea in hand, nothing cooking)

Covers the surfaces the other four flows only pass through: PRD FR-2, FR-4, FR-5,
FR-6, FR-7 and FR-11.

1. Nell opens `pumpkin dal` — the one-line recipe she pasted on Wednesday — and
   taps **Edit**.
2. She picks **dinner** from the meal-type chips, one selection or none, and types
   `45` into Total time.
3. She fat-fingers `4o` into Servings. It is **rejected at the field**, not held
   back to save: *"A whole number of servings."* She fixes it to `4`.
4. In **Tags** she types `bat` and takes the existing `batch cooking` from the
   typeahead. The list offers tags only — no ingredient has ever appeared here,
   because the two inputs never share a namespace (PRD FR-6).
5. In **Ingredients** she types `400` into Amount, takes `g` from the unit list,
   and types `dried chickpeas`. *(Revised 2026-09-15: this step used to walk the
   two-level tag and the coining ceremony, neither of which exists.)*
6. She adds `harissa` with no amount and no unit. Nothing ceremonial happens —
   it is free text, and a new ingredient is simply typed.
7. She saves and lands back on the recipe view. The two read one per line, with
   the quantities in their own column: **`400 g` `dried chickpeas`**, then
   `harissa` on its own with the measure column empty.
8. The meal type the enrichment script guessed last month is sitting there as an
   **unfilled outlined chip**. She taps it, keeps `dinner`, and the mark drops.
   That is the entire provenance interaction: no queue, no review screen, no
   count of things to confirm.
9. **Climax:** she goes back to the collection, scrolled halfway down, and taps
   the star on the row. It fills, the row **jumps to the favourites group at the
   top** — and her scroll position does not move (PRD FR-11). She never opened
   the recipe to do it, and she never lost her place.

*Failure — she decides the recipe was a dud and taps Delete on the recipe view:*
*"Delete pumpkin dal? This can't be undone — there's no trash."* On confirming, it
leaves the collection, the favourites group and every filter result at once. There
is no undo and nothing to restore, which is why the confirmation exists at all
(PRD FR-2).

## Open Questions

Genuine gaps, listed rather than filled.

- ~~**What ships in the seed?**~~ **Closed 2026-09-15** — the seed is a list of
  units, not categories, and it ships with 22. The taxonomy risk went with the
  category vocabulary.
- **Chip overflow at extreme counts.** The PRD sets no cap on tags per recipe.
  Wrapping to as many lines as needed is assumed above, but a recipe with sixty
  tags would make the reading view mostly chips. No cap, truncation or overflow
  behaviour is specified. *(Ingredients are no longer chips — they are one per
  line — so a long ingredient list is simply a long list.)*
- **In-place editing of a shopping-list item.** § Component Patterns says the row
  text is editable in place, but no story's acceptance criteria ask for it —
  Story 3.2 covers ticking and deleting, Story 3.3 only says items *arrive* as
  editable text. Specified and unbuilt. *(Raised 2026-09-15.)*
- **Is the favourites-only view a route?** Assumed here as a filter-bar toggle,
  which satisfies "one interaction from the collection" (PRD FR-11) but is not
  deep-linkable or shareable-by-URL. A route would be.
- **Does provenance show on the collection row?** Specified above for the recipe
  and edit views only. Whether a row whose meal type came from enrichment should
  carry the mark is undecided — showing it would put a tell on the app's calmest
  surface.
- **Is a `source` that looks like a URL a link?** PRD FR-4 makes `source` free
  text — "a URL, a person's name, a book". Rendered as plain text here. Making
  URLs clickable was not specified and would be the app's only outbound link.
- **Should the folk register reach the microcopy?** Written plain throughout, on
  the reading that "folk-witchcraft *looking*" is visual only. If the register is
  wanted in the words as well, the Voice and Tone table is the place it changes —
  and Entry 14's plain-English consequence would need reopening.
- **Does search cover tags and ingredients?** PRD FR-9 says names and bodies. A
  user typing `chickpeas` into search will match bodies that mention them but not
  recipes tagged with them and never mentioning the word. Left as specified.

## Amendments

### 2026-09-15 — The ingredient model changed shape

Story 2.8 replaced the two-level ingredient tag (a shared **category** plus an
optional free-text **specific**) with an optional **amount**, an optional
**unit** and a required free-text **name**. Requested directly, with the blast
radius stated and confirmed first.

Removed with the category: the **pantry filter**, the **shared category
vocabulary**, the **new-category row** and its coining ceremony, and the copy
rules that guarded the pantry filter's claim. Added: the **ingredient row**
pattern (one per line, quantities in their own column) and the **ingredient
entry** pattern (three fields).

Flow 2 was re-cut — it walked the pantry filter end to end — and Flow 4 steps 5–7
were re-cut for the same reason. **20 surfaces became 19** with the new-category
row gone.

### 2026-09-15 — Corrections to things this document already said

- **Ratings are in v1.** § Not in v1 listed them; Story 2.7 shipped a 1–5 star
  rating, and PRD FR-21 was written after the fact to cover it. Only a ratings
  *history* remains out of scope.
- **Modal stacking.** `DESIGN.md` said "modals never stack" while this document
  said they stack one level deep. A flat contradiction, resolved in this
  document's favour — it owns behaviour — and `DESIGN.md` corrected.
- **Confirmations are centred.** § Responsive specified a bottom sheet under
  700px. Changed at the user's request: a confirmation is a question that stops
  you, not a surface you work in, so it sits in the middle at every width.
- **The star rating sits beside the recipe name**, not on the meta line. Story
  2.7 specced the meta line because five targets plus a heart do not fit beside a
  name at 375px; moved on request, and the line wraps rather than truncating.
