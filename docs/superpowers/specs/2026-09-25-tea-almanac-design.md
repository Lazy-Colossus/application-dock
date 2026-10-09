# Cha Dao Almanac — Design Spec

Date: 2026-09-25
App id: `tea`
Status: approved in brainstorming, pending implementation plan

## Problem

The Cabinet answers "what tea do I have." It doesn't answer "what *is* this tea" — where it's
from, how it's made, what to expect brewing it. That knowledge currently lives nowhere in the app;
the catalogue tree only classifies (id, name, native script, a one-line default origin), it doesn't
explain. The Almanac is the read layer: a personal tea encyclopedia the user can browse, search,
and grow — starting with well-known Chinese and Japanese teas, then their regional variants, then
other tea-producing countries (Taiwan, Vietnam, African origins, and beyond).

## Scope

**In scope (this implementation):**

- An `AlmanacEntry` per named tea: country, romanized reading, a factual summary, and suggested
  brewing parameters (grams, water temperature, per-infusion steep times).
- Every entry links to exactly one catalogue leaf node (FR-24's subject matter *is* the catalogue's
  named teas, given facts). If a tea worth an entry has no catalogue node yet, the node is added as
  part of writing the entry — the catalogue stays the one classification tree, the Almanac never
  invents a parallel one.
- Seed content split into one JSON file per country under `backend/app/data/almanac/`.
- A browse/search read view (`GET /api/tea/almanac`, filterable by country and free text) and a
  detail view (`GET /api/tea/almanac/{catalogue_node_id}`).
- A small seed set (roughly 8–10 entries spanning China and Japan) to prove the feature end to end
  and satisfy "non-empty on first launch."

**Explicitly out of scope (this implementation), with the reason:**

