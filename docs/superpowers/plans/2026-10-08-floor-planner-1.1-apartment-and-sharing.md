# Floor Planner 1.1 — Apartment and Sharing: Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Work task by task.
> Run the task's tests, then commit.

**Goal:** Add the `floor-planner` dock app. It has one apartment document per sharing group, the
ISS Vanguard membership rules, rev-checked writes (lock and unlock are the first two), and design
B's empty frame.

**Architecture:** Each apartment is one JSON document, and a `memberships.json` map records who
belongs to which apartment. This mirrors `iss_vanguard_repo.py` / `iss_vanguard_service.py`,
**without SSE**. Every write to an apartment document carries `base_rev` and is refused with
`StaleRevError` (409) if the stored `rev` has moved on.

**Spec:** `docs/superpowers/specs/2026-10-08-floor-planner-design.md`
**Story:** `docs/stories/floor-planner/1.1.apartment-and-sharing.story.md`

## Global Constraints

- Branch: `feat/floor-planner-app`. End every commit message with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend layering is strict: router → service → repository. Only the repository touches the
  filesystem, all writes go through `app.core.storage.atomic_write_json`, and only the router
  raises `HTTPException`. Code must pass `black` and `ruff` at line length 100.
- Frontend HTTP goes only through `src/composables/useApi.ts`. The store exposes `loading` and
  `error`, and sets `loading` in `try/finally`. Use `<script setup lang="ts">`, never `any`, and
  the generic `defineProps<{}>()` syntax.
- App card: id `floor-planner`, label `Floor Planner`, icon `square_foot`, route
  `/floor-planner`. The icon must be identical in `registry.ts` and `shell.py`.
- Comments are minimal: only the non-obvious *why*.

## Refinements to the spec (decided while planning)

- **Lock and unlock move into 1.1.** They are the simplest real writes to the apartment document,
  so they prove the `base_rev` / 409 path end to end, and design B's top bar already has the
  button. Refusing to paint on a locked plan stays in 1.2. Story 1.1 has been updated to match.
- `members` is **derived on read** from `memberships.json` and never stored in the document,
  exactly as in ISS Vanguard (NFR-b).
- The document stores `updated_by` (the username of the last writer), so a 409 can say who made
  the change: "dani changed this". The view does not expose it.
- Errors: `PermissionError` maps to 403 (a non-owner adds or removes someone) and
  `ApartmentGoneError` maps to 410 "Your apartment changed — reload". Both follow ISS Vanguard.
- A new apartment's first layout gets a fresh `l_<hex>` id. Until the first write, the view of the
  implicit (unsaved) apartment shows a throwaway layout id. Nothing in 1.1 uses layout ids, and
  1.4's arranging needs a locked plan, which means a write has already happened.
- An apartment counts as "non-empty" for SH-1 when it has any furniture, any labels, or any
  painted square. A lock or unlock on its own leaves it empty.
- Fonts are IBM Plex Sans (400/500/600) and IBM Plex Mono (500). They are self-hosted as latin
  `woff2` files under `src/apps/floor-planner/css/fonts/`, following KitchenCraft, and are loaded
  only by the app's own sass.

## File Structure

**Backend (create):** `app/schemas/floor_planner.py`, `app/repositories/floor_planner_repo.py`,
`app/services/floor_planner_service.py`, `app/routers/floor_planner.py`,
`tests/test_floor_planner_service.py`, `tests/test_floor_planner_members.py`,
`tests/test_floor_planner_router.py`.

**Backend (modify):** `app/main.py`, `app/routers/shell.py`, `tests/test_shell.py`.

**Frontend (create, under `src/apps/floor-planner/`):** `types.ts`,
`stores/useFloorPlanStore.ts` (+ spec), `components/MembersDialog.vue` (+ spec),
`pages/PlanPage.vue` (+ spec), `css/floor-planner.sass`, `css/fonts/*.woff2`.

**Frontend (modify):** `src/apps/registry.ts` (+ `registry.spec.ts`), `src/router/routes.ts`,
`src/layouts/MainLayout.vue`.

**Docs:** `docs/stories/floor-planner/` (already created).

---

### Task 1: Schemas

**Files:** create `backend/app/schemas/floor_planner.py`.

- [ ] Write the models. The furniture and layout fields are the spec's data model, unvalidated
  for now. Stories 1.3 and 1.4 add their rules.

