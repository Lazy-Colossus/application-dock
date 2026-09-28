# ISS Vanguard Resource Tracker — Design Spec

Date: 2026-09-28
App id: `iss-vanguard`
Status: approved in brainstorming, pending implementation plan

## Problem

ISS Vanguard (Awaken Realms) is a cooperative campaign board game. Between missions the crew
spends gathered resources on ship projects, and keeping track of what is aboard, what each project
costs and what is still missing is fiddly table bookkeeping. The idea pool
(`docs/stories/iss-vanguard/idea-pool.md`) names two v1 features — a Ship Phase walkthrough and a
resource tracker. They are independent; this spec covers the **resource tracker only**. It is also
the first ISS Vanguard work, so it creates the app itself.

## Intent

Keep the ship's resource bookkeeping off the table so play flows. Several players at the table,
each on their own phone, see and edit the same ship live.

Success: a crew shares one ship; tapping a count on any phone shows on every other phone within
about a second; at a glance the crew sees what each project still lacks.

## Scope

**In scope:**

- New dock app `iss-vanguard` (registry card, route, backend router, story folder already exists).
- The 5 × 3 resource grid, fixed: 5 resources, each in 3 quality tiers.
- On-ship stock, adjusted one step at a time.
- Projects with a free-text code (e.g. `VB07`), a name, an optional prerequisite project and a cost
  on the same grid; complete (deducts cost) and reopen (restores cost).
- Three tabs: On ship · Needed · Difference, with a per-project shortfall list.
- Shared ships: one ship per person, owner adds members; live push via SSE.

**Out of scope:**

- Ship Phase walkthrough (its own spec later).
- Several ships/campaigns per person, ship switcher.
- History, undo beyond reopening a project.
- Enforcing prerequisites — they are a reminder only; the game enforces its own rules.
- Seeded project catalogue — the crew enters projects as the campaign introduces them.
- Ownership transfer, invitations that need accepting, read-only members.
- Localising the UI — chrome is English; only resource and tier names are Slovak.

## Requirements

### Functional

- **RT-1** A user with no ship sees an implicit empty ship they own; the first write creates it.
- **RT-2** Any member can change any stock cell by +1 or −1. A change that would take a cell below
  0 is refused.
- **RT-3** Any member can create, edit and delete projects. A project has a code (required,
  free text), a name (optional), an optional prerequisite (another project on the same ship, not
  itself) and a cost (whole numbers ≥ 0 per cell).
- **RT-4** Completing a project deducts its cost from stock, clamping each cell at 0, and marks it
  done. The UI warns first when stock is short, naming the shortfall.
- **RT-5** Reopening a done project adds its cost back to stock and marks it not done.
- **RT-6** Deleting a project clears any prerequisite that pointed at it.
- **RT-7** Needed = the sum of costs of not-done projects. Difference = stock − Needed, per cell.
- **RT-8** The Difference tab lists every not-done project that stock alone cannot cover, with
  its per-cell shortfall `max(0, cost − stock)`. Each project is measured against the whole
  stock independently; stock is not allocated between projects.
- **RT-9** The owner can add a dock user as a member. Refused when the name is not in the roster,
  is already a member, is on another ship that has other members, or owns a non-empty ship (any
  non-zero stock or any project).
- **RT-10** A member can leave; the owner can remove any member; the owner cannot leave while other
  members remain. A leaver starts with a fresh empty ship.
- **RT-11** Every write is pushed live to the ship's other open clients.

### Non-functional

- **NFR-a** Concurrent stock taps from different clients never lose an update: the client sends a
  delta and the server applies it under the ship's lock.
- **NFR-b** Membership has a single source of truth; no change can leave it inconsistent.
- **NFR-c** Single uvicorn worker, as the platform already assumes for SSE (`app.core.events`).

## Fixed vocabulary

Defined once in the backend (`app/schemas/iss_vanguard.py`, as `Literal` types) and once in the
frontend (`src/apps/iss-vanguard/resources.ts`, ids → display names). The order below is the
display order.

| Resource id | Display name |
|---|---|
| `microorganisms` | Mikroorganizmy |
| `alien_technologies` | Mimozemské technológie |
| `minerals` | Minerály |
| `strange_flora` | Podivná flóra |
| `living_specimens` | Živé exempláre |