- **Editing seeded entries / adding your own (PRD FR-25).** No write path, no edit UI. Read/search
  first; editing is a real follow-up feature (its own UI, its own catalogue-node-creation flow from
  the user's side) better scoped once the read side and the seed content both exist.
- **Ceremony vocabulary (PRD's "term, script, reading, meaning" glossary half of §4.9).** The
  current ask is tea facts, not vocabulary terms. Vocabulary is structurally unrelated to
  `AlmanacEntry` (no catalogue-node link) and can be added as its own small slice later without
  touching this data model.
- **Bulk content population beyond the seed set.** Writing "as many teas as we can find" is a
  content task, not a code task — see "Content rollout plan" below. It happens after this
  implementation ships, via background research batches, one country at a time.
- **Wiring the Almanac into the Session Timer's Brewing Curve fallback (PRD FR-11).** The Session
  Timer doesn't exist yet in this codebase. `AlmanacEntry.brewing` is shaped so that link is a
  straightforward lookup later, but nothing consumes it yet.

## Relationship to the Tea PRD

PRD: [`prd-tea-2026-09-06/prd.md`](../../planning-artifacts/prds/prd-tea-2026-09-06/prd.md) §4.9,
FR-24/25/26.

**Where this spec diverges:**

- **Entry granularity.** The PRD scopes the Almanac to *tea families* (~8–15 broad categories:
  green, young sheng, aged sheng, shou, oolong, black, white, Japanese greens) each with one
  default Brewing Parameter set for the Timer fallback. This spec scopes it to **individual named
  teas** (Longjing, Tieguanyin, Sencha, ...), matching the idea pool's "personal tea encyclopedia"
  framing and the user's explicit ask for "as many teas as we can find." Family-level defaults
  (what FR-11's fallback chain actually needs) can be derived later by picking a representative
  entry per top-level catalogue class, or added as a lighter `family_defaults` table — deferred
  until the Session Timer exists and the fallback chain is being built for real.
- **FR-26's seed breadth** ("[NOTE FOR PM: scope the initial family/vocabulary list explicitly]")
  is answered here: the seed for *this implementation* is small (8–10 entries, enough to prove the
  feature), and the PRD's "non-empty on first launch" is satisfied by it. The bulk of the breadth
  arrives in Phase B (content rollout, below), after this ships.

**Vocabulary.** Uses the PRD's terms: *Almanac*, *Cha Dao Almanac*, *Tea*, *Catalogue* (the PRD
calls the classification tree part of the Almanac's "families"; this codebase already names it the
catalogue, per `2026-09-24-tea-cabinet-design.md` — that naming stands).

## Requirements

### Functional

- **FR-1** — An Almanac entry holds: `catalogue_node_id` (PK, links to exactly one catalogue leaf
  node), `country`, `reading` (romanization — pinyin or rōmaji), `summary` (factual: what it is,
  how it's processed, what characterizes it), `brewing` (leaf grams, water temp °C, ordered
  per-infusion steep seconds — any of which may be absent when genuinely unknown), `source`
  (`"seed"` or `"user"`, unused until FR-25 lands but present so the shape doesn't change later).
- **FR-2** — The user can list and filter Almanac entries by country and by free-text search
  against name/native script/summary (name and native script are resolved from the linked
  catalogue node, not duplicated onto the entry).
- **FR-3** — The user can open one entry's detail: full summary, brewing parameters, country,
  resolved catalogue name/native script/default origin.
- **FR-4** — Writing a new entry for a tea with no catalogue node yet requires creating that node
  first (name, name_zh/name_ja, correct parent, default_origin) — enforced by convention in how
  seed content is written, not by new validation code, since entry-writing has no API path in this
  round (seed files are hand/agent-authored JSON, same as the catalogue's own seed).

### Non-functional

- Read-only in this round: no auth-gated mutation surface to secure beyond what already exists.
- Seed files must stay parseable, human-diffable JSON — one file per country keeps any single
  file's diff small and reviewable, and lets content-writing batches work in parallel without
  touching the same file (they may still collide on the shared catalogue file if it needs a new
  node — batches run sequentially for that reason, see below).

### Architecture

- Backend: `schemas/almanac.py` (pydantic), `repositories/almanac_repo.py` (loads + merges all
  `data/almanac/*.json`, mirroring how `tea_repo.py` merges the seed catalogue), a thin
  `services/almanac_service.py` (filtering, catalogue-node resolution for name/native
  script/family display), and two new routes on the existing `routers/tea.py`.
- Frontend: `stores/useTeaAlmanacStore.ts` (fetch + `loading`/`error`, mirrors
  `useTeaCatalogueStore.ts`), `pages/AlmanacPage.vue` (list + filters), `pages/
  AlmanacEntryDetailPage.vue` (detail), two routes, and a small link from `CabinetPage`'s header to
  reach it (an icon button beside the title — no new visual system, reuses the existing Yancha
  tokens from `tokens.ts`).

## Data model

### `AlmanacEntry`

```python
class BrewingParameters(BaseModel):
    leaf_grams: float | None = None
    water_temp_c: int | None = None
    steep_seconds: list[int] = Field(default_factory=list)  # ordered, one per infusion

class AlmanacEntry(BaseModel):
    catalogue_node_id: str                 # PK; must reference an existing leaf CatalogueNode
    country: str
    reading: str = ""
    summary: str
    brewing: BrewingParameters = Field(default_factory=BrewingParameters)
    source: Literal["seed", "user"] = "seed"
```

Deliberately does **not** carry `name`, `name_zh`/`name_ja`, or `default_origin` — those already
live on the linked `CatalogueNode` (see `backend/app/schemas/tea.py`) and resolving through the
link, rather than copying, is what keeps the catalogue the single source of truth for "what is this
tea called and how is it classified."

### `AlmanacEntryView`

What the API actually returns: the entry plus the fields resolved from its catalogue node, the same
`Model` + `...View(Model)` pattern `TeaView` already uses.

```python
class AlmanacEntryView(AlmanacEntry):
    name: str
    name_zh: str = ""
    default_origin: str = ""
```

### On-disk documents

```
backend/app/data/almanac/
  china.json
  japan.json
  taiwan.json
  vietnam.json
  kenya.json
  ...
```

Each file: a flat JSON array of `AlmanacEntry` objects. `country` inside each entry is redundant
with the filename in practice but kept on the model itself (not inferred from filename) so the
repo doesn't need path-based logic and a future user-authored entry (FR-25, not this round) isn't
forced to live in a per-country file.

The repository (`almanac_repo.py`) globs `data/almanac/*.json`, parses each into
`list[AlmanacEntry]`, and concatenates — same shape as `tea_repo.py`'s existing seed-catalogue
loader, just reading N files instead of one.

### Seed content (this implementation)

8–10 entries, chosen to span both countries and exercise the feature (search, filter, detail) —
exact picks made during implementation from teas whose catalogue nodes already exist (`longjing`,
`tieguanyin`, `da-hong-pao`, `sheng-puerh`, `sencha`, `gyokuro`, `matcha`, ...). No new catalogue
nodes are strictly required for the seed set, though the implementer may add one if a better
representative choice needs it.

## API

- `GET /api/tea/almanac?country=&q=` → `list[AlmanacEntryView]` (entry + resolved `name`,
  `name_zh`/`name_ja`, `default_origin` from the linked catalogue node). Flat list; the client
  doesn't need a tree here (unlike the catalogue), since browsing is by country/search, not by
  classification depth.
- `GET /api/tea/almanac/{catalogue_node_id}` → `AlmanacEntryView`, 404 if no entry exists for that
  node id.

Both routes follow the existing `routers/tea.py` conventions: `Depends(get_current_user)` (present
for consistency even though the Almanac isn't per-user data yet), stdlib exceptions translated to
HTTPException only here.

## Testing

- Backend (`test_almanac.py`): repo merges multiple seed files into one list; service filters by
  country and by search text; service resolves catalogue name/native script/origin correctly for
  an entry; router 404s for an unknown `catalogue_node_id`; router 200s with the expected shape.
- Frontend: `useTeaAlmanacStore.spec.ts` (loading/error, filter params reach the API call),
  `AlmanacPage.spec.ts` (renders list, empty state, filter interaction),
  `AlmanacEntryDetailPage.spec.ts` (renders summary + brewing + resolved catalogue fields).

## Content rollout plan (after this implementation ships)

Not part of the implementation plan — a separate, lighter effort once the feature exists, since it
needs no further code changes, only additions to `data/almanac/*.json` (and occasionally
`tea_catalogue.json` for a tea with no node yet).

Run as background research batches (one country/tier at a time, sequential — batches may all need
to add a catalogue node, and running them one at a time avoids two agents editing
`tea_catalogue.json` concurrently), in this order:

1. Well-known Chinese teas beyond the implementation's seed set (the catalogue already has ~40
   named-tea leaf nodes across all six Chinese classes plus Japanese greens and Taiwanese oolongs —
   most of "well-known China" already has a node waiting for its Almanac facts).
2. Regional/lesser-known Chinese teas (new catalogue nodes as needed).
3. Well-known Japanese teas beyond the seed set.
4. Regional/lesser-known Japanese teas.
5. Taiwan (oolong nodes already exist under `oolong.taiwanese`; add facts, add any missing named
   teas).
6. Vietnam.
7. African tea-producing countries (Kenya, Malawi, etc. — likely new nodes under `red.*`, since
   fully-oxidized African teas classify the same way Chinese red/black tea does).
8. Further regions as good material turns up.

Each batch: research facts, write directly to that country's JSON file (and add catalogue nodes as
needed), so the content never has to pass through the main conversation — keeping that context
clean is the explicit point of running it this way.

## Epics

- **Epic A — Almanac read feature.** Data model, seed loader, service, API, store, list page,
  detail page, nav entry, tests. This is the implementation plan's entire scope.
- **Epic B — Content rollout (post-implementation, not planned here).** The eight-step batch
  sequence above.
