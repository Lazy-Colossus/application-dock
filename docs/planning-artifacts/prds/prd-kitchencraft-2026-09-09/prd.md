---
title: KitchenCraft — Recipe Store
status: final
created: 2026-09-09
updated: 2026-09-10
---

# PRD: KitchenCraft

## 0. Document Purpose

Defines what KitchenCraft is and what v1 must do. Capabilities only — technical design lives in the architecture pass and in `addendum.md`. Downstream: `bmad-create-epics-and-stories`.

## 1. Vision

A private recipe collection that never punishes you for being in a hurry.

The user finds a recipe — on a website, in a message from a friend, in their own head — and gets it into KitchenCraft in one paste and one tap. No form to fill, no fields to satisfy, no "please select a category" before it will save. A recipe is a **name and a block of text**, and that is a complete, valid, first-class recipe forever.

Structure is optional and additive. If the user feels like tagging a recipe *chicken, 30 min, dinner*, the app gets better at answering "what do I make tonight?". If they never do, nothing breaks — and the structure can be added later, in bulk, by an LLM-assisted enrichment pass over the stored text, without the user ever having done data entry.

The payoff for structure is the **pantry filter**: pick the ingredients you actually have in the house, and see the recipes that use them.

## 2. Target User

The builder and their household — people cooking ordinary meals at home, standing in the kitchen with a phone, deciding what to make. Single-user in practice: each dock account holds its own private collection. [ASSUMPTION] Per-user storage keyed by the authenticated username, following the Listies pattern; no sharing surface in v1.

### 2.1 Jobs To Be Done

- **Functional — capture without friction.** Get a recipe out of a browser tab and into my collection before I lose it, in seconds, without filling in a form.
- **Functional — find it again.** Retrieve the thing I cooked two months ago from a half-remembered word in its text.
- **Functional — decide what to cook.** Answer "what can I make with what's in the fridge?" without opening five sites.
- **Functional — shop for it.** Turn "I'm cooking these three things this week" into a list I can carry to the shop.
- **Contextual — usable mid-cook.** Read the method one-handed, on a phone, with wet hands and a pan going.
- **Builder — enrichable.** Let me improve the whole collection's structure in one offline pass rather than nagging the user to do data entry.

### 2.2 Non-Users (v1)

- The public — no publishing, no sharing links, no community, no recipe discovery feed.
- Other households — no collaboration on one collection, no guest access.
- Anyone wanting nutrition tracking, calorie counts, or diet programme management.

## 3. Glossary

- **Recipe** — one stored item. Minimally a **name** and a **body**; optionally everything in §4.2.
- **Body** — the free-text block holding the recipe as the user captured it. Ingredients, method, notes, whatever they pasted, in whatever shape it arrived. Never rewritten by the system.
- **Tag** — a free-text label on a recipe. One flat namespace covering cuisine, occasion, diet, and anything else the user invents.
- **Ingredient tag** — a two-level label in a namespace of its own, separate from ordinary tags. A **category** (`chicken`, `cheese`, `beans`) is always present; a **specific** (`chicken thighs`, `feta`, `chickpeas`) is optional. The category is what the pantry filter matches on — coarse enough to actually match; the specific is what the recipe view shows — precise enough to be useful.
- **Category vocabulary** — the controlled set of ingredient categories. Shared across the collection so `chicken` means one thing; specifics stay free text.
- **Pantry filter** — selecting a set of ingredient categories to narrow the list to recipes carrying them.
- **Staple** — an ingredient assumed to be in every kitchen (salt, black pepper). Tagged like any other, but excluded by default when sending ingredients to the shopping list.
- **Enrichment pass** — an offline, LLM-assisted batch over stored bodies that populates structured fields and tags. Run by the builder in Claude Code against the data volume, not by the app.
- **Shopping list** — one running list per user of items to buy, filled from recipes or typed by hand.

## 4. Features

### 4.1 Capture and Edit

**Description:** The core loop. A new recipe needs a name and a body and nothing else. Every other field is optional at every point in the recipe's life. The capture screen opens focused on the text area so a paste-and-save takes two interactions.

**Functional Requirements:**

#### FR-1: Create a recipe from name and text alone