```python
"""Floor Planner models: one apartment document per sharing group."""

from __future__ import annotations

import uuid
from typing import Literal

from pydantic import BaseModel, Field

DEFAULT_COLS = 50
DEFAULT_ROWS = 40
EMPTY_CELL = ".."

Shape = Literal["rectangle", "round", "oval", "egg", "custom"]
Colour = Literal[
    "white", "black", "grey", "beige", "brown", "red", "orange", "yellow", "green", "blue", "purple"
]
Rotation = Literal[0, 90, 180, 270]


def empty_rows(cols: int, rows: int) -> list[str]:
    return [EMPTY_CELL * cols for _ in range(rows)]


class Label(BaseModel):
    id: str
    text: str
    col: int
    row: int


class Furniture(BaseModel):
    id: str
    name: str
    colour: Colour
    note: str = ""
    shape: Shape
    width_cm: int
    depth_cm: int
    cells: list[str] | None = None


class Placement(BaseModel):
    furniture_id: str
    x_cm: int
    y_cm: int
    rotation: Rotation = 0


class Layout(BaseModel):
    id: str
    name: str
    placements: list[Placement] = Field(default_factory=list)


def _first_layouts() -> list[Layout]:
    return [Layout(id=f"l_{uuid.uuid4().hex}", name="Layout A")]


class ApartmentDoc(BaseModel):
    """One apartment on disk. Membership lives in `memberships.json`, never here."""

    id: str
    owner: str
    rev: int = 0
    updated_by: str | None = None
    cols: int = DEFAULT_COLS
    rows: int = DEFAULT_ROWS
    surface: list[str] = Field(default_factory=lambda: empty_rows(DEFAULT_COLS, DEFAULT_ROWS))
    feature: list[str] = Field(default_factory=lambda: empty_rows(DEFAULT_COLS, DEFAULT_ROWS))
    labels: list[Label] = Field(default_factory=list)
    locked: bool = False
    furniture: list[Furniture] = Field(default_factory=list)
    layouts: list[Layout] = Field(default_factory=_first_layouts)


class ApartmentView(BaseModel):
    """The caller's apartment. `id` is None while they own an implicit empty one."""

    id: str | None
    owner: str
    members: list[str]
    is_owner: bool
    rev: int
    cols: int
    rows: int
    surface: list[str]
    feature: list[str]
    labels: list[Label]
    locked: bool
    furniture: list[Furniture]
    layouts: list[Layout]


class RevRequest(BaseModel):
    base_rev: int


class AddMemberRequest(BaseModel):
    username: str
```

- [ ] Commit: `feat(floor-planner): apartment document models`.

### Task 2: Repository

**Files:** create `backend/app/repositories/floor_planner_repo.py`.

- [ ] Copy `iss_vanguard_repo.py` and rename throughout:
  - `ship` → `apartment` and `ShipGoneError` → `ApartmentGoneError`
  - the app directory `_APP_DIR = "floor-planner"`, with files at `apartments/{id}.json`
  - ids `a_<32 hex>`, validated by `_APARTMENT_ID = re.compile(r"a_[0-9a-f]{32}")` before any
    path is built
  - `new_apartment(owner)` writes `ApartmentDoc(id=..., owner=owner)`

  Keep the module docstring's lock-order rule (membership first, then the apartment), and keep
  `apartment_transaction` writing nothing if the block raises.
- [ ] There are no direct tests for this module. The service tests exercise it through
  `tmp_path`, which is the "don't mock what you own" rule.
- [ ] Commit: `feat(floor-planner): apartment and membership storage`.

### Task 3: Service — apartment, rev check, lock

**Files:** create `backend/app/services/floor_planner_service.py` and
`backend/tests/test_floor_planner_service.py`.

- [ ] Write the failing tests first. Use the fixture from `test_iss_vanguard_members.py` (patch
  `repo.settings.data_dir` to `tmp_path`, then create users `ana`, `bo` and `cy`).
  - `test_a_newcomer_sees_an_unsaved_empty_apartment`: the view has `id is None`, 50 × 40 squares,
    every row `".." * 50`, `locked is False`, one layout named "Layout A", and
    `is_owner is True`. No file exists under `tmp_path / "floor-planner"`.
  - `test_locking_creates_the_apartment_and_bumps_rev`: `set_locked("ana", 0, True)` returns
    `rev == 1`, `locked is True` and a real `id`, and the file exists.
  - `test_a_stale_write_is_refused_and_names_who_changed_it`: ana locks (making rev 1), then bo,
    who is a member and was added through `add_member`, calls `set_locked("bo", 0, False)`. This
    raises `StaleRevError` matching "ana changed this", and the apartment is still locked at
    rev 1.
  - `test_unlock_after_lock`: `set_locked(..., 1, False)` gives `rev == 2` and
    `locked is False`.
