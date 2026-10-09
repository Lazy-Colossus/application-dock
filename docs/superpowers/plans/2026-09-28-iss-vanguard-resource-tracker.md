# ISS Vanguard Resource Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the new `iss-vanguard` dock app: a shared, live 5 × 3 resource grid (on ship / needed / difference) with projects that deduct their cost on completion.

**Architecture:** One JSON document per ship plus a `memberships.json` map, mirroring Tea cabinets (`tea_repo.py` / `tea_cabinet_service.py`). Every write is a delta applied under the ship's file lock, bumps `rev`, and publishes a coarse `ship.changed` event on a per-app `EventBus`; other clients refetch over SSE, mirroring Shared Notes. The frontend derives Needed / Difference / shortfalls from the ship with pure functions.

**Tech Stack:** FastAPI + Pydantic v2 (Python 3.12), pytest; Vue 3 `<script setup lang="ts">`, Pinia, Quasar v2, vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-09-28-iss-vanguard-resource-tracker-design.md`

## Global Constraints

- Commit directly on `main` (user preference — no feature branches). End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Backend: strict router → service → repository layering; only the repository touches the filesystem; all writes via `app.core.storage.atomic_write_json`; routers are the only place that raises `HTTPException`.
- Backend formatting: `black` + `ruff`, line length 100; type hints on every public signature; `pathlib`; f-strings.
- Frontend: all HTTP through `src/composables/useApi.ts`; the single `EventSource` exception lives in `composables/useShipEvents.ts`. Pinia stores expose `loading` and `error`; every async action sets `loading` in `try/finally` and routes errors into `error`.
- Frontend: `defineProps<{}>()` / `defineEmits<{}>()` generic syntax; no `any`; `interface` for object shapes, `type` for unions.
- Node ≥ 22.22. Backend tests need no env; dev server needs `DATA_DIR=./local-data`.
- Resource ids and Slovak names (display order): `microorganisms` Mikroorganizmy · `alien_technologies` Mimozemské technológie · `minerals` Minerály · `strange_flora` Podivná flóra · `living_specimens` Živé exempláre.
- Tier ids and names (display order): `basic` Základný · `rare` Vzácny · `very_rare` Veľmi vzácny.
- UI chrome is English. App card: id `iss-vanguard`, label `ISS Vanguard`, icon `rocket_launch`, route `/iss-vanguard`.
- Minimal comments: only the non-obvious *why*.

## Refinements to the spec (decided while planning)

- `members` is **not stored** in the ship document; `ShipView.members` is derived from `memberships.json` on every read (single source of truth, NFR-b). The spec's "derived on write" becomes "derived on read".
- Membership refusals by a non-owner are `PermissionError → 403` (as Tea), and a ship deleted by a concurrent membership change is `ShipGoneError → 410 "Your ship changed — reload"` (as Tea's `CabinetGoneError`).
- Clients refetch on `ship.changed` when `event.rev > ship.rev`, with no actor check. The writer already holds the new `rev` from its response, so its own event is ignored anyway, and the same user's second device still updates.
- When joining a ship deletes the joiner's empty ship, the old ship's stream gets `ship.closed {reason: "joined", member}` so a joiner who has the page open moves to the new ship. This covers the same situation as `"removed"`.
- The events route calls `ensure_ship` (creating an empty ship if needed) so a brand-new user has a stream to subscribe to.
- Any rejected write refetches the ship (not only rejected stock taps), so every failure reconverges.

## Review Focus

1. **Racing taps on a cell at 1:** two phones tap − at the same time; one succeeds, the other gets 422, and its grid refetches to 0. Pinned in Task 3 (service) and Task 9 (store refetch on failed write).
2. **A partner deletes the prerequisite while you edit:** saving a project whose `prerequisite_id` no longer exists is refused with 422 and does not corrupt the ship. Pinned in Task 4.
3. **You're removed from, or join, a ship while the page is open:** `ship.closed` naming you reloads your ship and resubscribes to the new ship's stream. Pinned in Task 5 (published), Task 13 (page resubscribes).
4. **Malformed cost grids:** an unknown resource/tier key or a negative count is rejected with 422; missing cells default to 0 and the stored grid is always complete. Pinned in Task 1.
5. **Completing with short stock:** each cell clamps at 0, and reopening restores the full cost, so the result can exceed the pre-completion stock. That's expected, and the test pins it so nobody "fixes" it. Pinned in Task 4.

## File Structure

**Backend (create):**
- `backend/app/schemas/iss_vanguard.py`: vocabulary literals, `Grid`, `Project`, `ShipDoc`, `ShipView`, request models.
- `backend/app/repositories/iss_vanguard_repo.py`: ship files, memberships map, locks.
- `backend/app/services/iss_vanguard_events.py`: the app's `EventBus`.
- `backend/app/services/iss_vanguard_service.py`: all business logic.
- `backend/app/routers/iss_vanguard.py`: HTTP + SSE.
- Tests: `backend/tests/test_iss_vanguard_schemas.py`, `test_iss_vanguard_repo.py`, `test_iss_vanguard_service.py`, `test_iss_vanguard_concurrency.py`, `test_iss_vanguard_members.py`, `test_iss_vanguard_router.py`, `test_iss_vanguard_events.py`.

**Backend (modify):** `backend/app/main.py` (register router), `backend/app/routers/shell.py` (`_APPS`).

**Frontend (create, under `frontend/src/apps/iss-vanguard/`):**
- `types.ts`, `resources.ts`, `shipMath.ts` (+ `shipMath.spec.ts`, `resources.spec.ts`)
- `composables/useShipEvents.ts` (+ spec)
- `stores/useShipStore.ts` (+ spec)
- `components/ResourceGrid.vue`, `StockStepper.vue`, `ProjectEditor.vue`, `ProjectRow.vue`, `ProjectList.vue`, `CrewSheet.vue` (+ specs)
- `pages/ShipPage.vue` (+ spec)

**Frontend (modify):** `frontend/src/apps/registry.ts`, `registry.spec.ts`, `frontend/src/router/routes.ts`.

**Docs:** `docs/stories/iss-vanguard/for-review/1.1.resource-tracker.story.md`.

---

### Task 1: Schemas: vocabulary, grid and ship models

**Files:**
- Create: `backend/app/schemas/iss_vanguard.py`
- Test: `backend/tests/test_iss_vanguard_schemas.py`

**Interfaces:**
- Produces: `Resource`, `Tier` (Literal types); `RESOURCES: tuple[Resource, ...]`, `TIERS: tuple[Tier, ...]`; `Grid` (annotated `dict[Resource, dict[Tier, int]]`, always complete, non-negative); `empty_grid() -> dict[Resource, dict[Tier, int]]`; `is_empty_grid(grid) -> bool`; models `Project`, `ShipDoc`, `ShipView`, `StockAdjustRequest`, `ProjectWriteRequest`, `AddMemberRequest`.

- [ ] **Step 1: Write the failing test**

```python
"""The fixed resource vocabulary and the always-complete grid."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.iss_vanguard import (
    RESOURCES,
    TIERS,
    ProjectWriteRequest,
    ShipDoc,
    StockAdjustRequest,
    empty_grid,
    is_empty_grid,
)


def test_vocabulary_is_fixed_and_ordered() -> None:
    assert RESOURCES == (
        "microorganisms",
        "alien_technologies",
        "minerals",
        "strange_flora",
        "living_specimens",
    )
    assert TIERS == ("basic", "rare", "very_rare")


def test_empty_grid_has_all_fifteen_cells_at_zero() -> None:
    grid = empty_grid()
    assert list(grid) == list(RESOURCES)
    assert all(list(row) == list(TIERS) for row in grid.values())
    assert is_empty_grid(grid)


def test_a_partial_cost_is_completed_with_zeros() -> None:
    req = ProjectWriteRequest(code="VB07", cost={"minerals": {"rare": 2}})
    assert req.cost["minerals"] == {"basic": 0, "rare": 2, "very_rare": 0}
    assert req.cost["microorganisms"] == {"basic": 0, "rare": 0, "very_rare": 0}
    assert not is_empty_grid(req.cost)


@pytest.mark.parametrize(
    "cost",
    [
        {"gold": {"basic": 1}},
        {"minerals": {"legendary": 1}},
        {"minerals": {"basic": -1}},
        {"minerals": {"basic": 1.5}},
    ],
)
def test_a_malformed_cost_is_rejected(cost: dict) -> None:
    with pytest.raises(ValidationError):
        ProjectWriteRequest(code="VB07", cost=cost)


def test_stock_delta_is_only_plus_or_minus_one() -> None:
    StockAdjustRequest(resource="minerals", tier="basic", delta=-1)
    with pytest.raises(ValidationError):
        StockAdjustRequest(resource="minerals", tier="basic", delta=2)


def test_a_new_ship_doc_starts_empty_at_rev_zero() -> None:
    doc = ShipDoc(id="s_" + "0" * 32, owner="ana")
    assert (doc.rev, doc.projects, is_empty_grid(doc.stock)) == (0, [], True)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.schemas.iss_vanguard'`

- [ ] **Step 3: Write the implementation**

```python
"""Schemas for the ISS Vanguard resource tracker.

The five resources and three tiers are fixed by the game, so they are literal
types: an unknown key in a request is a validation error, not new data. Every
grid is normalised to all fifteen cells, so no code downstream has to treat a
missing cell as zero.
"""

from __future__ import annotations

from typing import Annotated, Literal, get_args

from pydantic import AfterValidator, BaseModel, Field, NonNegativeInt

Resource = Literal[
    "microorganisms",
    "alien_technologies",
    "minerals",
    "strange_flora",
    "living_specimens",
]
Tier = Literal["basic", "rare", "very_rare"]

RESOURCES: tuple[Resource, ...] = get_args(Resource)
TIERS: tuple[Tier, ...] = get_args(Tier)


def _complete(grid: dict[Resource, dict[Tier, int]]) -> dict[Resource, dict[Tier, int]]:
    return {r: {t: grid.get(r, {}).get(t, 0) for t in TIERS} for r in RESOURCES}


Grid = Annotated[dict[Resource, dict[Tier, NonNegativeInt]], AfterValidator(_complete)]


def empty_grid() -> dict[Resource, dict[Tier, int]]:
    return _complete({})


def is_empty_grid(grid: dict[Resource, dict[Tier, int]]) -> bool:
    return all(count == 0 for row in grid.values() for count in row.values())


class Project(BaseModel):
    id: str
    code: str
    name: str = ""
    prerequisite_id: str | None = None
    cost: Grid = Field(default_factory=empty_grid)
    done: bool = False


class ShipDoc(BaseModel):
    """One ship on disk. Membership lives in `memberships.json`, never here."""

    id: str
    owner: str
    rev: int = 0
    stock: Grid = Field(default_factory=empty_grid)
    projects: list[Project] = Field(default_factory=list)


class ShipView(BaseModel):
    """The caller's ship. `id` is None while they own an implicit empty one."""

    id: str | None
    owner: str
    members: list[str]
    is_owner: bool
    rev: int
    stock: Grid
    projects: list[Project]


class StockAdjustRequest(BaseModel):
    resource: Resource
    tier: Tier
    delta: Literal[-1, 1]


class ProjectWriteRequest(BaseModel):
    code: str
    name: str = ""
    prerequisite_id: str | None = None
    cost: Grid = Field(default_factory=empty_grid)


class AddMemberRequest(BaseModel):
    username: str
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_schemas.py -v`
Expected: 9 passed. If `{"minerals": {"basic": 1.5}}` passes validation, Pydantic is in lax mode for that value. Change `NonNegativeInt` to `Annotated[int, Field(ge=0, strict=True)]` and re-run.

- [ ] **Step 5: Lint and commit**

```bash
cd backend && .venv/bin/black app/schemas/iss_vanguard.py tests/test_iss_vanguard_schemas.py && .venv/bin/ruff check app/schemas/iss_vanguard.py tests/test_iss_vanguard_schemas.py
git add backend/app/schemas/iss_vanguard.py backend/tests/test_iss_vanguard_schemas.py
git commit -m "feat(iss-vanguard): resource vocabulary and ship schemas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Repository: ship files, memberships, locks

**Files:**
- Create: `backend/app/repositories/iss_vanguard_repo.py`
- Test: `backend/tests/test_iss_vanguard_repo.py`

**Interfaces:**
- Consumes: `ShipDoc` (Task 1).
- Produces: `ShipGoneError(LookupError)`; `read_ship(ship_id) -> ShipDoc`; `write_ship(doc: ShipDoc) -> None`; `ship_lock(ship_id)` context manager; `ship_transaction(ship_id) -> Iterator[ShipDoc]` (read-modify-write under lock, no write if the block raises, raises `ShipGoneError` if missing); `new_ship(owner) -> str` (id `s_<32 hex>`); `delete_ship(ship_id) -> None`; `membership_lock()`; `read_memberships() -> dict[str, str]`; `write_memberships(dict[str, str]) -> None`. `settings` is importable from the module (tests monkeypatch `repo.settings.data_dir`).

- [ ] **Step 1: Write the failing test**

```python
"""Ship files and the membership map on disk."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import iss_vanguard_repo as repo


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def test_new_ship_writes_an_empty_ship_owned_by_the_caller(tmp_path: Path) -> None:
    ship_id = repo.new_ship("ana")
    assert ship_id.startswith("s_") and len(ship_id) == 34
    assert (tmp_path / "iss-vanguard" / "ships" / f"{ship_id}.json").is_file()
    doc = repo.read_ship(ship_id)
    assert (doc.id, doc.owner, doc.rev) == (ship_id, "ana", 0)


def test_a_transaction_writes_on_success_and_not_on_error() -> None:
    ship_id = repo.new_ship("ana")
    with repo.ship_transaction(ship_id) as doc:
        doc.stock["minerals"]["basic"] = 3
    assert repo.read_ship(ship_id).stock["minerals"]["basic"] == 3

    with pytest.raises(ValueError):
        with repo.ship_transaction(ship_id) as doc:
            doc.stock["minerals"]["basic"] = 9
            raise ValueError("refused")
    assert repo.read_ship(ship_id).stock["minerals"]["basic"] == 3


def test_a_deleted_ship_is_gone_and_a_transaction_does_not_resurrect_it() -> None:
    ship_id = repo.new_ship("ana")
    repo.delete_ship(ship_id)
    with pytest.raises(repo.ShipGoneError):
        repo.read_ship(ship_id)
    with pytest.raises(repo.ShipGoneError):
        with repo.ship_transaction(ship_id):
            pass
    with pytest.raises(repo.ShipGoneError):
        repo.read_ship(ship_id)


def test_memberships_round_trip_and_default_to_empty() -> None:
    assert repo.read_memberships() == {}
    repo.write_memberships({"ana": "s_" + "a" * 32})
    assert repo.read_memberships() == {"ana": "s_" + "a" * 32}


@pytest.mark.parametrize("bad", ["../x", "s_abc", "c_" + "0" * 32])
def test_unsafe_ship_ids_never_reach_a_path(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.read_ship(bad)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_repo.py -v`
Expected: FAIL with `ImportError: cannot import name 'iss_vanguard_repo'`

- [ ] **Step 3: Write the implementation**