The user can create a recipe by supplying a name and a body. No other field is required, and no other field blocks saving.

**Consequences (testable):**
- A recipe saved with only name and body persists and appears in the list, with empty structured fields rendered as absent rather than as "unknown" placeholders.
- Saving is rejected only when the name is empty or the body is empty; the error names which one.
- Leading/trailing whitespace in a pasted body is trimmed, but internal line breaks and blank lines are preserved exactly.

#### FR-2: Edit and delete a recipe

The user can edit any field of an existing recipe, and delete a recipe.

**Consequences (testable):**
- Editing only the tags leaves the body byte-identical.
- Deleting a recipe removes it from the list, from favourites, and from any pantry-filter result, in one action.
- Deletion asks for confirmation, because there is no undo. [ASSUMPTION] No trash/restore in v1.

#### FR-3: Preserve the captured text verbatim

The body is stored as the user entered it and is never reformatted, re-flowed, or restructured by the app or by an enrichment pass.

**Consequences (testable):**
- A body pasted with mixed bullet characters, inconsistent casing, and stray site boilerplate reads back exactly as pasted.
- An enrichment pass that adds tags and a time to a recipe leaves the body unchanged.

### 4.2 Structured Fields

**Description:** The optional metadata that makes a collection searchable. Every field is nullable; a recipe with all of them empty is normal, not broken.

**Functional Requirements:**

#### FR-4: Optional metadata on a recipe

