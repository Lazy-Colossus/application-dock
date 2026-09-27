# Teaware Cabinet — Design Spec

Date: 2026-09-27
App id: `tea`
Status: approved in brainstorming, pending implementation plan

## Problem

The tea app knows every tea on the shelf but nothing about the ware it is brewed in. The user
can't look up what they own (which pot is the 120 ml zhuni?), and sessions don't record the
vessel, so "last time in this gaiwan I used 7 g" is lost, and nobody can tell whether a pot
dedicated to one kind of tea is drifting off it.

## Intent

User's answers: **inventory** and **brewing aid** matter most; pot dedication is secondary.

- **Inventory:** a shelf of every piece of ware — photo, type, material, volume, maker,
  origin, when it was bought and for how much.
- **Brewing aid:** a session records the vessel it was brewed in, prefilled with the one you
  last used for that tea, so a tea's history shows the vessel beside the grams.
- **Dedication (light):** a porous pot can be dedicated to part of the tea tree, and its page
  flags sessions that were off-dedication.

Success: every pot the user owns is on the shelf, and most sessions record a vessel without
the user tapping anything.

## Scope

**In scope:**

- Teaware items stored in the cabinet document (so a shared cabinet shares its ware).
- Shelf at `/tea/ware` grouped by type, filters, add/edit/retire/delete, photos.
- `teaware_id` + server-filled `vessel_volume_ml` on sessions.
- Vessel picker in the timer bar, prefilled from the caller's last-used vessel.
- Per-item usage worked out from sessions, with an off-dedication count.
- Vessel shown on a tea's session rows.

**Out of scope:**

- Scaling suggested grams by vessel volume (volume is stored so it can come later).
- A stored Seasoning Log (usage is derived from sessions instead).
- Pitchers and cups attached to sessions (arrives with the Cha Xi Journal).
- A top-level navigation screen for the tea app (planned separately by the user).

## Relationship to the Tea PRD

PRD: [`prd-tea-2026-09-06/prd.md`](../../planning-artifacts/prds/prd-tea-2026-09-06/prd.md)
§4.2, FR-6–FR-8. **Where they disagree, this spec wins:**

- **Material list** (FR-6): porcelain / yixing / glass / other becomes
  **porcelain / clay / stoneware / glass / other**. Kyusu are usually Tokoname or Banko clay,
  and chawan are often stoneware; the specific place goes in `origin`.
- **Seasoning Log** (FR-7): not stored. The item's page derives its sessions from the
  sessions that name it, and flags those whose tea is outside the dedicated part of the
  catalogue tree. Nothing extra can drift out of sync.
- **Dedication** (FR-7 consequence): the pot names a catalogue node, not a free-text family.
- **Archive** (FR-6) is called **Retire** and can be undone. A hard delete also exists.

## Requirements

### Functional

- **TW-1** The user can add, edit, retire, bring back and delete a teaware item. Only `name`
  and `type` are required.
- **TW-2** The shelf groups non-retired items by type in the fixed order gaiwan, pot, kyusu,
  chawan, pitcher, cup, other; empty types are hidden. Filters: type, material, volume range,
  show retired.
- **TW-3** A porous item may be dedicated to a catalogue node. Its page shows the total
  number of finished sessions in it and how many were off-dedication (the tea's node is not
  the dedicated node or a descendant).
- **TW-4** A session may name a brewing vessel (gaiwan, pot, kyusu, chawan, other) that is
  not retired. The server copies the item's volume into the session while it is in progress;
  it is frozen once finished.
- **TW-5** The timer prefills the vessel: the caller's most recent vessel for this tea, else
  their most recent vessel for any tea, skipping retired and non-brewing items. A manual pick
  always wins.
- **TW-6** Deleting an item clears it from its sessions (keeping their stored volume) and
  never deletes a session. Retiring hides it from the shelf and the picker only.
- **TW-7** A tea's session rows show the vessel ("· Zhuni shuiping 110 ml", or
  "· 110 ml, vessel removed").
- **TW-8** A custom catalogue node cannot be deleted while teaware is dedicated to it.

### Non-functional

- **NFR-a** Teaware lives in the cabinet document; every write is one `doc_transaction`.
- **NFR-b** A household member sees and edits the cabinet's teaware like its teas; the
  last-used prefill is personal (the caller's own sessions only).
- **NFR-c** Existing cabinets and saved live timers keep working: schema v4 adds an empty
  list, and a saved live session without a vessel still loads.

## Data model

### `Teaware` (new, in `TeaDoc.teaware`)

| Field | Type | Notes |
|---|---|---|
| `id` | str | `w-` + 8 hex, like tea ids (`t-…`) |
| `name` | str | required, trimmed, non-empty |
| `type` | `gaiwan \| pot \| kyusu \| chawan \| pitcher \| cup \| other` | required |
| `material` | `porcelain \| clay \| stoneware \| glass \| other \| null` | |
| `volume_ml` | int > 0 \| null | |
| `porous` | bool | default `false` |
| `dedicated_node_id` | str \| null | must exist in the merged catalogue; only when `porous` |
| `maker` | str | default "" |
| `origin` | str | default "" |
| `acquired_date` | ISO date \| null | |
| `price_paid` | float ≥ 0 \| null | |
| `notes` | str | default "" |
| `image_url` | str \| null | server-set on upload |
| `retired_at` | ISO timestamp \| null | set = retired |
| `created_at`, `updated_at` | ISO timestamp | server-owned |

`TeawareWriteRequest` is the same minus `id`, `image_url`, `retired_at`, `created_at`,
`updated_at`, plus `retired: bool` (the server sets or clears `retired_at` when it changes).

Brewing types: `gaiwan`, `pot`, `kyusu`, `chawan`, `other`.

### `TeaSessionWrite` / `TeaSession` (changed)

| Field | Where | Notes |
|---|---|---|
| `teaware_id: str \| None` | write body | chosen by the phone |
| `vessel_volume_ml: int \| None` | `TeaSession` only | server-owned: copied from the item on every in-progress write; frozen when finalised; kept when the item is deleted |

### `TeaDoc` (changed — schema v4)

`teaware: list[Teaware]` added. `migrate()` v3 → v4 adds `teaware: []`; older sessions have
no vessel. Legacy v1/v2 files continue through v3 to v4.

### Photos

Stored with the existing cabinet image functions under `images/{cabinet_id}/` keyed by the
item id (`w-…` cannot collide with `t-…`). Served at `GET /api/tea/teaware/{id}/image?token=`.

## Services

`tea_teaware_service.py` — resolves the caller's cabinet through `tea_cabinet_service`
(never inside a `doc_transaction`), raises `ValueError` / `FileNotFoundError`.

- `list_teaware`, `get_teaware`, `create_teaware`, `replace_teaware`, `delete_teaware`,
  `save_image`, `delete_image`, `image_path`.
- `usage(username, teaware_id) -> TeawareUsage { sessions, total, off_dedication }` —
  finished sessions naming the item, newest first; `off_dedication` counts sessions whose
  tea's node is outside the dedicated subtree (sessions whose tea node cannot be resolved are
  not counted); 0 when not dedicated.