| Tier id | Display name |
|---|---|
| `basic` | Základný |
| `rare` | Vzácny |
| `very_rare` | Veľmi vzácny |

A **grid** is `dict[resource, dict[tier, int]]`, always complete (all 15 cells present; missing
cells in a request are treated as 0 and normalised on write).

## Data model

### Files under `DATA_DIR/iss-vanguard/`

```
ships/{ship_id}.json     one per ship
memberships.json         { username: ship_id }  — the single source of truth for membership
```

### `ShipDoc`

```
id: str                  uuid4 hex
owner: str
members: list[str]       includes the owner; derived from memberships.json on write
rev: int                 +1 on every write
stock: Grid
projects: list[Project]  creation order
```

### `Project`

```
id: str                  uuid4 hex, server-generated
code: str                non-blank after strip, e.g. "VB07"
name: str                may be empty
prerequisite_id: str | None
cost: Grid               every cell ≥ 0
done: bool
```

## Repository (`app/repositories/iss_vanguard_repo.py`)

Mirrors `tea_repo.py`: `read_doc`, `write_doc` (via the shared atomic write), `doc_transaction`
(read-modify-write under `key_lock` on the ship file; nothing is written if the block raises),
`new_ship(owner)`, `delete_ship`, `membership_lock`, `read_memberships`, `write_memberships`.
**Lock order is always membership, then ship.** Ship ids are validated as hex before touching a
path.

## Service (`app/services/iss_vanguard_service.py`)

Raises `FileNotFoundError` (unknown project), `ValueError` (invalid input, below-zero stock,
completing a done project, reopening a not-done one, membership rule broken). No HTTP.

- `get_ship(user)` — the caller's ship, or an unsaved empty one they own.
- `adjust_stock(user, resource, tier, delta)` — `delta` ∈ {−1, +1}.
- `create_project`, `update_project`, `delete_project` — validate code, cost and prerequisite
  (must exist on this ship and not be the project itself); delete clears dangling prerequisites.
- `complete_project`, `reopen_project` — RT-4, RT-5, in one transaction with the stock change.
- `add_member`, `remove_member` — RT-9, RT-10, under the membership lock.
- After each successful write, publish to `iss_vanguard_events` (below).

Every function resolves the ship from the caller's username; no request names a ship id, so there
is no path to a ship the caller is not on.

## API (`app/routers/iss_vanguard.py`, prefix `/api/iss-vanguard`)

Mapping here and nowhere below: `FileNotFoundError → 404`, `ValueError → 422`. Every write returns
the full updated `ShipView`.

| Method & path | Body | Does |
|---|---|---|
| `GET /ship` | — | The caller's ship (RT-1). |
| `POST /ship/stock` | `{resource, tier, delta}` | RT-2. |
| `POST /ship/projects` | `{code, name, prerequisite_id, cost}` | RT-3. |
| `PUT /ship/projects/{id}` | same | RT-3. |
| `DELETE /ship/projects/{id}` | — | RT-6. |
| `POST /ship/projects/{id}/complete` | — | RT-4. |
| `POST /ship/projects/{id}/reopen` | — | RT-5. |
| `POST /ship/members` | `{username}` | RT-9. |
| `DELETE /ship/members/{username}` | — | RT-10 (self = leave). |
| `GET /ship/events?token=` | — | SSE stream. |

`ShipView` = `ShipDoc` fields as snake_case JSON, no envelope.

Register the router in `app/main.py` and add `iss-vanguard` to `_APPS` in `app/routers/shell.py`.

## Live updates

- `app/services/iss_vanguard_events.py`: an `EventBus("iss-vanguard")` keyed by ship id, with the
  same module-level aliases as `shared_notes_events.py`.
- The events route authenticates with `user_from_token(token)` and subscribes to the caller's
  ship, reusing the `sse_frames` pattern from `routers/shared_notes.py`.
- Events carry no data beyond what decides a refetch:
  - `ship.changed {ship_id, rev, actor}` — after any stock or project write.
  - `members.changed {ship_id, members}` — after add/remove/leave.
  - `ship.closed {ship_id, reason: "removed", member}` — to the ship a member left or was removed
    from; the named member's client reloads its (new, empty) ship and resubscribes.
- A client ignores `ship.changed` whose `actor` is itself or whose `rev` is not newer than its own.