```python
"""Filesystem persistence for ISS Vanguard: one JSON document per ship.

The ONLY code that touches the filesystem for this app. Who belongs to which
ship lives in `memberships.json` alone, so membership can never disagree with
itself.

Lock order is always membership, then ship: never take the membership lock
while holding a ship's.

Layering: callers MUST be services.
"""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.iss_vanguard import ShipDoc

__all__ = [
    "ShipGoneError",
    "delete_ship",
    "membership_lock",
    "new_ship",
    "read_memberships",
    "read_ship",
    "settings",
    "ship_lock",
    "ship_transaction",
    "write_memberships",
    "write_ship",
]

_APP_DIR = "iss-vanguard"
_SHIP_ID = re.compile(r"s_[0-9a-f]{32}")


class ShipGoneError(LookupError):
    """The ship a request resolved was removed by a membership change before it ran."""


def _root() -> Path:
    return settings.data_dir / _APP_DIR


def _ship_path(ship_id: str) -> Path:
    if not _SHIP_ID.fullmatch(ship_id):
        raise ValueError(f"unsafe ship id: {ship_id!r}")
    return _root() / "ships" / f"{ship_id}.json"


def _memberships_path() -> Path:
    return _root() / "memberships.json"


def read_ship(ship_id: str) -> ShipDoc:
    try:
        raw = _ship_path(ship_id).read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise ShipGoneError(f"No ship {ship_id!r}") from exc
    return ShipDoc.model_validate(json.loads(raw))


def write_ship(doc: ShipDoc) -> None:
    atomic_write_json(_ship_path(doc.id), doc.model_dump(mode="json"))


@contextmanager
def ship_lock(ship_id: str) -> Iterator[None]:
    with key_lock(str(_ship_path(ship_id))):
        yield


@contextmanager
def ship_transaction(ship_id: str) -> Iterator[ShipDoc]:
    """Read-modify-write a ship under its lock; nothing is written if the block raises.

    Never creates the file: a request that resolved its ship just before a
    membership change deleted it gets `ShipGoneError` rather than resurrecting it.
    """
    with ship_lock(ship_id):
        doc = read_ship(ship_id)
        yield doc
        write_ship(doc)


def new_ship(owner: str) -> str:
    ship_id = f"s_{uuid.uuid4().hex}"
    write_ship(ShipDoc(id=ship_id, owner=owner))
    return ship_id


def delete_ship(ship_id: str) -> None:
    """Call under the ship's lock."""
    _ship_path(ship_id).unlink(missing_ok=True)


@contextmanager
def membership_lock() -> Iterator[None]:
    with key_lock(str(_memberships_path())):
        yield


def read_memberships() -> dict[str, str]:
    """Every member, owner included, mapped to their ship id."""
    try:
        raw = _memberships_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    return {str(user): str(ship) for user, ship in json.loads(raw).items()}


def write_memberships(members: dict[str, str]) -> None:
    """Call under the membership lock."""
    atomic_write_json(_memberships_path(), members)
```

`atomic_write_json` creates missing parent directories itself (`app/core/storage.py`), so no `mkdir` is needed here.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_repo.py -v`
Expected: 7 passed

- [ ] **Step 5: Lint and commit**

```bash
cd backend && .venv/bin/black app/repositories/iss_vanguard_repo.py tests/test_iss_vanguard_repo.py && .venv/bin/ruff check app/repositories/iss_vanguard_repo.py tests/test_iss_vanguard_repo.py
git add backend/app/repositories/iss_vanguard_repo.py backend/tests/test_iss_vanguard_repo.py
git commit -m "feat(iss-vanguard): ship repository with memberships and locks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Service core: resolving the ship, stock, events bus

**Files:**
- Create: `backend/app/services/iss_vanguard_events.py`
- Create: `backend/app/services/iss_vanguard_service.py`
- Test: `backend/tests/test_iss_vanguard_service.py`
- Test: `backend/tests/test_iss_vanguard_concurrency.py`

**Interfaces:**
- Consumes: Task 1 schemas, Task 2 repo.
- Produces (service): `ShipGoneError` (re-export of `repo.ShipGoneError`); `get_ship(username) -> ShipView`; `ensure_ship(username) -> str`; `adjust_stock(username, resource: Resource, tier: Tier, delta: int) -> ShipView`; private `_mutate(username, change: Callable[[ShipDoc], None]) -> ShipView` used by Tasks 4 and 5.
- Produces (events): module aliases `subscribe`, `unsubscribe`, `publish`, `is_stale`, `subscriber_count`. Every successful `_mutate` publishes `{"type": "ship.changed", "ship_id", "rev", "actor"}`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_iss_vanguard_service.py`:

```python
"""Business rules of the ISS Vanguard resource tracker."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import iss_vanguard_repo as repo
from app.services import iss_vanguard_events as events
from app.services import iss_vanguard_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


@pytest.fixture
def published(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict]]:
    spy: list[tuple[str, dict]] = []
    monkeypatch.setattr(events, "publish", lambda key, event: spy.append((key, event)))
    return spy


def test_a_new_user_reads_an_empty_ship_they_own_without_creating_it(tmp_path: Path) -> None:
    ship = service.get_ship("ana")
    assert (ship.id, ship.owner, ship.members, ship.is_owner, ship.rev) == (
        None,
        "ana",
        ["ana"],
        True,
        0,
    )
    assert ship.projects == []
    assert not (tmp_path / "iss-vanguard").exists()


def test_ensure_ship_creates_one_ship_and_is_idempotent() -> None:
    first = service.ensure_ship("ana")
    assert service.ensure_ship("ana") == first
    assert repo.read_memberships() == {"ana": first}


def test_the_first_tap_creates_the_ship_and_counts() -> None:
    ship = service.adjust_stock("ana", "minerals", "rare", 1)
    assert ship.id is not None
    assert ship.stock["minerals"]["rare"] == 1
    assert ship.rev == 1
    assert service.get_ship("ana").stock["minerals"]["rare"] == 1


def test_stock_goes_down_but_never_below_zero() -> None:
    service.adjust_stock("ana", "minerals", "rare", 1)
    assert service.adjust_stock("ana", "minerals", "rare", -1).stock["minerals"]["rare"] == 0
    with pytest.raises(ValueError, match="already at 0"):
        service.adjust_stock("ana", "minerals", "rare", -1)
    assert service.get_ship("ana").rev == 2


def test_every_write_publishes_ship_changed_with_the_new_rev(
    published: list[tuple[str, dict]],
) -> None:
    ship = service.adjust_stock("ana", "minerals", "basic", 1)
    assert published == [
        (ship.id, {"type": "ship.changed", "ship_id": ship.id, "rev": 1, "actor": "ana"})
    ]


def test_a_refused_write_publishes_nothing(published: list[tuple[str, dict]]) -> None:
    with pytest.raises(ValueError):
        service.adjust_stock("ana", "minerals", "basic", -1)
    assert published == []
```

`backend/tests/test_iss_vanguard_concurrency.py`:

```python
"""Taps from several phones at once must all land (NFR-a)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from app.repositories import iss_vanguard_repo as repo
from app.services import iss_vanguard_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def test_concurrent_increments_on_one_cell_all_count() -> None:
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: service.adjust_stock("ana", "minerals", "basic", 1), range(50)))
    ship = service.get_ship("ana")
    assert ship.stock["minerals"]["basic"] == 50
    assert ship.rev == 50
    assert len(repo.read_memberships()) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_service.py tests/test_iss_vanguard_concurrency.py -v`
Expected: FAIL with `ImportError` for `iss_vanguard_events` / `iss_vanguard_service`

- [ ] **Step 3: Write the events module**

`backend/app/services/iss_vanguard_events.py`:

```python
"""Live ship events: ISS Vanguard's instance of the platform bus.

Keyed by ship id. The mechanics, and the single-worker assumption they rest on,
live in `app.core.events`.
"""

from __future__ import annotations

from app.core.events import Event, EventBus

_bus = EventBus("iss-vanguard")

subscribe = _bus.subscribe
unsubscribe = _bus.unsubscribe
publish = _bus.publish
is_stale = _bus.is_stale
subscriber_count = _bus.subscriber_count

__all__ = ["Event", "subscribe", "unsubscribe", "publish", "is_stale", "subscriber_count"]
```

- [ ] **Step 4: Write the service core**

`backend/app/services/iss_vanguard_service.py`:

```python
"""Business logic for the ISS Vanguard resource tracker.

Every function works on the caller's ship, resolved from their username: no
request names a ship id, so no path reaches a ship the caller is not on. A user
with no ship reads an empty one they own; the first write creates it.

Never call `ensure_ship` inside a `repo.ship_transaction` block — it may take
the membership lock, which is always taken before a ship's.

Raises `FileNotFoundError` (no such project or member), `PermissionError` (not
the owner), `ValueError` (refused) and `ShipGoneError` (the ship vanished under
a concurrent membership change); the router translates them.
"""

from __future__ import annotations

from collections.abc import Callable

from app.repositories import iss_vanguard_repo as repo
from app.schemas.iss_vanguard import Resource, ShipDoc, ShipView, Tier, empty_grid
from app.services import iss_vanguard_events as events

ShipGoneError = repo.ShipGoneError


def _resolve(username: str) -> str | None:
    return repo.read_memberships().get(username)


def ensure_ship(username: str) -> str:
    """The caller's ship id, creating an empty ship they own if they have none."""
    ship_id = _resolve(username)
    if ship_id is not None:
        return ship_id
    with repo.membership_lock():
        members = repo.read_memberships()
        ship_id = members.get(username)
        if ship_id is None:
            ship_id = repo.new_ship(username)
            members[username] = ship_id
            repo.write_memberships(members)
        return ship_id


def _members_of(ship_id: str) -> list[str]:
    return sorted(user for user, ship in repo.read_memberships().items() if ship == ship_id)


def _view(doc: ShipDoc, username: str) -> ShipView:
    return ShipView(
        id=doc.id,
        owner=doc.owner,
        members=_members_of(doc.id),
        is_owner=doc.owner == username,
        rev=doc.rev,
        stock=doc.stock,
        projects=doc.projects,
    )


def get_ship(username: str) -> ShipView:
    ship_id = _resolve(username)
    if ship_id is None:
        return ShipView(
            id=None,
            owner=username,
            members=[username],
            is_owner=True,
            rev=0,
            stock=empty_grid(),
            projects=[],
        )
    return _view(repo.read_ship(ship_id), username)


def _mutate(username: str, change: Callable[[ShipDoc], None]) -> ShipView:
    """Apply `change` to the caller's ship under its lock, bump `rev`, and tell the others."""
    ship_id = ensure_ship(username)
    with repo.ship_transaction(ship_id) as doc:
        change(doc)
        doc.rev += 1
        updated = doc.model_copy(deep=True)
    events.publish(
        ship_id,
        {"type": "ship.changed", "ship_id": ship_id, "rev": updated.rev, "actor": username},
    )
    return _view(updated, username)


def adjust_stock(username: str, resource: Resource, tier: Tier, delta: int) -> ShipView:
    """Apply one tap. A delta, not a total, so taps from two phones never overwrite each other."""

    def change(doc: ShipDoc) -> None:
        count = doc.stock[resource][tier] + delta
        if count < 0:
            raise ValueError(f"{resource} ({tier}) is already at 0")
        doc.stock[resource][tier] = count

    return _mutate(username, change)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_service.py tests/test_iss_vanguard_concurrency.py -v`
Expected: 7 passed

- [ ] **Step 6: Lint and commit**

```bash
cd backend && .venv/bin/black app/services/iss_vanguard_*.py tests/test_iss_vanguard_*.py && .venv/bin/ruff check app/services/iss_vanguard_*.py tests/test_iss_vanguard_*.py
git add backend/app/services/iss_vanguard_events.py backend/app/services/iss_vanguard_service.py backend/tests/test_iss_vanguard_service.py backend/tests/test_iss_vanguard_concurrency.py
git commit -m "feat(iss-vanguard): ship resolution, stock taps and live change events

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Service: projects (create, edit, delete, complete, reopen)

**Files:**
- Modify: `backend/app/services/iss_vanguard_service.py` (append)
- Modify: `backend/tests/test_iss_vanguard_service.py` (append)

**Interfaces:**
- Consumes: `_mutate` and the service's imports (Task 3), `ProjectWriteRequest`, `Project`, `RESOURCES`, `TIERS` (Task 1).
- Produces: `create_project(username, req: ProjectWriteRequest) -> ShipView`; `update_project(username, project_id: str, req: ProjectWriteRequest) -> ShipView`; `delete_project(username, project_id: str) -> ShipView`; `complete_project(username, project_id: str) -> ShipView`; `reopen_project(username, project_id: str) -> ShipView`. Project ids are `p-<8 hex>`.

- [ ] **Step 1: Write the failing tests** (append to `test_iss_vanguard_service.py`; add `from app.schemas.iss_vanguard import ProjectWriteRequest` to the imports)

```python
def _req(code: str = "VB07", **kw: object) -> ProjectWriteRequest:
    return ProjectWriteRequest(code=code, **kw)


def test_create_project_strips_and_stores_it() -> None:
    ship = service.create_project(
        "ana", _req("  VB07 ", name=" Reactor ", cost={"minerals": {"rare": 2}})
    )
    (project,) = ship.projects
    assert (project.code, project.name, project.done) == ("VB07", "Reactor", False)
    assert project.id.startswith("p-")
    assert project.cost["minerals"]["rare"] == 2


def test_a_blank_code_is_refused() -> None:
    with pytest.raises(ValueError, match="code"):
        service.create_project("ana", _req("   "))


def test_a_prerequisite_must_be_another_project_on_this_ship() -> None:
    first = service.create_project("ana", _req("VB03")).projects[0]
    second = service.create_project("ana", _req("VB07", prerequisite_id=first.id)).projects[1]
    assert second.prerequisite_id == first.id
    with pytest.raises(ValueError, match="prerequisite"):
        service.create_project("ana", _req("VB09", prerequisite_id="p-00000000"))
    with pytest.raises(ValueError, match="itself"):
        service.update_project("ana", first.id, _req("VB03", prerequisite_id=first.id))


def test_update_replaces_fields_but_keeps_done() -> None:
    project = service.create_project("ana", _req("VB07")).projects[0]
    service.adjust_stock("ana", "minerals", "basic", 1)
    service.complete_project("ana", project.id)
    updated = service.update_project(
        "ana", project.id, _req("VB08", name="Lab", cost={"minerals": {"basic": 1}})
    ).projects[0]
    assert (updated.code, updated.name, updated.done) == ("VB08", "Lab", True)


def test_editing_or_deleting_an_unknown_project_is_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        service.update_project("ana", "p-00000000", _req())
    with pytest.raises(FileNotFoundError):
        service.delete_project("ana", "p-00000000")


def test_deleting_a_project_clears_prerequisites_pointing_at_it() -> None:
    first = service.create_project("ana", _req("VB03")).projects[0]
    service.create_project("ana", _req("VB07", prerequisite_id=first.id))
    ship = service.delete_project("ana", first.id)
    assert [(p.code, p.prerequisite_id) for p in ship.projects] == [("VB07", None)]


def test_complete_deducts_cost_and_reopen_restores_it() -> None:
    for _ in range(3):
        service.adjust_stock("ana", "minerals", "rare", 1)
    project = service.create_project("ana", _req(cost={"minerals": {"rare": 2}})).projects[0]

    done = service.complete_project("ana", project.id)
    assert done.stock["minerals"]["rare"] == 1
    assert done.projects[0].done is True

    reopened = service.reopen_project("ana", project.id)
    assert reopened.stock["minerals"]["rare"] == 3
    assert reopened.projects[0].done is False


def test_completing_with_short_stock_clamps_at_zero_and_reopen_restores_full_cost() -> None:
    service.adjust_stock("ana", "minerals", "rare", 1)
    project = service.create_project("ana", _req(cost={"minerals": {"rare": 2}})).projects[0]
    assert service.complete_project("ana", project.id).stock["minerals"]["rare"] == 0
    # Reopening restores the whole cost, not what was actually taken: the game
    # state is what the crew says it is, and the clamp only guards against negatives.
    assert service.reopen_project("ana", project.id).stock["minerals"]["rare"] == 2


def test_complete_twice_and_reopen_open_are_refused() -> None:
    project = service.create_project("ana", _req()).projects[0]
    with pytest.raises(ValueError, match="isn't done"):
        service.reopen_project("ana", project.id)
    service.complete_project("ana", project.id)
    with pytest.raises(ValueError, match="already done"):
        service.complete_project("ana", project.id)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_service.py -v`