- [ ] Implement it:

```python
"""Business logic for Floor Planner.

Every function works on the caller's apartment, resolved from their username: no
request names an apartment id. A user with no apartment reads an empty one they
own; the first write creates it. Every document write carries the `rev` it was
based on and is refused if another write landed first (NFR-a: no live push, so
this is how two editors find out about each other).

Raises `FileNotFoundError`, `PermissionError`, `ValueError`, `StaleRevError` and
`ApartmentGoneError`; the router translates them.
"""

class StaleRevError(Exception):
    """The write was based on an older `rev` than the one stored."""

ApartmentGoneError = repo.ApartmentGoneError

# _resolve, ensure_apartment, _members_of: as in iss_vanguard_service, renamed.

def _view(doc: ApartmentDoc, username: str, *, saved: bool = True) -> ApartmentView:
    data = doc.model_dump(exclude={"id", "updated_by"})
    return ApartmentView(
        **data,
        id=doc.id if saved else None,
        members=_members_of(doc.id) if saved else [username],
        is_owner=doc.owner == username,
    )

def get_apartment(username: str) -> ApartmentView:
    apartment_id = _resolve(username)
    if apartment_id is None:
        return _view(ApartmentDoc(id="", owner=username), username, saved=False)
    return _view(repo.read_apartment(apartment_id), username)

def _mutate(username: str, base_rev: int, change: Callable[[ApartmentDoc], None]) -> ApartmentView:
    apartment_id = ensure_apartment(username)
    with repo.apartment_transaction(apartment_id) as doc:
        if doc.rev != base_rev:
            raise StaleRevError(f"{doc.updated_by or 'Someone'} changed this")
        change(doc)
        doc.rev += 1
        doc.updated_by = username
        updated = doc.model_copy(deep=True)
    return _view(updated, username)

def set_locked(username: str, base_rev: int, locked: bool) -> ApartmentView:
    def change(doc: ApartmentDoc) -> None:
        doc.locked = locked
    return _mutate(username, base_rev, change)
```

  Never call `ensure_apartment` inside an `apartment_transaction`, for the same lock-order reason
  as in ISS Vanguard.
- [ ] Run `.venv/bin/pytest tests/test_floor_planner_service.py`, then commit:
  `feat(floor-planner): apartment service with rev-checked writes`.

### Task 4: Service — membership

**Files:** modify `floor_planner_service.py`; create `backend/tests/test_floor_planner_members.py`.