## Frontend (`src/apps/iss-vanguard/`)

### Units

- `resources.ts` — resource and tier ids and Slovak display names, in display order.
- `types.ts` — `Grid`, `Project`, `Ship`, request shapes.
- `shipMath.ts` — pure functions: `needed(ship)`, `diff(ship)`, `perProjectShortfall(ship)`,
  `completionShortfall(ship, project)`.
- `stores/useShipStore.ts` — Pinia; `ship`, `loading`, `error`; actions for each API call, all via
  `useApi`, each setting `loading` in `try/finally` and routing errors into `error`. Getters wrap
  `shipMath`.
- `composables/useShipEvents.ts` — the `EventSource` wrapper, modelled on `useNoteEvents.ts`; the
  only file here that touches `EventSource`.
- `components/ResourceGrid.vue` — 5 rows × 3 columns. Props `grid`, `mode: "edit" | "readonly" |
  "diff"`; emits `cell-tap`. `diff` mode shows signed values: red < 0, green > 0, dim 0.
- `components/StockStepper.vue` — the tap prompt: resource + tier name, current count large, big
  − / + buttons, stays open for repeated taps; − disabled at 0.
- `components/ProjectEditor.vue` — dialog: code, name, prerequisite select (other projects), a
  `ResourceGrid` in `edit` mode over a local draft; Save sends one create/update.
- `components/ProjectList.vue` — rows of code · name · prerequisite chip ("needs VB03", greyed when
  that project is done) · menu (Edit, Complete/Reopen, Delete); done projects in a collapsed
  "Completed" section.
- `components/CrewSheet.vue` — members list, add by username, remove, leave; modelled on Tea's
  `tea/components/HouseholdSheet.vue`.
- `pages/ShipPage.vue` — header with "Crew" button; tabs **On ship** (`ResourceGrid` edit +
  `StockStepper`), **Needed** (`ResourceGrid` readonly + `ProjectList` + "Add project"),
  **Difference** (`ResourceGrid` diff + "Short per project" list, or "All projects covered").
  Starts the event stream on mount, stops it on unmount.

The stepper shows the server's value: each tap awaits the response, no optimistic update.

The Complete confirmation reads "Deduct cost from ship?" and, when `completionShortfall` is
non-empty, adds "Stock is short by … — those counts will stop at 0."

### Shell wiring

- `src/apps/registry.ts`: `{ id: "iss-vanguard", label: "ISS Vanguard", icon: "rocket_launch",
  route: "/iss-vanguard" }`.
- `src/router/routes.ts`: lazy route to `ShipPage.vue`.

## Error handling

- Every failed action lands in the store's `error` and shows as a banner with the server's `detail`.
- A rejected stock tap (e.g. a partner's tap already took the cell to 0) additionally refetches the
  ship so the grid reconverges.
- A dropped event stream reconnects; the next fetch carries the current `rev`, so nothing is missed.

## Testing

### Backend (`backend/tests/`)

- `test_iss_vanguard_service.py` — implicit empty ship; stock ±1 and the below-zero refusal;
  project validation (blank code, negative cost, self or unknown prerequisite); complete with
  enough stock, complete with clamping, complete twice refused; reopen restores and is refused when
  not done; delete clears dangling prerequisites.
- `test_iss_vanguard_concurrency.py` — many threads each applying +1 to the same cell end at the
  exact total.
- `test_iss_vanguard_members.py` — the RT-9 / RT-10 rules, modelled on `test_tea_cabinets.py`.
- `test_iss_vanguard_router.py` — status codes per error, full `ShipView` returned on writes,
  events published on writes, events route rejects a bad token.

### Frontend (co-located `*.spec.ts`)

- `shipMath.spec.ts` — needed, diff, per-project shortfall, completion shortfall.
- `ResourceGrid.spec.ts` — each mode renders and colours correctly; `cell-tap` emitted in edit.
- `stores/useShipStore.spec.ts` — each action, `loading` / `error` handling, refetch on rejected tap.
- `pages/ShipPage.spec.ts` — tabs, stepper flow, complete confirmation with and without shortfall.
- `registry.spec.ts` — updated for the new entry.

## Stories

Add the stories that implement this spec under `docs/stories/iss-vanguard/` as Draft, moving
through `for-review/` and `done/` per CLAUDE.md.