- `last_used(username, tea_id | None) -> Teaware | None` — per TW-5.
- **Delete** removes the item and its photo and sets `teaware_id = None` on every session
  that named it, in one transaction.

Changes elsewhere:

- `tea_session_service.upsert`: if `teaware_id` is set it must exist, be a brewing type and
  not be retired (`ValueError` → 422); while in progress, `vessel_volume_ml` = the item's
  `volume_ml`; a finalised session keeps what it had.
- `tea_catalogue_service.delete_node`: `NodeInUseError` also when teaware is dedicated to the
  node.

## API

All under `/api/tea`, inheriting the router's 410 stale-cabinet handling.

| Route | Returns |
|---|---|
| `GET /teaware` | `list[Teaware]` (retired included) |
| `POST /teaware` | `Teaware`, 201 |
| `GET /teaware/{id}` | `Teaware` |
| `PUT /teaware/{id}` | `Teaware` |
| `DELETE /teaware/{id}` | 204 |
| `POST /teaware/{id}/image` | `Teaware`, 201 |
| `GET /teaware/{id}/image?token=` | image file |
| `DELETE /teaware/{id}/image` | `Teaware` |
| `GET /teaware/{id}/usage` | `TeawareUsage` |
| `GET /teaware/last-used?tea_id=` | `Teaware \| null` (declared before `/teaware/{id}`) |

Errors: `FileNotFoundError` → 404, `ValueError` → 422, `NodeInUseError` → 409 (unchanged).

## Frontend

### Routes

`tea/ware` (`tea-ware`), `tea/ware/new` (`tea-ware-new`), `tea/ware/:wareId`
(`tea-ware-detail`) — registered **before** `tea/:teaId`. A "Ware" button in the Cabinet
header opens `/tea/ware`.

### Units

- `stores/useTeawareStore.ts` — `items`, `loading`, `saving`, `error`; `fetchItems`,
  `createItem`, `replaceItem`, `deleteItem`, `uploadImage`, `removeImage`, `fetchUsage(id)`,
  `lastUsed(teaId)`.
- `stores/useTeawareFiltersStore.ts` — type, material, volume min/max, show retired.
- `ware.ts` — pure helpers: section grouping in type order, filter matching, brewing-type
  check, vessel label for a session row.
- `components/WareSection.vue`, `components/WareCard.vue` — the tea shelf's strip layout
  with ware content (photo or type glyph, name, "110 ml · clay").
- `components/WareFilters.vue`, `components/WareForm.vue` (dedication via `CataloguePicker`,
  shown only when porous), `components/PickVesselSheet.vue` (non-retired brewing vessels).
- `pages/WareCabinetPage.vue`, `pages/NewWarePage.vue`, `pages/WareDetailPage.vue` (read-only
  view, edit toggle, photo, Retire / Bring back, delete confirmation naming the session
  count, usage summary and list).
- Timer: `LiveSession.teaware?: { id, name, volume_ml } | null` (optional, so saved sessions
  still hydrate); a vessel button in the timer bar; prefill from `lastUsed` when a tea is
  attached or when the timer opens with no vessel; snapshot sends `teaware_id`.
- `TeaSessionsList.vue` — vessel label per row (per TW-7).

## Testing

**Backend:** v4 migration (v3 and legacy); each validation refusal; retire / bring back;
delete clears sessions without deleting any; node-delete guard; session vessel validation and
volume copy/freeze; usage counts with descendant nodes; last-used ordering, personal scope,
skipping retired and non-brewing; API status codes, photo via `?token=`, a household member
seeing the owner's teaware.

**Frontend:** store actions and errors; shelf sections in type order and filters; form's
porous-only dedication; detail usage and delete confirmation; vessel picker listing brewing
vessels only; timer prefill, manual override, hydrating an old saved session, snapshot
`teaware_id`; session-row vessel labels including "vessel removed".

## Docs

Update the PRD §4.2 (FR-6–FR-8) to point at this spec and record the material list and the
derived-usage decision.

## Epics

- **Epic A — Teaware Cabinet.** Everything above. This is the implementation plan's entire
  scope.