Expected: the new tests FAIL with `AttributeError: module ... has no attribute 'create_project'`

- [ ] **Step 3: Write the implementation** (append to `iss_vanguard_service.py`; add `import uuid` and extend the schema import to `Project, ProjectWriteRequest, RESOURCES, TIERS`)

```python
def _find(doc: ShipDoc, project_id: str) -> Project:
    for project in doc.projects:
        if project.id == project_id:
            return project
    raise FileNotFoundError(f"No project {project_id!r}")


def _clean(doc: ShipDoc, req: ProjectWriteRequest, project_id: str | None) -> ProjectWriteRequest:
    code = req.code.strip()
    if not code:
        raise ValueError("A project needs a code, e.g. VB07")
    if req.prerequisite_id is not None:
        if req.prerequisite_id == project_id:
            raise ValueError("A project can't be its own prerequisite")
        if not any(p.id == req.prerequisite_id for p in doc.projects):
            raise ValueError("The prerequisite project no longer exists")
    return req.model_copy(update={"code": code, "name": req.name.strip()})


def create_project(username: str, req: ProjectWriteRequest) -> ShipView:
    def change(doc: ShipDoc) -> None:
        clean = _clean(doc, req, None)
        doc.projects.append(Project(id=f"p-{uuid.uuid4().hex[:8]}", **clean.model_dump()))

    return _mutate(username, change)


def update_project(username: str, project_id: str, req: ProjectWriteRequest) -> ShipView:
    def change(doc: ShipDoc) -> None:
        project = _find(doc, project_id)
        clean = _clean(doc, req, project_id)
        project.code = clean.code
        project.name = clean.name
        project.prerequisite_id = clean.prerequisite_id
        project.cost = clean.cost

    return _mutate(username, change)


def delete_project(username: str, project_id: str) -> ShipView:
    def change(doc: ShipDoc) -> None:
        doc.projects.remove(_find(doc, project_id))
        for project in doc.projects:
            if project.prerequisite_id == project_id:
                project.prerequisite_id = None

    return _mutate(username, change)


def complete_project(username: str, project_id: str) -> ShipView:
    """Deduct the cost, clamping at 0: the game may already have played out with short stock."""

    def change(doc: ShipDoc) -> None:
        project = _find(doc, project_id)
        if project.done:
            raise ValueError(f"{project.code} is already done")
        for resource in RESOURCES:
            for tier in TIERS:
                have = doc.stock[resource][tier]
                doc.stock[resource][tier] = max(0, have - project.cost[resource][tier])
        project.done = True

    return _mutate(username, change)


def reopen_project(username: str, project_id: str) -> ShipView:
    def change(doc: ShipDoc) -> None:
        project = _find(doc, project_id)
        if not project.done:
            raise ValueError(f"{project.code} isn't done")
        for resource in RESOURCES:
            for tier in TIERS:
                doc.stock[resource][tier] += project.cost[resource][tier]
        project.done = False

    return _mutate(username, change)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_service.py -v`
Expected: all passed (15)

- [ ] **Step 5: Lint and commit**

```bash
cd backend && .venv/bin/black app/services/iss_vanguard_service.py tests/test_iss_vanguard_service.py && .venv/bin/ruff check app/services/iss_vanguard_service.py tests/test_iss_vanguard_service.py
git add backend/app/services/iss_vanguard_service.py backend/tests/test_iss_vanguard_service.py
git commit -m "feat(iss-vanguard): projects with prerequisites, complete and reopen

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Service: crew membership

**Files:**
- Modify: `backend/app/services/iss_vanguard_service.py` (append)
- Create: `backend/tests/test_iss_vanguard_members.py`

**Interfaces:**
- Consumes: `ensure_ship`, `_resolve`, `get_ship`, `events` (Task 3); `is_empty_grid` (Task 1); `auth_service.list_usernames() -> list[str]`.
- Produces: `add_member(caller, username) -> ShipView`; `remove_member(caller, username) -> ShipView` (self = leave). Publishes `{"type": "members.changed", "ship_id", "members"}` to the ship, plus `{"type": "ship.closed", "ship_id", "reason": "removed" | "joined", "member"}` to the ship the member left.

- [ ] **Step 1: Write the failing tests**

```python
"""Who shares a ship (RT-9, RT-10)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import iss_vanguard_repo as repo
from app.schemas.iss_vanguard import ProjectWriteRequest
from app.services import auth_service
from app.services import iss_vanguard_events as events
from app.services import iss_vanguard_service as service


@pytest.fixture(autouse=True)
def setup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    for name in ("ana", "bo", "cy"):
        auth_service.create_user(name)


@pytest.fixture
def published(monkeypatch: pytest.MonkeyPatch) -> list[tuple[str, dict]]:
    spy: list[tuple[str, dict]] = []
    monkeypatch.setattr(events, "publish", lambda key, event: spy.append((key, event)))
    return spy


def test_the_owner_adds_a_member_who_then_shares_everything() -> None:
    service.adjust_stock("ana", "minerals", "basic", 1)
    ship = service.add_member("ana", " bo ")
    assert ship.members == ["ana", "bo"]
    theirs = service.get_ship("bo")
    assert (theirs.id, theirs.is_owner) == (ship.id, False)
    assert service.adjust_stock("bo", "minerals", "basic", 1).stock["minerals"]["basic"] == 2


@pytest.mark.parametrize(("username", "message"), [("ana", "already"), ("zed", "no one")])
def test_add_member_refuses_yourself_and_unknown_names(username: str, message: str) -> None:
    with pytest.raises(ValueError, match=message):
        service.add_member("ana", username)


def test_add_member_refuses_someone_already_aboard() -> None:
    service.add_member("ana", "bo")
    with pytest.raises(ValueError, match="already"):
        service.add_member("ana", "bo")


def test_only_the_owner_adds_people() -> None:
    service.add_member("ana", "bo")
    with pytest.raises(PermissionError):
        service.add_member("bo", "cy")


def test_add_member_refuses_someone_whose_own_ship_has_anything() -> None:
    service.create_project("bo", ProjectWriteRequest(code="VB01"))
    with pytest.raises(ValueError, match="their ship"):
        service.add_member("ana", "bo")
    service.delete_project("bo", service.get_ship("bo").projects[0].id)
    service.adjust_stock("bo", "minerals", "basic", 1)
    with pytest.raises(ValueError, match="their ship"):
        service.add_member("ana", "bo")


def test_add_member_refuses_someone_who_shares_another_ship() -> None:
    service.add_member("cy", "bo")
    with pytest.raises(ValueError, match="shares"):
        service.add_member("ana", "bo")


def test_joining_removes_the_joiners_empty_ship_and_tells_its_stream(
    published: list[tuple[str, dict]],
) -> None:
    old = service.ensure_ship("bo")
    ship = service.add_member("ana", "bo")
    with pytest.raises(repo.ShipGoneError):
        repo.read_ship(old)
    assert (old, {"type": "ship.closed", "ship_id": old, "reason": "joined", "member": "bo"}) in (
        published
    )
    assert (
        ship.id,
        {"type": "members.changed", "ship_id": ship.id, "members": ["ana", "bo"]},
    ) in published


def test_the_owner_removes_a_member_who_then_starts_empty(
    published: list[tuple[str, dict]],
) -> None:
    ship = service.add_member("ana", "bo")
    service.adjust_stock("ana", "minerals", "basic", 1)
    assert service.remove_member("ana", "bo").members == ["ana"]
    fresh = service.get_ship("bo")
    assert (fresh.id, fresh.is_owner) == (None, True)
    assert (
        ship.id,
        {"type": "ship.closed", "ship_id": ship.id, "reason": "removed", "member": "bo"},
    ) in published


def test_a_member_leaves() -> None:
    service.add_member("ana", "bo")
    assert service.remove_member("bo", "bo").members == ["bo"]
    assert service.get_ship("ana").members == ["ana"]


def test_a_member_cannot_remove_someone_else() -> None:
    service.add_member("ana", "bo")
    service.add_member("ana", "cy")
    with pytest.raises(PermissionError):
        service.remove_member("bo", "cy")


def test_the_owner_cannot_leave() -> None:
    service.add_member("ana", "bo")
    with pytest.raises(ValueError, match="owner"):
        service.remove_member("ana", "ana")


def test_removing_a_non_member_is_not_found() -> None:
    service.ensure_ship("ana")
    with pytest.raises(FileNotFoundError):
        service.remove_member("ana", "cy")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_members.py -v`
Expected: FAIL with `AttributeError: ... has no attribute 'add_member'`. If `auth_service.create_user` fails in the fixture, look at the fixture in `tests/test_tea_cabinets.py` (lines 17-35, and `tests/tea_support.share`) and copy how it registers users.

- [ ] **Step 3: Write the implementation** (append; add `from app.services import auth_service` and `is_empty_grid` to the imports)

```python
def _is_empty(doc: ShipDoc) -> bool:
    return not doc.projects and is_empty_grid(doc.stock)


def _publish_members(ship_id: str) -> None:
    events.publish(
        ship_id,
        {"type": "members.changed", "ship_id": ship_id, "members": _members_of(ship_id)},
    )


def _publish_closed(ship_id: str, reason: str, member: str) -> None:
    # Everyone on the stream receives it; `member` says whose client should move.
    events.publish(
        ship_id,
        {"type": "ship.closed", "ship_id": ship_id, "reason": reason, "member": member},
    )


def add_member(caller: str, username: str) -> ShipView:
    """Move `username` aboard the caller's ship. Only an empty ship can be left behind."""
    username = username.strip()
    if username == caller:
        raise ValueError("You're already aboard this ship")
    if username not in auth_service.list_usernames():
        raise ValueError(f"There's no one called {username!r} on the dock")

    ship_id = ensure_ship(caller)
    abandoned: str | None = None
    with repo.membership_lock():
        members = repo.read_memberships()
        if repo.read_ship(ship_id).owner != caller:
            raise PermissionError("Only the ship's owner can add crew")
        theirs = members.get(username)
        if theirs == ship_id:
            raise ValueError(f"{username} is already aboard")
        if theirs is None:
            members[username] = ship_id
            repo.write_memberships(members)
        else:
            if any(ship == theirs for user, ship in members.items() if user != username):
                raise ValueError(f"{username} already shares a ship with someone else")
            with repo.ship_lock(theirs):
                if not _is_empty(repo.read_ship(theirs)):
                    raise ValueError(f"{username} already has resources or projects on their ship")
                members[username] = ship_id
                repo.write_memberships(members)
                # Only after the map write: a crash here leaves an unreferenced empty
                # file, never a member pointing at a ship that is gone.
                repo.delete_ship(theirs)
            abandoned = theirs
    if abandoned is not None:
        _publish_closed(abandoned, "joined", username)
    _publish_members(ship_id)
    return get_ship(caller)


def remove_member(caller: str, username: str) -> ShipView:
    """The owner removes anyone else; a member removes themself (leaving)."""
    ship_id = _resolve(caller)
    with repo.membership_lock():
        members = repo.read_memberships()
        if ship_id is None or members.get(username) != ship_id:
            raise FileNotFoundError(f"{username} isn't aboard this ship")
        owner = repo.read_ship(ship_id).owner
        if caller not in (owner, username):
            raise PermissionError("Only the ship's owner can remove other crew")
        if username == owner:
            raise ValueError("The owner can't leave the ship — remove the other crew instead")
        del members[username]
        repo.write_memberships(members)
    _publish_members(ship_id)
    _publish_closed(ship_id, "removed", username)
    return get_ship(caller)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_members.py tests/test_iss_vanguard_service.py -v`
Expected: all passed

- [ ] **Step 5: Lint and commit**

```bash
cd backend && .venv/bin/black app/services/iss_vanguard_service.py tests/test_iss_vanguard_members.py && .venv/bin/ruff check app/services/iss_vanguard_service.py tests/test_iss_vanguard_members.py
git add backend/app/services/iss_vanguard_service.py backend/tests/test_iss_vanguard_members.py
git commit -m "feat(iss-vanguard): shared ships — add, remove and leave crew

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Router, SSE endpoint and shell registration

**Files:**
- Create: `backend/app/routers/iss_vanguard.py`
- Modify: `backend/app/main.py` (import `iss_vanguard` in the `from app.routers import (...)` block; add `app.include_router(iss_vanguard.router)` after `kitchencraft`)
- Modify: `backend/app/routers/shell.py` (append to `_APPS`)
- Create: `backend/tests/test_iss_vanguard_router.py`
- Create: `backend/tests/test_iss_vanguard_events.py`

**Interfaces:**
- Consumes: every public service function (Tasks 3–5); `get_current_user`, `user_from_token` from `app.core.dependencies`.
- Produces: the HTTP API in the spec's table under `/api/iss-vanguard`; `sse_frames(ship_id, queue, is_disconnected, keepalive=15)` async generator.

- [ ] **Step 1: Write the failing router tests**

`backend/tests/test_iss_vanguard_router.py`. Auth is bypassed as `test_user` by `conftest.py`.