A recipe may carry: **meal type** (breakfast / lunch / dinner / snack / dessert / other), **total time** in minutes, **servings**, **source** (free text — a URL, a person's name, a book), **tags**, and **ingredient tags**.

**Consequences (testable):**
- Each field can be set and cleared independently; clearing one does not disturb the others.
- Meal type accepts exactly one value from the fixed list, or none.
- Time and servings accept positive integers only, or none; a non-numeric entry is rejected at the field, not at save.
- A recipe may carry any number of tags and ingredient tags, including zero. [ASSUMPTION] No enforced cap.

#### FR-5: Ingredient tags carry a category and an optional specific

Every ingredient tag has a category drawn from the shared category vocabulary; a free-text specific may be attached to it.

**Consequences (testable):**
- An ingredient tag can be stored as category alone (`cheese`) or as category plus specific (`cheese` → `feta`).
- Two recipes tagged `cheese`/`feta` and `cheese`/`halloumi` both match a pantry selection of `cheese`, and each displays its own specific.
- The recipe view shows the specific where one exists and the category where one does not — it never shows both stacked as two separate ingredients.
- Adding an ingredient offers the existing category vocabulary first; introducing a genuinely new category is possible but is a visibly distinct act from picking an existing one.

#### FR-6: Tags and ingredients are entered separately

The edit screen presents two distinct inputs — **Tags** and **Ingredients** — rather than one combined input that infers which namespace a label belongs to.

**Consequences (testable):**
- A label typed into Tags never lands in the ingredient namespace, and vice versa, regardless of its wording.
- Each input suggests only from its own namespace.

#### FR-7: Tag entry assists reuse

When entering tags or ingredients, the user is offered the values already present elsewhere in their collection, so the vocabulary converges rather than fragmenting.

**Consequences (testable):**
- Typing `chi` offers existing `chicken` and `chickpeas` before creating a new tag.
- Tags are matched case-insensitively and stored in a single normalised casing, so `Chicken` and `chicken` never coexist as two tags.
- The user can still commit a genuinely new tag that matches nothing existing.

### 4.3 Browse, Search, Filter

**Description:** The collection screen. Everything the user does to get from "I have 40 recipes" to "I'm cooking this one."

**Functional Requirements:**

#### FR-8: Browse the collection

The user sees their recipes as a scannable list, newest first by default. [ASSUMPTION] Creation date descending is the default order; alternative sorts are not in v1.

**Consequences (testable):**
- Each entry shows at minimum the name, and shows meal type and time when present.
- Favourites sort above everything else (see FR-11).
- An empty collection shows a prompt to capture the first recipe, not a blank screen.

#### FR-9: Full-text search

A single search box matches against recipe names and bodies.

**Consequences (testable):**
- Searching `paprika` returns recipes whose body mentions paprika even when no tag does.
- Matching is case-insensitive and matches partial words.
- Search combines with active filters rather than replacing them.

#### FR-10: Filter by meal type, tag, and pantry ingredients

The user can narrow the list by meal type, by tag, and by ingredient **category**. Ingredient categories behave as a **plain tag filter**: selecting `chicken` and `rice` shows recipes carrying both of those categories, regardless of what else those recipes also require.

**Consequences (testable):**
- Selecting two ingredient categories returns only recipes carrying both.
- Matching is on category, never on specific: a pantry selection of `cheese` matches a recipe tagged `cheese`/`feta`.
- A recipe needing ten other ingredients still matches a two-ingredient pantry selection — the filter never checks completeness, and the UI never implies it does.
- Filters combine across categories (meal type AND tags AND ingredients) and each is individually clearable.
- The result count is visible, and a zero-result state offers to clear filters.

### 4.4 Favourites

**Description:** The handful of recipes actually in rotation, kept one tap away.

**Functional Requirements:**

#### FR-11: Mark a recipe as favourite

The user can toggle a favourite flag on any recipe; favourites surface first in the collection and can be viewed alone.

**Consequences (testable):**
- Toggling favourite from the list does not open the recipe or lose scroll position.
- Favourites appear above non-favourites in the default browse order, and remain visibly marked inside a filtered result.
- A favourites-only view is reachable in one interaction from the collection screen.

### 4.5 Shopping List

**Description:** Exactly one list per user, reachable from anywhere in the app, filled from recipes or by hand, and emptied at the shop. It is a shopping companion, not a second notes app: open it in the aisle, cross things off, clear it on the way out.

**Functional Requirements:**

#### FR-12: One shopping list, always one tap away

A button in the app's top-right corner opens the shopping list as a modal over whatever the user was doing. There is exactly one list per user.

**Consequences (testable):**
- The button is present on every KitchenCraft screen, and opening the list never navigates away from or loses the state of the current screen.
- Closing the modal returns the user exactly where they were.
- The list persists across sessions and devices, and survives a browser refresh mid-shop.
- No second list can be created; there is no list-management surface.

#### FR-13: The list behaves like a shopping companion

Items can be added by hand, ticked as purchased, unticked, and deleted. A ticked item is struck through and stays visible in place.

**Consequences (testable):**
- Ticking an item strikes it through without removing or reordering it — the user can see what they have already picked up.
- Ticking is a single tap on the item row, sized for a hand holding a basket.
- A "clear" action empties the list, and asks for confirmation because there is no undo.
- An empty list says so plainly and offers hand-entry, rather than showing a bare panel.

#### FR-14: Add a recipe's ingredients through a confirmation modal

"Add to shopping list" on a recipe opens a modal listing that recipe's ingredients as checkboxes. Everything is checked by default **except staples** (salt, black pepper), which start unchecked. Confirming adds the checked items.

**Consequences (testable):**
- The modal lists one entry per ingredient tag, showing the specific where one exists and the category where it does not.
- Salt and black pepper appear unchecked while every other ingredient appears checked, and the user can check them anyway.
- Confirming with everything unchecked is a no-op that closes the modal without touching the list.
- Items arrive as ordinary editable text, so `chicken thighs` can be amended to `2 packs chicken thighs` in the list. [ASSUMPTION] v1 does not parse quantities out of the body — ingredient names go across bare.
- A recipe with no ingredient tags explains there is nothing structured to send yet, rather than opening an empty modal.

#### FR-15: Adding to a non-empty list is a deliberate choice

When the list already holds items, confirming an add asks the user whether to **add to** the existing list or **overwrite** it.

**Consequences (testable):**
- The prompt appears only when the list is non-empty; adding to an empty list is silent.
- "Add" appends without duplicating items already present, matched case-insensitively.
- "Overwrite" discards the previous contents — including ticked items — and asks for confirmation before doing so.

#### FR-16: Confirming an add offers the list without demanding it

After a successful add, the user is offered a way through to the shopping list and can equally stay on the recipe.

**Consequences (testable):**
- The confirmation makes clear how many items were added.
- Taking the offered link opens the shopping list; ignoring it leaves the user on the recipe with the modal closed.
- The user is never navigated away automatically.

### 4.6 Offline Enrichment

**Description:** The mechanism that makes optional structure viable. The builder periodically runs an LLM-assisted pass over stored bodies to populate meal type, time, tags, and ingredient tags — turning a pile of pasted text into a filterable collection without the user having done any data entry.

The pass runs **directly against the data volume** — a maintenance script in `backend/scripts/`, invoked from Claude Code, reading and writing the recipe files where they live. There is no export endpoint and no HTTP surface for enrichment. This buys simplicity at the cost of writing underneath a running application, which is what FR-17 exists to contain.

**Functional Requirements:**

#### FR-17: Enrichment writes are as safe as application writes

The enrichment script goes through the same persistence discipline as the app itself — the repository layer, its atomic write path, and its per-file locking — rather than reading and rewriting JSON on its own.

**Consequences (testable):**
- A pass run while the app is serving traffic cannot produce a torn or truncated file.
- A pass and a concurrent user edit of the same collection cannot lose either party's write; one waits for the other.
- The script fails loudly and changes nothing if the data it finds does not match the expected schema.

#### FR-18: Apply structured updates in bulk

Structured fields and tags for many recipes can be updated in one operation, addressed by stable recipe identity, without supplying or touching the bodies.

**Consequences (testable):**
- A bulk update that sets tags on 40 recipes leaves all 40 bodies byte-identical.
- An update naming an unknown recipe fails that entry and reports it, without abandoning the rest of the batch.
- A partially applied batch leaves every individual recipe in a valid state — no recipe is left half-written.
- Re-running the identical batch is a no-op rather than duplicating tags.
- A recipe's identity survives every edit the user can make, including renaming it — enrichment addresses recipes by id, never by name.

#### FR-19: Enrichment never overwrites deliberate user input

A field the user set by hand is not silently replaced by an enrichment pass.

**Consequences (testable):**
- A recipe whose meal type the user set to `lunch` still reads `lunch` after a pass that would have inferred `dinner`.
- Enrichment fills empty fields and adds tags; the user's own values and tags survive.
- [OPEN] The mechanism for distinguishing user-set from machine-set values is a design question for architecture, not a PRD decision.

#### FR-20: Enrichment respects the category vocabulary

A pass assigns ingredient categories from the existing shared vocabulary, and introduces a new category only when nothing existing fits.

**Consequences (testable):**
- Two passes over similar recipes do not produce `chicken` and `chicken meat` as separate categories.
- Newly introduced categories are reported at the end of a pass so the builder can catch vocabulary drift early.

## 5. Non-Goals (Explicit)

- **Images.** No photo upload, no image URLs. Persistence stays pure JSON-on-disk like every other dock app.
- **In-app AI parsing.** No "parse this for me" button, no `ANTHROPIC_API_KEY` in the backend, no paid external dependency. Enrichment is offline and builder-run. Revisit once the data model has proven itself.
- **URL scraping.** The app does not fetch a recipe from a link. The user pastes text.
- **Servings scaling.** Requires reliably parsed quantities, not just ingredient names.
- **Meal planning / calendar.** Kalendariq exists; KitchenCraft does not become a planner.
- **Nutrition, calories, macros.**
- **Sharing, publishing, multi-user collaboration on a collection.**
- **Rich-text or structured recipe editing** (separate ingredient rows, numbered step objects). The body is text.

## 6. MVP Scope

### 6.1 In Scope

FR-1 through FR-20: capture, edit, optional structured fields (including two-level ingredient tags), search, filter (meal type / tags / pantry ingredients), favourites, the shopping list and its recipe hand-off, and the offline enrichment path.

### 6.2 Out of Scope for MVP

Everything in §5, plus: alternative sort orders, trash/restore, tag rename and merge across the collection, printing, per-recipe cooking notes or ratings history, a user-configurable staples list (salt and black pepper are hard-coded in v1), and any second shopping list.

## 7. Success Metrics

- **Capture cost.** A recipe goes from clipboard to saved in under 10 seconds and no more than three interactions.
- **Collection reached.** The builder's existing scattered recipes (browser bookmarks, notes, messages) end up in KitchenCraft rather than staying scattered.
- **Filter earns itself.** After one enrichment pass, the pantry filter returns a usable answer — a handful of plausible recipes, not zero and not everything.
- **Mid-cook readability.** The method is readable at arm's length on a phone, one-handed, without pinch-zoom.

**Counter-metrics** (things that would mean we got it wrong):

- Users leaving bodies unpasted because the form felt like work — capture friction reintroduced by field creep.
- Enrichment passes silently degrading the collection: bodies altered, user tags lost, tag vocabulary fragmented into near-duplicates.
- The pantry filter returning recipes the user obviously cannot cook often enough that they stop trusting it — the known cost of the plain-tag-filter choice.
- The category vocabulary drifting into near-synonyms across enrichment passes, quietly making the pantry filter worse the more it is used.
- An enrichment pass corrupting live data because it wrote to the volume underneath a running app.

## 8. Resolved and Open

**Resolved during discovery:**

1. **Enrichment reaches the data by direct volume access** — a maintenance script in `backend/scripts/` driven from Claude Code, going through the repository layer (FR-17). No export endpoint, no HTTP enrichment surface.
2. **Ingredient granularity is two-level** — a shared category plus an optional free-text specific (FR-5). The filter matches the category; the view shows the specific.
3. **Tags and ingredients get separate inputs** (FR-6). One combined input would pollute the namespace the pantry filter depends on.
4. **The shopping list lives in KitchenCraft**, not in Listies, and is deliberately minimal: one list, a modal, tick-to-cross-off, clear (FR-12 – FR-16).

**Still open:**

1. **Distinguishing user-set from machine-set field values** (FR-19). Needed so enrichment can fill gaps without overwriting deliberate input. An architecture decision — provenance flags, a separate machine-written layer, or something else.
2. **Seeding the category vocabulary.** Does v1 ship a starter list of ingredient categories, or does the vocabulary accrete from the first enrichment pass? Accretion is simpler but makes the first pass load-bearing for years of tag quality.
3. **Reaching the volume from the host.** Direct access is decided; the mechanics are not — bind mount, `docker cp`, or running the script inside the container. Belongs to architecture, but the answer determines whether a pass can run against a live app at all.

## 9. Assumptions Index

- **[ASSUMPTION]** Per-user private collection keyed by authenticated username (Listies pattern); no sharing in v1.
- **[ASSUMPTION]** Default browse order is creation date descending, favourites first; no alternative sorts.
- **[ASSUMPTION]** No trash or undo; deletion is confirmed and permanent.
- **[ASSUMPTION]** No cap on tag count per recipe.
- **[ASSUMPTION]** Quantities are not parsed out of bodies for the shopping list in v1; ingredient names go across bare.
- **[ASSUMPTION]** Staples are hard-coded as salt and black pepper, not user-configurable in v1.
- **[ASSUMPTION]** The shopping list holds plain text items with no link back to the recipe they came from.
- **[ASSUMPTION]** Mobile-first web, same Quasar SPA as every other dock app — no native app, no offline mode.

## 10. Cross-Cutting NFRs

- **Persistence.** JSON files on disk, one file per user, all writes atomic, per-file locking on read-modify-write — the established dock pattern. No database, no new backend dependency.
- **Layering.** Strict router → service → repository; the repository is the only code touching the filesystem.
- **Data safety.** The body is the irreplaceable asset. No operation — edit, enrichment, bulk update, migration — may lose or silently alter a body. Offline enrichment is held to the same standard as the app: same repository layer, same atomic writes, same locks.
- **Mobile-first.** Every screen usable one-handed at phone width; the recipe reading view is legible at arm's length.
- **Auth.** Behind the dock's existing JWT auth like every other app; a user reaches only their own collection.
- **Performance.** Search and filter stay instant over a personal-scale collection (hundreds, not millions, of recipes). [ASSUMPTION] Client-side filtering over the loaded collection is acceptable at this scale.

## 11. Aesthetic & Tone

Calm and uncluttered — a notebook, not a magazine. The text is the hero: generous line height, comfortable measure, no decoration competing with the method while someone is cooking from it. Structure (tags, time, meal type) is present but quiet, sitting at the edges rather than framing the content. Empty fields are invisible, never rendered as gaps waiting to be filled — the app must never make an unstructured recipe feel unfinished.