- [ ] Port each test in `test_iss_vanguard_members.py` except the SSE ones (`published`, "tells
  its stream"), renaming ship to apartment.
  - Use `set_locked` for the "has something" cases instead of stock: an apartment that was only
    locked still counts as **empty**. Pin that in
    `test_add_member_accepts_someone_whose_apartment_was_only_locked`.
  - For "non-empty", write a label straight onto the joiner's apartment document through
    `repo.apartment_transaction`. Nothing in 1.1 can add a label yet.
- [ ] Implement `add_member` and `remove_member` by porting the ISS versions without the
  `_publish_*` calls. Change the wording from ship to apartment ("…already shares an apartment
  with someone else", "The owner can't leave — remove the others first").

```python
def _is_empty(doc: ApartmentDoc) -> bool:
    painted = any(row.strip(".") for row in (*doc.surface, *doc.feature))
    return not (doc.furniture or doc.labels or painted)
```

- [ ] Run the tests, then commit: `feat(floor-planner): share an apartment (SH-1)`.

### Task 5: Router and shell registration

**Files:** create `backend/app/routers/floor_planner.py` and
`backend/tests/test_floor_planner_router.py`; modify `app/main.py`, `app/routers/shell.py` and
`tests/test_shell.py`.

- [ ] Router: a `_ApartmentRoute(APIRoute)` that handles errors in this order:
  1. `StaleRevError` → 409 with `str(exc)`
  2. `ApartmentGoneError` → 410 "Your apartment changed — reload"
  3. `FileNotFoundError` → 404
  4. `PermissionError` → 403
  5. `ValueError` → 422

  Use prefix `/api/floor-planner` and tag `floor-planner`. Every route depends on
  `get_current_user` and returns an `ApartmentView`.

| Route | Calls |
|---|---|
| `GET /apartment` | `get_apartment` |
| `POST /apartment/lock` body `RevRequest` | `set_locked(user, base_rev, True)` |
| `POST /apartment/unlock` body `RevRequest` | `set_locked(user, base_rev, False)` |
| `POST /apartment/members` body `AddMemberRequest` | `add_member` |
| `DELETE /apartment/members/{username}` | `remove_member` |

- [ ] Add `floor_planner` to the `from app.routers import (...)` block and to `include_router`
  in `main.py`. Append `AppDescriptor(id="floor-planner", label="Floor Planner",
  icon="square_foot", route="/floor-planner")` to `_APPS`.
- [ ] Router tests, using the `test_iss_vanguard_router.py` fixture with users `test_user` and
  `bo`:
  - `GET` returns the implicit apartment with `id: null` and 40 rows.
  - `lock` with `base_rev` 0 returns 200 and `rev` 1.
  - A second `lock` with `base_rev` 0 returns 409 with detail "test_user changed this".
  - Adding `zed` returns 422.
  - When `bo` is a member and calls `DELETE /members/test_user` (switch the `get_current_user`
    override to `bo`), the response is 403.
  - A body missing `base_rev` returns 422.
- [ ] Shell tests: `test_list_apps_includes_floor_planner` and
  `test_floor_planner_router_is_mounted` (checks the prefix).
- [ ] Run `.venv/bin/pytest`, `black .` and `ruff check .`, then commit:
  `feat(floor-planner): API and dock registration`.

### Task 6: Frontend types and store

**Files:** create `src/apps/floor-planner/types.ts`, `stores/useFloorPlanStore.ts` and
`stores/useFloorPlanStore.spec.ts`.

- [ ] `types.ts`: one interface for each backend model (`Apartment` = `ApartmentView`,
  `Label`, `Furniture`, `Layout`, `Placement`), the union types `Shape`, `Colour` and
  `Rotation`, and `type Mode = "draw" | "furniture" | "arrange"`.
- [ ] Store `useFloorPlanStore` (Pinia id `floor-planner`), modelled on `useShipStore`:
  - State: `apartment`, `loading`, `error`, `notice`.
  - `fetchApartment()`.
  - `write(call)`:
    - On success, store the returned apartment and clear `error` and `notice`.
    - On an `ApiError` with `status === 409`, set `notice = \`${e.detail}, reloaded\`` and
      refetch.
    - On any other error, set `error` and refetch, as `useShipStore` does.
  - `lock()` and `unlock()` post `{ base_rev: apartment.rev }`.
  - `addMember`, `removeMember`, `leave` and `fetchRoster` (from `/auth/users`) work as in
    `useShipStore`.
- [ ] Spec, mocking `@/composables/useApi` as `ShipPage.spec.ts` does. Export a real `ApiError`
  class from the mock so the store can check `status`:
  - `fetchApartment` stores the result and toggles `loading`.
  - `lock` posts `base_rev` equal to the current `rev`.
  - A 409 sets `notice` to "dani changed this, reloaded", refetches, and leaves `error` null.
  - A 422 sets `error` and refetches.
- [ ] Run `npx vitest run src/apps/floor-planner`, then commit:
  `feat(floor-planner): apartment store with stale-write reload`.

### Task 7: Members dialog

**Files:** create `components/MembersDialog.vue` and its spec.

- [ ] Port `iss-vanguard/components/CrewSheet.vue`:
  - Change the wording: "People sharing this apartment", "Add someone", and the leave hint
    "You'll start with an empty apartment. Everything here stays with the others."
  - Restyle it with B's tokens (Task 8's sass variables), with Plex Sans for text and buttons at
    least 36 px tall.
  - Keep the data-testids, swapping their `crew-` prefix for `members-`.
- [ ] Spec, ported from `CrewSheet.spec.ts`:
  - The owner sees Add and a Remove button for each other member.
  - A member sees Leave, which asks for confirmation first.
  - The error from the store is shown.
- [ ] Commit: `feat(floor-planner): members dialog`.

### Task 8: Plan page frame, route, registry, header

**Files:**
- Create `pages/PlanPage.vue` and its spec, `css/floor-planner.sass` and `css/fonts/`.
- Modify `registry.ts`, `registry.spec.ts`, `routes.ts` and `MainLayout.vue`.

- [ ] Fonts: download the latin `woff2` files for IBM Plex Sans 400, 500 and 600, and IBM Plex
  Mono 500, into `css/fonts/` (from the IBM Plex GitHub release or google-webfonts-helper).
  Declare them with `@font-face` in `floor-planner.sass`, following `kitchencraft.sass`.
- [ ] Add `floor-planner.sass` tokens taken from mockup B:

  | Token | Value |
  |---|---|
  | ground | `#eceae4` |
  | chrome | `#ffffff` |
  | panel | `#fafaf8` |
  | line | `#dddbd4` |
  | ink | `#1c1c1a` |
  | muted | `#5c5a54` |
  | accent | `#1d4ed8` |
  | warn ink / warn background | `#8a2d0c` / `#fff0e6` |
  | locked ink / locked background | `#14532d` / `#e3f1ea` |
  | unlocked ink / unlocked background | `#7a5200` / `#fff4d6` |

  Add a `.fp-mono` class (Plex Mono) for measurements.
- [ ] `PlanPage.vue` is design B's frame, desktop-first, filling the shell's page area:
  - **Top bar:**
    - The Draw plan · Furniture · Arrange segmented switch, held as a local `mode` ref that
      defaults to `draw`.
    - The lock chip ("Unlocked" or "Plan locked") with a Lock plan / Unlock button that calls
      `store.lock()` or `store.unlock()`.
    - The members' initials as avatars inside a button that opens `MembersDialog` in a
      `q-dialog`.
    - No app name: the shell bar already shows "Floor Planner".
  - **Body:** three columns (`data-testid` `fp-left`, `fp-plan`, `fp-right`), empty until
    1.2–1.4 fill them.
  - **Bottom bar:** "1 square = 20 cm" in mono for now.
  - **Messages:** `store.notice` shows as a dismissible banner under the top bar, and
    `store.error` uses the warn colours.
  - `onMounted(fetchApartment)`.
- [ ] Spec:
  - Renders the switch, and clicking Furniture marks it active.
  - Shows "Unlocked" with a Lock plan button that calls `lock` (check the post body).
  - When the apartment is locked, shows "Plan locked" and Unlock.
  - Shows the notice.
  - Clicking the avatars opens the members dialog.
- [ ] Registry: append the `floor-planner` entry with a one-line comment ("A set-square glyph
  for a to-scale plan."). Add a `registry.spec.ts` case like the ISS one.
- [ ] Routes: add `{ path: "floor-planner", name: "floor-planner", component: () =>
  import("@/apps/floor-planner/pages/PlanPage.vue"), meta: { title: "Floor Planner",
  requiresAuth: true } }` next to the ISS route.
- [ ] `MainLayout.vue`: add `inFloorPlanner` and an `app-bar--floor-planner` class with a
  `#ffffff` background, a `#1c1c1a` title, a 1px `#dddbd4` bottom border, and
  `:deep(.q-btn) { color: #3d3b36 !important }` (for the same Quasar `!important` reason given in
  the KitchenCraft comment). Add a one-line *why* comment: "a light drafting table, so the dark
  dock bar would sit on it as foreign chrome".
- [ ] Run `npm test`, `npm run lint` and `npx vue-tsc --noEmit`, then commit:
  `feat(floor-planner): design B frame, route and dock card`.

### Task 9: Verify and hand off

- [ ] Run the full gate: `.venv/bin/pytest`, `black --check .` and `ruff check .` in `backend/`;
  `npm test`, `npm run lint` and `npm run build` in `frontend/`.
- [ ] Check it manually with both dev servers running (`DATA_DIR=./local-data`):
  1. Sign in as Jake and open the card. Expect an empty frame showing "Unlocked".
  2. Lock the plan.
  3. Add Dani as a member.
  4. In a second browser profile, sign in as Dani: she sees "Plan locked" and both avatars.
  5. As Jake, unlock.
  6. As Dani, without reloading, click Unlock. Expect the banner "jake changed this, reloaded",
     with the page showing Unlocked.
- [ ] Fill in the story's Dev Agent Record and move it to `for-review/`, then commit:
  `docs(floor-planner): story 1.1 ready for review`.

## Review Focus

1. **Stale writes:** two clients write against the same `rev`. The second gets a 409 naming the
   first writer, its view reloads, and the stored document is unchanged. Pinned in Tasks 3, 5
   and 6.
2. **The implicit apartment:** a `GET` alone never creates a file, and the first write creates
   the file at `rev` 0 and lands it at `rev` 1. Pinned in Task 3.
3. **Joining:** joining discards only an *empty* apartment, and a lock alone does not make one
   non-empty. Pinned in Task 4.
4. **Lock order:** membership is always locked before the apartment. `ensure_apartment` is never
   called inside a transaction.