```python
"""HTTP contract of the ISS Vanguard API."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.repositories import iss_vanguard_repo as repo
from app.services import auth_service
from app.services import iss_vanguard_service as service

client = TestClient(app)
BASE = "/api/iss-vanguard/ship"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    for name in ("test_user", "bo"):
        auth_service.create_user(name)


def test_get_ship_returns_the_implicit_empty_ship() -> None:
    body = client.get(BASE).json()
    assert body["id"] is None
    assert body["members"] == ["test_user"]
    assert body["stock"]["minerals"] == {"basic": 0, "rare": 0, "very_rare": 0}


def test_a_stock_tap_returns_the_whole_ship() -> None:
    r = client.post(f"{BASE}/stock", json={"resource": "minerals", "tier": "rare", "delta": 1})
    assert r.status_code == 200
    assert r.json()["stock"]["minerals"]["rare"] == 1
    assert r.json()["rev"] == 1


@pytest.mark.parametrize(
    "body",
    [
        {"resource": "gold", "tier": "rare", "delta": 1},
        {"resource": "minerals", "tier": "rare", "delta": 5},
        {"resource": "minerals", "tier": "rare", "delta": -1},  # already at 0
    ],
)
def test_a_bad_tap_is_422(body: dict) -> None:
    assert client.post(f"{BASE}/stock", json=body).status_code == 422


def test_project_lifecycle_over_http() -> None:
    created = client.post(
        f"{BASE}/projects", json={"code": "VB07", "cost": {"minerals": {"basic": 1}}}
    )
    assert created.status_code == 200
    project_id = created.json()["projects"][0]["id"]

    edited = client.put(f"{BASE}/projects/{project_id}", json={"code": "VB08", "name": "Lab"})
    assert edited.json()["projects"][0]["code"] == "VB08"
    assert client.post(f"{BASE}/projects/{project_id}/complete").json()["projects"][0]["done"]
    assert not client.post(f"{BASE}/projects/{project_id}/reopen").json()["projects"][0]["done"]
    assert client.delete(f"{BASE}/projects/{project_id}").json()["projects"] == []


def test_project_errors_map_to_404_and_422() -> None:
    assert client.put(f"{BASE}/projects/p-00000000", json={"code": "X"}).status_code == 404
    assert client.post(f"{BASE}/projects/p-00000000/complete").status_code == 404
    assert client.post(f"{BASE}/projects", json={"code": "  "}).status_code == 422
    assert (
        client.post(f"{BASE}/projects", json={"code": "X", "cost": {"minerals": {"basic": -1}}})
    ).status_code == 422


def test_members_over_http() -> None:
    added = client.post(f"{BASE}/members", json={"username": "bo"})
    assert added.json()["members"] == ["bo", "test_user"]
    assert client.post(f"{BASE}/members", json={"username": "zed"}).status_code == 422
    assert client.delete(f"{BASE}/members/nobody").status_code == 404
    assert client.delete(f"{BASE}/members/bo").json()["members"] == ["test_user"]


def test_a_non_owner_adding_crew_is_403() -> None:
    service.add_member("bo", "test_user")
    auth_service.create_user("cy")
    assert client.post(f"{BASE}/members", json={"username": "cy"}).status_code == 403


def test_a_ship_that_vanished_mid_request_is_410(monkeypatch: pytest.MonkeyPatch) -> None:
    def gone(*_: object) -> None:
        raise repo.ShipGoneError("gone")

    monkeypatch.setattr(service, "adjust_stock", gone)
    r = client.post(f"{BASE}/stock", json={"resource": "minerals", "tier": "rare", "delta": 1})
    assert r.status_code == 410
    assert r.json()["detail"] == "Your ship changed — reload"


def test_the_shell_lists_the_app() -> None:
    apps = client.get("/api/apps").json()
    assert {
        "id": "iss-vanguard",
        "label": "ISS Vanguard",
        "icon": "rocket_launch",
        "route": "/iss-vanguard",
    } in apps
```

- [ ] **Step 2: Write the failing events tests**

`backend/tests/test_iss_vanguard_events.py`:

```python
"""The live ship stream: token gating over HTTP, streaming via the generator."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.routers.iss_vanguard import sse_frames
from app.services import iss_vanguard_events as events
from app.services import iss_vanguard_service as service

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "jwt_secret_key", "test-secret-key-for-tests-only")


def test_events_rejects_a_bad_token() -> None:
    assert client.get("/api/iss-vanguard/ship/events?token=garbage").status_code == 401


def test_events_without_a_token_is_422() -> None:
    assert client.get("/api/iss-vanguard/ship/events").status_code == 422


async def _never_disconnected() -> bool:
    return False


def test_sse_frames_open_deliver_and_unsubscribe() -> None:
    ship_id = service.ensure_ship("ana")

    async def scenario() -> tuple[str, dict, int]:
        queue = events.subscribe(ship_id)
        gen = sse_frames(ship_id, queue, _never_disconnected, keepalive=0.05)
        try:
            opening = await asyncio.wait_for(gen.__anext__(), timeout=2)
            events.publish(ship_id, {"type": "ship.changed", "ship_id": ship_id, "rev": 1})
            frame = ""
            while not frame.startswith("data:"):
                frame = await asyncio.wait_for(gen.__anext__(), timeout=2)
        finally:
            await gen.aclose()
        return opening.strip(), json.loads(frame.removeprefix("data:")), (
            events.subscriber_count(ship_id)
        )

    opening, payload, remaining = asyncio.run(scenario())
    assert opening == ": connected"
    assert payload == {"type": "ship.changed", "ship_id": ship_id, "rev": 1}
    assert remaining == 0

```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_router.py tests/test_iss_vanguard_events.py -v`
Expected: FAIL with `ImportError: cannot import name 'iss_vanguard' from 'app.routers'` (or 404s)

- [ ] **Step 4: Write the router**

`backend/app/routers/iss_vanguard.py`:

```python
"""ISS Vanguard resource tracker API.

Every route works on the caller's ship, resolved by the service from the
authenticated username; no route takes a ship id.

Exception mapping lives here and nowhere below: `FileNotFoundError → 404`,
`PermissionError → 403`, `ValueError → 422`, `ShipGoneError → 410` (the ship
vanished under a concurrent membership change — the client reloads).
"""

from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator, Awaitable, Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from fastapi.responses import StreamingResponse
from fastapi.routing import APIRoute

from app.core.dependencies import get_current_user, user_from_token
from app.schemas.iss_vanguard import (
    AddMemberRequest,
    ProjectWriteRequest,
    ShipView,
    StockAdjustRequest,
)
from app.services import iss_vanguard_events as events
from app.services import iss_vanguard_service as service


class _ShipRoute(APIRoute):
    """Maps the service's stdlib errors once, so no handler repeats the ladder."""

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def guarded(request: Request) -> Response:
            try:
                return await handler(request)
            except service.ShipGoneError as exc:
                raise HTTPException(status_code=410, detail="Your ship changed — reload") from exc
            except FileNotFoundError as exc:
                raise HTTPException(status_code=404, detail=str(exc)) from exc
            except PermissionError as exc:
                raise HTTPException(status_code=403, detail=str(exc)) from exc
            except ValueError as exc:
                raise HTTPException(status_code=422, detail=str(exc)) from exc

        return guarded


router = APIRouter(prefix="/api/iss-vanguard", tags=["iss-vanguard"], route_class=_ShipRoute)


@router.get("/ship", response_model=ShipView)
def get_ship(current_user: str = Depends(get_current_user)) -> ShipView:
    return service.get_ship(current_user)


@router.post("/ship/stock", response_model=ShipView)
def adjust_stock(
    req: StockAdjustRequest, current_user: str = Depends(get_current_user)
) -> ShipView:
    return service.adjust_stock(current_user, req.resource, req.tier, req.delta)


@router.post("/ship/projects", response_model=ShipView)
def create_project(
    req: ProjectWriteRequest, current_user: str = Depends(get_current_user)
) -> ShipView:
    return service.create_project(current_user, req)


@router.put("/ship/projects/{project_id}", response_model=ShipView)
def update_project(
    project_id: str, req: ProjectWriteRequest, current_user: str = Depends(get_current_user)
) -> ShipView:
    return service.update_project(current_user, project_id, req)


