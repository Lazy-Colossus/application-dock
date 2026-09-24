# Tea Cabinet — Design Spec

Date: 2026-09-24
App id: `tea`
Status: approved in brainstorming, pending implementation plan

## Problem

There is no record of what tea is on the shelf. A tea collection accumulates — a cake here, a
25g sample there, something a friend brought back from Fujian — and within a year the answers to
three ordinary questions are gone: *what do I actually have*, *where did this one come from*, and
*was it worth what I paid*. The information exists only on the bags, in a drawer, in Chinese.

The Cabinet is the inventory that answers those questions. It is the first slice of the tea app
and deliberately the foundation: the later features from the idea pool — the Gongfu Session Timer,
the Cha Xi Journal, the Almanac — all need a tea to point at, and building them first would mean
inventing that entity twice.

## Scope

**In scope (v1):**

- A per-user cabinet of teas with collector-grade fields: provenance, purchase, storage, notes.
- A shared catalogue tree (the Almanac's spine) classifying every tea from broad class to named
  tea, seeded in the repo and extensible by the user.
- A grouped shelf, a full detail page per tea, and editing grams without leaving the shelf.
- A per-tea "running low" threshold, shown on the rim gauge as a dashed fill and a threshold tick.

**Explicitly out of scope (v1), with the reason:**

- **Photos.** This codebase has no upload path at all — every app is pure JSON through
  `useApi.ts`. Photos mean a multipart endpoint, binary storage outside the `atomic_write_json`
  path, a serving route, validation and orphan cleanup: plausibly as much work as the rest of v1.
  Deferred so it can be designed once, as shared infrastructure the Cha Xi Journal also needs.
- **Session logging and auto-decrement.** Grams are edited by hand in v1. There is no usage log,
  no brewing history, no timer. The Session Timer will introduce sessions and *then* decrement.
- **Almanac content.** v1 builds and populates the taxonomy; it does not write the encyclopedia.
  Curated history, brewing parameters and origin mapping hang off these same nodes in their own
  spec, against a tree already validated by a real shelf.
- **Node renaming.** Nodes can be added and deleted (when unused), not renamed. Small to add later.
- **Sharing.** The cabinet is private per user, like every app here except Kalendariq.

**Deferred lifecycle decision:** a tea at 0g stays on the shelf. There is no archive state, no
"finished" view and no automatic removal — an empty tea is just a tea with `grams_remaining: 0`,
sorted to the bottom of its section. This was chosen over archiving to keep v1 to a single
lifecycle-free entity.

## Requirements

### Functional

- **FR-1** — A tea record holds: `name`, `catalogue_node_id`, `form`, `origin`, `vendor`, `year`,
  `harvest_season`, `cultivar`, `grams_purchased`, `grams_remaining`, `price_paid`,
  `purchase_date`, `storage_location`, `low_threshold_grams`, `notes`, plus server-set `id`,
  `created_at` and `updated_at`.
- **FR-2** — `name` and `catalogue_node_id` are the only required fields. Adding a tea must not be
  a form-filling chore; everything else can be filled in later or never.
- **FR-3** — Every tea is classified by linking to exactly one catalogue node, at whatever depth is
  true for it. Linking to a bare class (`oolong`) is as valid as linking to a named tea.
- **FR-4** — The catalogue is a tree of nodes with a `parent_id`, 1–3 levels deep in the seeded
  data and not depth-capped in the schema.
- **FR-5** — The seven top-level classes are the Chinese six plus a catch-all, in this fixed order:
  `green`, `yellow`, `white`, `oolong`, `red`, `dark`, `other`. `red` is what the West calls black
  tea; `dark` is heicha, with sheng and shu pu-erh, Liu Bao, Fu Zhuan and Liu An as its subtypes.
- **FR-6** — Seeded nodes ship in the repo and are read-only. The user can add their own nodes
  anywhere in the tree; they are stored in that user's own data and merged over the seed on read.
  A user node can never shadow, mutate or replace a seed node.
- **FR-7** — The user can add a node from within the picker, with the parent preset, without
  leaving the tea they are creating. A missing tea is three taps to add, not a reason to give up.
- **FR-8** — Deleting a catalogue node that teas are linked to is refused with an error naming how
  many teas use it. Deleting a seed node is refused. Deleting an unused user node succeeds.
- **FR-9** — On picking a node, `origin` is prefilled from the nearest ancestor (starting with the
  node itself) that carries a `default_origin`. Prefill writes only into a field the user has not
  typed in, and never fires twice for the same field. Prefilled values are freely editable.
- **FR-10** — The shelf groups teas into sections by their root class, in the FR-5 order. Sections
  with no teas are not rendered.
- **FR-11** — Within a section, teas sort by `name` A–Z, except that teas at `grams_remaining: 0`
  sort to the end of *their own section* — not to the end of the shelf. A class section remains
  the single place to look for that class.
- **FR-12** — A tea on the shelf shows the name (with `name_zh` when its node carries one), the
  catalogue path as a subtitle, and a **rim gauge**: a circular stroke drawn to
  `grams_remaining / grams_purchased` in the class's liquor colour, with the grams inside it. The
  gauge carries class and quantity together, so a tea needs no badge, chip or pill.
- **FR-13** — A tea is below its threshold when `low_threshold_grams` is set and
  `grams_remaining` is at or below it. A null threshold is never low.
- **FR-14** — Tapping a rim gauge on the shelf opens the grams sheet — minus, value, plus, Save —
  without navigating away. The change is optimistic and rolls back on failure. The same sheet is
  the only way grams change anywhere in the app.
- **FR-15** — Every other field is edited on the tea's own page at `/tea/:teaId`. Creating a tea
  happens at `/tea/new`.
- **FR-16** — Navigating away from a form with unsaved changes asks before discarding.
- **FR-17** — Price per gram is derived in the frontend as `price_paid / grams_purchased` and
  displayed only when both are present. It is never stored.
- **FR-18** — The app appears on the dock landing page as "Tea Cabinet" at `/tea`.

### Non-functional

- **NFR-1** — All persistence goes through `atomic_write_json`; no code outside
  `repositories/tea_repo.py` touches the filesystem for this app, including the seed catalogue read.
- **NFR-2** — Read-modify-write of a user's cabinet runs under `key_lock(username)`. Because
  approach A rewrites the whole document on every save, concurrent writes must not lose data.
- **NFR-3** — The username is validated as a bare filename before it is used in a path, so a
  crafted username can never escape the `users/` directory.
- **NFR-4** — Layering is strict: routers do HTTP and exception translation only, services hold
  rules and raise stdlib exceptions, repositories do I/O. No `HTTPException` outside the router.
- **NFR-5** — Both Pinia stores expose `loading` and `error`; every async action sets `loading` in
  a `try/finally` and routes failures into `error.value`. No bare `console.error`.
- **NFR-6** — The UI is usable one-handed on a phone. This gets used at the tea table.
- **NFR-7** — API contract as per the platform: snake_case fields, direct serialization with no
  envelope, ISO 8601 dates, errors as `{ detail }`.

### Architecture

- **AR-1** — Storage is one JSON file per user at `tea/users/{username}.json`, holding both the
  shelf and that user's own catalogue nodes in one document. Chosen over one-file-per-tea because
  the cabinet is a single-user document almost always loaded in full; per-tea files would buy
  concurrency isolation that is not needed while making the common operation — rendering the whole
  shelf — the expensive one. They live in one document because they are edited together: adding a
  node while creating the tea that prompted it is one user action and must be one atomic write.
- **AR-2** — Migration to per-tea files, if photos or a shared household cabinet ever demand it, is
  contained in the repository layer. This codebase already performs whole-directory data
  migrations (`kalendariq_repo`).
- **AR-3** — The seed catalogue is a version-controlled repo file, `app/data/tea_catalogue.json`,
  read once and cached at module level. It is immutable and ships with the image.
- **AR-4** — The catalogue is served flat with `parent_id`, not pre-nested. The client builds the
  tree once for the picker; the response stays trivially cacheable and the serializer stays dumb.
- **AR-5** — `TeaView` carries a server-resolved `class_id` (the tea's root ancestor) so the shelf
  never walks the tree to place a card, and classification cannot drift from grouping.

## Data model

### `CatalogueNode`

| Field | Type | Notes |
|---|---|---|
| `id` | `str` | Dotted slug path for seeds: `oolong`, `oolong.wuyi-yancha`, `oolong.wuyi-yancha.da-hong-pao`. Readable, stable, diffable in git. User nodes get `u-{hex8}`. |
| `parent_id` | `str \| None` | `None` for the seven classes. |
| `name` | `str` | Pinyin/English: "Da Hong Pao". |
| `name_zh` | `str` | Optional Chinese: 大紅袍. Cheap now, painful to retrofit. |
| `source` | `"seed" \| "user"` | Keeps user additions and seed data from ever clobbering each other. |
| `default_origin` | `str` | The v1 prefill payload. Empty on most nodes. |

### `Tea`

| Field | Type | Notes |
|---|---|---|
| `id` | `str` | `t-{hex8}`, server-minted. |
| `name` | `str` | Required, non-empty. |
| `catalogue_node_id` | `str` | Required; must resolve against the merged tree. |
| `form` | enum \| `None` | `loose`, `cake`, `brick`, `tuo`, `ball`, `other`. Optional, per FR-2; `None` until set. |
| `origin` | `str` | Free text — "Bulang, Menghai" does not decompose cleanly. |
| `vendor` | `str` | |
| `year` | `int \| None` | Harvest year; 1900 ≤ year ≤ next year. |
| `harvest_season` | `"spring" \| "summer" \| "autumn" \| "winter" \| None` | |
| `cultivar` | `str` | |
| `grams_purchased` | `float \| None` | `> 0` when present. Denominator for price per gram. |
| `grams_remaining` | `float` | `>= 0`, and `<= grams_purchased` when that is set. On create, defaults to `grams_purchased` when given, else `0`. |
| `price_paid` | `float \| None` | `>= 0`. Bare number — no currency field in v1. |
| `purchase_date` | `date \| None` | ISO 8601. |
| `storage_location` | `str` | |
| `low_threshold_grams` | `float \| None` | `>= 0`. Null means never low. |
| `notes` | `str` | Multiline. |
| `created_at` / `updated_at` | `datetime` | ISO 8601, server-set. |

### On-disk document

```json
{
  "schema_version": 1,
  "teas": [ ... ],
  "catalogue_nodes": [ ... ]
}
```

### Seeded catalogue (v1 content)

The seed ships the seven classes and the starter tree below. `default_origin` is set where it is
unambiguous (e.g. `oolong.wuyi-yancha.da-hong-pao` → "Wuyi Shan, Fujian"; `green.longjing` →
"Xihu, Zhejiang"; `oolong.anxi.tieguanyin` → "Anxi, Fujian").

- **green** — Longjing, Biluochun, Huangshan Maofeng, Taiping Houkui, Anji Baicha, Liu An Gua Pian;
  and *Japanese green* → Sencha, Gyokuro, Matcha, Hojicha, Genmaicha.
- **yellow** — Junshan Yinzhen, Huoshan Huangya.
- **white** — *Fuding* → Bai Hao Yinzhen, Bai Mudan, Shou Mei, Gong Mei.
- **oolong** — *Wuyi yancha* → Da Hong Pao, Rou Gui, Shui Xian, Tie Luohan, Bai Ji Guan, Shui Jin
  Gui; *Anxi* → Tieguanyin, Huang Jin Gui, Benshan; *Phoenix Dancong* → Mi Lan Xiang, Ya Shi Xiang,
  Zhi Lan Xiang; *Taiwanese* → Dong Ding, Alishan, Lishan, Oriental Beauty, Wenshan Baozhong.
- **red** — Zhengshan Xiaozhong (Lapsang Souchong), Jin Jun Mei, Dianhong, Qimen (Keemun).
- **dark** — Sheng pu-erh, Shu pu-erh, Liu Bao, Fu Zhuan, Liu An.
- **other** — a leaf with no children.

The raggedness is intentional and is why the tree is not a fixed three columns: Longjing hangs
straight off `green`, while Da Hong Pao sits two levels under `oolong`. Forcing a middle tier
would mean inventing filler subtypes for half the shelf.

## API

Router prefix `/api/tea`, matching the `shared-notes` shape.

```
GET    /api/tea/catalogue            → 200 list[CatalogueNodeView]   flat, seed+user merged
POST   /api/tea/catalogue            → 201 CatalogueNodeView         adds one user node
DELETE /api/tea/catalogue/{node_id}  → 204 | 409 in use | 400 seed node | 404 unknown

GET    /api/tea/teas                 → 200 list[TeaView]
POST   /api/tea/teas                 → 201 TeaView
GET    /api/tea/teas/{tea_id}        → 200 TeaView | 404
PUT    /api/tea/teas/{tea_id}        → 200 TeaView | 404   full replace, as notes do
DELETE /api/tea/teas/{tea_id}        → 204 | 404
```

Exception mapping, in the router and nowhere else: `FileNotFoundError` → 404, `ValueError` → 400,
`NodeInUseError` → 409.

## Backend structure

```
app/routers/tea.py                 HTTP + exception translation only
app/services/tea_service.py        shelf rules, validation, prefill resolution
app/services/tea_catalogue_service.py   merge, tree resolution, deletion guard
app/repositories/tea_repo.py       the only module touching disk
app/schemas/tea.py                 storage models + API views
app/data/tea_catalogue.json        seeded tree (repo file, not DATA_DIR)
```

Loading the seed is a file read, so it lives in `tea_repo.read_seed_catalogue()` — not in the
service that merges it. This is the layering rule most likely to be quietly violated.

`app/routers/shell.py` gains a `tea` entry in `_APPS`.

## Frontend structure

```
src/apps/tea/
├── types.ts                      Tea, CatalogueNode, TeaClass
├── catalogue.ts                  pure: buildTree, rootClassOf, pathOf, childrenOf
├── shelf.ts                      pure: groupByClass, sortSection, isLow, gaugeArc
├── composables/
│   └── useSectionInView.ts       which class owns its leaves while scrolling
├── stores/
│   ├── useTeaCabinetStore.ts     shelf CRUD; loading/error
│   └── useTeaCatalogueStore.ts   tree fetch + cache; add/delete node
├── components/
│   ├── TeaRow.vue                name, path and its rim gauge
│   ├── RimGauge.vue              proportion, threshold tick, dashed-when-low, empty state
│   ├── ClassLeaves.vue           the sinensis/assamica silhouettes behind a section
│   ├── ShelfSection.vue
│   ├── GramsSheet.vue            the stepper, opened from any rim
│   ├── TeaForm.vue               the field set, shared by both pages
│   ├── CataloguePicker.vue
│   └── AddNodeDialog.vue
└── pages/
    ├── CabinetPage.vue           /tea
    ├── NewTeaPage.vue            /tea/new
    └── TeaDetailPage.vue         /tea/:teaId
```

Two deliberate splits. The rules that are easy to get subtly wrong — tree walking, grouping, sort
order, the low test — live in `catalogue.ts` and `shelf.ts` as pure functions, unit-tested without
mounting anything. And create and detail are separate pages composing one `TeaForm`, rather than
one page branching on a null id; `/tea/new` cannot collide with an id because ids are `t-{hex8}`.

Registration: `{ id: "tea", label: "Tea Cabinet", icon: "emoji_food_beverage", route: "/tea" }` in
both `src/apps/registry.ts` and `_APPS`; routes lazy-loaded in `src/router/routes.ts`.

## Interaction design

**The shelf.** Sections in class order, empty sections hidden, teas sorted per FR-11. Scrolling
moves the leaves from one class to the next and nothing else animates. A fresh cabinet shows an
empty state rather than a bare page.

**Grams.** The recurring act is "I brewed 7g, knock it off". Making that a navigate → edit → save →
back round trip is four steps for a two-digit change, and an app that is annoying at the tea table
will not get used. Tapping any rim opens the grams sheet — minus, value, plus, Save, with a hint
stating where you started so a mis-tap is obvious before it commits. The store already holds the
full record from the list response, so the full-replace PUT costs nothing extra. The update is
optimistic and rolls back on failure.

**The picker.** Chips, not dropdowns: every option at a tier stays visible, so the taxonomy is
learned in passing rather than hunted through, and it is all one thumb. Tiers appear as you narrow
and stop when the tea has no deeper kinds. Every tier below the first ends with "+ Add one",
opening `AddNodeDialog` with the parent stated rather than asked for.

**Prefill.** Walk from the picked node up its ancestors, take the first `default_origin` found,
write it into `origin` only if untouched (FR-9). The picker's footer states what is about to be
filled in, and that it can be changed, before it happens. The payload is thin in v1 by design — it is the
seam the Almanac will widen into suggested brewing parameters and harvest windows.

## Visual direction

**Settled in the design session of 2026-09-24. The contracts are
[`DESIGN.md`](../../planning-artifacts/ux-designs/ux-tea-2026-09-24/DESIGN.md) (how it looks) and
[`EXPERIENCE.md`](../../planning-artifacts/ux-designs/ux-tea-2026-09-24/EXPERIENCE.md) (how it
works), with mockups beside them. Both win over this summary and over any mock.**

Identity: **Yancha**. The Cabinet is its own world, not the dock's Carbon theme — as Kalendariq and
Hotaru are. A warm **clay-black** ground (`#17120E`) with a faint fractal grain, the colour of
unglazed zisha rather than of a screen.

**Liquor is the only colour system.** A hue appears only because a tea makes that colour in the
cup: jade for green, straw for yellow, silver for white, amber for oolong, copper for red,
mahogany for dark. Those six classify, measure and illustrate. Interactive elements carry no hue at
all — a primary action is a bone fill with dark type — because the app's amber *is* oolong, and a
colour that also meant "button" would stop being a trustworthy class cue. The dock's gold is doubly
forbidden: it means interactive everywhere else and sits a few degrees from the oolong liquor.

Two serifs, no sans: **Newsreader** for all Latin, **Noto Serif SC** for Chinese, which is always
present and always secondary to the Latin name beside it.

The interface has one instrument, the **rim gauge** — a cup seen from above whose stroke is drawn
round to how much leaf is left, in its class's liquor, with the grams inside. It carries class and
quantity together, which is why nothing on the shelf is badged. Below the low threshold its fill
goes dashed, and a tick outside the rim marks where the threshold sits, so you see how far past the
line a tea has gone. With no `grams_purchased` the proportion is unknowable and the ring is drawn
unbroken rather than implying a full vessel.

Behind each class sit the **leaves of the plant it comes from** — narrow *sinensis*, or broad
*assamica* for the dark teas, because that is genuinely the plant pu-erh is made from. Flat
silhouettes, two or three per section, bleeding off the edge, never contained. The section nearest
42% of the viewport draws them at full strength; the rest rest at 14%, crossfading over 0.85s as
you scroll, and not at all under `prefers-reduced-motion`.

Nothing is a box: no card borders, no outlines, no shadows except on sheets. Structure comes from
the leaves, the space and the alignment. Mobile-first and one-handed throughout — the gauge is a
44px target and *is* the tap target for editing grams.

**This supersedes the pre-session direction, which had the app inheriting Carbon and forbade
colour-coding by class.** Both were wrong: the app deserves its own world like its siblings, and
liquor colours are not decoration but the tea's own identity, muted and ordered by a classification
that already exists.

## Testing

Backend tests in `backend/tests/` as `test_tea_*.py`, each with an autouse fixture doing
`monkeypatch.setattr(repo.settings, "data_dir", tmp_path)`; `conftest.py` already bypasses auth to
`test_user`. Frontend specs co-located. TDD throughout: test first, watch it fail, then implement.

| File | Covers |
|---|---|
| `test_tea_repo.py` | Round trip through the per-user file; an absent file reads as an empty cabinet without creating anything; teas and user nodes persist together; unsafe usernames rejected before becoming a path. |
| `test_tea_catalogue.py` | Seed loads and parses; user nodes merge over seed; a user node cannot shadow or mutate a seed node; root-class resolution at every depth; `NodeInUseError` on a node with teas; seed-node delete refused; unused user-node delete succeeds. |
| `test_tea_service.py` | Each validation rule as its own case — empty name, unresolvable node id, negatives, `year` bounds, `grams_remaining > grams_purchased`. Prefill: nearest ancestor wins, walks past nodes with none, yields nothing when no ancestor has one. |
| `test_tea_api.py` | CRUD round trip through the router; 201/204 codes; 404 unknown id, 400 bad payload, 409 in-use node delete. |
| `test_tea_concurrency.py` | Interleaved writes to one cabinet lose nothing, mirroring `test_context_switch_concurrency.py`. This is the test that earns AR-1. |
| `test_app_registry_parity.py` | Already exists; fails until both registries list `tea`. |
| `catalogue.spec.ts` | Tree building from the flat list, path rendering, ancestor walking, children lookup. |
| `shelf.spec.ts` | Fixed class order; empty sections omitted; name A–Z; 0g last *within its section*; `isLow` at, above and below threshold; null threshold never low. |
| `useTeaCabinetStore.spec.ts` | `loading` set and cleared on failure; `ApiError.detail` lands in `error.value`; optimistic grams edit rolls back on rejection. |
| `useTeaCatalogueStore.spec.ts` | Tree fetched once and cached; a newly added node is immediately pickable without a refetch. |
| `CataloguePicker.spec.ts` | A level appears only when the parent has children; "Add new…" emits the right parent; prefill fills an untouched `origin` and refuses to overwrite a typed one. |
| `RimGauge.spec.ts` | Arc length from proportion; dashed fill below threshold; tick at the threshold angle; unbroken track when `grams_purchased` is null; empty state at 0g. |
| `TeaRow.spec.ts` | Name, Chinese and path rendering; the row opens the grams sheet when its gauge is tapped. |
| `GramsSheet.spec.ts` | Steps by 1g; refuses more than `grams_purchased` with the stated message; optimistic commit rolls back on rejection. |
| `CabinetPage.spec.ts` | Empty state; sections in order; spinner while loading; banner on error. |

Two things deliberately not tested: Quasar's own components, and the seed catalogue's *content* — a
test asserting Da Hong Pao sits under Wuyi yancha would restate the data file and need editing
every time the seed grows. The seed is validated structurally instead: every `parent_id` resolves,
ids are unique, every root is one of the seven classes. That catches the failure that matters — a
typo'd parent orphaning a branch.

## Epics

Proposed shape — the authoritative breakdown will be generated into
`docs/planning-artifacts/epics-tea.md`, with stories under `docs/stories/tea/`.

- **Epic 1 — Foundation & the catalogue:** register the app in both registries and the router;
  the per-user document, schemas and repository with locking (NFR-1, NFR-2, AR-1); the seeded
  catalogue file and its structural validation; merge, tree resolution and the deletion guard;
  the catalogue endpoints.
- **Epic 2 — The tea record:** tea CRUD across router, service and repository; every validation
  rule; prefill resolution (FR-9); `class_id` resolution on the view (AR-5).
- **Epic 3 — The shelf:** `catalogue.ts` and `shelf.ts`; both stores; `RimGauge`, `TeaRow`,
  `ClassLeaves`, `ShelfSection` and `CabinetPage` with grouping, ordering, leaf ghosting, empty and
  error states.
- **Epic 4 — Adding and editing:** `TeaForm`, `CataloguePicker`, `AddNodeDialog`, `NewTeaPage`,
  `TeaDetailPage`, the dirty-state guard, and `GramsSheet` opened from any rim (FR-14).

Epic 2 depends on Epic 1 (a tea cannot validate its node without the tree). Epic 3 depends on
Epic 2. Epic 4 depends on Epic 3. No epic depends on a later one.