@router.delete("/ship/projects/{project_id}", response_model=ShipView)
def delete_project(project_id: str, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.delete_project(current_user, project_id)


@router.post("/ship/projects/{project_id}/complete", response_model=ShipView)
def complete_project(project_id: str, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.complete_project(current_user, project_id)


@router.post("/ship/projects/{project_id}/reopen", response_model=ShipView)
def reopen_project(project_id: str, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.reopen_project(current_user, project_id)


@router.post("/ship/members", response_model=ShipView)
def add_member(req: AddMemberRequest, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.add_member(current_user, req.username)


@router.delete("/ship/members/{username}", response_model=ShipView)
def remove_member(username: str, current_user: str = Depends(get_current_user)) -> ShipView:
    return service.remove_member(current_user, username)


_KEEPALIVE_SECONDS = 15


async def sse_frames(
    ship_id: str,
    queue: asyncio.Queue[dict[str, Any]],
    is_disconnected: Callable[[], Awaitable[bool]],
    keepalive: float = _KEEPALIVE_SECONDS,
) -> AsyncIterator[str]:
    """Format a subscriber's queue as SSE frames until disconnect; always unsubscribes."""
    try:
        yield ": connected\n\n"
        while True:
            if await is_disconnected():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=keepalive)
            except TimeoutError:
                yield ": ping\n\n"
                continue
            yield f"data: {json.dumps(event)}\n\n"
            if events.is_stale(ship_id, queue):
                # Overflowed and missed events: drop it; it resyncs on reconnect by `rev`.
                break
    finally:
        events.unsubscribe(ship_id, queue)


@router.get("/ship/events")
async def ship_events(request: Request, token: str = Query(...)) -> StreamingResponse:
    """SSE stream for the caller's ship, authenticated via `?token=`.

    An `EventSource` cannot send an `Authorization` header. The ship is created
    if the caller has none, so a brand-new user still has a stream to hear a
    `ship.closed {reason: "joined"}` on.
    """
    username = user_from_token(token)
    ship_id = service.ensure_ship(username)
    queue = events.subscribe(ship_id)
    return StreamingResponse(
        sse_frames(ship_id, queue, request.is_disconnected),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

- [ ] **Step 5: Register it**

In `backend/app/main.py`, add `iss_vanguard,` to the `from app.routers import (...)` list (keep it alphabetical) and `app.include_router(iss_vanguard.router)` after `app.include_router(kitchencraft.router)`.

In `backend/app/routers/shell.py`, append to `_APPS`:

```python
    AppDescriptor(
        id="iss-vanguard",
        label="ISS Vanguard",
        icon="rocket_launch",
        route="/iss-vanguard",
    ),
```

- [ ] **Step 6: Run the tests**

Run: `cd backend && .venv/bin/pytest tests/test_iss_vanguard_router.py tests/test_iss_vanguard_events.py -v`
Expected: all pass. `tests/test_app_registry_parity.py` will now FAIL because the frontend registry doesn't have the entry yet. That's expected and gets fixed in Task 13. Leave it failing only until then.

- [ ] **Step 7: Lint and commit**

```bash
cd backend && .venv/bin/black . && .venv/bin/ruff check .
git add backend/app/routers/iss_vanguard.py backend/app/main.py backend/app/routers/shell.py backend/tests/test_iss_vanguard_router.py backend/tests/test_iss_vanguard_events.py
git commit -m "feat(iss-vanguard): HTTP API, live ship stream and shell entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Frontend vocabulary, types and ship maths

**Files:**
- Create: `frontend/src/apps/iss-vanguard/types.ts`
- Create: `frontend/src/apps/iss-vanguard/resources.ts`
- Create: `frontend/src/apps/iss-vanguard/shipMath.ts`
- Test: `frontend/src/apps/iss-vanguard/resources.spec.ts`, `shipMath.spec.ts`

**Interfaces:**
- Produces (types): `ResourceId`, `TierId`, `Grid`, `Project`, `Ship`, `ProjectDraft`, `Shortage`, `ProjectShortfall`.
- Produces (resources): `RESOURCES: readonly { id: ResourceId; name: string }[]`, `TIERS: readonly { id: TierId; name: string }[]`, `emptyGrid(): Grid`, `cellName(resource, tier): string`.
- Produces (shipMath): `needed(ship): Grid`, `diff(ship): Grid`, `shortfall(stock, cost): Shortage[]`, `perProjectShortfall(ship): ProjectShortfall[]`.

- [ ] **Step 1: Write the types** (no test — types only)

`types.ts`:

```ts
export type ResourceId =
  | "microorganisms"
  | "alien_technologies"
  | "minerals"
  | "strange_flora"
  | "living_specimens";

export type TierId = "basic" | "rare" | "very_rare";

export type Grid = Record<ResourceId, Record<TierId, number>>;

export interface Project {
  id: string;
  code: string;
  name: string;
  prerequisite_id: string | null;
  cost: Grid;
  done: boolean;
}

export interface Ship {
  // null while the caller owns an implicit empty ship the server hasn't written yet.
  id: string | null;
  owner: string;
  members: string[];
  is_owner: boolean;
  rev: number;
  stock: Grid;
  projects: Project[];
}

export interface ProjectDraft {
  code: string;
  name: string;
  prerequisite_id: string | null;
  cost: Grid;
}

export interface Shortage {
  resource: ResourceId;
  tier: TierId;
  amount: number;
}

export interface ProjectShortfall {
  project: Project;
  missing: Shortage[];
}
```

- [ ] **Step 2: Write the failing tests**

`resources.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RESOURCES, TIERS, cellName, emptyGrid } from "./resources";

describe("resources", () => {
  it("lists the five resources and three tiers in display order", () => {
    expect(RESOURCES.map((r) => r.name)).toEqual([
      "Mikroorganizmy",
      "Mimozemské technológie",
      "Minerály",
      "Podivná flóra",
      "Živé exempláre",
    ]);
    expect(TIERS.map((t) => t.name)).toEqual(["Základný", "Vzácny", "Veľmi vzácny"]);
  });

  it("builds a fresh all-zero grid each call", () => {
    const a = emptyGrid();
    a.minerals.rare = 3;
    expect(emptyGrid().minerals.rare).toBe(0);
    expect(Object.keys(emptyGrid())).toHaveLength(5);
  });

  it("names a cell", () => {
    expect(cellName("minerals", "very_rare")).toBe("Minerály · Veľmi vzácny");
  });
});
```

`shipMath.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emptyGrid } from "./resources";
import { diff, needed, perProjectShortfall, shortfall } from "./shipMath";
import type { Grid, Project, Ship } from "./types";

function grid(cells: Partial<Record<string, number>>): Grid {
  const g = emptyGrid();
  for (const [key, value] of Object.entries(cells)) {
    const [resource, tier] = key.split(".") as [keyof Grid, "basic" | "rare" | "very_rare"];
    g[resource][tier] = value ?? 0;
  }
  return g;
}

function project(id: string, cost: Grid, done = false): Project {
  return { id, code: id.toUpperCase(), name: "", prerequisite_id: null, cost, done };
}

function ship(stock: Grid, projects: Project[]): Ship {
  return { id: "s_1", owner: "ana", members: ["ana"], is_owner: true, rev: 1, stock, projects };
}

describe("shipMath", () => {
  const s = ship(grid({ "minerals.rare": 3, "strange_flora.basic": 1 }), [
    project("a", grid({ "minerals.rare": 2 })),
    project("b", grid({ "minerals.rare": 2, "strange_flora.basic": 1 })),
    project("done", grid({ "minerals.rare": 9 }), true),
  ]);

  it("sums the cost of projects that aren't done", () => {
    expect(needed(s).minerals.rare).toBe(4);
    expect(needed(s).strange_flora.basic).toBe(1);
  });

  it("subtracts needed from stock, going negative when short", () => {
    const d = diff(s);
    expect(d.minerals.rare).toBe(-1);
    expect(d.strange_flora.basic).toBe(0);
    expect(d.microorganisms.basic).toBe(0);
  });

  it("lists only the missing cells, in display order", () => {
    expect(
      shortfall(grid({ "minerals.basic": 1 }), grid({ "minerals.basic": 3, "microorganisms.rare": 1 })),
    ).toEqual([
      { resource: "microorganisms", tier: "rare", amount: 1 },
      { resource: "minerals", tier: "basic", amount: 2 },
    ]);
  });

  it("measures each open project against the whole stock on its own", () => {
    // a (2) and b (2) are each coverable by 3 alone, even though together they need 4.
    expect(perProjectShortfall(s)).toEqual([]);
    const short = ship(grid({ "minerals.rare": 1 }), s.projects);
    expect(perProjectShortfall(short).map((p) => [p.project.id, p.missing])).toEqual([
      ["a", [{ resource: "minerals", tier: "rare", amount: 1 }]],
      [
        "b",
        [
          { resource: "minerals", tier: "rare", amount: 1 },
          { resource: "strange_flora", tier: "basic", amount: 1 },
        ],
      ],
    ]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard`
Expected: FAIL: cannot resolve `./resources` / `./shipMath`

- [ ] **Step 4: Write the implementation**

`resources.ts`:

```ts
import type { Grid, ResourceId, TierId } from "./types";

// The game's own Slovak names; the rest of the UI is English.
export const RESOURCES: readonly { id: ResourceId; name: string }[] = [
  { id: "microorganisms", name: "Mikroorganizmy" },
  { id: "alien_technologies", name: "Mimozemské technológie" },
  { id: "minerals", name: "Minerály" },
  { id: "strange_flora", name: "Podivná flóra" },
  { id: "living_specimens", name: "Živé exempláre" },
];

export const TIERS: readonly { id: TierId; name: string }[] = [
  { id: "basic", name: "Základný" },
  { id: "rare", name: "Vzácny" },
  { id: "very_rare", name: "Veľmi vzácny" },
];

export function emptyGrid(): Grid {
  return Object.fromEntries(
    RESOURCES.map((r) => [r.id, Object.fromEntries(TIERS.map((t) => [t.id, 0]))]),
  ) as Grid;
}

export function cellName(resource: ResourceId, tier: TierId): string {
  const r = RESOURCES.find((x) => x.id === resource)?.name ?? resource;
  const t = TIERS.find((x) => x.id === tier)?.name ?? tier;
  return `${r} · ${t}`;
}
```

`shipMath.ts`:

```ts
import { RESOURCES, TIERS, emptyGrid } from "./resources";
import type { Grid, ProjectShortfall, Ship, Shortage } from "./types";

export function needed(ship: Ship): Grid {
  const total = emptyGrid();
  for (const project of ship.projects) {
    if (project.done) continue;
    for (const r of RESOURCES)
      for (const t of TIERS) total[r.id][t.id] += project.cost[r.id][t.id];
  }
  return total;
}

export function diff(ship: Ship): Grid {
  const need = needed(ship);
  const out = emptyGrid();
  for (const r of RESOURCES)
    for (const t of TIERS) out[r.id][t.id] = ship.stock[r.id][t.id] - need[r.id][t.id];
  return out;
}

export function shortfall(stock: Grid, cost: Grid): Shortage[] {
  const missing: Shortage[] = [];
  for (const r of RESOURCES)
    for (const t of TIERS) {
      const amount = cost[r.id][t.id] - stock[r.id][t.id];
      if (amount > 0) missing.push({ resource: r.id, tier: t.id, amount });
    }
  return missing;
}

/** Each open project against the whole stock alone — stock is not shared out between them. */
export function perProjectShortfall(ship: Ship): ProjectShortfall[] {
  return ship.projects
    .filter((p) => !p.done)
    .map((project) => ({ project, missing: shortfall(ship.stock, project.cost) }))
    .filter((p) => p.missing.length > 0);
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard`
Expected: 7 passed

- [ ] **Step 6: Lint and commit**

```bash
cd frontend && npx eslint src/apps/iss-vanguard && npx prettier --write src/apps/iss-vanguard
git add frontend/src/apps/iss-vanguard
git commit -m "feat(iss-vanguard): frontend vocabulary, types and ship maths

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Live events composable

**Files:**
- Create: `frontend/src/apps/iss-vanguard/composables/useShipEvents.ts`
- Test: `frontend/src/apps/iss-vanguard/composables/useShipEvents.spec.ts`

**Interfaces:**
- Produces: `useShipEvents(token: string, handlers: ShipEventHandlers): ShipEventsSubscription` where `ShipEventHandlers = { onChanged?(e: ShipChangedEvent); onMembersChanged?(e: MembersChangedEvent); onClosed?(e: ShipClosedEvent) }` and `ShipEventsSubscription = { close(): void }`. Event types: `ShipChangedEvent {type:"ship.changed"; ship_id; rev; actor}`, `MembersChangedEvent {type:"members.changed"; ship_id; members}`, `ShipClosedEvent {type:"ship.closed"; ship_id; reason: "removed" | "joined"; member}`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useShipEvents } from "./useShipEvents";

class FakeEventSource {
  static last: FakeEventSource | null = null;
  onmessage: ((m: MessageEvent<string>) => void) | null = null;
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  close() {
    this.closed = true;
  }
  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEventSource);
  FakeEventSource.last = null;
});
afterEach(() => vi.unstubAllGlobals());

describe("useShipEvents", () => {
  it("opens the caller's ship stream with the token in the query", () => {
    useShipEvents("tok en/+", {});
    expect(FakeEventSource.last?.url).toBe(
      "/api/iss-vanguard/ship/events?token=tok%20en%2F%2B",
    );
  });

  it("dispatches each event type and ignores junk", () => {
    const onChanged = vi.fn();
    const onMembersChanged = vi.fn();
    const onClosed = vi.fn();
    useShipEvents("t", { onChanged, onMembersChanged, onClosed });
    const src = FakeEventSource.last!;
    src.emit({ type: "ship.changed", ship_id: "s", rev: 2, actor: "bo" });
    src.emit({ type: "members.changed", ship_id: "s", members: ["ana"] });
    src.emit({ type: "ship.closed", ship_id: "s", reason: "removed", member: "bo" });
    src.emit({ type: "other" });
    src.onmessage?.({ data: "not json" } as MessageEvent<string>);
    expect(onChanged).toHaveBeenCalledWith({ type: "ship.changed", ship_id: "s", rev: 2, actor: "bo" });
    expect(onMembersChanged).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("closes the stream", () => {
    useShipEvents("t", {}).close();
    expect(FakeEventSource.last?.closed).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/composables`
Expected: FAIL: cannot resolve `./useShipEvents`

- [ ] **Step 3: Write the implementation**

```ts
// The ONE justified exception to "all HTTP goes through useApi" in this app:
// `useApi` is fetch-based and cannot hold a server-push stream open. Kept here
// so nothing else touches `EventSource`. The JWT rides as `?token=` because an
// `EventSource` cannot send an Authorization header.

export interface ShipChangedEvent {
  type: "ship.changed";
  ship_id: string;
  rev: number;
  actor: string;
}

export interface MembersChangedEvent {
  type: "members.changed";
  ship_id: string;
  members: string[];
}

export interface ShipClosedEvent {
  type: "ship.closed";
  ship_id: string;
  reason: "removed" | "joined";
  // Everyone on the stream gets the frame; only this member's client moves ship.
  member: string;
}

export type ShipEvent = ShipChangedEvent | MembersChangedEvent | ShipClosedEvent;

export interface ShipEventHandlers {
  onChanged?: (event: ShipChangedEvent) => void;
  onMembersChanged?: (event: MembersChangedEvent) => void;
  onClosed?: (event: ShipClosedEvent) => void;
}

export interface ShipEventsSubscription {
  close(): void;
}

export function useShipEvents(
  token: string,
  handlers: ShipEventHandlers,
): ShipEventsSubscription {
  const source = new EventSource(
    `/api/iss-vanguard/ship/events?token=${encodeURIComponent(token)}`,
  );

  source.onmessage = (message: MessageEvent<string>) => {
    let event: ShipEvent;
    try {
      event = JSON.parse(message.data) as ShipEvent;
    } catch {
      return;
    }
    switch (event.type) {
      case "ship.changed":
        handlers.onChanged?.(event);
        break;
      case "members.changed":
        handlers.onMembersChanged?.(event);
        break;
      case "ship.closed":
        handlers.onClosed?.(event);
        break;
    }
  };

  return { close: () => source.close() };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/composables`
Expected: 3 passed

- [ ] **Step 5: Lint and commit**

```bash
cd frontend && npx eslint src/apps/iss-vanguard && npx prettier --write src/apps/iss-vanguard
git add frontend/src/apps/iss-vanguard/composables
git commit -m "feat(iss-vanguard): live ship events composable

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ship store

**Files:**
- Create: `frontend/src/apps/iss-vanguard/stores/useShipStore.ts`
- Test: `frontend/src/apps/iss-vanguard/stores/useShipStore.spec.ts`

**Interfaces:**
- Consumes: `api` from `@/composables/useApi`; `useAuthStore` (`username`); `needed`, `diff`, `perProjectShortfall` (Task 7); types (Task 7).
- Produces: `useShipStore()` with state `ship: Ship | null`, `loading: boolean`, `error: string | null`; getters `needed: Grid | null`, `diff: Grid | null`, `shortfalls: ProjectShortfall[]`; actions `fetchShip(): Promise<void>`, `applyRemoteRev(rev: number): Promise<void>`, `adjustStock(resource, tier, delta: 1 | -1): Promise<boolean>`, `createProject(draft): Promise<boolean>`, `updateProject(id, draft): Promise<boolean>`, `deleteProject(id): Promise<boolean>`, `completeProject(id): Promise<boolean>`, `reopenProject(id): Promise<boolean>`, `addMember(username): Promise<boolean>`, `removeMember(username): Promise<boolean>`, `leave(): Promise<boolean>`, `fetchRoster(): Promise<string[]>`. Every failed write sets `error` and refetches the ship.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

import { useShipStore } from "./useShipStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { emptyGrid } from "../resources";
import type { Ship } from "../types";

function ship(over: Partial<Ship> = {}): Ship {
  return {
    id: "s_1",
    owner: "ana",
    members: ["ana"],
    is_owner: true,
    rev: 1,
    stock: emptyGrid(),
    projects: [],
    ...over,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("useShipStore", () => {
  it("fetches the ship and derives needed and diff", async () => {
    getMock.mockResolvedValue(ship());
    const store = useShipStore();
    await store.fetchShip();
    expect(getMock).toHaveBeenCalledWith("/iss-vanguard/ship");
    expect(store.ship?.id).toBe("s_1");
    expect(store.needed?.minerals.basic).toBe(0);
    expect(store.loading).toBe(false);
  });

  it("sends a tap as a delta and takes the returned ship", async () => {
    const after = ship({ rev: 2 });
    after.stock.minerals.rare = 1;
    postMock.mockResolvedValue(after);
    const store = useShipStore();
    expect(await store.adjustStock("minerals", "rare", 1)).toBe(true);
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/stock", {
      resource: "minerals",
      tier: "rare",
      delta: 1,
    });
    expect(store.ship?.stock.minerals.rare).toBe(1);
  });

  it("reports a rejected tap and refetches so the grid reconverges", async () => {
    postMock.mockRejectedValue({ detail: "minerals (rare) is already at 0" });
    getMock.mockResolvedValue(ship({ rev: 5 }));
    const store = useShipStore();
    expect(await store.adjustStock("minerals", "rare", -1)).toBe(false);
    expect(store.error).toBe("minerals (rare) is already at 0");
    expect(store.ship?.rev).toBe(5);
    expect(store.loading).toBe(false);
  });

  it("refetches on a remote change only when it is newer", async () => {
    getMock.mockResolvedValue(ship({ rev: 3 }));
    const store = useShipStore();
    await store.fetchShip();
    getMock.mockClear();
    await store.applyRemoteRev(3);
    expect(getMock).not.toHaveBeenCalled();
    await store.applyRemoteRev(4);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("uses the project endpoints", async () => {
    const draft = { code: "VB07", name: "", prerequisite_id: null, cost: emptyGrid() };
    postMock.mockResolvedValue(ship());
    putMock.mockResolvedValue(ship());
    delMock.mockResolvedValue(ship());
    const store = useShipStore();
    await store.createProject(draft);
    await store.updateProject("p-1", draft);
    await store.completeProject("p-1");
    await store.reopenProject("p-1");
    await store.deleteProject("p-1");
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/projects", draft);
    expect(putMock).toHaveBeenCalledWith("/iss-vanguard/ship/projects/p-1", draft);
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/projects/p-1/complete");
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/projects/p-1/reopen");
    expect(delMock).toHaveBeenCalledWith("/iss-vanguard/ship/projects/p-1");
  });

  it("adds, removes and leaves via the members endpoints", async () => {
    useAuthStore().username = "bo";
    postMock.mockResolvedValue(ship());
    delMock.mockResolvedValue(ship({ owner: "bo", members: ["bo"] }));
    const store = useShipStore();
    await store.addMember("cy");
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/members", { username: "cy" });
    expect(await store.leave()).toBe(true);
    expect(delMock).toHaveBeenCalledWith("/iss-vanguard/ship/members/bo");
    expect(store.ship?.owner).toBe("bo");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/stores`
Expected: FAIL: cannot resolve `./useShipStore`

- [ ] **Step 3: Write the implementation**

```ts
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { useAuthStore } from "@/stores/useAuthStore";
import { diff as diffOf, needed as neededOf, perProjectShortfall } from "../shipMath";
import type { Grid, ProjectDraft, ProjectShortfall, ResourceId, Ship, TierId } from "../types";

const BASE = "/iss-vanguard/ship";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

export const useShipStore = defineStore("iss-vanguard-ship", () => {
  const ship = ref<Ship | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const needed = computed<Grid | null>(() => (ship.value ? neededOf(ship.value) : null));
  const diff = computed<Grid | null>(() => (ship.value ? diffOf(ship.value) : null));
  const shortfalls = computed<ProjectShortfall[]>(() =>
    ship.value ? perProjectShortfall(ship.value) : [],
  );

  async function fetchShip(): Promise<void> {
    loading.value = true;
    try {
      ship.value = await api.get<Ship>(BASE);
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function applyRemoteRev(rev: number): Promise<void> {
    if (ship.value === null || rev > ship.value.rev) await fetchShip();
  }

  /** Every write returns the whole ship; a rejected one refetches so the view reconverges. */
  async function write(call: () => Promise<Ship>): Promise<boolean> {
    loading.value = true;
    try {
      ship.value = await call();
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      try {
        ship.value = await api.get<Ship>(BASE);
      } catch {
        // The write's error is already shown; a failed refetch adds nothing.
      }
      return false;
    } finally {
      loading.value = false;
    }
  }

  const adjustStock = (resource: ResourceId, tier: TierId, delta: 1 | -1) =>
    write(() => api.post<Ship>(`${BASE}/stock`, { resource, tier, delta }));
  const createProject = (draft: ProjectDraft) =>
    write(() => api.post<Ship>(`${BASE}/projects`, { ...draft }));
  const updateProject = (id: string, draft: ProjectDraft) =>
    write(() => api.put<Ship>(`${BASE}/projects/${id}`, { ...draft }));
  const deleteProject = (id: string) => write(() => api.del<Ship>(`${BASE}/projects/${id}`));
  const completeProject = (id: string) =>
    write(() => api.post<Ship>(`${BASE}/projects/${id}/complete`));
  const reopenProject = (id: string) =>
    write(() => api.post<Ship>(`${BASE}/projects/${id}/reopen`));
  const addMember = (username: string) =>
    write(() => api.post<Ship>(`${BASE}/members`, { username }));
  const removeMember = (username: string) =>
    write(() => api.del<Ship>(`${BASE}/members/${encodeURIComponent(username)}`));

  async function leave(): Promise<boolean> {
    const me = useAuthStore().username;
    return me ? removeMember(me) : false;
  }

  /** The dock roster for the add field; a failure yields an empty list. */
  async function fetchRoster(): Promise<string[]> {
    try {
      return (await api.get<{ usernames: string[] }>("/auth/users")).usernames;
    } catch (e) {
      error.value = message(e);
      return [];
    }
  }

  return {
    ship,
    loading,
    error,
    needed,
    diff,
    shortfalls,
    fetchShip,
    applyRemoteRev,
    adjustStock,
    createProject,
    updateProject,
    deleteProject,
    completeProject,
    reopenProject,
    addMember,
    removeMember,
    leave,
    fetchRoster,
  };
});
```

`leave` doesn't need to refetch. The DELETE response is the leaver's own new empty ship, because the service returns `get_ship(caller)` after removing the membership.

The `createProject` test expects `postMock` to be called with `draft`. `{ ...draft }` is equal by value, and that's what `toHaveBeenCalledWith` compares, so it passes. The spread is there because `api.post` wants a `Record<string, unknown>` and an interface doesn't satisfy that type.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/stores`
Expected: 6 passed

- [ ] **Step 5: Lint and commit**

```bash
cd frontend && npx eslint src/apps/iss-vanguard && npx prettier --write src/apps/iss-vanguard
git add frontend/src/apps/iss-vanguard/stores
git commit -m "feat(iss-vanguard): ship store with delta taps and refetch on rejection

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: ResourceGrid and StockStepper

**Files:**
- Create: `frontend/src/apps/iss-vanguard/components/ResourceGrid.vue`
- Create: `frontend/src/apps/iss-vanguard/components/StockStepper.vue`
- Test: `ResourceGrid.spec.ts`, `StockStepper.spec.ts` (same folder)

**Interfaces:**
- Consumes: `RESOURCES`, `TIERS`, `cellName` (Task 7).
- Produces: `<ResourceGrid :grid="Grid" mode="edit|readonly|diff" @cell-tap="(resource, tier) => …" />`. Each cell has `data-testid="cell-{resource}-{tier}"`; in `diff` mode, cells get classes `grid__cell--short` (<0), `grid__cell--spare` (>0), `grid__cell--even` (0) and show `-3` / `+2` / `0`.
- Produces: `<StockStepper :resource :tier :count :busy @step="(delta: 1 | -1) => …" @close />` with test ids `stepper-minus`, `stepper-plus`, `stepper-count`, `stepper-close`. Minus is disabled at 0; both buttons are disabled while `busy`.

- [ ] **Step 1: Write the failing tests**

`ResourceGrid.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ResourceGrid from "./ResourceGrid.vue";
import { emptyGrid } from "../resources";

describe("ResourceGrid", () => {
  it("renders 5 rows by 3 tiers with Slovak names", () => {
    const wrapper = mount(ResourceGrid, { props: { grid: emptyGrid(), mode: "readonly" } });
    expect(wrapper.findAll("tbody tr")).toHaveLength(5);
    expect(wrapper.findAll("thead th")).toHaveLength(4);
    expect(wrapper.text()).toContain("Podivná flóra");
    expect(wrapper.text()).toContain("Veľmi vzácny");
  });

  it("emits cell-tap in edit mode only", async () => {
    const edit = mount(ResourceGrid, { props: { grid: emptyGrid(), mode: "edit" } });
    await edit.get("[data-testid=cell-minerals-rare]").trigger("click");
    expect(edit.emitted("cell-tap")).toEqual([["minerals", "rare"]]);

    const ro = mount(ResourceGrid, { props: { grid: emptyGrid(), mode: "readonly" } });
    await ro.get("[data-testid=cell-minerals-rare]").trigger("click");
    expect(ro.emitted("cell-tap")).toBeUndefined();
  });

  it("shows signed, coloured values in diff mode", () => {
    const grid = emptyGrid();
    grid.minerals.rare = -3;
    grid.minerals.basic = 2;
    const wrapper = mount(ResourceGrid, { props: { grid, mode: "diff" } });
    const short = wrapper.get("[data-testid=cell-minerals-rare]");
    const spare = wrapper.get("[data-testid=cell-minerals-basic]");
    const even = wrapper.get("[data-testid=cell-minerals-very_rare]");
    expect([short.text(), spare.text(), even.text()]).toEqual(["-3", "+2", "0"]);
    expect(short.classes()).toContain("grid__cell--short");
    expect(spare.classes()).toContain("grid__cell--spare");
    expect(even.classes()).toContain("grid__cell--even");
  });
});
```

`StockStepper.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StockStepper from "./StockStepper.vue";

const props = { resource: "minerals", tier: "rare", count: 2, busy: false } as const;

describe("StockStepper", () => {
  it("names the cell, shows the count and emits steps", async () => {
    const wrapper = mount(StockStepper, { props });
    expect(wrapper.text()).toContain("Minerály · Vzácny");
    expect(wrapper.get("[data-testid=stepper-count]").text()).toBe("2");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    await wrapper.get("[data-testid=stepper-minus]").trigger("click");
    await wrapper.get("[data-testid=stepper-close]").trigger("click");
    expect(wrapper.emitted("step")).toEqual([[1], [-1]]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("disables minus at zero and both while busy", () => {
    const zero = mount(StockStepper, { props: { ...props, count: 0 } });
    expect(zero.get("[data-testid=stepper-minus]").attributes("disabled")).toBeDefined();
    expect(zero.get("[data-testid=stepper-plus]").attributes("disabled")).toBeUndefined();
    const busy = mount(StockStepper, { props: { ...props, busy: true } });
    expect(busy.get("[data-testid=stepper-plus]").attributes("disabled")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/components`
Expected: FAIL: cannot resolve the `.vue` files

- [ ] **Step 3: Write `ResourceGrid.vue`**

```vue
<template>
  <table class="grid" data-testid="resource-grid">
    <thead>
      <tr>
        <th />
        <th v-for="tier in TIERS" :key="tier.id" scope="col">{{ tier.name }}</th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="resource in RESOURCES" :key="resource.id">
        <th scope="row" class="grid__name">{{ resource.name }}</th>
        <td v-for="tier in TIERS" :key="tier.id">
          <button
            v-if="mode === 'edit'"
            type="button"
            class="grid__cell grid__cell--tap"
            :data-testid="`cell-${resource.id}-${tier.id}`"
            @click="emit('cell-tap', resource.id, tier.id)"
          >
            {{ grid[resource.id][tier.id] }}
          </button>
          <span
            v-else
            class="grid__cell"
            :class="mode === 'diff' ? tone(grid[resource.id][tier.id]) : ''"
            :data-testid="`cell-${resource.id}-${tier.id}`"
          >
            {{ label(grid[resource.id][tier.id]) }}
          </span>
        </td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { RESOURCES, TIERS } from "../resources";
import type { Grid, ResourceId, TierId } from "../types";

const props = defineProps<{ grid: Grid; mode: "edit" | "readonly" | "diff" }>();
const emit = defineEmits<{ "cell-tap": [resource: ResourceId, tier: TierId] }>();

function tone(value: number): string {
  if (value < 0) return "grid__cell--short";
  if (value > 0) return "grid__cell--spare";
  return "grid__cell--even";
}

function label(value: number): string {
  return props.mode === "diff" && value > 0 ? `+${value}` : String(value);
}
</script>

<style scoped lang="scss">
.grid {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}
.grid th {
  font-size: 12px;
  font-weight: 500;
  padding: 4px;
  text-align: center;
}
.grid__name {
  text-align: left !important;
  width: 34%;
}
.grid td {
  padding: 3px;
}
.grid__cell {
  display: block;
  width: 100%;
  min-height: 44px;
  line-height: 44px;
  text-align: center;
  font-size: 18px;
  font-variant-numeric: tabular-nums;
  border-radius: 6px;
  background: rgba(127, 127, 127, 0.12);
}
.grid__cell--tap {
  border: 0;
  cursor: pointer;
  color: inherit;
}
.grid__cell--short {
  color: #e05757;
}
.grid__cell--spare {
  color: #3fa66b;
}
.grid__cell--even {
  opacity: 0.45;
}
</style>
```

- [ ] **Step 4: Write `StockStepper.vue`**

```vue
<template>
  <div class="stepper" data-testid="stock-stepper">
    <p class="stepper__title">{{ cellName(resource, tier) }}</p>
    <div class="stepper__row">
      <button
        type="button"
        class="stepper__btn"
        data-testid="stepper-minus"
        :disabled="busy || count === 0"
        @click="emit('step', -1)"
      >
        −
      </button>
      <span class="stepper__count" data-testid="stepper-count">{{ count }}</span>
      <button
        type="button"
        class="stepper__btn"
        data-testid="stepper-plus"
        :disabled="busy"
        @click="emit('step', 1)"
      >
        +
      </button>
    </div>
    <button type="button" class="stepper__close" data-testid="stepper-close" @click="emit('close')">
      Done
    </button>
  </div>
</template>

<script setup lang="ts">
import { cellName } from "../resources";
import type { ResourceId, TierId } from "../types";

defineProps<{ resource: ResourceId; tier: TierId; count: number; busy: boolean }>();
const emit = defineEmits<{ step: [delta: 1 | -1]; close: [] }>();
</script>

<style scoped lang="scss">
.stepper {
  padding: 16px;
  text-align: center;
}
.stepper__title {
  margin: 0 0 12px;
  font-size: 15px;
}
.stepper__row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}
.stepper__btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 0;
  font-size: 32px;
  cursor: pointer;
}
.stepper__btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.stepper__count {
  min-width: 64px;
  font-size: 40px;
  font-variant-numeric: tabular-nums;
}
.stepper__close {
  margin-top: 16px;
  background: transparent;
  border: 0;
  font-size: 14px;
  cursor: pointer;
  color: inherit;
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/components`
Expected: 5 passed

- [ ] **Step 6: Lint and commit**

```bash
cd frontend && npx eslint src/apps/iss-vanguard && npx prettier --write src/apps/iss-vanguard
git add frontend/src/apps/iss-vanguard/components
git commit -m "feat(iss-vanguard): resource grid and stock stepper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: ProjectEditor and ProjectList

**Files:**
- Create: `frontend/src/apps/iss-vanguard/components/ProjectEditor.vue`
- Create: `frontend/src/apps/iss-vanguard/components/ProjectRow.vue`
- Create: `frontend/src/apps/iss-vanguard/components/ProjectList.vue`
- Test: `ProjectEditor.spec.ts`, `ProjectList.spec.ts` (ProjectRow is covered through ProjectList)

**Interfaces:**
- Consumes: `ResourceGrid`, `StockStepper` (Task 10); `emptyGrid` (Task 7); types.
- Produces: `<ProjectEditor :project="Project | null" :projects="Project[]" :busy @save="(draft: ProjectDraft) => …" @cancel />`. Test ids: `editor-code`, `editor-name`, `editor-prerequisite` (a `<select>`, empty value = none), `editor-save` (disabled when the code is blank or `busy`), `editor-cancel`. The cost grid uses the `cell-*` ids from ResourceGrid, and tapping a cell shows an inline `StockStepper` that edits the local draft.
- Produces: `<ProjectList :projects="Project[]" @edit @complete @reopen @remove />`. Each event carries the `Project`. Rows have `data-testid="project-{id}"`, with buttons `project-edit-{id}`, `project-complete-{id}` (open projects), `project-reopen-{id}` (done projects) and `project-delete-{id}`. The prerequisite chip is `project-prereq-{id}`, with class `chip--done` when that prerequisite is done. Done projects sit inside `<details data-testid="completed">`.

- [ ] **Step 1: Write the failing tests**

`ProjectEditor.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProjectEditor from "./ProjectEditor.vue";
import { emptyGrid } from "../resources";
import type { Project, ProjectDraft } from "../types";

const other: Project = {
  id: "p-1",
  code: "VB03",
  name: "Hull",
  prerequisite_id: null,
  cost: emptyGrid(),
  done: false,
};

describe("ProjectEditor", () => {
  it("builds a new draft from the fields and the cost grid", async () => {
    const wrapper = mount(ProjectEditor, {
      props: { project: null, projects: [other], busy: false },
    });
    expect(wrapper.get("[data-testid=editor-save]").attributes("disabled")).toBeDefined();

    await wrapper.get("[data-testid=editor-code]").setValue("VB07");
    await wrapper.get("[data-testid=editor-name]").setValue("Reactor");
    await wrapper.get("[data-testid=editor-prerequisite]").setValue("p-1");
    await wrapper.get("[data-testid=cell-minerals-rare]").trigger("click");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    await wrapper.get("[data-testid=editor-save]").trigger("click");

    const [[draft]] = wrapper.emitted("save") as [[ProjectDraft]];
    expect(draft.code).toBe("VB07");
    expect(draft.name).toBe("Reactor");
    expect(draft.prerequisite_id).toBe("p-1");
    expect(draft.cost.minerals.rare).toBe(2);
  });

  it("edits a copy of an existing project and never offers itself as prerequisite", async () => {
    const project: Project = { ...other, cost: emptyGrid() };
    project.cost.minerals.basic = 1;
    const wrapper = mount(ProjectEditor, {
      props: { project, projects: [project], busy: false },
    });
    const options = wrapper.findAll("[data-testid=editor-prerequisite] option");
    expect(options.map((o) => o.attributes("value"))).toEqual([""]);
    await wrapper.get("[data-testid=cell-minerals-basic]").trigger("click");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    expect(project.cost.minerals.basic).toBe(1);
    await wrapper.get("[data-testid=editor-save]").trigger("click");
    const [[draft]] = wrapper.emitted("save") as [[ProjectDraft]];
    expect(draft.cost.minerals.basic).toBe(2);
    expect(draft.prerequisite_id).toBeNull();
  });
});
```

`ProjectList.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ProjectList from "./ProjectList.vue";
import { emptyGrid } from "../resources";
import type { Project } from "../types";

function p(id: string, code: string, over: Partial<Project> = {}): Project {
  return { id, code, name: "", prerequisite_id: null, cost: emptyGrid(), done: false, ...over };
}

const projects = [
  p("p-1", "VB03", { done: true }),
  p("p-2", "VB07", { name: "Reactor", prerequisite_id: "p-1" }),
  p("p-3", "VB09", { prerequisite_id: "p-2" }),
];

describe("ProjectList", () => {
  it("lists open projects and tucks done ones under Completed", () => {
    const wrapper = mount(ProjectList, { props: { projects } });
    const completed = wrapper.get("[data-testid=completed]");
    expect(completed.find("[data-testid=project-p-1]").exists()).toBe(true);
    expect(completed.find("[data-testid=project-p-2]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=project-p-2]").text()).toContain("VB07");
    expect(wrapper.get("[data-testid=project-p-2]").text()).toContain("Reactor");
  });

  it("shows prerequisite reminders, greyed once done", () => {
    const wrapper = mount(ProjectList, { props: { projects } });
    const done = wrapper.get("[data-testid=project-prereq-p-2]");
    const open = wrapper.get("[data-testid=project-prereq-p-3]");
    expect(done.text()).toBe("needs VB03");
    expect(done.classes()).toContain("chip--done");
    expect(open.classes()).not.toContain("chip--done");
  });

  it("emits the row's actions with the project", async () => {
    const wrapper = mount(ProjectList, { props: { projects } });
    await wrapper.get("[data-testid=project-complete-p-2]").trigger("click");
    await wrapper.get("[data-testid=project-reopen-p-1]").trigger("click");
    await wrapper.get("[data-testid=project-edit-p-2]").trigger("click");
    await wrapper.get("[data-testid=project-delete-p-3]").trigger("click");
    expect(wrapper.emitted("complete")?.[0]).toEqual([projects[1]]);
    expect(wrapper.emitted("reopen")?.[0]).toEqual([projects[0]]);
    expect(wrapper.emitted("edit")?.[0]).toEqual([projects[1]]);
    expect(wrapper.emitted("remove")?.[0]).toEqual([projects[2]]);
    expect(wrapper.find("[data-testid=project-complete-p-1]").exists()).toBe(false);
  });

  it("says so when there are no projects", () => {
    expect(mount(ProjectList, { props: { projects: [] } }).text()).toContain("No projects yet");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/components/Project`
Expected: FAIL: cannot resolve the `.vue` files

- [ ] **Step 3: Write `ProjectEditor.vue`**

```vue
<template>
  <div class="editor" data-testid="project-editor">
    <p class="editor__title">{{ project ? "Edit project" : "New project" }}</p>
    <label class="editor__label">
      Code
      <input v-model="code" class="editor__field" placeholder="e.g. VB07" data-testid="editor-code" />
    </label>
    <label class="editor__label">
      Name
      <input v-model="name" class="editor__field" data-testid="editor-name" />
    </label>
    <label class="editor__label">
      Requires
      <select v-model="prerequisite" class="editor__field" data-testid="editor-prerequisite">
        <option value="">Nothing</option>
        <option v-for="other in candidates" :key="other.id" :value="other.id">
          {{ other.code }}{{ other.name ? ` · ${other.name}` : "" }}
        </option>
      </select>
    </label>

    <p class="editor__label">Cost</p>
    <ResourceGrid :grid="cost" mode="edit" @cell-tap="select" />
    <StockStepper
      v-if="selected"
      :resource="selected.resource"
      :tier="selected.tier"
      :count="cost[selected.resource][selected.tier]"
      :busy="false"
      @step="step"
      @close="selected = null"
    />

    <div class="editor__actions">
      <button type="button" data-testid="editor-cancel" @click="emit('cancel')">Cancel</button>
      <button
        type="button"
        data-testid="editor-save"
        :disabled="busy || code.trim() === ''"
        @click="save"
      >
        Save
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import ResourceGrid from "./ResourceGrid.vue";
import StockStepper from "./StockStepper.vue";
import { emptyGrid } from "../resources";
import type { Grid, Project, ProjectDraft, ResourceId, TierId } from "../types";

const props = defineProps<{ project: Project | null; projects: Project[]; busy: boolean }>();
const emit = defineEmits<{ save: [draft: ProjectDraft]; cancel: [] }>();

const code = ref(props.project?.code ?? "");
const name = ref(props.project?.name ?? "");
const prerequisite = ref(props.project?.prerequisite_id ?? "");
// A deep copy: the cost grid is edited locally and only leaves on Save.
const cost = ref<Grid>(
  props.project ? (JSON.parse(JSON.stringify(props.project.cost)) as Grid) : emptyGrid(),
);
const selected = ref<{ resource: ResourceId; tier: TierId } | null>(null);

const candidates = computed(() => props.projects.filter((p) => p.id !== props.project?.id));

function select(resource: ResourceId, tier: TierId): void {
  selected.value = { resource, tier };
}

function step(delta: 1 | -1): void {
  if (!selected.value) return;
  const { resource, tier } = selected.value;
  cost.value[resource][tier] = Math.max(0, cost.value[resource][tier] + delta);
}

function save(): void {
  emit("save", {
    code: code.value.trim(),
    name: name.value.trim(),
    prerequisite_id: prerequisite.value || null,
    cost: cost.value,
  });
}
</script>

<style scoped lang="scss">
.editor {
  padding: 16px;
  max-width: 480px;
}
.editor__title {
  font-size: 16px;
  margin: 0 0 12px;
}
.editor__label {
  display: block;
  font-size: 13px;
  margin: 8px 0 4px;
}
.editor__field {
  display: block;
  width: 100%;
  margin-top: 4px;
  padding: 8px;
  font-size: 15px;
}
.editor__actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 16px;
}
</style>
```

- [ ] **Step 4: Write `ProjectRow.vue` and `ProjectList.vue`**

`ProjectRow.vue` is one row, used by both the open list and the Completed list:

```vue
<template>
  <div class="row">
    <span class="row__code">{{ project.code }}</span>
    <span v-if="project.name" class="row__name">{{ project.name }}</span>
    <span
      v-if="prerequisite"
      class="chip"
      :class="{ 'chip--done': prerequisite.done }"
      :data-testid="`project-prereq-${project.id}`"
    >
      needs {{ prerequisite.code }}
    </span>
    <span class="row__actions">
      <button type="button" :data-testid="`project-edit-${project.id}`" @click="emit('edit')">
        Edit
      </button>
      <button
        v-if="project.done"
        type="button"
        :data-testid="`project-reopen-${project.id}`"
        @click="emit('reopen')"
      >
        Reopen
      </button>
      <button
        v-else
        type="button"
        :data-testid="`project-complete-${project.id}`"
        @click="emit('complete')"
      >
        Complete
      </button>
      <button type="button" :data-testid="`project-delete-${project.id}`" @click="emit('remove')">
        Delete
      </button>
    </span>
  </div>
</template>

<script setup lang="ts">
import type { Project } from "../types";

defineProps<{ project: Project; prerequisite: Project | undefined }>();
const emit = defineEmits<{ edit: []; complete: []; reopen: []; remove: [] }>();
</script>

<style scoped lang="scss">
.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
}
.row__code {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.row__actions {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.row__actions button {
  background: transparent;
  border: 0;
  font-size: 13px;
  cursor: pointer;
  color: inherit;
  opacity: 0.8;
}
.chip {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 10px;
  background: rgba(127, 127, 127, 0.18);
}
.chip--done {
  opacity: 0.45;
}
</style>
```

`ProjectList.vue`:

```vue
<template>
  <div class="projects">
    <p v-if="projects.length === 0" class="projects__empty">No projects yet.</p>
    <ul class="projects__list">
      <li v-for="project in open" :key="project.id" :data-testid="`project-${project.id}`">
        <ProjectRow
          :project="project"
          :prerequisite="prerequisiteOf(project)"
          @edit="emit('edit', project)"
          @complete="emit('complete', project)"
          @reopen="emit('reopen', project)"
          @remove="emit('remove', project)"
        />
      </li>
    </ul>
    <details v-if="done.length > 0" data-testid="completed">
      <summary>Completed ({{ done.length }})</summary>
      <ul class="projects__list">
        <li v-for="project in done" :key="project.id" :data-testid="`project-${project.id}`">
          <ProjectRow
            :project="project"
            :prerequisite="prerequisiteOf(project)"
            @edit="emit('edit', project)"
            @complete="emit('complete', project)"
            @reopen="emit('reopen', project)"
            @remove="emit('remove', project)"
          />
        </li>
      </ul>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ProjectRow from "./ProjectRow.vue";
import type { Project } from "../types";

const props = defineProps<{ projects: Project[] }>();
const emit = defineEmits<{
  edit: [project: Project];
  complete: [project: Project];
  reopen: [project: Project];
  remove: [project: Project];
}>();

const open = computed(() => props.projects.filter((p) => !p.done));
const done = computed(() => props.projects.filter((p) => p.done));
const byId = computed(() => new Map(props.projects.map((p) => [p.id, p])));

function prerequisiteOf(project: Project): Project | undefined {
  return project.prerequisite_id ? byId.value.get(project.prerequisite_id) : undefined;
}
</script>

<style scoped lang="scss">
.projects__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.projects__empty {
  opacity: 0.6;
}
</style>
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/components`
Expected: all passed (11)

- [ ] **Step 6: Lint and commit**

```bash
cd frontend && npx eslint src/apps/iss-vanguard && npx prettier --write src/apps/iss-vanguard
git add frontend/src/apps/iss-vanguard/components
git commit -m "feat(iss-vanguard): project editor and project list

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: CrewSheet

**Files:**
- Create: `frontend/src/apps/iss-vanguard/components/CrewSheet.vue`
- Test: `frontend/src/apps/iss-vanguard/components/CrewSheet.spec.ts`

**Interfaces:**
- Consumes: `useShipStore` (`ship`, `error`, `loading`, `addMember`, `removeMember`, `leave`, `fetchRoster`), `useAuthStore().username`.
- Produces: `<CrewSheet @close @left />`. `left` fires after a successful leave, so the page resubscribes. Test ids: `crew-member-{name}`, `crew-remove-{name}`, `crew-add-input`, `crew-add`, `crew-leave`, `crew-leave-yes`, `crew-error`, `crew-close`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: delMock },
}));

import CrewSheet from "./CrewSheet.vue";
import { useShipStore } from "../stores/useShipStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { emptyGrid } from "../resources";
import type { Ship } from "../types";

function ship(over: Partial<Ship> = {}): Ship {
  return {
    id: "s_1",
    owner: "ana",
    members: ["ana", "bo"],
    is_owner: true,
    rev: 1,
    stock: emptyGrid(),
    projects: [],
    ...over,
  };
}

async function sheet(s: Ship, me: string) {
  useAuthStore().username = me;
  useShipStore().ship = s;
  getMock.mockResolvedValue({ usernames: ["ana", "bo", "cy"] });
  const wrapper = mount(CrewSheet);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("CrewSheet", () => {
  it("lets the owner add from the roster and remove others", async () => {
    const wrapper = await sheet(ship(), "ana");
    expect(wrapper.get("[data-testid=crew-member-ana]").text()).toContain("owner");
    expect(wrapper.find("[data-testid=crew-remove-ana]").exists()).toBe(false);
    expect(wrapper.findAll("datalist option").map((o) => o.attributes("value"))).toEqual(["cy"]);

    postMock.mockResolvedValue(ship({ members: ["ana", "bo", "cy"] }));
    await wrapper.get("[data-testid=crew-add-input]").setValue("cy");
    await wrapper.get("[data-testid=crew-add]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/members", { username: "cy" });

    delMock.mockResolvedValue(ship({ members: ["ana"] }));
    await wrapper.get("[data-testid=crew-remove-bo]").trigger("click");
    expect(delMock).toHaveBeenCalledWith("/iss-vanguard/ship/members/bo");
  });

  it("lets a member leave after confirming, then emits left", async () => {
    const wrapper = await sheet(ship({ is_owner: false }), "bo");
    expect(wrapper.find("[data-testid=crew-add]").exists()).toBe(false);
    delMock.mockResolvedValue(ship({ owner: "bo", members: ["bo"] }));
    await wrapper.get("[data-testid=crew-leave]").trigger("click");
    await wrapper.get("[data-testid=crew-leave-yes]").trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/iss-vanguard/ship/members/bo");
    expect(wrapper.emitted("left")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/components/CrewSheet.spec.ts`
Expected: FAIL: cannot resolve `./CrewSheet.vue`

- [ ] **Step 3: Write the implementation**

```vue
<template>
  <div class="crew" data-testid="crew-sheet">
    <p class="crew__title">Crew aboard this ship</p>
    <ul class="crew__members">
      <li v-for="member in members" :key="member" :data-testid="`crew-member-${member}`">
        <span>
          {{ member }}
          <small v-if="member === store.ship?.owner"> · owner</small>
          <small v-if="member === me"> · you</small>
        </span>
        <button
          v-if="isOwner && member !== me"
          type="button"
          :data-testid="`crew-remove-${member}`"
          @click="store.removeMember(member)"
        >
          Remove
        </button>
      </li>
    </ul>

    <p v-if="store.error" class="crew__error" data-testid="crew-error">{{ store.error }}</p>

    <template v-if="isOwner">
      <label class="crew__label" for="crew-add">Add crew</label>
      <input
        id="crew-add"
        v-model="draft"
        list="crew-roster"
        placeholder="their dock username"
        data-testid="crew-add-input"
      />
      <datalist id="crew-roster">
        <option v-for="name in addable" :key="name" :value="name" />
      </datalist>
      <button
        type="button"
        data-testid="crew-add"
        :disabled="draft.trim() === '' || store.loading"
        @click="add"
      >
        Add to ship
      </button>
    </template>
    <template v-else-if="confirmingLeave">
      <p class="crew__hint">You'll start with an empty ship. Everything here stays with the crew.</p>
      <button type="button" data-testid="crew-leave-yes" @click="leave">Leave ship</button>
      <button type="button" @click="confirmingLeave = false">Stay</button>
    </template>
    <button v-else type="button" data-testid="crew-leave" @click="confirmingLeave = true">
      Leave ship
    </button>

    <button type="button" data-testid="crew-close" @click="emit('close')">Close</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useShipStore } from "../stores/useShipStore";
import { useAuthStore } from "@/stores/useAuthStore";

const emit = defineEmits<{ close: []; left: [] }>();

const store = useShipStore();
const auth = useAuthStore();

const roster = ref<string[]>([]);
const draft = ref("");
const confirmingLeave = ref(false);

const me = computed(() => auth.username);
const members = computed(() => store.ship?.members ?? []);
const isOwner = computed(() => store.ship?.is_owner ?? false);
const addable = computed(() =>
  roster.value.filter((u) => u !== me.value && !members.value.includes(u)),
);

onMounted(async () => {
  roster.value = await store.fetchRoster();
});

async function add(): Promise<void> {
  if (await store.addMember(draft.value.trim())) draft.value = "";
}

async function leave(): Promise<void> {
  if (await store.leave()) emit("left");
}
</script>

<style scoped lang="scss">
.crew {
  padding: 16px;
  min-width: 280px;
}
.crew__title {
  font-size: 16px;
  margin: 0 0 8px;
}
.crew__members {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}
.crew__members li {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid rgba(127, 127, 127, 0.2);
}
.crew__label {
  display: block;
  font-size: 13px;
  margin-top: 6px;
}
.crew__error,
.crew__hint {
  font-size: 13px;
  margin: 6px 0;
}
.crew__error {
  color: #e05757;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/components/CrewSheet.spec.ts`
Expected: 2 passed

- [ ] **Step 5: Lint and commit**

```bash
cd frontend && npx eslint src/apps/iss-vanguard && npx prettier --write src/apps/iss-vanguard
git add frontend/src/apps/iss-vanguard/components
git commit -m "feat(iss-vanguard): crew sheet for sharing a ship

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: ShipPage, route and registry

**Files:**
- Create: `frontend/src/apps/iss-vanguard/pages/ShipPage.vue`
- Test: `frontend/src/apps/iss-vanguard/pages/ShipPage.spec.ts`
- Modify: `frontend/src/apps/registry.ts` (append entry)
- Modify: `frontend/src/apps/registry.spec.ts` (add test)
- Modify: `frontend/src/router/routes.ts` (add route after the `shared-notes` routes)

**Interfaces:**
- Consumes: everything from Tasks 7–12; `useAuthStore().token`, `.username`.
- Produces: the `/iss-vanguard` route named `iss-vanguard-ship`. Page test ids: `tab-ship`, `tab-needed`, `tab-diff`, `ship-error`, `add-project`, `crew-open`, `confirm-complete`, `confirm-complete-yes`, `confirm-shortfall`, `confirm-delete-yes`, `shortfall-list`, `all-covered`.

- [ ] **Step 1: Write the failing page test**

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, subscribe, closeMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  subscribe: vi.fn(),
  closeMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));
vi.mock("../composables/useShipEvents", () => ({ useShipEvents: subscribe }));

import ShipPage from "./ShipPage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import { emptyGrid } from "../resources";
import type { ShipEventHandlers } from "../composables/useShipEvents";
import type { Ship } from "../types";

function ship(over: Partial<Ship> = {}): Ship {
  const stock = emptyGrid();
  stock.minerals.rare = 1;
  const cost = emptyGrid();
  cost.minerals.rare = 2;
  return {
    id: "s_1",
    owner: "ana",
    members: ["ana"],
    is_owner: true,
    rev: 1,
    stock,
    projects: [{ id: "p-1", code: "VB07", name: "", prerequisite_id: null, cost, done: false }],
    ...over,
  };
}

let handlers: ShipEventHandlers;

async function page() {
  const auth = useAuthStore();
  auth.username = "ana";
  auth.token = "tok";
  getMock.mockResolvedValue(ship());
  const wrapper = mount(ShipPage);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  subscribe.mockImplementation((_token: string, h: ShipEventHandlers) => {
    handlers = h;
    return { close: closeMock };
  });
});

describe("ShipPage", () => {
  it("loads the ship, subscribes, and taps a cell through the stepper", async () => {
    const wrapper = await page();
    expect(subscribe).toHaveBeenCalledWith("tok", expect.any(Object));
    await wrapper.get("[data-testid=cell-minerals-rare]").trigger("click");
    postMock.mockResolvedValue(ship({ rev: 2 }));
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/stock", {
      resource: "minerals",
      tier: "rare",
      delta: 1,
    });
  });

  it("shows the difference and per-project shortfall", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=tab-diff]").trigger("click");
    expect(wrapper.get("[data-testid=cell-minerals-rare]").text()).toBe("-1");
    expect(wrapper.get("[data-testid=shortfall-list]").text()).toContain("VB07");
    expect(wrapper.get("[data-testid=shortfall-list]").text()).toContain("1× Minerály · Vzácny");
  });

  it("warns about short stock before completing", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=tab-needed]").trigger("click");
    await wrapper.get("[data-testid=project-complete-p-1]").trigger("click");
    expect(wrapper.get("[data-testid=confirm-shortfall]").text()).toContain("stop at 0");
    postMock.mockResolvedValue(ship());
    await wrapper.get("[data-testid=confirm-complete-yes]").trigger("click");
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/projects/p-1/complete");
  });

  it("refetches on a newer remote change and moves ship when closed for me", async () => {
    await page();
    getMock.mockClear();
    handlers.onChanged?.({ type: "ship.changed", ship_id: "s_1", rev: 1, actor: "bo" });
    expect(getMock).not.toHaveBeenCalled();
    handlers.onChanged?.({ type: "ship.changed", ship_id: "s_1", rev: 2, actor: "bo" });
    await flushPromises();
    expect(getMock).toHaveBeenCalledTimes(1);

    handlers.onClosed?.({ type: "ship.closed", ship_id: "s_1", reason: "removed", member: "bo" });
    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);
    handlers.onClosed?.({ type: "ship.closed", ship_id: "s_1", reason: "removed", member: "ana" });
    await flushPromises();
    expect(closeMock).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("shows the store error in a banner", async () => {
    const wrapper = await page();
    postMock.mockRejectedValue({ detail: "nope" });
    await wrapper.get("[data-testid=cell-minerals-rare]").trigger("click");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=ship-error]").text()).toContain("nope");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard/pages`
Expected: FAIL: cannot resolve `./ShipPage.vue`

- [ ] **Step 3: Write `ShipPage.vue`**

```vue
<template>
  <q-page class="ship">
    <div class="ship__header">
      <div class="ship__tabs" role="tablist">
        <button
          v-for="t in tabs"
          :key="t.id"
          type="button"
          role="tab"
          class="ship__tab"
          :class="{ 'ship__tab--active': tab === t.id }"
          :data-testid="`tab-${t.id}`"
          @click="tab = t.id"
        >
          {{ t.label }}
        </button>
      </div>
      <button type="button" class="ship__crew" data-testid="crew-open" @click="crewOpen = true">
        Crew ({{ store.ship?.members.length ?? 1 }})
      </button>
    </div>

    <p v-if="store.error" class="ship__error" data-testid="ship-error">{{ store.error }}</p>

    <template v-if="store.ship">
      <section v-if="tab === 'ship'">
        <ResourceGrid :grid="store.ship.stock" mode="edit" @cell-tap="openStepper" />
      </section>

      <section v-else-if="tab === 'needed'">
        <ResourceGrid v-if="store.needed" :grid="store.needed" mode="readonly" />
        <button type="button" class="ship__add" data-testid="add-project" @click="openEditor(null)">
          Add project
        </button>
        <ProjectList
          :projects="store.ship.projects"
          @edit="openEditor"
          @complete="(p) => (completing = p)"
          @reopen="(p) => store.reopenProject(p.id)"
          @remove="(p) => (deleting = p)"
        />
      </section>

      <section v-else>
        <ResourceGrid v-if="store.diff" :grid="store.diff" mode="diff" />
        <p class="ship__subtitle">Short per project</p>
        <ul v-if="store.shortfalls.length > 0" class="ship__shortfalls" data-testid="shortfall-list">
          <li v-for="s in store.shortfalls" :key="s.project.id">
            <strong>{{ s.project.code }}</strong>
            <span v-if="s.project.name"> {{ s.project.name }}</span>:
            {{ describe(s.missing) }}
          </li>
        </ul>
        <p v-else data-testid="all-covered">All projects covered.</p>
      </section>
    </template>

    <q-dialog :model-value="stepper !== null" @update:model-value="stepper = null">
      <StockStepper
        v-if="stepper && store.ship"
        :resource="stepper.resource"
        :tier="stepper.tier"
        :count="store.ship.stock[stepper.resource][stepper.tier]"
        :busy="store.loading"
        @step="(d) => stepper && store.adjustStock(stepper.resource, stepper.tier, d)"
        @close="stepper = null"
      />
    </q-dialog>

    <q-dialog :model-value="editing !== undefined" @update:model-value="editing = undefined">
      <ProjectEditor
        v-if="editing !== undefined && store.ship"
        :project="editing"
        :projects="store.ship.projects"
        :busy="store.loading"
        @save="saveProject"
        @cancel="editing = undefined"
      />
    </q-dialog>

    <q-dialog :model-value="completing !== null" @update:model-value="completing = null">
      <div v-if="completing" class="ship__confirm" data-testid="confirm-complete">
        <p>Deduct the cost of {{ completing.code }} from the ship?</p>
        <p v-if="completingShort.length > 0" data-testid="confirm-shortfall">
          Stock is short by {{ describe(completingShort) }} — those counts will stop at 0.
        </p>
        <button type="button" @click="completing = null">Cancel</button>
        <button type="button" data-testid="confirm-complete-yes" @click="complete">Complete</button>
      </div>
    </q-dialog>

    <q-dialog :model-value="deleting !== null" @update:model-value="deleting = null">
      <div v-if="deleting" class="ship__confirm">
        <p>Delete {{ deleting.code }}? Projects that require it will lose the reminder.</p>
        <button type="button" @click="deleting = null">Cancel</button>
        <button type="button" data-testid="confirm-delete-yes" @click="remove">Delete</button>
      </div>
    </q-dialog>

    <q-dialog v-model="crewOpen">
      <CrewSheet v-if="crewOpen" @close="crewOpen = false" @left="onLeft" />
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import ResourceGrid from "../components/ResourceGrid.vue";
import StockStepper from "../components/StockStepper.vue";
import ProjectEditor from "../components/ProjectEditor.vue";
import ProjectList from "../components/ProjectList.vue";
import CrewSheet from "../components/CrewSheet.vue";
import { useShipEvents, type ShipEventsSubscription } from "../composables/useShipEvents";
import { useShipStore } from "../stores/useShipStore";
import { cellName } from "../resources";
import { shortfall } from "../shipMath";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Project, ProjectDraft, ResourceId, Shortage, TierId } from "../types";

type Tab = "ship" | "needed" | "diff";
const tabs: { id: Tab; label: string }[] = [
  { id: "ship", label: "On ship" },
  { id: "needed", label: "Needed" },
  { id: "diff", label: "Difference" },
];

const store = useShipStore();
const auth = useAuthStore();

const tab = ref<Tab>("ship");
const stepper = ref<{ resource: ResourceId; tier: TierId } | null>(null);
// undefined = closed, null = new project, Project = editing that one.
const editing = ref<Project | null | undefined>(undefined);
const completing = ref<Project | null>(null);
const deleting = ref<Project | null>(null);
const crewOpen = ref(false);

const completingShort = computed<Shortage[]>(() =>
  completing.value && store.ship ? shortfall(store.ship.stock, completing.value.cost) : [],
);

function describe(missing: Shortage[]): string {
  return missing.map((m) => `${m.amount}× ${cellName(m.resource, m.tier)}`).join(", ");
}

function openStepper(resource: ResourceId, tier: TierId): void {
  stepper.value = { resource, tier };
}

function openEditor(project: Project | null): void {
  editing.value = project;
}

async function saveProject(draft: ProjectDraft): Promise<void> {
  const target = editing.value;
  const ok = target ? await store.updateProject(target.id, draft) : await store.createProject(draft);
  if (ok) editing.value = undefined;
}

async function complete(): Promise<void> {
  if (completing.value) await store.completeProject(completing.value.id);
  completing.value = null;
}

async function remove(): Promise<void> {
  if (deleting.value) await store.deleteProject(deleting.value.id);
  deleting.value = null;
}

let subscription: ShipEventsSubscription | null = null;

// The stream is bound to whichever ship the server resolves for me, so after
// being moved (removed, joined elsewhere, or leaving) it must be reopened.
function subscribe(): void {
  subscription?.close();
  if (!auth.token) return;
  subscription = useShipEvents(auth.token, {
    onChanged: (e) => void store.applyRemoteRev(e.rev),
    onMembersChanged: () => void store.fetchShip(),
    onClosed: (e) => {
      if (e.member === auth.username) void moved();
    },
  });
}

async function moved(): Promise<void> {
  await store.fetchShip();
  subscribe();
}

function onLeft(): void {
  crewOpen.value = false;
  subscribe();
}

onMounted(async () => {
  await store.fetchShip();
  subscribe();
});

onBeforeUnmount(() => subscription?.close());
</script>

<style scoped lang="scss">
.ship {
  padding: 12px 16px 32px;
  max-width: 640px;
  margin: 0 auto;
}
.ship__header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.ship__tabs {
  display: flex;
  flex: 1;
  gap: 4px;
}
.ship__tab {
  flex: 1;
  padding: 8px 4px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: inherit;
  font-size: 14px;
  cursor: pointer;
}
.ship__tab--active {
  border-bottom-color: currentColor;
  font-weight: 600;
}
.ship__crew,
.ship__add {
  background: transparent;
  border: 1px solid rgba(127, 127, 127, 0.4);
  border-radius: 6px;
  padding: 6px 10px;
  color: inherit;
  cursor: pointer;
}
.ship__add {
  margin: 12px 0;
}
.ship__error {
  color: #e05757;
  font-size: 13px;
}
.ship__subtitle {
  margin: 16px 0 6px;
  font-weight: 600;
}
.ship__shortfalls {
  padding-left: 18px;
}
.ship__confirm {
  padding: 16px;
  max-width: 360px;
}
</style>
```

- [ ] **Step 4: Wire the route and the registry**

In `frontend/src/router/routes.ts`, after the `shared-notes/notes/:noteId` route object, add:

```ts
      {
        path: "iss-vanguard",
        name: "iss-vanguard-ship",
        component: () => import("@/apps/iss-vanguard/pages/ShipPage.vue"),
        meta: { title: "ISS Vanguard", requiresAuth: true },
      },
```

In `frontend/src/apps/registry.ts`, append to `apps`:

```ts
  {
    id: "iss-vanguard",
    label: "ISS Vanguard",
    // A launch glyph for the ship the tracker keeps the books for.
    icon: "rocket_launch",
    route: "/iss-vanguard",
  },
```

In `frontend/src/apps/registry.spec.ts`, add inside the `describe`:

```ts
  it("registers the ISS Vanguard app", () => {
    const app = apps.find((a) => a.id === "iss-vanguard");
    expect(app).toBeDefined();
    expect(app?.label).toBe("ISS Vanguard");
    expect(app?.icon).toBe("rocket_launch");
    expect(app?.route).toBe("/iss-vanguard");
  });
```

If `registry.spec.ts` has a test that pins the total number of apps or their order, update it to include the new entry.

- [ ] **Step 5: Run the frontend and parity tests**

Run: `cd frontend && npx vitest run src/apps/iss-vanguard src/apps/registry.spec.ts`
Expected: all pass

Run: `cd backend && .venv/bin/pytest tests/test_app_registry_parity.py -v`
Expected: PASS. It failed after Task 6 and is fixed now.

- [ ] **Step 6: Lint and commit**

```bash
cd frontend && npm run lint && npx prettier --write src/apps/iss-vanguard src/apps/registry.ts src/apps/registry.spec.ts src/router/routes.ts
git add frontend/src/apps/iss-vanguard frontend/src/apps/registry.ts frontend/src/apps/registry.spec.ts frontend/src/router/routes.ts
git commit -m "feat(iss-vanguard): ship page with tabs, dialogs and live updates

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Story doc, full verification, manual check

**Files:**
- Create: `docs/stories/iss-vanguard/for-review/1.1.resource-tracker.story.md`

- [ ] **Step 1: Write the story**

```markdown
# Story 1.1: Resource tracker

**Status:** Ready for Review
**App:** iss-vanguard
**Spec:** `docs/superpowers/specs/2026-09-28-iss-vanguard-resource-tracker-design.md`
**Plan:** `docs/superpowers/plans/2026-09-28-iss-vanguard-resource-tracker.md`

## Story

As an ISS Vanguard crew at the table, we want one shared tracker of the resources aboard, what our
projects cost and what we still lack, so the between-mission bookkeeping stays off the table.

## Acceptance criteria

1. A 5 × 3 grid (Mikroorganizmy, Mimozemské technológie, Minerály, Podivná flóra, Živé exempláre ×
   Základný, Vzácny, Veľmi vzácny) on the **On ship** tab; tapping a cell opens − / + that change it
   by one; counts never go below 0. (RT-2)
2. Projects with a code, name, optional prerequisite and a cost grid can be added, edited and
   deleted; deleting clears prerequisites pointing at it. (RT-3, RT-6)
3. **Needed** sums open projects' costs; **Difference** shows stock − needed in red / green / dim,
   plus a per-project shortfall list. (RT-7, RT-8)
4. Completing deducts the cost (clamping at 0, warning first when short); reopening restores it.
   (RT-4, RT-5)
5. The owner adds crew by username; members may leave; the owner may remove members; changes by
   anyone appear on every open phone within about a second. (RT-9 – RT-11)

## Dev notes

Refinements to the spec are listed in the plan's "Refinements to the spec" section.
```

- [ ] **Step 2: Run the full backend suite, format and lint**

Run: `cd backend && .venv/bin/black --check . && .venv/bin/ruff check . && .venv/bin/pytest -q`
Expected: clean format, no lint errors, all tests pass

- [ ] **Step 3: Run the full frontend suite and lint**

Run: `cd frontend && npm test && npm run lint && npm run typecheck`
Expected: all tests pass, no lint or type errors.

- [ ] **Step 4: Manual check in the running app**

Start both servers: backend `cd backend && source .venv/bin/activate && DATA_DIR=./local-data uvicorn app.main:app --reload --port 9000`, frontend `cd frontend && npm run dev`. Then check:
1. The dock landing page shows the **ISS Vanguard** card, and it opens `/iss-vanguard`.
2. On ship: tap Minerály · Vzácny and press + three times; the count reads 3.
3. Needed: add project `VB07` costing 5 × Minerály · Vzácny. Needed shows 5, and Difference shows red −2 with "VB07: 2× Minerály · Vzácny".
4. Complete VB07: the warning names the shortfall; confirm, and On ship reads 0. Reopen it, and On ship reads 5.
5. Open a second browser profile as another dock user. Add them from Crew, then tap + on the second profile; the first profile updates within about a second without a reload.

- [ ] **Step 5: Commit**

```bash
git add docs/stories/iss-vanguard/for-review/1.1.resource-tracker.story.md
git commit -m "docs(iss-vanguard): story 1.1 resource tracker ready for review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
