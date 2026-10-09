# Teaware Cabinet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A shelf of the user's teaware (gaiwans, pots, kyusu, chawan, pitchers, cups) stored in the shared cabinet, with the brewing vessel recorded on each session and prefilled from the last one used.

**Architecture:** Teaware is a new list in the cabinet's `TeaDoc` (schema v4), served by a new `tea_teaware_service` behind `/api/tea/teaware` routes on the existing tea router. Sessions gain a client-chosen `teaware_id` and a server-filled `vessel_volume_ml`. The frontend adds a `useTeawareStore`, pure helpers in `ware.ts`, a ware shelf / new / detail page trio, a vessel picker in the timer bar, and vessel labels on session rows.

**Tech Stack:** FastAPI + Pydantic v2 (Python 3.12), pytest; Vue 3 `<script setup lang="ts">`, Pinia setup stores, vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-09-27-tea-teaware-cabinet-design.md`

## Global Constraints

- Backend is strictly 3-layer: routers translate exceptions to `HTTPException` (nowhere else); services raise `ValueError` / `FileNotFoundError` / domain exceptions; `app/repositories/tea_repo.py` is the only tea code touching the filesystem.
- Never call `tea_cabinet_service.resolve`/`ensure` inside a `repo.doc_transaction` block — resolve first.
- An unusable vessel on a session is **422, never 404** — the timer reads a 404 on push/finish as "the tea is gone" and detaches the tea.
- `vessel_volume_ml` is server-owned — never read from a request body.
- Brewing types: `gaiwan`, `pot`, `kyusu`, `chawan`, `other`. Materials: `porcelain`, `clay`, `stoneware`, `glass`, `other`. Types' shelf order: gaiwan, pot, kyusu, chawan, pitcher, cup, other.
- Teaware ids are `w-` + 8 hex; tea ids stay `t-…`.
- Frontend: all HTTP through `src/composables/useApi.ts`; Pinia stores expose `loading` and `error`, set `loading` in `try/finally`, route failures into `error.value`. `<script setup lang="ts">`, `defineProps<{}>()` / `defineEmits<{}>()` generics, `interface` for object shapes, no `any`.
- Colour is a tea's liquor only (DESIGN.md): teaware UI uses the bone/ink `GROUND` palette, never a hue.
- Spec mocks must answer `/tea/cabinet` with a real `Cabinet` and `/tea/teaware/last-used…` with `null` (or a real `Teaware`) — never add store guards against malformed fixture data.
- Black + ruff (line length 100); `npm run lint`, `npm run typecheck`. Minimal comments: only the non-obvious *why*.
- Commit directly on `main`. Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations from the spec (decided while planning)

1. **Entry point is the Tea home screen, not a Cabinet header button.** Since the spec was written the user added `TeaHomePage` (`/tea`, commit 1589e65) — the first-level navigation screen they said they'd build. Teaware becomes its fourth section (after Cabinet), and `/tea/ware`'s back arrow points at `/tea`.
2. **Vessel prefill runs when a tea is attached**, not also "when the timer opens with no vessel": a timer with no tea saves nothing, and every way a tea gets onto the timer (pick, `?tea=`, resume) goes through `attachTea` or `resume`, so the second trigger adds nothing.
3. **`CataloguePicker` gains a `bare` prop** that hides its "+ Add one" chips and origin-prefill note, so the dedication picker can reuse it without offering tea-only actions.

## Review Focus

1. **A vessel retired (or deleted) by a household member while your timer is running** — the next push gets 422; the timer must drop the vessel with a notice and keep syncing, not spin as "unsynced" forever — Task 8 (`drops a vessel the server refuses and keeps syncing`).
2. **Finishing after the vessel became unusable** — the finish must not be lost: drop the vessel, say so, and let the person save again — Task 8 (`finishing with a refused vessel drops it and keeps the sheet open`).
3. **Unchecking "Seasons" on a dedicated pot** must clear the dedication, or the save is refused — Task 7 (`unchecking porous clears the dedication`).
4. **`/api/tea/teaware/last-used` being swallowed by `/teaware/{id}`** — Task 4 (`test_last_used_is_not_read_as_an_id`).
5. **A saved live session from before this change** (no `teaware` key in localStorage) must still load — Task 8 (`hydrates a saved session that has no vessel`).

---

## File Structure

**Backend**
- Create `backend/app/schemas/teaware.py` — `Teaware`, `TeawareWriteRequest`, `TeawareUsage`, `BREWING_TYPES`.
- Modify `backend/app/schemas/tea.py` — `TeaDoc` v4 with `teaware`.
- Modify `backend/app/schemas/tea_session.py` — `teaware_id`, `vessel_volume_ml`.
- Modify `backend/app/repositories/tea_repo.py` — `migrate()` v3→v4.
- Modify `backend/app/services/tea_service.py` — public `image_extension()` helper.
- Create `backend/app/services/tea_teaware_service.py` — CRUD, retire, photos, usage, last-used.
- Modify `backend/app/services/tea_session_service.py` — vessel validation + volume copy.
- Modify `backend/app/services/tea_catalogue_service.py` — node guard.
- Modify `backend/app/routers/tea.py` — teaware routes, 422 on session upsert.
- Tests: create `backend/tests/test_tea_teaware.py`, `backend/tests/test_tea_teaware_api.py`; update `test_tea_repo.py`, `test_tea_schemas.py`.

**Frontend (`frontend/src/apps/tea/`)**
- Modify `types.ts`; create `ware.ts` (+ `ware.spec.ts`).
- Create `stores/useTeawareStore.ts` (+ spec), `stores/useTeawareFiltersStore.ts`.
- Create `components/WareCard.vue`, `components/WareSection.vue`, `components/WareFilters.vue`, `components/WareForm.vue`, `components/PickVesselSheet.vue` (+ specs where listed).
- Modify `components/CataloguePicker.vue` (`bare`), `components/TeaSessionsList.vue` (tea names, vessel labels).
- Create `pages/WareCabinetPage.vue`, `pages/NewWarePage.vue`, `pages/WareDetailPage.vue` (+ specs).
- Modify `pages/TeaHomePage.vue`, `pages/TimerPage.vue`, `pages/TeaDetailPage.vue`, `stores/useTeaTimerStore.ts`, `frontend/src/router/routes.ts` (+ their specs).

**Docs**
- Modify `docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md` §4.2.

---

### Task 1: Teaware schemas and schema v4

**Files:**
- Create: `backend/app/schemas/teaware.py`
- Modify: `backend/app/schemas/tea.py` (`TeaDoc`, imports)
- Modify: `backend/app/schemas/tea_session.py` (`TeaSessionWrite`, `TeaSession`)
- Modify: `backend/app/repositories/tea_repo.py` (`migrate`)
- Modify: `backend/tests/test_tea_repo.py`, `backend/tests/test_tea_schemas.py`

**Interfaces:**
- Produces: `app.schemas.teaware.Teaware`, `TeawareWriteRequest`, `TeawareUsage`, `TeawareType`, `TeawareMaterial`, `BREWING_TYPES: frozenset[str]`; `TeaDoc.teaware: list[Teaware]` with `schema_version = 4`; `TeaSessionWrite.teaware_id: str | None = None`; `TeaSession.vessel_volume_ml: int | None = None`.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/test_tea_repo.py`:
- `test_new_cabinet_writes_an_empty_v3_doc_owned_by_the_user`: rename to `test_new_cabinet_writes_an_empty_current_doc_owned_by_the_user` and change `== (3, cabinet_id, "alice")` to `== (4, cabinet_id, "alice")`; add `assert doc.teaware == []`.
- Rename `test_migrate_v1_goes_all_the_way_to_v3` to `test_migrate_v1_goes_all_the_way_to_v4`, change `== 3` to `== 4`, and add `assert upgraded["teaware"] == []`.
- Append:

```python
def test_migrate_v3_adds_an_empty_teaware_list() -> None:
    raw: dict[str, object] = {"schema_version": 3, "id": "c_" + "1" * 32, "owner": "alice"}
    upgraded = repo.migrate(raw)
    assert upgraded["schema_version"] == 4
    assert upgraded["teaware"] == []
```

In `backend/tests/test_tea_schemas.py` change `assert doc.schema_version == 3` to `== 4` and append:

```python
def test_a_session_without_a_vessel_parses() -> None:
    from app.schemas.tea_session import TeaSession

    session = TeaSession.model_validate(
        {
            "id": "s-1",
            "tea_id": "t-1",
            "status": "finalised",
            "started_at": "2026-09-27T18:00:00+00:00",
            "curve_source": "generic",
            "brewed_by": "alice",
            "updated_at": "2026-09-27T18:30:00+00:00",
        }
    )
    assert (session.teaware_id, session.vessel_volume_ml) == (None, None)


def test_teaware_write_refuses_a_zero_volume_and_a_negative_price() -> None:
    from pydantic import ValidationError

    from app.schemas.teaware import TeawareWriteRequest

    with pytest.raises(ValidationError):
        TeawareWriteRequest.model_validate({"name": "Pot", "type": "pot", "volume_ml": 0})
    with pytest.raises(ValidationError):
        TeawareWriteRequest.model_validate({"name": "Pot", "type": "pot", "price_paid": -1})
```

(add `import pytest` at the top of `test_tea_schemas.py` if it is not already imported).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_repo.py tests/test_tea_schemas.py -q`
Expected: FAIL — schema version 3 ≠ 4, `teaware` missing, `app.schemas.teaware` not found.

- [ ] **Step 3: Add the schemas**

Create `backend/app/schemas/teaware.py`:

```python
"""Pydantic v2 schemas for the Teaware Cabinet.

Teaware lives inside the cabinet's tea doc (see `app/schemas/tea.py`), so a
shared cabinet shares its ware, and deleting a pot clears it from the sessions
that name it in the same atomic write.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, PositiveInt

from app.schemas.tea_session import TeaSession

TeawareType = Literal["gaiwan", "pot", "kyusu", "chawan", "pitcher", "cup", "other"]
TeawareMaterial = Literal["porcelain", "clay", "stoneware", "glass", "other"]

# What a session can be brewed in. Pitchers and cups join a sitting with the Cha
# Xi Journal, not the timer.
BREWING_TYPES: frozenset[str] = frozenset({"gaiwan", "pot", "kyusu", "chawan", "other"})


class Teaware(BaseModel):
    id: str
    name: str
    type: TeawareType
    material: TeawareMaterial | None = None
    volume_ml: int | None = None
    porous: bool = False
    dedicated_node_id: str | None = None
    maker: str = ""
    origin: str = ""
    acquired_date: str | None = None
    price_paid: float | None = None
    notes: str = ""
    image_url: str | None = None
    retired_at: str | None = None
    created_at: str
    updated_at: str


class TeawareWriteRequest(BaseModel):
    """The body for both create and replace: `Teaware` minus server fields, plus `retired`."""

    name: str
    type: TeawareType
    material: TeawareMaterial | None = None
    volume_ml: PositiveInt | None = None
    porous: bool = False
    dedicated_node_id: str | None = None
    maker: str = ""
    origin: str = ""
    acquired_date: str | None = None
    price_paid: float | None = Field(default=None, ge=0)
    notes: str = ""
    retired: bool = False


class TeawareUsage(BaseModel):
    """A piece's finished sessions, newest first, and how many strayed from its dedication."""

    sessions: list[TeaSession]
    total: int
    off_dedication: int
```

In `backend/app/schemas/tea_session.py`, add to `TeaSessionWrite` after `infusions` (before the validator):

```python
    teaware_id: str | None = None
```

and replace `TeaSession` with:

```python
class TeaSession(TeaSessionWrite):
    id: str
    # Server-owned like `id`: set from the caller on first write, never read from a body.
    brewed_by: str
    # Server-owned: copied from the vessel on every write, so it survives the pot's deletion.
    vessel_volume_ml: int | None = None
    updated_at: str
    finished_at: str | None = None
```

In `backend/app/schemas/tea.py`, add `from app.schemas.teaware import Teaware` beside the `TeaSession` import, and change `TeaDoc` to:

```python
class TeaDoc(BaseModel):
    schema_version: int = 4
    # Empty only on the implicit cabinet of a user who has not written anything yet.
    id: str = ""
    owner: str = ""
    teas: list[Tea] = Field(default_factory=list)
    catalogue_nodes: list[CatalogueNode] = Field(default_factory=list)
    sessions: list[TeaSession] = Field(default_factory=list)
    teaware: list[Teaware] = Field(default_factory=list)
```

In the module docstring's first paragraph, change "holding the cabinet's teas, the catalogue nodes its members added, and their brewing sessions" to "holding the cabinet's teas, the catalogue nodes its members added, their brewing sessions and their teaware".

- [ ] **Step 4: Migrate v3 → v4**

In `backend/app/repositories/tea_repo.py` `migrate()`, append to the docstring "v4 added `teaware`." and add, after the `if raw["schema_version"] == 2:` block and before `return raw`:

```python
    if raw["schema_version"] == 3:
        raw = {**raw, "schema_version": 4, "teaware": []}
```

- [ ] **Step 5: Run the backend suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS (including the migration tests in `test_tea_cabinets.py`, which go v2 → v4 through the chain).

- [ ] **Step 6: Lint and commit**

```bash
cd backend && black . && ruff check . && cd ..
git add backend/app/schemas backend/app/repositories/tea_repo.py backend/tests
git commit -m "feat(tea): teaware schemas and cabinet schema v4

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Teaware service — create, replace, retire, delete, photos

**Files:**
- Modify: `backend/app/services/tea_service.py` (image constants → `image_extension()`)
- Create: `backend/app/services/tea_teaware_service.py`
- Modify: `backend/app/services/tea_catalogue_service.py` (`delete_node`)
- Create: `backend/tests/test_tea_teaware.py`

**Interfaces:**
- Consumes: `tea_cabinet_service.resolve/ensure/read_doc_for`; `tea_catalogue_service.merged_nodes`; repo `doc_transaction`, `save_image`, `delete_image`, `find_image`, `read_doc`.
- Produces: `tea_service.image_extension(content: bytes, content_type: str) -> str`; `tea_teaware_service.list_teaware(username) -> list[Teaware]`, `get_teaware(username, teaware_id) -> Teaware`, `create_teaware(username, req) -> Teaware`, `replace_teaware(username, teaware_id, req) -> Teaware`, `delete_teaware(username, teaware_id) -> None`, `save_image(username, teaware_id, content, content_type) -> Teaware`, `delete_image(username, teaware_id) -> Teaware`, `image_path(username, teaware_id) -> Path`. Private `_position(doc, teaware_id) -> int` (raises `FileNotFoundError`), used by Task 3.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tea_teaware.py`:

```python
"""The Teaware Cabinet: validation, retiring, deleting, photos, usage and the vessel prefill."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CreateNodeRequest, TeaWriteRequest
from app.schemas.tea_session import TeaSessionWrite
from app.schemas.teaware import TeawareWriteRequest
from app.services import tea_catalogue_service as catalogue
from app.services import tea_service
from app.services import tea_session_service as sessions
from app.services import tea_teaware_service as service
from tests.tea_support import cabinet_of, doc_of

TIEGUANYIN = "oolong.anxi.tieguanyin"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _req(**overrides: object) -> TeawareWriteRequest:
    payload: dict[str, object] = {
        "name": "Zhuni shuiping",
        "type": "pot",
        "material": "clay",
        "volume_ml": 110,
    }
    payload.update(overrides)
    return TeawareWriteRequest.model_validate(payload)


def _tea(username: str = "alice", node: str = TIEGUANYIN) -> str:
    req = TeaWriteRequest.model_validate(
        {"name": "Tea", "catalogue_node_id": node, "grams_remaining": 50}
    )
    return tea_service.create_tea(username, req).id


def _brew(
    tea_id: str,
    session_id: str,
    teaware_id: str | None,
    *,
    username: str = "alice",
    status: str = "finalised",
) -> None:
    sessions.upsert(
        username,
        session_id,
        TeaSessionWrite.model_validate(
            {
                "tea_id": tea_id,
                "status": status,
                "started_at": "2026-09-27T18:00:00+00:00",
                "curve_source": "generic",
                "teaware_id": teaware_id,
                "infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": 12}],
            }
        ),
    )


def test_create_mints_an_id_and_trims_the_name() -> None:
    item = service.create_teaware("alice", _req(name="  Zhuni shuiping  "))
    assert item.id.startswith("w-")
    assert item.name == "Zhuni shuiping"
    assert item.created_at == item.updated_at
    assert item.retired_at is None
    assert [w.id for w in service.list_teaware("alice")] == [item.id]


def test_create_refuses_a_blank_name() -> None:
    with pytest.raises(ValueError, match="needs a name"):
        service.create_teaware("alice", _req(name="   "))


def test_create_refuses_a_bad_acquired_date() -> None:
    with pytest.raises(ValueError, match="date like"):
        service.create_teaware("alice", _req(acquired_date="last spring"))


def test_dedication_needs_a_pot_that_seasons() -> None:
    with pytest.raises(ValueError, match="seasons"):
        service.create_teaware("alice", _req(porous=False, dedicated_node_id="oolong"))


def test_dedication_needs_a_known_catalogue_node() -> None:
    with pytest.raises(ValueError, match="No catalogue entry"):
        service.create_teaware("alice", _req(porous=True, dedicated_node_id="not-a-node"))


def test_retiring_stamps_once_and_bringing_back_clears() -> None:
    item = service.create_teaware("alice", _req())
    retired = service.replace_teaware("alice", item.id, _req(retired=True))
    assert retired.retired_at is not None
    again = service.replace_teaware("alice", item.id, _req(retired=True, notes="chipped lid"))
    assert again.retired_at == retired.retired_at
    back = service.replace_teaware("alice", item.id, _req(retired=False))
    assert back.retired_at is None


def test_replace_keeps_the_id_created_at_and_photo() -> None:
    item = service.create_teaware("alice", _req())
    with_photo = service.save_image("alice", item.id, b"jpeg-bytes", "image/jpeg")
    replaced = service.replace_teaware("alice", item.id, _req(name="Renamed"))
    assert (replaced.id, replaced.created_at) == (item.id, item.created_at)
    assert replaced.image_url == with_photo.image_url == f"/api/tea/teaware/{item.id}/image"
    assert replaced.name == "Renamed"


@pytest.mark.parametrize("action", ["get", "replace", "delete", "image"])
def test_an_unknown_item_is_not_found(action: str) -> None:
    with pytest.raises(FileNotFoundError):
        if action == "get":
            service.get_teaware("alice", "w-nosuchid")
        elif action == "replace":
            service.replace_teaware("alice", "w-nosuchid", _req())
        elif action == "delete":
            service.delete_teaware("alice", "w-nosuchid")
        else:
            service.image_path("alice", "w-nosuchid")


def test_photos_round_trip_and_refuse_bad_uploads() -> None:
    item = service.create_teaware("alice", _req())
    service.save_image("alice", item.id, b"jpeg-bytes", "image/jpeg")
    assert service.image_path("alice", item.id).read_bytes() == b"jpeg-bytes"
    with pytest.raises(ValueError):
        service.save_image("alice", item.id, b"%PDF", "application/pdf")
    cleared = service.delete_image("alice", item.id)
    assert cleared.image_url is None
    with pytest.raises(FileNotFoundError):
        service.image_path("alice", item.id)


def test_delete_clears_the_vessel_from_sessions_and_keeps_them() -> None:
    tea_id = _tea()
    pot = service.create_teaware("alice", _req())
    _brew(tea_id, "s-live", pot.id, status="in_progress")
    _brew(tea_id, "s-done", pot.id)

    service.delete_teaware("alice", pot.id)

    stored = {s.id: s for s in doc_of("alice").sessions}
    assert set(stored) == {"s-live", "s-done"}
    assert all(s.teaware_id is None for s in stored.values())
    assert all(s.vessel_volume_ml == 110 for s in stored.values())
    assert service.list_teaware("alice") == []


def test_delete_removes_the_photo() -> None:
    item = service.create_teaware("alice", _req())
    service.save_image("alice", item.id, b"jpeg-bytes", "image/jpeg")
    service.delete_teaware("alice", item.id)
    assert repo.find_image(cabinet_of("alice"), item.id) is None


def test_a_node_with_dedicated_teaware_cannot_be_deleted() -> None:
    node = catalogue.create_node("alice", CreateNodeRequest(parent_id="oolong", name="House"))
    service.create_teaware("alice", _req(porous=True, dedicated_node_id=node.id))
    with pytest.raises(catalogue.NodeInUseError, match="dedicated here"):
        catalogue.delete_node("alice", node.id)
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_teaware.py -q`
Expected: FAIL — `ImportError: cannot import name 'tea_teaware_service'`.

- [ ] **Step 3: Share the image-upload rule**

In `backend/app/services/tea_service.py`, rename `_MAX_IMAGE_BYTES` → `MAX_IMAGE_BYTES` and `_IMAGE_EXTENSIONS` → `IMAGE_EXTENSIONS`, add below them:

```python
def image_extension(content: bytes, content_type: str) -> str:
    """The stored extension for an uploaded photo; `ValueError` when it can't be kept."""
    extension = IMAGE_EXTENSIONS.get(content_type)
    if extension is None:
        raise ValueError("Only JPEG, PNG, WebP, or GIF images are supported")
    if len(content) > MAX_IMAGE_BYTES:
        raise ValueError("Images must be 5MB or smaller")
    return extension
```

and in `save_image` replace the four lines that look up the extension and check the size with `extension = image_extension(content, content_type)`.

- [ ] **Step 4: Write the service**

Create `backend/app/services/tea_teaware_service.py`:

```python
"""Business logic for the Teaware Cabinet.

Operates on the caller's cabinet, resolved by `tea_cabinet_service` before any
transaction opens, so a household shares its ware as it shares its teas.
Raises `ValueError` for invalid input and `FileNotFoundError` for a missing
item; the router translates.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime
from pathlib import Path

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc
from app.schemas.teaware import Teaware, TeawareWriteRequest
from app.services import tea_cabinet_service as cabinets
from app.services import tea_catalogue_service as catalogue
from app.services import tea_service


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return f"w-{uuid.uuid4().hex[:8]}"


def _position(doc: TeaDoc, teaware_id: str) -> int:
    for position, item in enumerate(doc.teaware):
        if item.id == teaware_id:
            return position
    raise FileNotFoundError(f"No teaware with id {teaware_id!r}")


def _validate(username: str, req: TeawareWriteRequest) -> str:
    """Check a write request and return the cleaned name."""
    name = req.name.strip()
    if not name:
        raise ValueError("Teaware needs a name")
    if req.acquired_date is not None:
        try:
            date.fromisoformat(req.acquired_date)
        except ValueError as exc:
            raise ValueError("Acquired date must be a date like 2024-03-12") from exc
    if req.dedicated_node_id is not None:
        if not req.porous:
            raise ValueError("Only a pot that seasons can be dedicated to a tea")
        if req.dedicated_node_id not in {n.id for n in catalogue.merged_nodes(username)}:
            raise ValueError(f"No catalogue entry with id {req.dedicated_node_id!r}")
    return name


def _retired_at(req: TeawareWriteRequest, previous: str | None, stamp: str) -> str | None:
    """Stamped when retiring starts; kept while it stays retired; cleared on the way back."""
    if not req.retired:
        return None
    return previous or stamp


def _item(
    req: TeawareWriteRequest,
    name: str,
    *,
    teaware_id: str,
    created_at: str,
    image_url: str | None,
    retired_at: str | None,
    stamp: str,
) -> Teaware:
    return Teaware(
        **req.model_dump(exclude={"name", "retired"}),
        name=name,
        id=teaware_id,
        image_url=image_url,
        retired_at=retired_at,
        created_at=created_at,
        updated_at=stamp,
    )


def list_teaware(username: str) -> list[Teaware]:
    """Every piece in the cabinet, retired ones included — the shelf filters."""
    return list(cabinets.read_doc_for(username).teaware)


def get_teaware(username: str, teaware_id: str) -> Teaware:
    doc = cabinets.read_doc_for(username)
    return doc.teaware[_position(doc, teaware_id)]


def create_teaware(username: str, req: TeawareWriteRequest) -> Teaware:
    name = _validate(username, req)
    stamp = _now_iso()
    item = _item(
        req,
        name,
        teaware_id=_new_id(),
        created_at=stamp,
        image_url=None,
        retired_at=_retired_at(req, None, stamp),
        stamp=stamp,
    )
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        doc.teaware.append(item)
    return item


def replace_teaware(username: str, teaware_id: str, req: TeawareWriteRequest) -> Teaware:
    """Full replace. `id`, `created_at` and the photo survive."""
    name = _validate(username, req)
    stamp = _now_iso()
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        position = _position(doc, teaware_id)
        existing = doc.teaware[position]
        item = _item(
            req,
            name,
            teaware_id=existing.id,
            created_at=existing.created_at,
            image_url=existing.image_url,
            retired_at=_retired_at(req, existing.retired_at, stamp),
            stamp=stamp,
        )
        doc.teaware[position] = item
        return item


def delete_teaware(username: str, teaware_id: str) -> None:
    """Remove a piece. Its sessions stay, keeping the volume they were brewed at."""
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        del doc.teaware[_position(doc, teaware_id)]
        doc.sessions = [
            s.model_copy(update={"teaware_id": None}) if s.teaware_id == teaware_id else s
            for s in doc.sessions
        ]
    repo.delete_image(cabinet_id, teaware_id)


def save_image(username: str, teaware_id: str, content: bytes, content_type: str) -> Teaware:
    extension = tea_service.image_extension(content, content_type)
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _position(doc, teaware_id)
        repo.save_image(cabinet_id, teaware_id, content, extension)
        updated = doc.teaware[position].model_copy(
            update={"image_url": f"/api/tea/teaware/{teaware_id}/image", "updated_at": _now_iso()}
        )
        doc.teaware[position] = updated
        return updated


def delete_image(username: str, teaware_id: str) -> Teaware:
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _position(doc, teaware_id)
        repo.delete_image(cabinet_id, teaware_id)
        updated = doc.teaware[position].model_copy(
            update={"image_url": None, "updated_at": _now_iso()}
        )
        doc.teaware[position] = updated
        return updated


def image_path(username: str, teaware_id: str) -> Path:
    """The stored photo's path. 404s cover both a missing piece and no photo."""
    cabinet_id = cabinets.resolve(username)
    if cabinet_id is None or not any(w.id == teaware_id for w in repo.read_doc(cabinet_id).teaware):
        raise FileNotFoundError(f"No teaware with id {teaware_id!r}")
    path = repo.find_image(cabinet_id, teaware_id)
    if path is None:
        raise FileNotFoundError(f"No image for teaware {teaware_id!r}")
    return path
```

(`image_path`'s `if` line may exceed 100 columns; let black wrap it.)

- [ ] **Step 5: Guard dedicated catalogue nodes**

In `backend/app/services/tea_catalogue_service.py` `delete_node`, after the `in_use` block and before the `doc.catalogue_nodes = …` line, add:

```python
        dedicated = sum(1 for item in doc.teaware if item.dedicated_node_id == node_id)
        if dedicated:
            plural = "piece of teaware is" if dedicated == 1 else "pieces of teaware are"
            raise NodeInUseError(
                f"{dedicated} {plural} dedicated here. Change the dedication first."
            )
```

- [ ] **Step 6: Run the tests**

Run: `cd backend && .venv/bin/pytest tests/test_tea_teaware.py tests/test_tea_service.py tests/test_tea_catalogue.py -q`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
cd backend && black . && ruff check . && cd ..
git add backend/app/services backend/tests/test_tea_teaware.py
git commit -m "feat(tea): teaware service — add, edit, retire, delete, photos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Vessels on sessions, usage and the last-used prefill

**Files:**
- Modify: `backend/app/services/tea_session_service.py` (`upsert`, new `_vessel_volume`, docstring)
- Modify: `backend/app/services/tea_teaware_service.py` (append `usage`, `last_used`)
- Modify: `backend/tests/test_tea_teaware.py` (append)

**Interfaces:**
- Consumes: Task 2's `_position`; `BREWING_TYPES`; `catalogue.node_index`, `catalogue.ancestry`, `catalogue.merged_nodes`.
- Produces: `tea_session_service.upsert` raises `ValueError` for an unusable vessel and stores `vessel_volume_ml`; `tea_teaware_service.usage(username, teaware_id) -> TeawareUsage`; `tea_teaware_service.last_used(username, tea_id: str | None) -> Teaware | None`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_tea_teaware.py` (add `from tests.tea_support import share` to the imports):

```python
def test_a_session_copies_the_vessels_volume_until_it_finishes() -> None:
    tea_id = _tea()
    pot = service.create_teaware("alice", _req())
    _brew(tea_id, "s-1", pot.id, status="in_progress")
    assert doc_of("alice").sessions[0].vessel_volume_ml == 110

    service.replace_teaware("alice", pot.id, _req(volume_ml=120))
    _brew(tea_id, "s-1", pot.id)
    service.replace_teaware("alice", pot.id, _req(volume_ml=150))

    assert doc_of("alice").sessions[0].vessel_volume_ml == 120


def test_a_session_without_a_vessel_has_no_volume() -> None:
    _brew(_tea(), "s-1", None)
    assert doc_of("alice").sessions[0].vessel_volume_ml is None


@pytest.mark.parametrize("problem", ["cup", "retired", "unknown"])
def test_a_session_refuses_a_vessel_it_cannot_be_brewed_in(problem: str) -> None:
    tea_id = _tea()
    if problem == "cup":
        teaware_id = service.create_teaware("alice", _req(type="cup")).id
    elif problem == "retired":
        teaware_id = service.create_teaware("alice", _req(retired=True)).id
    else:
        teaware_id = "w-nosuchid"
    with pytest.raises(ValueError):
        _brew(tea_id, "s-1", teaware_id, status="in_progress")
    assert doc_of("alice").sessions == []


def test_usage_counts_finished_sessions_and_strays_from_the_dedication() -> None:
    oolong = _tea(node=TIEGUANYIN)
    green = _tea(node="green")
    pot = service.create_teaware("alice", _req(porous=True, dedicated_node_id="oolong"))
    _brew(oolong, "s-1", pot.id)
    _brew(green, "s-2", pot.id)
    _brew(oolong, "s-3", pot.id, status="in_progress")

    usage = service.usage("alice", pot.id)

    assert [s.id for s in usage.sessions] == ["s-2", "s-1"]
    assert (usage.total, usage.off_dedication) == (2, 1)


def test_usage_without_a_dedication_counts_nothing_off() -> None:
    pot = service.create_teaware("alice", _req())
    _brew(_tea(node="green"), "s-1", pot.id)
    assert service.usage("alice", pot.id).off_dedication == 0


def test_last_used_prefers_this_teas_last_vessel_then_any() -> None:
    tea_a, tea_b, tea_c = _tea(), _tea(), _tea()
    pot = service.create_teaware("alice", _req())
    gaiwan = service.create_teaware("alice", _req(name="Gaiwan", type="gaiwan"))
    _brew(tea_a, "s-1", pot.id)
    _brew(tea_b, "s-2", gaiwan.id)

    assert service.last_used("alice", tea_a) == service.get_teaware("alice", pot.id)
    assert service.last_used("alice", tea_b).id == gaiwan.id  # type: ignore[union-attr]
    assert service.last_used("alice", tea_c).id == gaiwan.id  # type: ignore[union-attr]
    assert service.last_used("alice", None).id == gaiwan.id  # type: ignore[union-attr]


def test_last_used_is_personal_and_skips_retired() -> None:
    tea_id = _tea()
    share("alice", "bob")
    gaiwan = service.create_teaware("alice", _req(name="Gaiwan", type="gaiwan"))
    _brew(tea_id, "s-bob", gaiwan.id, username="bob")
    assert service.last_used("alice", tea_id) is None

    pot = service.create_teaware("alice", _req())
    _brew(tea_id, "s-alice", pot.id)
    service.replace_teaware("alice", pot.id, _req(retired=True))
    assert service.last_used("alice", tea_id) is None
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_teaware.py -q`
Expected: FAIL — `vessel_volume_ml` stays `None`, no `ValueError`, `usage`/`last_used` missing.

- [ ] **Step 3: Validate the vessel and copy its volume**

In `backend/app/services/tea_session_service.py`:
- Docstring's last paragraph becomes: "Raises `FileNotFoundError`, `SessionFinalisedError`, `PermissionError` (another member's session), `ValueError` (a vessel it can't be brewed in); the router translates."
- Add `from app.schemas.teaware import BREWING_TYPES` to the imports.
- Add above `upsert`:

```python
def _vessel_volume(doc: TeaDoc, teaware_id: str | None) -> int | None:
    """The volume to record for `teaware_id`, refusing a vessel nobody can brew in.

    `ValueError`, not `FileNotFoundError`: the timer reads a 404 as "your tea is gone".
    """
    if teaware_id is None:
        return None
    item = next((w for w in doc.teaware if w.id == teaware_id), None)
    if item is None:
        raise ValueError("That vessel is no longer in the cabinet")
    if item.type not in BREWING_TYPES:
        raise ValueError(f"A {item.type} isn't something you brew in")
    if item.retired_at is not None:
        raise ValueError(f"{item.name} is retired")
    return item.volume_ml
```

- In `upsert`, after the `if existing is not None:` block (so a retried finish still gets 409 first), add `vessel_volume_ml = _vessel_volume(doc, req.teaware_id)`, and pass `vessel_volume_ml=vessel_volume_ml,` to the `TeaSession(...)` constructor after `brewed_by=username,`.

- [ ] **Step 4: Add usage and last-used**

Append to `backend/app/services/tea_teaware_service.py` (add `TeawareUsage` and `BREWING_TYPES` to the `app.schemas.teaware` import, and `from app.schemas.tea_session import TeaSession`):

```python
def _off_dedication(username: str, doc: TeaDoc, item: Teaware, done: list[TeaSession]) -> int:
    """Sessions whose tea sits outside the dedicated part of the tree. Unknown teas don't count."""
    if item.dedicated_node_id is None:
        return 0
    index = catalogue.node_index(catalogue.merged_nodes(username))
    node_of = {tea.id: tea.catalogue_node_id for tea in doc.teas}
    off = 0
    for session in done:
        node_id = node_of.get(session.tea_id)
        if node_id is None or node_id not in index:
            continue
        if item.dedicated_node_id not in {n.id for n in catalogue.ancestry(index, node_id)}:
            off += 1
    return off


def usage(username: str, teaware_id: str) -> TeawareUsage:
    doc = cabinets.read_doc_for(username)
    item = doc.teaware[_position(doc, teaware_id)]
    done = sorted(
        (s for s in doc.sessions if s.teaware_id == teaware_id and s.status == "finalised"),
        key=lambda s: s.finished_at or "",
        reverse=True,
    )
    return TeawareUsage(
        sessions=done,
        total=len(done),
        off_dedication=_off_dedication(username, doc, item, done),
    )


def last_used(username: str, tea_id: str | None) -> Teaware | None:
    """The vessel to prefill: your last one for this tea, else your last one at all.

    Your own sessions only — a partner's favourite gaiwan is not your default.
    """
    doc = cabinets.read_doc_for(username)
    usable = {
        w.id: w for w in doc.teaware if w.type in BREWING_TYPES and w.retired_at is None
    }
    mine = sorted(
        (s for s in doc.sessions if s.brewed_by == username and s.teaware_id in usable),
        key=lambda s: s.updated_at,
        reverse=True,
    )
    for pool in ([s for s in mine if s.tea_id == tea_id], mine):
        if pool and pool[0].teaware_id is not None:
            return usable[pool[0].teaware_id]
    return None
```

- [ ] **Step 5: Run the backend suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
cd backend && black . && ruff check . && cd ..
git add backend/app/services backend/tests/test_tea_teaware.py
git commit -m "feat(tea): record the vessel on sessions; teaware usage and last-used

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Teaware API routes

**Files:**
- Modify: `backend/app/routers/tea.py`
- Create: `backend/tests/test_tea_teaware_api.py`

**Interfaces:**
- Consumes: Tasks 2–3 service functions.
- Produces: `GET/POST /api/tea/teaware`, `GET /api/tea/teaware/last-used?tea_id=`, `GET/PUT/DELETE /api/tea/teaware/{teaware_id}`, `POST/GET/DELETE /api/tea/teaware/{teaware_id}/image`, `GET /api/tea/teaware/{teaware_id}/usage`; `PUT /api/tea/sessions/{id}` returns 422 for an unusable vessel.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tea_teaware_api.py`:

```python
"""The /api/tea/teaware surface: status codes, photos, sessions and sharing."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app
from app.repositories import tea_repo as repo
from app.services import auth_service
from tests.tea_support import share

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _pot(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {"name": "Zhuni shuiping", "type": "pot", "volume_ml": 110}
    body.update(overrides)
    response = client.post("/api/tea/teaware", json=body)
    assert response.status_code == 201
    return response.json()


def _tea() -> str:
    body = {"name": "Tieguanyin", "catalogue_node_id": "oolong.anxi.tieguanyin"}
    return client.post("/api/tea/teas", json=body).json()["id"]


def _session(tea_id: str, teaware_id: str | None) -> dict[str, object]:
    return {
        "tea_id": tea_id,
        "status": "in_progress",
        "started_at": "2026-09-27T18:00:00+00:00",
        "curve_source": "generic",
        "teaware_id": teaware_id,
        "infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": None}],
    }


def test_create_list_get_replace_delete() -> None:
    pot = _pot()
    assert pot["id"].startswith("w-")
    assert [w["id"] for w in client.get("/api/tea/teaware").json()] == [pot["id"]]
    assert client.get(f"/api/tea/teaware/{pot['id']}").json()["name"] == "Zhuni shuiping"

    replaced = client.put(
        f"/api/tea/teaware/{pot['id']}", json={"name": "Renamed", "type": "pot", "retired": True}
    )
    assert replaced.status_code == 200
    assert replaced.json()["retired_at"] is not None

    assert client.delete(f"/api/tea/teaware/{pot['id']}").status_code == 204
    assert client.get("/api/tea/teaware").json() == []


def test_refusals_and_unknowns() -> None:
    assert client.post("/api/tea/teaware", json={"name": " ", "type": "pot"}).status_code == 422
    assert client.post("/api/tea/teaware", json={"name": "Pot", "type": "vase"}).status_code == 422
    assert client.get("/api/tea/teaware/w-nosuchid").status_code == 404
    assert client.delete("/api/tea/teaware/w-nosuchid").status_code == 404
    assert client.get("/api/tea/teaware/w-nosuchid/usage").status_code == 404


def test_last_used_is_not_read_as_an_id() -> None:
    response = client.get("/api/tea/teaware/last-used")
    assert response.status_code == 200
    assert response.json() is None


def test_a_session_records_the_vessel_and_refuses_a_cup() -> None:
    tea_id = _tea()
    pot = _pot()
    cup = _pot(name="Cup", type="cup")

    stored = client.put("/api/tea/sessions/s-1", json=_session(tea_id, pot["id"]))
    assert stored.status_code == 200
    assert (stored.json()["teaware_id"], stored.json()["vessel_volume_ml"]) == (pot["id"], 110)

    refused = client.put("/api/tea/sessions/s-2", json=_session(tea_id, cup["id"]))
    assert refused.status_code == 422

    last = client.get("/api/tea/teaware/last-used", params={"tea_id": tea_id})
    assert last.json()["id"] == pot["id"]


def test_usage_lists_finished_sessions() -> None:
    tea_id = _tea()
    pot = _pot()
    client.put("/api/tea/sessions/s-1", json={**_session(tea_id, pot["id"]), "status": "finalised"})
    usage = client.get(f"/api/tea/teaware/{pot['id']}/usage").json()
    assert (usage["total"], usage["off_dedication"]) == (1, 0)
    assert usage["sessions"][0]["id"] == "s-1"


def test_photo_round_trip_via_token() -> None:
    pot = _pot()
    uploaded = client.post(
        f"/api/tea/teaware/{pot['id']}/image",
        files={"file": ("p.jpg", b"jpeg-bytes", "image/jpeg")},
    )
    assert uploaded.status_code == 201
    token = auth_service.create_access_token("test_user")
    fetched = client.get(f"/api/tea/teaware/{pot['id']}/image", params={"token": token})
    assert fetched.status_code == 200
    assert fetched.content == b"jpeg-bytes"
    assert client.delete(f"/api/tea/teaware/{pot['id']}/image").json()["image_url"] is None


def test_a_household_member_sees_the_owners_teaware() -> None:
    pot = _pot()
    share("test_user", "bob")
    app.dependency_overrides[get_current_user] = lambda: "bob"
    assert [w["id"] for w in client.get("/api/tea/teaware").json()] == [pot["id"]]
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_teaware_api.py -q`
Expected: FAIL — 404/405 on `/api/tea/teaware`.

- [ ] **Step 3: Add the routes**

In `backend/app/routers/tea.py`:
- Docstring exception list: append "`ValueError` -> 422 also on a session whose vessel can't be brewed in."
- Imports: add `from app.schemas.teaware import Teaware, TeawareUsage, TeawareWriteRequest` and `from app.services import tea_teaware_service as teaware`.
- In `upsert_session`, add before the `SessionFinalisedError` clause:

```python
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
```

- Append at the end of the file:

```python
@router.get("/teaware", response_model=list[Teaware])
def list_teaware(current_user: str = Depends(get_current_user)) -> list[Teaware]:
    return teaware.list_teaware(current_user)


@router.post("/teaware", response_model=Teaware, status_code=201)
def create_teaware(
    req: TeawareWriteRequest, current_user: str = Depends(get_current_user)
) -> Teaware:
    try:
        return teaware.create_teaware(current_user, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# Declared before `/teaware/{teaware_id}`, which would otherwise read "last-used" as an id.
@router.get("/teaware/last-used", response_model=Teaware | None)
def last_used_teaware(
    tea_id: str | None = None, current_user: str = Depends(get_current_user)
) -> Teaware | None:
    return teaware.last_used(current_user, tea_id)


@router.get("/teaware/{teaware_id}", response_model=Teaware)
def get_teaware(teaware_id: str, current_user: str = Depends(get_current_user)) -> Teaware:
    try:
        return teaware.get_teaware(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc


@router.put("/teaware/{teaware_id}", response_model=Teaware)
def replace_teaware(
    teaware_id: str,
    req: TeawareWriteRequest,
    current_user: str = Depends(get_current_user),
) -> Teaware:
    try:
        return teaware.replace_teaware(current_user, teaware_id, req)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/teaware/{teaware_id}", status_code=204)
def delete_teaware(teaware_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        teaware.delete_teaware(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc


@router.post("/teaware/{teaware_id}/image", response_model=Teaware, status_code=201)
async def upload_teaware_image(
    teaware_id: str,
    file: Annotated[UploadFile, File()],
    current_user: str = Depends(get_current_user),
) -> Teaware:
    content = await file.read()
    try:
        return teaware.save_image(current_user, teaware_id, content, file.content_type or "")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/teaware/{teaware_id}/image")
def get_teaware_image(teaware_id: str, token: str = Query(...)) -> FileResponse:
    """`?token=` for the same reason as tea photos: an `<img>` can't send a header."""
    current_user = user_from_token(token)
    try:
        path = teaware.image_path(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image not found") from exc
    media_type = _IMAGE_MEDIA_TYPES.get(path.suffix.removeprefix("."), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.delete("/teaware/{teaware_id}/image", response_model=Teaware)
def delete_teaware_image(teaware_id: str, current_user: str = Depends(get_current_user)) -> Teaware:
    try:
        return teaware.delete_image(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc


@router.get("/teaware/{teaware_id}/usage", response_model=TeawareUsage)
def teaware_usage(teaware_id: str, current_user: str = Depends(get_current_user)) -> TeawareUsage:
    try:
        return teaware.usage(current_user, teaware_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Teaware not found") from exc
```

- [ ] **Step 4: Run the backend suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
cd backend && black . && ruff check . && cd ..
git add backend/app/routers/tea.py backend/tests/test_tea_teaware_api.py
git commit -m "feat(tea): teaware API routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend types, ware helpers and stores

**Files:**
- Modify: `frontend/src/apps/tea/types.ts`
- Create: `frontend/src/apps/tea/ware.ts`, `frontend/src/apps/tea/ware.spec.ts`
- Create: `frontend/src/apps/tea/stores/useTeawareStore.ts`, `frontend/src/apps/tea/stores/useTeawareStore.spec.ts`
- Create: `frontend/src/apps/tea/stores/useTeawareFiltersStore.ts`
- Modify fixtures: every spec that builds a `TeaSession` (find them with `grep -rln "brewed_by" frontend/src/apps/tea --include=*.spec.ts`)

**Interfaces:**
- Produces (types): `TeawareType`, `TeawareMaterial`, `Teaware`, `TeawareWrite`, `TeawareUsage`; `TeaSessionWrite.teaware_id: string | null`; `TeaSession.vessel_volume_ml: number | null`.
- Produces (`ware.ts`): `WARE_TYPE_ORDER`, `WARE_TYPE_LABELS`, `MATERIAL_LABELS`, `isBrewingVessel(item)`, `groupByType(items) -> WareSectionData[]`, `WareSectionData`, `WareFilterState`, `matchesWareFilters(item, state)`, `wareSummary(item)`, `vesselLabel(session, items)`, `blankWare()`, `toWareWrite(item)`, `canSaveWare(draft)`.
- Produces (stores): `useTeawareStore()` → `items`, `loading`, `saving`, `error`, `fetchItems()`, `createItem(body) -> Teaware | null`, `replaceItem(id, body) -> Teaware | null`, `deleteItem(id) -> boolean`, `uploadImage(id, file)`, `removeImage(id)`, `fetchUsage(id) -> TeawareUsage | null`, `lastUsed(teaId | null) -> Teaware | null`. `useTeawareFiltersStore()` → `type`, `material`, `minMl`, `maxMl`, `showRetired`, `state`, `activeCount`, `clear()`.

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/apps/tea/ware.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  canSaveWare,
  groupByType,
  isBrewingVessel,
  matchesWareFilters,
  toWareWrite,
  vesselLabel,
  wareSummary,
  type WareFilterState,
} from "./ware";
import type { TeaSession, Teaware } from "./types";

function ware(id: string, overrides: Partial<Teaware> = {}): Teaware {
  return {
    id,
    name: id,
    type: "pot",
    material: "clay",
    volume_ml: 110,
    porous: false,
    dedicated_node_id: null,
    maker: "",
    origin: "",
    acquired_date: null,
    price_paid: null,
    notes: "",
    image_url: null,
    retired_at: null,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
    ...overrides,
  };
}

function session(overrides: Partial<TeaSession> = {}): TeaSession {
  return {
    id: "s-1",
    brewed_by: "jakub",
    tea_id: "t-1",
    status: "finalised",
    started_at: "2026-09-27T18:00:00Z",
    updated_at: "2026-09-27T18:30:00Z",
    finished_at: "2026-09-27T18:30:00Z",
    leaf_grams: 7,
    water_temp_c: 95,
    rating: null,
    curve_source: "generic",
    curve_source_label: "",
    infusions: [],
    teaware_id: null,
    vessel_volume_ml: null,
    ...overrides,
  };
}

const NO_FILTERS: WareFilterState = {
  type: null,
  material: null,
  minMl: null,
  maxMl: null,
  showRetired: false,
};

describe("ware helpers", () => {
  it("groups by type in shelf order, names A–Z, empty types omitted", () => {
    const sections = groupByType([
      ware("b-cup", { type: "cup" }),
      ware("Zhuni", { type: "pot" }),
      ware("Duanni", { type: "pot" }),
      ware("Gaiwan", { type: "gaiwan" }),
    ]);
    expect(sections.map((s) => s.type)).toEqual(["gaiwan", "pot", "cup"]);
    expect(sections[1].items.map((i) => i.name)).toEqual(["Duanni", "Zhuni"]);
  });

  it("knows what can be brewed in", () => {
    expect(isBrewingVessel(ware("a", { type: "gaiwan" }))).toBe(true);
    expect(isBrewingVessel(ware("a", { type: "cup" }))).toBe(false);
    expect(isBrewingVessel(ware("a", { retired_at: "2026-09-27T10:00:00Z" }))).toBe(false);
  });

  it("hides retired pieces unless asked, and filters by type, material and volume", () => {
    const retired = ware("r", { retired_at: "2026-09-27T10:00:00Z" });
    expect(matchesWareFilters(retired, NO_FILTERS)).toBe(false);
    expect(matchesWareFilters(retired, { ...NO_FILTERS, showRetired: true })).toBe(true);
    expect(matchesWareFilters(ware("a"), { ...NO_FILTERS, type: "gaiwan" })).toBe(false);
    expect(matchesWareFilters(ware("a"), { ...NO_FILTERS, material: "glass" })).toBe(false);
    expect(matchesWareFilters(ware("a"), { ...NO_FILTERS, minMl: 100, maxMl: 120 })).toBe(true);
    expect(matchesWareFilters(ware("a"), { ...NO_FILTERS, minMl: 120 })).toBe(false);
    expect(matchesWareFilters(ware("a", { volume_ml: null }), { ...NO_FILTERS, maxMl: 200 })).toBe(
      false,
    );
  });

  it("summarises volume and material", () => {
    expect(wareSummary(ware("a"))).toBe("110 ml · clay");
    expect(wareSummary(ware("a", { volume_ml: null, material: null }))).toBe("");
  });

  it("labels a session's vessel, including one since removed", () => {
    const pot = ware("w-1", { name: "Zhuni" });
    expect(vesselLabel(session({ teaware_id: "w-1", vessel_volume_ml: 110 }), [pot])).toBe(
      "Zhuni 110 ml",
    );
    expect(vesselLabel(session({ teaware_id: null, vessel_volume_ml: 110 }), [pot])).toBe(
      "110 ml, vessel removed",
    );
    expect(vesselLabel(session(), [pot])).toBe("");
  });

  it("round-trips an item into a write body and needs only a name to save", () => {
    const body = toWareWrite(ware("w-1", { retired_at: "2026-09-27T10:00:00Z" }));
    expect(body.retired).toBe(true);
    expect("id" in body).toBe(false);
    expect(canSaveWare({ ...body, name: "  " })).toBe(false);
    expect(canSaveWare(body)).toBe(true);
  });
});
```

Create `frontend/src/apps/tea/stores/useTeawareStore.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock, uploadMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  uploadMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock, upload: uploadMock },
}));

import { useTeawareStore } from "./useTeawareStore";
import { blankWare } from "../ware";
import type { Teaware } from "../types";

const POT: Teaware = {
  id: "w-1",
  name: "Zhuni",
  type: "pot",
  material: "clay",
  volume_ml: 110,
  porous: false,
  dedicated_node_id: null,
  maker: "",
  origin: "",
  acquired_date: null,
  price_paid: null,
  notes: "",
  image_url: null,
  retired_at: null,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("useTeawareStore", () => {
  it("fetches the shelf", async () => {
    getMock.mockResolvedValue([POT]);
    const store = useTeawareStore();
    await store.fetchItems();
    expect(getMock).toHaveBeenCalledWith("/tea/teaware");
    expect(store.items).toEqual([POT]);
    expect(store.loading).toBe(false);
  });

  it("empties the shelf and shows the reason when the load fails", async () => {
    getMock.mockRejectedValue(Object.assign(new Error("500"), { detail: "boom" }));
    const store = useTeawareStore();
    store.items = [POT];
    await store.fetchItems();
    expect(store.items).toEqual([]);
    expect(store.error).toBe("boom");
  });

  it("creates, replaces and deletes", async () => {
    const store = useTeawareStore();
    postMock.mockResolvedValue(POT);
    expect(await store.createItem(blankWare())).toEqual(POT);
    expect(postMock).toHaveBeenCalledWith("/tea/teaware", expect.objectContaining({ name: "" }));

    putMock.mockResolvedValue({ ...POT, name: "Renamed" });
    await store.replaceItem("w-1", { ...blankWare(), name: "Renamed" });
    expect(store.items[0].name).toBe("Renamed");

    delMock.mockResolvedValue(undefined);
    expect(await store.deleteItem("w-1")).toBe(true);
    expect(store.items).toEqual([]);
  });

  it("keeps a refused write's reason and returns null", async () => {
    postMock.mockRejectedValue(Object.assign(new Error("422"), { detail: "Teaware needs a name" }));
    const store = useTeawareStore();
    expect(await store.createItem(blankWare())).toBeNull();
    expect(store.error).toBe("Teaware needs a name");
    expect(store.saving).toBe(false);
  });

  it("asks for the last-used vessel, and treats a failure as none", async () => {
    const store = useTeawareStore();
    getMock.mockResolvedValueOnce(POT);
    expect(await store.lastUsed("t-1")).toEqual(POT);
    expect(getMock).toHaveBeenCalledWith("/tea/teaware/last-used?tea_id=t-1");
    getMock.mockResolvedValueOnce(null);
    expect(await store.lastUsed(null)).toBeNull();
    expect(getMock).toHaveBeenLastCalledWith("/tea/teaware/last-used");
    getMock.mockRejectedValueOnce(new Error("down"));
    expect(await store.lastUsed("t-1")).toBeNull();
    expect(store.error).toBeNull();
  });

  it("fetches a piece's usage", async () => {
    getMock.mockResolvedValue({ sessions: [], total: 0, off_dedication: 0 });
    const store = useTeawareStore();
    expect(await store.fetchUsage("w-1")).toEqual({ sessions: [], total: 0, off_dedication: 0 });
    expect(getMock).toHaveBeenCalledWith("/tea/teaware/w-1/usage");
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/ware.spec.ts src/apps/tea/stores/useTeawareStore.spec.ts`
Expected: FAIL — cannot resolve `./ware` / `./useTeawareStore`.

- [ ] **Step 3: Add the types**

In `frontend/src/apps/tea/types.ts`, add `teaware_id: string | null;` as the last field of `TeaSessionWrite`, add `vessel_volume_ml: number | null;` to `TeaSession` after `brewed_by`, and append:

```ts
export type TeawareType = "gaiwan" | "pot" | "kyusu" | "chawan" | "pitcher" | "cup" | "other";
export type TeawareMaterial = "porcelain" | "clay" | "stoneware" | "glass" | "other";

export interface Teaware {
  id: string;
  name: string;
  type: TeawareType;
  material: TeawareMaterial | null;
  volume_ml: number | null;
  porous: boolean;
  dedicated_node_id: string | null;
  maker: string;
  origin: string;
  acquired_date: string | null;
  price_paid: number | null;
  notes: string;
  image_url: string | null;
  retired_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Create/replace body: server fields dropped, `retired` stands in for `retired_at`. */
export interface TeawareWrite {
  name: string;
  type: TeawareType;
  material: TeawareMaterial | null;
  volume_ml: number | null;
  porous: boolean;
  dedicated_node_id: string | null;
  maker: string;
  origin: string;
  acquired_date: string | null;
  price_paid: number | null;
  notes: string;
  retired: boolean;
}

export interface TeawareUsage {
  sessions: TeaSession[];
  total: number;
  off_dedication: number;
}
```

Then run `grep -rln "brewed_by" frontend/src/apps/tea --include=*.spec.ts` and, in every object literal building a `TeaSession` in those files, add `teaware_id: null, vessel_volume_ml: null,` next to `brewed_by`. Also add `teaware_id: null` to any object literal typed as `TeaSessionWrite` (none are expected; `npm run typecheck` will say).

- [ ] **Step 4: Write the helpers**

Create `frontend/src/apps/tea/ware.ts`:

```ts
// The ware shelf's rules as pure functions, like shelf.ts is for teas.

import type {
  TeaSession,
  Teaware,
  TeawareMaterial,
  TeawareType,
  TeawareWrite,
} from "./types";

export const WARE_TYPE_ORDER: TeawareType[] = [
  "gaiwan",
  "pot",
  "kyusu",
  "chawan",
  "pitcher",
  "cup",
  "other",
];

export const WARE_TYPE_LABELS: Record<TeawareType, { label: string; labelZh: string }> = {
  gaiwan: { label: "Gaiwan", labelZh: "蓋碗" },
  pot: { label: "Pot", labelZh: "壺" },
  kyusu: { label: "Kyusu", labelZh: "急須" },
  chawan: { label: "Chawan", labelZh: "茶碗" },
  pitcher: { label: "Pitcher", labelZh: "公道杯" },
  cup: { label: "Cup", labelZh: "杯" },
  other: { label: "Other", labelZh: "其他" },
};

export const MATERIAL_LABELS: Record<TeawareMaterial, string> = {
  porcelain: "Porcelain",
  clay: "Clay",
  stoneware: "Stoneware",
  glass: "Glass",
  other: "Other",
};

// Must match the server's BREWING_TYPES.
const BREWING_TYPES: ReadonlySet<TeawareType> = new Set([
  "gaiwan",
  "pot",
  "kyusu",
  "chawan",
  "other",
]);

export function isBrewingVessel(item: Teaware): boolean {
  return BREWING_TYPES.has(item.type) && item.retired_at === null;
}

export interface WareSectionData {
  type: TeawareType;
  items: Teaware[];
}

/** Sections in shelf order, names A–Z, empty types omitted. */
export function groupByType(items: Teaware[]): WareSectionData[] {
  const buckets = new Map<TeawareType, Teaware[]>();
  for (const item of items) {
    // A type this build doesn't know means the server is ahead; shelve it rather than drop it.
    const type: TeawareType = WARE_TYPE_ORDER.includes(item.type) ? item.type : "other";
    buckets.set(type, [...(buckets.get(type) ?? []), item]);
  }
  return WARE_TYPE_ORDER.filter((type) => buckets.has(type)).map((type) => ({
    type,
    items: [...(buckets.get(type) ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export interface WareFilterState {
  type: TeawareType | null;
  material: TeawareMaterial | null;
  minMl: number | null;
  maxMl: number | null;
  showRetired: boolean;
}

export function matchesWareFilters(item: Teaware, filters: WareFilterState): boolean {
  if (!filters.showRetired && item.retired_at !== null) return false;
  if (filters.type && item.type !== filters.type) return false;
  if (filters.material && item.material !== filters.material) return false;
  const volume = item.volume_ml;
  if (filters.minMl !== null && (volume === null || volume < filters.minMl)) return false;
  if (filters.maxMl !== null && (volume === null || volume > filters.maxMl)) return false;
  return true;
}

/** "110 ml · clay", leaving out whatever isn't recorded. */
export function wareSummary(item: Teaware): string {
  return [
    item.volume_ml !== null ? `${item.volume_ml} ml` : "",
    item.material ? MATERIAL_LABELS[item.material].toLowerCase() : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What a session row says about its vessel: name and volume, or that the pot is gone. */
export function vesselLabel(session: TeaSession, items: Teaware[]): string {
  const ml = session.vessel_volume_ml !== null ? `${session.vessel_volume_ml} ml` : "";
  const item = session.teaware_id ? items.find((i) => i.id === session.teaware_id) : undefined;
  if (item) return ml ? `${item.name} ${ml}` : item.name;
  if (session.teaware_id === null && ml) return `${ml}, vessel removed`;
  return ml;
}

export function blankWare(): TeawareWrite {
  return {
    name: "",
    type: "gaiwan",
    material: null,
    volume_ml: null,
    porous: false,
    dedicated_node_id: null,
    maker: "",
    origin: "",
    acquired_date: null,
    price_paid: null,
    notes: "",
    retired: false,
  };
}

export function toWareWrite(item: Teaware): TeawareWrite {
  return {
    name: item.name,
    type: item.type,
    material: item.material,
    volume_ml: item.volume_ml,
    porous: item.porous,
    dedicated_node_id: item.dedicated_node_id,
    maker: item.maker,
    origin: item.origin,
    acquired_date: item.acquired_date,
    price_paid: item.price_paid,
    notes: item.notes,
    retired: item.retired_at !== null,
  };
}

export function canSaveWare(draft: TeawareWrite): boolean {
  return draft.name.trim() !== "";
}
```

- [ ] **Step 5: Write the stores**

Create `frontend/src/apps/tea/stores/useTeawareStore.ts`:

```ts
import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Teaware, TeawareUsage, TeawareWrite } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

export const useTeawareStore = defineStore("tea-teaware", () => {
  const items = ref<Teaware[]>([]);
  const loading = ref(false);
  // Apart from `loading`, so a write never blanks the shelf being looked at.
  const saving = ref(false);
  const error = ref<string | null>(null);

  function put(item: Teaware): void {
    items.value = items.value.some((i) => i.id === item.id)
      ? items.value.map((i) => (i.id === item.id ? item : i))
      : [...items.value, item];
  }

  async function fetchItems(): Promise<void> {
    loading.value = true;
    try {
      items.value = await api.get<Teaware[]>("/tea/teaware");
      error.value = null;
    } catch (e) {
      items.value = [];
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function write(run: () => Promise<Teaware>): Promise<Teaware | null> {
    saving.value = true;
    try {
      const item = await run();
      put(item);
      error.value = null;
      return item;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      saving.value = false;
    }
  }

  function createItem(body: TeawareWrite): Promise<Teaware | null> {
    return write(() => api.post<Teaware>("/tea/teaware", { ...body }));
  }

  function replaceItem(id: string, body: TeawareWrite): Promise<Teaware | null> {
    return write(() => api.put<Teaware>(`/tea/teaware/${id}`, { ...body }));
  }

  async function deleteItem(id: string): Promise<boolean> {
    saving.value = true;
    try {
      await api.del(`/tea/teaware/${id}`);
      items.value = items.value.filter((i) => i.id !== id);
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  async function uploadImage(id: string, file: File): Promise<void> {
    await write(() => api.upload<Teaware>(`/tea/teaware/${id}/image`, file));
  }

  async function removeImage(id: string): Promise<void> {
    await write(() => api.del<Teaware>(`/tea/teaware/${id}/image`));
  }

  async function fetchUsage(id: string): Promise<TeawareUsage | null> {
    try {
      const usage = await api.get<TeawareUsage>(`/tea/teaware/${id}/usage`);
      error.value = null;
      return usage;
    } catch (e) {
      error.value = message(e);
      return null;
    }
  }

  /** A best-effort prefill: a failure just means no suggestion, never an error banner. */
  async function lastUsed(teaId: string | null): Promise<Teaware | null> {
    const query = teaId ? `?tea_id=${encodeURIComponent(teaId)}` : "";
    try {
      return await api.get<Teaware | null>(`/tea/teaware/last-used${query}`);
    } catch {
      return null;
    }
  }

  return {
    items,
    loading,
    saving,
    error,
    fetchItems,
    createItem,
    replaceItem,
    deleteItem,
    uploadImage,
    removeImage,
    fetchUsage,
    lastUsed,
  };
});
```

Create `frontend/src/apps/tea/stores/useTeawareFiltersStore.ts`:

```ts
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { WareFilterState } from "@/apps/tea/ware";
import type { TeawareMaterial, TeawareType } from "@/apps/tea/types";

// A store rather than page state so the filters survive opening a piece and coming back.
export const useTeawareFiltersStore = defineStore("tea-teaware-filters", () => {
  const type = ref<TeawareType | null>(null);
  const material = ref<TeawareMaterial | null>(null);
  const minMl = ref<number | null>(null);
  const maxMl = ref<number | null>(null);
  const showRetired = ref(false);

  const state = computed<WareFilterState>(() => ({
    type: type.value,
    material: material.value,
    minMl: minMl.value,
    maxMl: maxMl.value,
    showRetired: showRetired.value,
  }));

  const activeCount = computed(
    () =>
      Number(type.value !== null) +
      Number(material.value !== null) +
      Number(minMl.value !== null || maxMl.value !== null) +
      Number(showRetired.value),
  );

  function clear(): void {
    type.value = null;
    material.value = null;
    minMl.value = null;
    maxMl.value = null;
    showRetired.value = false;
  }

  return { type, material, minMl, maxMl, showRetired, state, activeCount, clear };
});
```

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): teaware types, shelf helpers and stores

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The ware shelf, its routes and the home-screen entry

**Files:**
- Create: `frontend/src/apps/tea/components/WareCard.vue`, `components/WareSection.vue`, `components/WareFilters.vue`
- Create: `frontend/src/apps/tea/pages/WareCabinetPage.vue`, `pages/WareCabinetPage.spec.ts`
- Create (placeholders replaced in Task 7): `pages/NewWarePage.vue`, `pages/WareDetailPage.vue`
- Modify: `frontend/src/router/routes.ts` (+ `routes.spec.ts`), `frontend/src/apps/tea/pages/TeaHomePage.vue` (+ spec)

**Interfaces:**
- Consumes: Task 5's `useTeawareStore`, `useTeawareFiltersStore`, `groupByType`, `matchesWareFilters`, `wareSummary`, `WARE_TYPE_LABELS`, `MATERIAL_LABELS`, `WARE_TYPE_ORDER`; `imageSrc` from `shelf.ts`.
- Produces: routes `tea-ware` (`/tea/ware`), `tea-ware-new` (`/tea/ware/new`), `tea-ware-detail` (`/tea/ware/:wareId`); test ids `ware-card`, `ware-card-name`, `ware-card-meta`, `ware-section`, `ware-section-name`, `ware-filters`, `ware-filters-sheet`, `ware-filter-type-{type}`, `ware-filter-material-{m}`, `ware-filter-min`, `ware-filter-max`, `ware-filter-retired`, `ware-filters-done`, `ware-filters-clear`, `ware-count`, `ware-empty`, `ware-no-match`, `ware-clear-filters`, `ware-error`, `ware-add`.

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/apps/tea/pages/WareCabinetPage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push } = vi.hoisted(() => ({ getMock: vi.fn(), push: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import WareCabinetPage from "./WareCabinetPage.vue";
import { useTeawareFiltersStore } from "../stores/useTeawareFiltersStore";
import type { Teaware } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function ware(id: string, overrides: Partial<Teaware> = {}): Teaware {
  return {
    id,
    name: id,
    type: "pot",
    material: "clay",
    volume_ml: 110,
    porous: false,
    dedicated_node_id: null,
    maker: "",
    origin: "",
    acquired_date: null,
    price_paid: null,
    notes: "",
    image_url: null,
    retired_at: null,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
    ...overrides,
  };
}

async function render(items: Teaware[]) {
  getMock.mockImplementation((path: string) =>
    path === "/tea/teaware" ? Promise.resolve(items) : Promise.resolve([]),
  );
  const wrapper = mount(WareCabinetPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("WareCabinetPage", () => {
  it("invites you to add the first piece when there is none", async () => {
    expect((await render([])).find("[data-testid=ware-empty]").exists()).toBe(true);
  });

  it("shelves pieces by type in shelf order, hiding retired ones", async () => {
    const wrapper = await render([
      ware("Cup", { type: "cup" }),
      ware("Zhuni"),
      ware("Gaiwan", { type: "gaiwan" }),
      ware("Old", { retired_at: "2026-09-27T10:00:00Z" }),
    ]);
    expect(wrapper.findAll("[data-testid=ware-section-name]").map((n) => n.text())).toEqual([
      "Gaiwan",
      "Pot",
      "Cup",
    ]);
    expect(wrapper.findAll("[data-testid=ware-card-name]").map((n) => n.text())).not.toContain(
      "Old",
    );
    expect(wrapper.get("[data-testid=ware-count]").text()).toBe("3 pieces");
    expect(wrapper.findAll("[data-testid=ware-card-meta]")[1].text()).toBe("110 ml · clay");
  });

  it("filters, and offers to clear when nothing matches", async () => {
    const wrapper = await render([ware("Zhuni")]);
    useTeawareFiltersStore().type = "gaiwan";
    await flushPromises();
    expect(wrapper.find("[data-testid=ware-no-match]").exists()).toBe(true);
    expect(wrapper.get("[data-testid=ware-count]").text()).toBe("0 of 1 piece");
    await wrapper.get("[data-testid=ware-clear-filters]").trigger("click");
    expect(wrapper.findAll("[data-testid=ware-card]")).toHaveLength(1);
  });

  it("shows retired pieces when asked", async () => {
    const wrapper = await render([ware("Old", { retired_at: "2026-09-27T10:00:00Z" })]);
    await wrapper.get("[data-testid=ware-filters]").trigger("click");
    await wrapper.get("[data-testid=ware-filter-retired]").setValue(true);
    expect(wrapper.findAll("[data-testid=ware-card]")).toHaveLength(1);
  });

  it("opens a piece and the add form", async () => {
    const wrapper = await render([ware("w-1")]);
    await wrapper.get("[data-testid=ware-card]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-ware-detail", params: { wareId: "w-1" } });
    await wrapper.get("[data-testid=ware-add]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-ware-new" });
  });
});
```

In `frontend/src/apps/tea/pages/TeaHomePage.spec.ts`: change the expected labels to `["Cabinet", "Teaware", "Brew", "Almanac"]` (and the test name to "offers the cabinet, teaware, brewing and the almanac, in that order"), and add `["Teaware", "tea-ware"],` to the `it.each` table.

In `frontend/src/router/routes.spec.ts`, inside `describe("tea back navigation", …)`, add:

```ts
  it("gives teaware its own pages, not a tea called 'ware'", async () => {
    const router = makeRouter();
    await router.push("/tea/ware");
    expect(router.currentRoute.value.name).toBe("tea-ware");
    expect(router.currentRoute.value.meta.backTo).toBe("/tea");

    await router.push("/tea/ware/new");
    expect(router.currentRoute.value.name).toBe("tea-ware-new");
    expect(router.currentRoute.value.meta.backTo).toBe("/tea/ware");

    await router.push("/tea/ware/w-1");
    expect(router.currentRoute.value.name).toBe("tea-ware-detail");
    expect(router.currentRoute.value.meta.backTo).toBe("/tea/ware");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/pages/WareCabinetPage.spec.ts src/apps/tea/pages/TeaHomePage.spec.ts src/router/routes.spec.ts`
Expected: FAIL — `WareCabinetPage.vue` missing, no Teaware section, `/tea/ware` resolves to `tea-detail`.

- [ ] **Step 3: Write the card and section**

Create `frontend/src/apps/tea/components/WareCard.vue`:

```vue
<template>
  <button
    :class="['card', { 'card--retired': item.retired_at !== null }]"
    data-testid="ware-card"
    @click="emit('open', item.id)"
  >
    <span class="card__frame">
      <img v-if="photoSrc" class="card__photo" :src="photoSrc" alt="" />
      <span v-else class="card__placeholder" lang="zh">{{ glyph }}</span>
    </span>
    <span class="card__name" data-testid="ware-card-name">{{ item.name }}</span>
    <span v-if="summary" class="card__meta" data-testid="ware-card-meta">{{ summary }}</span>
  </button>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { imageSrc } from "../shelf";
import { WARE_TYPE_LABELS, wareSummary } from "../ware";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Teaware } from "../types";

const props = defineProps<{ item: Teaware }>();
const emit = defineEmits<{ open: [teawareId: string] }>();

const auth = useAuthStore();
const photoSrc = computed(() => imageSrc(props.item.image_url, auth.token));
const summary = computed(() => wareSummary(props.item));
const glyph = computed(() => (WARE_TYPE_LABELS[props.item.type] ?? WARE_TYPE_LABELS.other).labelZh.charAt(0));
</script>

<style scoped lang="scss">
.card {
  flex: none;
  width: 112px;
  background: transparent;
  border: 0;
  padding: 0;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  scroll-snap-align: start;
}
.card__frame {
  display: block;
  width: 112px;
  height: 112px;
  border-radius: 6px;
  overflow: hidden;
  background: #1e1712;
}
.card__photo {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
// Ware isn't a liquor, so its placeholder stays bone/ink (DESIGN.md).
.card__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #2c241d;
  color: #8b7a63;
  font-size: 40px;
  font-weight: 300;
}
.card__name {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: #efe7da;
  font-size: 13.5px;
  line-height: 1.3;
  margin-top: 7px;
}
.card__meta {
  display: block;
  color: #8b7a63;
  font-size: 12px;
  margin-top: 2px;
}
.card--retired .card__frame {
  opacity: 0.4;
}
.card--retired .card__name {
  color: #574d43;
}
</style>
```

Create `frontend/src/apps/tea/components/WareSection.vue`:

```vue
<template>
  <section class="section" data-testid="ware-section">
    <header class="section__head">
      <span class="section__name" data-testid="ware-section-name">{{ labels.label }}</span>
      <span class="section__zh" lang="zh">{{ labels.labelZh }}</span>
    </header>
    <div :class="['section__strip', { 'section__strip--two-rows': section.items.length > 6 }]">
      <WareCard
        v-for="item in section.items"
        :key="item.id"
        :item="item"
        @open="emit('open', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import WareCard from "./WareCard.vue";
import { WARE_TYPE_LABELS, type WareSectionData } from "../ware";

const props = defineProps<{ section: WareSectionData }>();
const emit = defineEmits<{ open: [teawareId: string] }>();

const labels = computed(() => WARE_TYPE_LABELS[props.section.type]);
</script>

<style scoped lang="scss">
// The tea shelf's strip layout (ShelfSection.vue), without the class leaves.
.section {
  padding: 10px 0 22px;
}
.section__head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 9px;
  padding: 0 18px;
}
.section__name {
  color: #e4d9c6;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
}
.section__zh {
  color: #a99781;
  font-size: 12.5px;
  font-weight: 300;
}
.section__strip {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 112px;
  align-items: start;
  gap: 16px 12px;
  overflow-x: auto;
  scroll-snap-type: x proximity;
  scroll-padding: 0 18px;
  padding: 0 18px 4px;
  scrollbar-width: none;
}
.section__strip--two-rows {
  grid-template-rows: auto auto;
}
.section__strip::-webkit-scrollbar {
  display: none;
}
</style>
```

- [ ] **Step 4: Write the filters sheet**

Create `frontend/src/apps/tea/components/WareFilters.vue`:

```vue
<template>
  <div class="scrim" @click="emit('close')"></div>
  <div class="sheet ware-filters" data-testid="ware-filters-sheet">
    <p class="ware-filters__tier">Type</p>
    <div class="ware-filters__chips">
      <button
        v-for="type in types"
        :key="type"
        :class="['chip', { 'chip--on': filters.type === type }]"
        :data-testid="`ware-filter-type-${type}`"
        @click="filters.type = filters.type === type ? null : type"
      >
        {{ WARE_TYPE_LABELS[type].label }}
      </button>
    </div>

    <template v-if="materials.length">
      <p class="ware-filters__tier">Material</p>
      <div class="ware-filters__chips">
        <button
          v-for="material in materials"
          :key="material"
          :class="['chip', { 'chip--on': filters.material === material }]"
          :data-testid="`ware-filter-material-${material}`"
          @click="filters.material = filters.material === material ? null : material"
        >
          {{ MATERIAL_LABELS[material] }}
        </button>
      </div>
    </template>

    <p class="ware-filters__tier">Volume (ml)</p>
    <div class="ware-filters__range">
      <input
        class="sheet__field"
        data-testid="ware-filter-min"
        inputmode="numeric"
        placeholder="from"
        aria-label="Volume from, ml"
        :value="filters.minMl ?? ''"
        @input="filters.minMl = asMl($event)"
      />
      <input
        class="sheet__field"
        data-testid="ware-filter-max"
        inputmode="numeric"
        placeholder="to"
        aria-label="Volume to, ml"
        :value="filters.maxMl ?? ''"
        @input="filters.maxMl = asMl($event)"
      />
    </div>

    <label class="ware-filters__check">
      <input v-model="filters.showRetired" type="checkbox" data-testid="ware-filter-retired" />
      Show retired pieces
    </label>

    <button class="sheet__save" data-testid="ware-filters-done" @click="emit('close')">
      {{ matchCount === 1 ? "Show 1 piece" : `Show ${matchCount} pieces` }}
    </button>
    <button
      v-if="filters.activeCount > 0"
      class="sheet__cancel"
      data-testid="ware-filters-clear"
      @click="filters.clear()"
    >
      Clear filters
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { MATERIAL_LABELS, WARE_TYPE_LABELS, WARE_TYPE_ORDER } from "../ware";
import { useTeawareFiltersStore } from "../stores/useTeawareFiltersStore";
import type { Teaware, TeawareMaterial } from "../types";

const props = defineProps<{ items: Teaware[]; matchCount: number }>();
const emit = defineEmits<{ close: [] }>();

const filters = useTeawareFiltersStore();

// Only what the cabinet actually holds — a chip that can only empty the shelf is noise.
const types = computed(() => WARE_TYPE_ORDER.filter((t) => props.items.some((i) => i.type === t)));
const materials = computed(() =>
  (Object.keys(MATERIAL_LABELS) as TeawareMaterial[]).filter((m) =>
    props.items.some((i) => i.material === m),
  ),
);

function asMl(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value.trim();
  const parsed = Number(raw);
  return raw !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.scrim {
  position: fixed;
  inset: 0;
  z-index: 19;
  background: rgba(0, 0, 0, 0.45);
}
.ware-filters {
  max-height: 85vh;
  overflow-y: auto;
}
.ware-filters__tier {
  color: #6b5f52;
  font-size: 11.5px;
  margin: 10px 0 4px;
}
.ware-filters__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 6px 0;
}
.chip {
  border: 1px solid #2e271f;
  background: transparent;
  color: #e4d9c6;
  font-family: inherit;
  font-size: 13px;
  padding: 5px 11px;
  border-radius: 14px;
  cursor: pointer;
}
.chip--on {
  background: #e4d9c6;
  border-color: #e4d9c6;
  color: #17120e;
  font-weight: 600;
}
.ware-filters__range {
  display: flex;
  gap: 10px;
}
.ware-filters__check {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #e4d9c6;
  font-size: 14px;
  padding: 12px 0 4px;
}
</style>
```

(`timer-sheet.scss` gives `.sheet` `z-index: 20`; the scrim sits just below it.)

- [ ] **Step 5: Write the shelf page and placeholder pages**

Create `frontend/src/apps/tea/pages/WareCabinetPage.vue`:

```vue
<template>
  <q-page class="ware">
    <div class="ware__scroll">
      <header class="ware__header">
        <span class="ware__title">Teaware</span>
        <div class="ware__header-right">
          <button
            :class="['ware__link', { 'ware__link--on': filters.activeCount > 0 }]"
            data-testid="ware-filters"
            @click="filtering = true"
          >
            {{ filters.activeCount > 0 ? `Filters · ${filters.activeCount}` : "Filters" }}
          </button>
          <span class="ware__count" data-testid="ware-count">{{ countLabel }}</span>
        </div>
      </header>

      <div v-if="teaware.error" class="ware__error" data-testid="ware-error">
        {{ teaware.error }}
      </div>
      <p
        v-else-if="!teaware.loading && teaware.items.length === 0"
        class="ware__empty"
        data-testid="ware-empty"
      >
        No teaware yet. Add your first gaiwan or pot.
      </p>
      <p v-else-if="sections.length === 0" class="ware__empty" data-testid="ware-no-match">
        Nothing matches these filters.
        <button class="ware__clear" data-testid="ware-clear-filters" @click="filters.clear()">
          Clear filters
        </button>
      </p>

      <WareSection
        v-for="section in sections"
        :key="section.type"
        :section="section"
        @open="openItem"
      />
    </div>

    <WareFilters
      v-if="filtering"
      :items="teaware.items"
      :match-count="visible.length"
      @close="filtering = false"
    />

    <button
      class="ware__add"
      data-testid="ware-add"
      aria-label="Add teaware"
      @click="router.push({ name: 'tea-ware-new' })"
    >
      +
    </button>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import WareSection from "../components/WareSection.vue";
import WareFilters from "../components/WareFilters.vue";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useTeawareFiltersStore } from "../stores/useTeawareFiltersStore";
import { groupByType, matchesWareFilters } from "../ware";

const router = useRouter();
const teaware = useTeawareStore();
const filters = useTeawareFiltersStore();
const filtering = ref(false);

const visible = computed(() =>
  teaware.items.filter((item) => matchesWareFilters(item, filters.state)),
);
const sections = computed(() => groupByType(visible.value));
// Counted against what the shelf would show unfiltered, so hidden retired pieces
// don't read as "3 of 4" by default.
const countLabel = computed(() => {
  const base = filters.showRetired
    ? teaware.items.length
    : teaware.items.filter((item) => item.retired_at === null).length;
  const noun = base === 1 ? "piece" : "pieces";
  return visible.value.length === base
    ? `${base} ${noun}`
    : `${visible.value.length} of ${base} ${noun}`;
});

function openItem(wareId: string): void {
  void router.push({ name: "tea-ware-detail", params: { wareId } });
}

onMounted(() => {
  void teaware.fetchItems();
});
</script>

<style scoped lang="scss">
.ware {
  background: #17120e;
  position: relative;
  min-height: 100%;
}
.ware__scroll {
  padding-bottom: 80px;
}
.ware__header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: linear-gradient(#17120e 76%, rgba(23, 18, 14, 0));
  padding: 20px 18px 16px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.ware__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
}
.ware__header-right {
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.ware__link {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-family: inherit;
  font-size: 13px;
  padding: 0;
  cursor: pointer;
}
.ware__link--on {
  color: #efe7da;
}
.ware__count {
  color: #6b5f52;
  font-size: 13px;
}
.ware__empty {
  color: #8b7a63;
  font-size: 14.5px;
  padding: 0 18px;
}
.ware__error {
  background: #1e1712;
  border-left: 2px solid #e4d9c6;
  color: #efe7da;
  margin: 0 18px;
  padding: 12px 14px;
}
.ware__clear {
  display: block;
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 14px;
  padding: 10px 0 0;
  cursor: pointer;
}
.ware__add {
  position: fixed;
  z-index: 6;
  right: 18px;
  bottom: 18px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 0;
  background: #e4d9c6;
  color: #17120e;
  font-size: 28px;
  cursor: pointer;
}
</style>
```

Create minimal placeholders so the routes resolve (Task 7 replaces both files entirely):

`frontend/src/apps/tea/pages/NewWarePage.vue` and `frontend/src/apps/tea/pages/WareDetailPage.vue`, each:

```vue
<template>
  <q-page class="tea-page"></q-page>
</template>
```

- [ ] **Step 6: Add the routes and the home-screen entry**

In `frontend/src/router/routes.ts`, insert **before** the `tea/:teaId` route:

```ts
      {
        path: "tea/ware",
        name: "tea-ware",
        component: () => import("@/apps/tea/pages/WareCabinetPage.vue"),
        meta: { title: "Teaware", requiresAuth: true, backTo: "/tea" },
      },
      {
        path: "tea/ware/new",
        name: "tea-ware-new",
        component: () => import("@/apps/tea/pages/NewWarePage.vue"),
        meta: { title: "New teaware", requiresAuth: true, backTo: "/tea/ware" },
      },
      {
        path: "tea/ware/:wareId",
        name: "tea-ware-detail",
        component: () => import("@/apps/tea/pages/WareDetailPage.vue"),
        meta: { title: "Teaware", requiresAuth: true, backTo: "/tea/ware" },
      },
```

(and add a one-line comment above the first: `// Before tea/:teaId, which would otherwise read "ware" as a tea id.`).

In `frontend/src/apps/tea/pages/TeaHomePage.vue`, insert into `SECTIONS` after the Cabinet entry:

```ts
  {
    name: "Teaware",
    nameZh: "茶具",
    blurb: "Your gaiwans, pots and cups, and what's been brewed in each.",
    route: "tea-ware",
  },
```

- [ ] **Step 7: Run the tests, typecheck and lint**

Run: `cd frontend && npx vitest run src/apps/tea src/router && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(tea): the teaware shelf, its routes and a home-screen entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Add and view a piece — form, new page, detail page

**Files:**
- Modify: `frontend/src/apps/tea/components/CataloguePicker.vue` (`bare` prop)
- Create: `frontend/src/apps/tea/components/WareForm.vue`, `components/WareForm.spec.ts`
- Replace: `frontend/src/apps/tea/pages/NewWarePage.vue`, `pages/WareDetailPage.vue`
- Create: `pages/NewWarePage.spec.ts`, `pages/WareDetailPage.spec.ts`
- Modify: `frontend/src/apps/tea/components/TeaSessionsList.vue` (`teaNames` prop) (+ spec)

**Interfaces:**
- Consumes: Task 5 store/helpers (`blankWare`, `toWareWrite`, `canSaveWare`, `wareSummary`, `WARE_TYPE_LABELS`, `MATERIAL_LABELS`, `WARE_TYPE_ORDER`), `useTeaCatalogueStore`, `useTeaCabinetStore`, `useTeaHouseholdStore`, `pathOf` from `catalogue.ts`, `imageSrc`.
- Produces: `<WareForm v-model :nodes>`; `CataloguePicker` prop `bare?: boolean`; `TeaSessionsList` prop `teaNames?: Record<string, string>` with test id `sessions-tea-{id}`; detail test ids `ware-title`, `ware-summary`, `ware-facts`, `ware-fact-{key}`, `ware-usage`, `ware-edit`, `ware-edit-done`, `ware-save`, `ware-retire`, `ware-remove`, `ware-remove-confirm`, `ware-remove-yes`, `ware-remove-no`, `ware-missing`, `ware-error`, `ware-upload-photo`, `ware-remove-photo`, `ware-photo-input`; new-page ids `ware-new-save`, `ware-new-error`; form ids `ware-field-name|type|material|volume|porous|maker|origin|acquired|price|notes`, `ware-clear-dedication`.

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/apps/tea/components/WareForm.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import WareForm from "./WareForm.vue";
import { blankWare } from "../ware";
import type { CatalogueNode, TeawareWrite } from "../types";

const NODES: CatalogueNode[] = [
  { id: "oolong", parent_id: null, name: "Oolong", name_zh: "烏龍", source: "seed", default_origin: "" },
];

function form(value: Partial<TeawareWrite> = {}) {
  return mount(WareForm, { props: { modelValue: { ...blankWare(), ...value }, nodes: NODES } });
}

function lastEmit(wrapper: ReturnType<typeof form>): TeawareWrite {
  const events = wrapper.emitted("update:modelValue") ?? [];
  return events[events.length - 1][0] as TeawareWrite;
}

describe("WareForm", () => {
  it("edits the name and turns an empty material back into not-recorded", async () => {
    const wrapper = form({ material: "clay" });
    await wrapper.get("[data-testid=ware-field-name]").setValue("Zhuni");
    expect(lastEmit(wrapper).name).toBe("Zhuni");
    await wrapper.get("[data-testid=ware-field-material]").setValue("");
    expect(lastEmit(wrapper).material).toBeNull();
  });

  it("keeps a volume only when it is a whole number above zero", async () => {
    const wrapper = form();
    await wrapper.get("[data-testid=ware-field-volume]").setValue("110");
    expect(lastEmit(wrapper).volume_ml).toBe(110);
    await wrapper.get("[data-testid=ware-field-volume]").setValue("0");
    expect(lastEmit(wrapper).volume_ml).toBeNull();
  });

  it("offers a dedication only for a pot that seasons", () => {
    expect(form().find("[data-testid=picker]").exists()).toBe(false);
    expect(form({ porous: true }).find("[data-testid=picker]").exists()).toBe(true);
    expect(form({ porous: true }).find("[data-testid=picker-prefill]").exists()).toBe(false);
  });

  it("unchecking porous clears the dedication", async () => {
    const wrapper = form({ porous: true, dedicated_node_id: "oolong" });
    await wrapper.get("[data-testid=ware-field-porous]").setValue(false);
    expect(lastEmit(wrapper)).toMatchObject({ porous: false, dedicated_node_id: null });
  });
});
```

Create `frontend/src/apps/tea/pages/WareDetailPage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: putMock, del: delMock, upload: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { wareId: "w-1" } }),
  useRouter: () => ({ push }),
  onBeforeRouteLeave: vi.fn(),
}));

import WareDetailPage from "./WareDetailPage.vue";
import type { Cabinet, TeaSession, Teaware } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };
const SOLO: Cabinet = { id: null, owner: "jakub", members: ["jakub"], is_owner: true };

const POT: Teaware = {
  id: "w-1",
  name: "Zhuni shuiping",
  type: "pot",
  material: "clay",
  volume_ml: 110,
  porous: true,
  dedicated_node_id: "oolong",
  maker: "Wang",
  origin: "Yixing",
  acquired_date: null,
  price_paid: null,
  notes: "",
  image_url: null,
  retired_at: null,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

const SESSION: TeaSession = {
  id: "s-1",
  brewed_by: "jakub",
  tea_id: "t-1",
  status: "finalised",
  started_at: "2026-09-27T18:00:00Z",
  updated_at: "2026-09-27T18:30:00Z",
  finished_at: "2026-09-27T18:30:00Z",
  leaf_grams: 7,
  water_temp_c: 95,
  rating: 4,
  curve_source: "generic",
  curve_source_label: "",
  infusions: [],
  teaware_id: "w-1",
  vessel_volume_ml: 110,
};

async function page(item: Teaware | null = POT) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teaware") return Promise.resolve(item ? [item] : []);
    if (path === "/tea/teaware/w-1/usage")
      return Promise.resolve({ sessions: [SESSION], total: 1, off_dedication: 1 });
    if (path === "/tea/cabinet") return Promise.resolve(SOLO);
    if (path === "/tea/teas")
      return Promise.resolve([{ id: "t-1", name: "Longjing" }]);
    if (path === "/tea/catalogue")
      return Promise.resolve([
        { id: "oolong", parent_id: null, name: "Oolong", name_zh: "", source: "seed", default_origin: "" },
      ]);
    return Promise.resolve([]);
  });
  const wrapper = mount(WareDetailPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("WareDetailPage", () => {
  it("shows the piece, its facts and its dedication", async () => {
    const wrapper = await page();
    expect(wrapper.get("[data-testid=ware-title]").text()).toBe("Zhuni shuiping");
    expect(wrapper.get("[data-testid=ware-summary]").text()).toContain("110 ml · clay");
    expect(wrapper.get("[data-testid=ware-fact-seasons]").text()).toContain("Oolong");
    expect(wrapper.get("[data-testid=ware-fact-maker]").text()).toBe("Wang");
  });

  it("counts its sessions and the ones off its dedication, naming each tea", async () => {
    const wrapper = await page();
    expect(wrapper.get("[data-testid=ware-usage]").text()).toContain(
      "1 session · 1 off-dedication",
    );
    expect(wrapper.get("[data-testid=sessions-tea-s-1]").text()).toBe("Longjing");
  });

  it("retires and brings back", async () => {
    putMock.mockResolvedValue({ ...POT, retired_at: "2026-09-27T12:00:00Z" });
    const wrapper = await page();
    await wrapper.get("[data-testid=ware-retire]").trigger("click");
    await flushPromises();
    expect(putMock).toHaveBeenCalledWith(
      "/tea/teaware/w-1",
      expect.objectContaining({ retired: true, name: "Zhuni shuiping" }),
    );
    expect(wrapper.get("[data-testid=ware-retire]").text()).toBe("Bring back");
  });

  it("asks before deleting, saying how many sessions it is cleared from", async () => {
    delMock.mockResolvedValue(undefined);
    const wrapper = await page();
    await wrapper.get("[data-testid=ware-edit]").trigger("click");
    await wrapper.get("[data-testid=ware-remove]").trigger("click");
    expect(wrapper.get("[data-testid=ware-remove-confirm]").text()).toContain("1 session");
    await wrapper.get("[data-testid=ware-remove-yes]").trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/tea/teaware/w-1");
    expect(push).toHaveBeenCalledWith({ name: "tea-ware" });
  });

  it("saves edits", async () => {
    putMock.mockResolvedValue({ ...POT, name: "Renamed" });
    const wrapper = await page();
    await wrapper.get("[data-testid=ware-edit]").trigger("click");
    await wrapper.get("[data-testid=ware-field-name]").setValue("Renamed");
    await wrapper.get("[data-testid=ware-save]").trigger("click");
    await flushPromises();
    expect(putMock).toHaveBeenCalledWith(
      "/tea/teaware/w-1",
      expect.objectContaining({ name: "Renamed" }),
    );
    expect(wrapper.find("[data-testid=ware-edit]").exists()).toBe(true);
  });

  it("says so when the piece is not in the cabinet", async () => {
    expect((await page(null)).find("[data-testid=ware-missing]").exists()).toBe(true);
  });
});
```

Create `frontend/src/apps/tea/pages/NewWarePage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }), onBeforeRouteLeave: vi.fn() }));

import NewWarePage from "./NewWarePage.vue";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  getMock.mockResolvedValue([]);
});

describe("NewWarePage", () => {
  it("needs a name before it saves, then opens the new piece", async () => {
    postMock.mockResolvedValue({ id: "w-9" });
    const wrapper = mount(NewWarePage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.get("[data-testid=ware-new-save]").attributes("disabled")).toBeDefined();

    await wrapper.get("[data-testid=ware-field-name]").setValue("Gaiwan");
    await wrapper.get("[data-testid=ware-new-save]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith(
      "/tea/teaware",
      expect.objectContaining({ name: "Gaiwan", type: "gaiwan" }),
    );
    expect(push).toHaveBeenCalledWith({ name: "tea-ware-detail", params: { wareId: "w-9" } });
  });

  it("shows a refused save and keeps the typing", async () => {
    postMock.mockRejectedValue(Object.assign(new Error("422"), { detail: "Teaware needs a name" }));
    const wrapper = mount(NewWarePage, { global: { stubs: STUBS } });
    await wrapper.get("[data-testid=ware-field-name]").setValue("x");
    await wrapper.get("[data-testid=ware-new-save]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=ware-new-error]").text()).toBe("Teaware needs a name");
    expect(
      (wrapper.get("[data-testid=ware-field-name]").element as HTMLInputElement).value,
    ).toBe("x");
  });
});
```

Append to `frontend/src/apps/tea/components/TeaSessionsList.spec.ts` inside its `describe`:

```ts
  it("names each session's tea when given tea names", () => {
    const wrapper = mount(TeaSessionsList, {
      props: { sessions: [session("s-1"), session("s-2", { tea_id: "t-gone" })], teaNames: { "t-1": "Longjing" } },
    });
    expect(wrapper.get("[data-testid=sessions-tea-s-1]").text()).toBe("Longjing");
    expect(wrapper.get("[data-testid=sessions-tea-s-2]").text()).toBe("a removed tea");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/components/WareForm.spec.ts src/apps/tea/pages/NewWarePage.spec.ts src/apps/tea/pages/WareDetailPage.spec.ts src/apps/tea/components/TeaSessionsList.spec.ts`
Expected: FAIL — `WareForm.vue` missing; placeholder pages render nothing; no `sessions-tea-*`.

- [ ] **Step 3: Give CataloguePicker a bare mode**

In `frontend/src/apps/tea/components/CataloguePicker.vue`: props become `defineProps<{ nodes: CatalogueNode[]; modelValue: string | null; bare?: boolean }>()` with a comment above: `// bare: pick a node only — no "+ Add one" or origin note (the teaware dedication picker).`; change the add-chip `v-if="tier.parentId"` to `v-if="tier.parentId && !bare"` and the prefill paragraph `v-if="prefill"` to `v-if="prefill && !bare"`.

- [ ] **Step 4: Write the form**

Create `frontend/src/apps/tea/components/WareForm.vue`:

```vue
<template>
  <div class="form">
    <label class="form__label" for="ware-name">Name</label>
    <input
      id="ware-name"
      class="form__field"
      data-testid="ware-field-name"
      :value="modelValue.name"
      @input="patch({ name: asText($event) })"
    />

    <label class="form__label" for="ware-type">Type</label>
    <select
      id="ware-type"
      class="form__field"
      data-testid="ware-field-type"
      :value="modelValue.type"
      @change="patch({ type: asType($event) })"
    >
      <option v-for="type in WARE_TYPE_ORDER" :key="type" :value="type">
        {{ WARE_TYPE_LABELS[type].label }}
      </option>
    </select>

    <label class="form__label" for="ware-material">Material</label>
    <select
      id="ware-material"
      class="form__field"
      data-testid="ware-field-material"
      :value="modelValue.material ?? ''"
      @change="patch({ material: asMaterial($event) })"
    >
      <option value="">Not recorded</option>
      <option v-for="material in MATERIALS" :key="material" :value="material">
        {{ MATERIAL_LABELS[material] }}
      </option>
    </select>

    <label class="form__label" for="ware-volume">Volume (ml)</label>
    <input
      id="ware-volume"
      class="form__field"
      data-testid="ware-field-volume"
      inputmode="numeric"
      :value="modelValue.volume_ml ?? ''"
      @input="patch({ volume_ml: asVolume($event) })"
    />

    <label class="form__check">
      <input
        type="checkbox"
        data-testid="ware-field-porous"
        :checked="modelValue.porous"
        @change="onPorous"
      />
      Seasons — porous clay that takes on the tea
    </label>

    <template v-if="modelValue.porous">
      <p class="form__label">Dedicated to</p>
      <CataloguePicker
        bare
        :nodes="nodes"
        :model-value="modelValue.dedicated_node_id"
        @update:model-value="patch({ dedicated_node_id: $event })"
      />
      <button
        v-if="modelValue.dedicated_node_id"
        type="button"
        class="form__clear"
        data-testid="ware-clear-dedication"
        @click="patch({ dedicated_node_id: null })"
      >
        No dedication
      </button>
    </template>

    <p class="form__label">Where it's from</p>
    <input
      class="form__field"
      data-testid="ware-field-maker"
      placeholder="Maker or workshop"
      :value="modelValue.maker"
      @input="patch({ maker: asText($event) })"
    />
    <input
      class="form__field"
      data-testid="ware-field-origin"
      placeholder="Origin — Yixing, Jingdezhen, Tokoname…"
      :value="modelValue.origin"
      @input="patch({ origin: asText($event) })"
    />

    <p class="form__label">Buying it</p>
    <input
      class="form__field"
      type="date"
      data-testid="ware-field-acquired"
      aria-label="Acquired on"
      :value="modelValue.acquired_date ?? ''"
      @input="patch({ acquired_date: asText($event) || null })"
    />
    <input
      class="form__field"
      data-testid="ware-field-price"
      placeholder="Price paid"
      inputmode="decimal"
      :value="modelValue.price_paid ?? ''"
      @input="patch({ price_paid: asPrice($event) })"
    />

    <label class="form__label" for="ware-notes">Notes</label>
    <textarea
      id="ware-notes"
      class="form__field"
      rows="4"
      data-testid="ware-field-notes"
      :value="modelValue.notes"
      @input="patch({ notes: asText($event) })"
    />
  </div>
</template>

<script setup lang="ts">
import CataloguePicker from "./CataloguePicker.vue";
import { MATERIAL_LABELS, WARE_TYPE_LABELS, WARE_TYPE_ORDER } from "../ware";
import type { CatalogueNode, TeawareMaterial, TeawareType, TeawareWrite } from "../types";

const props = defineProps<{ modelValue: TeawareWrite; nodes: CatalogueNode[] }>();
const emit = defineEmits<{ "update:modelValue": [value: TeawareWrite] }>();

const MATERIALS = Object.keys(MATERIAL_LABELS) as TeawareMaterial[];

function patch(change: Partial<TeawareWrite>): void {
  emit("update:modelValue", { ...props.modelValue, ...change });
}

function asText(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function asType(event: Event): TeawareType {
  return (event.target as HTMLSelectElement).value as TeawareType;
}

function asMaterial(event: Event): TeawareMaterial | null {
  const raw = (event.target as HTMLSelectElement).value;
  return raw === "" ? null : (raw as TeawareMaterial);
}

function asVolume(event: Event): number | null {
  const parsed = Number(asText(event).trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function asPrice(event: Event): number | null {
  const raw = asText(event).trim();
  const parsed = Number(raw);
  return raw !== "" && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// A pot that no longer seasons can't keep a dedication — the server would refuse the save.
function onPorous(event: Event): void {
  const porous = (event.target as HTMLInputElement).checked;
  patch({ porous, dedicated_node_id: porous ? props.modelValue.dedicated_node_id : null });
}
</script>

<style scoped lang="scss">
.form__label {
  display: block;
  color: #9a8b78;
  font-size: 12px;
  letter-spacing: 0.05em;
  padding: 18px 0 6px;
  margin: 0;
}
.form__field {
  width: 100%;
  background: #241c16;
  border: 1px solid #3b3026;
  border-radius: 3px;
  padding: 11px 12px;
  color: #efe7da;
  font-size: 15px;
  font-family: inherit;
  margin-bottom: 8px;
}
.form__check {
  display: flex;
  align-items: center;
  gap: 9px;
  color: #e4d9c6;
  font-size: 14px;
  padding: 16px 0 4px;
}
.form__clear {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-family: inherit;
  font-size: 13px;
  padding: 4px 0;
  cursor: pointer;
}
</style>
```

- [ ] **Step 5: Write the new page**

Replace `frontend/src/apps/tea/pages/NewWarePage.vue` with:

```vue
<template>
  <q-page class="tea-page">
    <header class="tea-page__bar">
      <button
        class="tea-page__back"
        data-testid="page-back"
        @click="router.push({ name: 'tea-ware' })"
      >
        ← Teaware
      </button>
      <button
        class="tea-page__save"
        data-testid="ware-new-save"
        :disabled="!canSave || teaware.saving"
        @click="save"
      >
        Save
      </button>
    </header>

    <h1 class="tea-page__title">New teaware</h1>

    <p v-if="teaware.error" class="tea-page__error" data-testid="ware-new-error">
      {{ teaware.error }}
    </p>

    <div class="tea-page__body">
      <WareForm v-model="draft" :nodes="catalogue.nodes" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import WareForm from "../components/WareForm.vue";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { blankWare, canSaveWare } from "../ware";
import type { TeawareWrite } from "../types";

const router = useRouter();
const teaware = useTeawareStore();
const catalogue = useTeaCatalogueStore();

const draft = ref<TeawareWrite>(blankWare());
const saved = ref(false);
const canSave = computed(() => canSaveWare(draft.value));
const dirty = computed(
  () => !saved.value && JSON.stringify(draft.value) !== JSON.stringify(blankWare()),
);

async function save(): Promise<void> {
  const created = await teaware.createItem(draft.value);
  if (!created) return; // The error is on screen; the typing is kept.
  saved.value = true;
  void router.push({ name: "tea-ware-detail", params: { wareId: created.id } });
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("Leave without saving? This piece won't be added.");
});

onMounted(() => {
  teaware.error = null;
  void catalogue.fetchNodes();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";
</style>
```

- [ ] **Step 6: Write the detail page**

Replace `frontend/src/apps/tea/pages/WareDetailPage.vue` with:

```vue
<template>
  <q-page class="tea-page">
    <header class="tea-page__bar">
      <button
        class="tea-page__back"
        data-testid="page-back"
        @click="router.push({ name: 'tea-ware' })"
      >
        ← Teaware
      </button>
      <template v-if="item">
        <button v-if="!editMode" class="ware-page__mode" data-testid="ware-edit" @click="editMode = true">
          ✎ Edit
        </button>
        <button v-else class="ware-page__mode" data-testid="ware-edit-done" @click="leaveEditMode">
          Done
        </button>
      </template>
    </header>

    <p v-if="!item && !teaware.loading" class="ware-page__missing" data-testid="ware-missing">
      That piece is not in your cabinet. It may have been removed.
    </p>

    <template v-if="item">
      <img v-if="photoSrc" class="ware-page__photo" :src="photoSrc" alt="" />
      <h1 class="tea-page__title" data-testid="ware-title">{{ item.name }}</h1>
      <p class="ware-page__summary" data-testid="ware-summary">
        {{ typeLabel }}<template v-if="summary"> · {{ summary }}</template
        ><template v-if="item.retired_at"> · retired</template>
      </p>

      <p v-if="teaware.error" class="tea-page__error" data-testid="ware-error">
        {{ teaware.error }}
      </p>

      <template v-if="!editMode">
        <dl v-if="facts.length" class="ware-page__facts" data-testid="ware-facts">
          <template v-for="fact in facts" :key="fact.key">
            <dt>{{ fact.label }}</dt>
            <dd :data-testid="`ware-fact-${fact.key}`">{{ fact.value }}</dd>
          </template>
        </dl>
        <p v-if="item.notes" class="ware-page__notes">{{ item.notes }}</p>

        <section class="ware-page__section" data-testid="ware-usage">
          <h2 class="ware-page__heading">
            Sessions<template v-if="usage"> · {{ usageLabel }}</template>
          </h2>
          <TeaSessionsList
            :sessions="usage?.sessions ?? []"
            :tea-names="teaNames"
            :shared="household.shared"
            :me="auth.username"
          />
        </section>

        <button
          class="ware-page__retire"
          data-testid="ware-retire"
          :disabled="teaware.saving"
          @click="toggleRetired"
        >
          {{ item.retired_at ? "Bring back" : "Retire" }}
        </button>
      </template>

      <template v-else>
        <div class="tea-page__body">
          <button
            class="ware-page__photo-action"
            data-testid="ware-upload-photo"
            :disabled="teaware.saving"
            @click="photoInput?.click()"
          >
            {{ item.image_url ? "Replace photo" : "Add a photo" }}
          </button>
          <button
            v-if="item.image_url"
            class="ware-page__photo-action"
            data-testid="ware-remove-photo"
            :disabled="teaware.saving"
            @click="teaware.removeImage(item.id)"
          >
            Remove photo
          </button>
          <input
            ref="photoInput"
            type="file"
            accept="image/*"
            class="ware-page__photo-input"
            data-testid="ware-photo-input"
            @change="onPhotoChosen"
          />
          <WareForm v-if="draft" v-model="draft" :nodes="catalogue.nodes" />
          <button
            class="ware-page__apply"
            data-testid="ware-save"
            :disabled="!dirty || !canSave || teaware.saving"
            @click="save"
          >
            Save changes
          </button>
        </div>
        <button class="ware-page__remove" data-testid="ware-remove" @click="confirming = true">
          Delete from cabinet
        </button>
      </template>

      <div v-if="confirming" class="ware-page__sheet" data-testid="ware-remove-confirm">
        <p class="ware-page__sheet-title">
          Delete {{ item.name }}?
          <template v-if="usage && usage.total > 0">
            It is cleared from {{ usage.total }} {{ usage.total === 1 ? "session" : "sessions" }};
            they keep their record.
          </template>
        </p>
        <button class="ware-page__sheet-yes" data-testid="ware-remove-yes" @click="remove">
          Delete
        </button>
        <button class="ware-page__sheet-no" data-testid="ware-remove-no" @click="confirming = false">
          Keep it
        </button>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import WareForm from "../components/WareForm.vue";
import TeaSessionsList from "../components/TeaSessionsList.vue";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { imageSrc } from "../shelf";
import { pathOf } from "../catalogue";
import { MATERIAL_LABELS, WARE_TYPE_LABELS, canSaveWare, toWareWrite, wareSummary } from "../ware";
import type { TeawareUsage, TeawareWrite } from "../types";

const route = useRoute();
const router = useRouter();
const teaware = useTeawareStore();
const catalogue = useTeaCatalogueStore();
const cabinet = useTeaCabinetStore();
const household = useTeaHouseholdStore();
const auth = useAuthStore();

const wareId = computed(() => String(route.params.wareId));
const item = computed(() => teaware.items.find((w) => w.id === wareId.value) ?? null);
const usage = ref<TeawareUsage | null>(null);

const editMode = ref(false);
const confirming = ref(false);
const draft = ref<TeawareWrite | null>(null);
watch(
  item,
  (value) => {
    if (value && draft.value === null) draft.value = toWareWrite(value);
  },
  { immediate: true },
);
const dirty = computed(
  () =>
    item.value !== null &&
    draft.value !== null &&
    JSON.stringify(draft.value) !== JSON.stringify(toWareWrite(item.value)),
);
const canSave = computed(() => draft.value !== null && canSaveWare(draft.value));

const typeLabel = computed(() => (item.value ? WARE_TYPE_LABELS[item.value.type].label : ""));
const summary = computed(() => (item.value ? wareSummary(item.value) : ""));
const photoSrc = computed(() => imageSrc(item.value?.image_url ?? null, auth.token));
const teaNames = computed(() => Object.fromEntries(cabinet.teas.map((t) => [t.id, t.name])));

const usageLabel = computed(() => {
  if (!usage.value) return "";
  const { total, off_dedication: off } = usage.value;
  const base = `${total} ${total === 1 ? "session" : "sessions"}`;
  return off > 0 ? `${base} · ${off} off-dedication` : base;
});

interface Fact {
  key: string;
  label: string;
  value: string;
}

const facts = computed<Fact[]>(() => {
  const w = item.value;
  if (!w) return [];
  const dedication = w.dedicated_node_id
    ? pathOf(catalogue.nodes, w.dedicated_node_id)
        .map((node) => node.name)
        .join(" › ")
    : "";
  const rows: [string, string, string][] = [
    ["material", "Material", w.material ? MATERIAL_LABELS[w.material] : ""],
    ["volume", "Volume", w.volume_ml !== null ? `${w.volume_ml} ml` : ""],
    ["seasons", "Seasons", w.porous ? (dedication ? `Yes — dedicated to ${dedication}` : "Yes") : ""],
    ["maker", "Maker", w.maker],
    ["origin", "Origin", w.origin],
    ["acquired", "Acquired", w.acquired_date ?? ""],
    ["price", "Price", w.price_paid !== null ? `${w.price_paid}` : ""],
  ];
  return rows.filter(([, , value]) => value !== "").map(([key, label, value]) => ({ key, label, value }));
});

const photoInput = ref<HTMLInputElement | null>(null);

async function onPhotoChosen(event: Event): Promise<void> {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (photoInput.value) photoInput.value.value = "";
  if (file && item.value) await teaware.uploadImage(item.value.id, file);
}

async function toggleRetired(): Promise<void> {
  if (!item.value) return;
  const updated = await teaware.replaceItem(item.value.id, {
    ...toWareWrite(item.value),
    retired: item.value.retired_at === null,
  });
  if (updated) draft.value = toWareWrite(updated);
}

async function save(): Promise<void> {
  if (!draft.value) return;
  const updated = await teaware.replaceItem(wareId.value, draft.value);
  if (updated) {
    draft.value = toWareWrite(updated);
    editMode.value = false;
  }
}

function leaveEditMode(): void {
  if (dirty.value && !window.confirm("Discard your unsaved changes to this piece?")) return;
  if (item.value) draft.value = toWareWrite(item.value);
  editMode.value = false;
}

async function remove(): Promise<void> {
  confirming.value = false;
  if (await teaware.deleteItem(wareId.value)) void router.push({ name: "tea-ware" });
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("Leave without saving? Your changes to this piece will be lost.");
});

onMounted(async () => {
  teaware.error = null;
  void catalogue.fetchNodes();
  void household.fetchCabinet();
  if (cabinet.teas.length === 0) void cabinet.fetchTeas();
  if (teaware.items.length === 0) await teaware.fetchItems();
  usage.value = await teaware.fetchUsage(wareId.value);
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.ware-page__mode {
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
}
.ware-page__missing {
  color: #8b7a63;
  padding: 0 18px;
}
.ware-page__photo {
  display: block;
  width: calc(100% - 36px);
  max-height: 260px;
  object-fit: cover;
  border-radius: 6px;
  margin: 6px 18px 4px;
}
.ware-page__summary {
  color: #8b7a63;
  font-size: 14px;
  margin: 4px 18px 0;
}
.ware-page__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 18px 18px 0;
  font-size: 14px;
  dt {
    color: #8b7a63;
  }
  dd {
    color: #efe7da;
    margin: 0;
  }
}
.ware-page__notes {
  color: #e4d9c6;
  font-size: 14.5px;
  line-height: 1.6;
  margin: 16px 18px 0;
  white-space: pre-wrap;
}
.ware-page__section {
  margin: 24px 18px 0;
}
.ware-page__heading {
  color: #9a8b78;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 0.05em;
  margin: 0 0 8px;
}
.ware-page__retire,
.ware-page__remove {
  display: block;
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  margin: 28px 18px 0;
  cursor: pointer;
}
.ware-page__photo-action {
  background: transparent;
  border: 1px solid #3b3026;
  border-radius: 3px;
  color: #e4d9c6;
  font-family: inherit;
  font-size: 13px;
  padding: 7px 12px;
  margin: 10px 8px 0 0;
  cursor: pointer;
}
.ware-page__photo-input {
  display: none;
}
.ware-page__apply {
  display: block;
  width: 100%;
  margin-top: 18px;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-family: inherit;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
  &:disabled {
    background: #3b3026;
    color: #6b5f52;
    cursor: default;
  }
}
.ware-page__sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 20;
  background: #1e1712;
  border-top: 1px solid #33291f;
  border-radius: 14px 14px 0 0;
  padding: 20px 18px 24px;
}
.ware-page__sheet-title {
  color: #efe7da;
  font-size: 15px;
  margin: 0 0 14px;
}
.ware-page__sheet-yes,
.ware-page__sheet-no {
  display: block;
  width: 100%;
  border: 0;
  font-family: inherit;
  font-size: 15px;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.ware-page__sheet-yes {
  background: #e4d9c6;
  color: #17120e;
  font-weight: 600;
}
.ware-page__sheet-no {
  background: transparent;
  color: #6b5f52;
  margin-top: 8px;
}
</style>
```

- [ ] **Step 7: Let session rows name their tea**

In `frontend/src/apps/tea/components/TeaSessionsList.vue`, change the props to `defineProps<{ sessions: TeaSession[]; shared?: boolean; me?: string | null; teaNames?: Record<string, string> }>()` (keep the existing comment), and add as the first child of each row (before the date span):

```vue
      <span v-if="teaNames" class="sessions__tea" :data-testid="`sessions-tea-${session.id}`">{{
        teaNames[session.tea_id] ?? "a removed tea"
      }}</span>
```

with style:

```scss
.sessions__tea {
  color: #efe7da;
}
```

- [ ] **Step 8: Run the tests, typecheck and lint**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS (the existing `CataloguePicker` and `TeaSessionsList` tests still pass — `bare` and `teaNames` default off).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): add, view, retire and delete a piece of teaware

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: The vessel on the timer

**Files:**
- Modify: `frontend/src/apps/tea/stores/useTeaTimerStore.ts` (+ spec)
- Create: `frontend/src/apps/tea/components/PickVesselSheet.vue`, `components/PickVesselSheet.spec.ts`
- Modify: `frontend/src/apps/tea/pages/TimerPage.vue` (+ spec)

**Interfaces:**
- Consumes: `useTeawareStore().lastUsed`, `.items`, `.fetchItems`; `isBrewingVessel`, `wareSummary`.
- Produces: `LiveVessel { id: string; name: string; volume_ml: number | null }`; `LiveSession.teaware?: LiveVessel | null`; timer store `setVessel(item: Teaware | null): Promise<void>`; `resume(session, tea, vessel: Teaware | null = null)`; snapshot carries `teaware_id`; test ids `timer-vessel`, `vessel-sheet`, `vessel-{id}`, `vessel-none`, `vessel-empty`, `vessel-close`.

- [ ] **Step 1: Make existing timer mocks answer the new calls**

The timer will now call `GET /tea/teaware/last-used…` (from `attachTea`) and the page will call `GET /tea/teaware`. Existing spec mocks that answer every GET with a curve or with `[]` would hand the timer a bogus vessel. Fix the fixtures (never the store):

- In `frontend/src/apps/tea/stores/useTeaTimerStore.spec.ts`, add below the fixtures:

```ts
function mockCurve(curve: unknown): void {
  getMock.mockImplementation((path: string) =>
    Promise.resolve(path.startsWith("/tea/teaware/last-used") ? null : curve),
  );
}
```

  and replace every `getMock.mockResolvedValue(X)` in that file with `mockCurve(X)` (leave `mockRejectedValue` calls as they are).
- In `frontend/src/apps/tea/pages/TimerPage.spec.ts`, in `routes()` and in every other `getMock.mockImplementation` in the file, add as the first line of the implementation: `if (path.startsWith("/tea/teaware/last-used")) return Promise.resolve(null);`.

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaTimerStore.spec.ts src/apps/tea/pages/TimerPage.spec.ts`
Expected: PASS (behaviour unchanged so far).

- [ ] **Step 2: Write the failing tests**

Append inside the main `describe` of `useTeaTimerStore.spec.ts` (add `import type { Teaware } from "@/apps/tea/types";` and a `POT` fixture):

```ts
const POT: Teaware = {
  id: "w-1",
  name: "Zhuni",
  type: "pot",
  material: "clay",
  volume_ml: 110,
  porous: false,
  dedicated_node_id: null,
  maker: "",
  origin: "",
  acquired_date: null,
  price_paid: null,
  notes: "",
  image_url: null,
  retired_at: null,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};
```

```ts
  it("prefills the vessel you last used for this tea and sends it", async () => {
    getMock.mockImplementation((path: string) =>
      Promise.resolve(path === "/tea/teaware/last-used?tea_id=t-1" ? POT : ALMANAC),
    );
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    expect(store.live?.teaware).toEqual({ id: "w-1", name: "Zhuni", volume_ml: 110 });
    expect(putMock).toHaveBeenLastCalledWith(
      expect.stringMatching(/^\/tea\/sessions\//),
      expect.objectContaining({ teaware_id: "w-1" }),
    );
  });

  it("keeps a vessel you picked yourself over the prefill", async () => {
    getMock.mockImplementation((path: string) =>
      Promise.resolve(path.startsWith("/tea/teaware/last-used") ? POT : ALMANAC),
    );
    const store = useTeaTimerStore();
    await store.setVessel({ ...POT, id: "w-2", name: "Gaiwan" });
    await store.attachTea(tea());
    expect(store.live?.teaware?.id).toBe("w-2");
  });

  it("drops a vessel the server refuses and keeps syncing", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(Object.assign(httpError(422), { detail: "Zhuni is retired" }));
    await store.setVessel(POT);
    expect(store.live?.teaware).toBeNull();
    expect(store.notice).toContain("Zhuni");
    expect(store.unsynced).toBe(false);
    expect(putMock).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({ teaware_id: null }),
    );
  });

  it("finishing with a refused vessel drops it and keeps the sheet open", async () => {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await store.setVessel(POT);
    putMock.mockRejectedValueOnce(httpError(422));
    expect(await store.finish(4)).toBeNull();
    expect(store.live?.teaware).toBeNull();
    expect(store.live?.tea).not.toBeNull();
    expect(store.error).toBeNull();
  });

  it("hydrates a saved session that has no vessel", () => {
    localStorage.setItem(
      "tea-timer:live",
      JSON.stringify({
        version: 1,
        sessionId: "s-old",
        startedAt: "2026-09-26T17:00:00Z",
        tea: null,
        curve: ALMANAC,
        leafGrams: null,
        waterTempC: null,
        infusions: [{ number: 1, target_seconds: 20, actual_seconds: null }],
        steepStartedAt: null,
        pushed: false,
      }),
    );
    setActivePinia(createPinia());
    const store = useTeaTimerStore();
    expect(store.live?.sessionId).toBe("s-old");
    expect(store.live?.teaware ?? null).toBeNull();
  });
```

(`tea()`, `ALMANAC` and `httpError(status)` already exist in that spec; if the tea fixture is named differently, use the existing one. If `httpError` does not attach `status`, check its definition — it must produce an object with a numeric `status`, which `statusOf` reads.)

Create `frontend/src/apps/tea/components/PickVesselSheet.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PickVesselSheet from "./PickVesselSheet.vue";
import type { Teaware } from "../types";

function ware(id: string, overrides: Partial<Teaware> = {}): Teaware {
  return {
    id,
    name: id,
    type: "pot",
    material: null,
    volume_ml: 110,
    porous: false,
    dedicated_node_id: null,
    maker: "",
    origin: "",
    acquired_date: null,
    price_paid: null,
    notes: "",
    image_url: null,
    retired_at: null,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
    ...overrides,
  };
}

describe("PickVesselSheet", () => {
  it("offers only vessels you can brew in, and picks one", async () => {
    const wrapper = mount(PickVesselSheet, {
      props: {
        items: [
          ware("w-pot"),
          ware("w-cup", { type: "cup" }),
          ware("w-old", { retired_at: "2026-09-27T10:00:00Z" }),
        ],
        currentId: null,
      },
    });
    expect(wrapper.find("[data-testid=vessel-w-cup]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=vessel-w-old]").exists()).toBe(false);
    await wrapper.get("[data-testid=vessel-w-pot]").trigger("click");
    expect(wrapper.emitted("pick")?.[0][0]).toMatchObject({ id: "w-pot" });
  });

  it("can clear the vessel, and says so when there is nothing to pick", async () => {
    const withCurrent = mount(PickVesselSheet, { props: { items: [ware("w-pot")], currentId: "w-pot" } });
    await withCurrent.get("[data-testid=vessel-none]").trigger("click");
    expect(withCurrent.emitted("pick")?.[0][0]).toBeNull();

    const empty = mount(PickVesselSheet, { props: { items: [], currentId: null } });
    expect(empty.find("[data-testid=vessel-empty]").exists()).toBe(true);
  });
});
```

Append to `frontend/src/apps/tea/pages/TimerPage.spec.ts` inside its main `describe`:

```ts
  it("shows the vessel, and picks another from the sheet", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith("/tea/teaware/last-used")) return Promise.resolve(null);
      if (path === "/tea/teaware")
        return Promise.resolve([
          {
            id: "w-1", name: "Zhuni", type: "pot", material: "clay", volume_ml: 110, porous: false,
            dedicated_node_id: null, maker: "", origin: "", acquired_date: null, price_paid: null,
            notes: "", image_url: null, retired_at: null,
            created_at: "2026-09-27T10:00:00Z", updated_at: "2026-09-27T10:00:00Z",
          },
        ]);
      if (path === "/tea/teas") return Promise.resolve([tea(), tea2()]);
      if (path === "/tea/sessions?status=in_progress") return Promise.resolve([]);
      if (path === "/tea/teas/t-1/curve") return Promise.resolve(CURVE);
      return Promise.resolve([]);
    });
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-vessel]").text()).toContain("+ vessel");

    await wrapper.get("[data-testid=timer-vessel]").trigger("click");
    await wrapper.get("[data-testid=vessel-w-1]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-vessel]").text()).toContain("in Zhuni · 110 ml");
    expect(wrapper.find("[data-testid=vessel-sheet]").exists()).toBe(false);
  });
```

(`tea`, `tea2`, `CURVE`, `mount`, `flushPromises` exist in that spec; keep its existing mount options if `mount(TimerPage)` there takes any.)

- [ ] **Step 3: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaTimerStore.spec.ts src/apps/tea/components/PickVesselSheet.spec.ts src/apps/tea/pages/TimerPage.spec.ts`
Expected: FAIL — no `teaware` on the live session, `setVessel` missing, sheet missing.

- [ ] **Step 4: Teach the timer store about vessels**

In `frontend/src/apps/tea/stores/useTeaTimerStore.ts`:
- Imports: add `Teaware` to the type import from `@/apps/tea/types`, and `import { useTeawareStore } from "./useTeawareStore";`.
- Add after `LiveTea`:

```ts
export interface LiveVessel {
  id: string;
  name: string;
  volume_ml: number | null;
}
```

- In `LiveSession`, add after `tea`: `// Optional: sessions saved before vessels existed still hydrate.` and `teaware?: LiveVessel | null;`.
- Add after `liveTea`:

```ts
function liveVessel(item: Teaware): LiveVessel {
  return { id: item.id, name: item.name, volume_ml: item.volume_ml };
}
```

- In `snapshot`, add `teaware_id: session.teaware?.id ?? null,` after `infusions: session.infusions,`.
- In `push`'s `catch`, after the `if (statusOf(e) === 404) {…}` block and before `unsynced.value = true;`, add:

```ts
      if (statusOf(e) === 422 && session.teaware) {
        // The vessel was retired or removed elsewhere: carry on without it rather
        // than retrying a push that can never land.
        notice.value = `${session.teaware.name} can't be brewed in any more — carrying on without a vessel.`;
        session.teaware = null;
        await push();
        return;
      }
```

- In `attachTea`, after `session.infusions = …map(…);` and before `notice.value = null;`, add:

```ts
    // Prefill only an empty slot, so a vessel picked by hand always wins.
    if (!session.teaware) {
      const vessel = await useTeawareStore().lastUsed(tea.id);
      if (live.value !== session) return;
      if (vessel && !session.teaware) session.teaware = liveVessel(vessel);
    }
```

- Add after `setWaterTemp`:

```ts
  async function setVessel(item: Teaware | null): Promise<void> {
    const session = ensureSession();
    session.teaware = item ? liveVessel(item) : null;
    await push();
  }
```

- In `finish`'s `catch`, after the `if (statusOf(e) === 404) {…}` block, add:

```ts
      if (statusOf(e) === 422 && session.teaware) {
        // Don't lose the finish over a vessel that became unusable: drop it and let
        // the person save again.
        notice.value = `${session.teaware.name} can't be brewed in any more — saved without a vessel if you finish again.`;
        session.teaware = null;
        error.value = null;
        return null;
      }
```

- Change `resume(session: TeaSession, tea: Tea): void` to `resume(session: TeaSession, tea: Tea, vessel: Teaware | null = null): void` and add `teaware: vessel ? liveVessel(vessel) : null,` to the `live.value = {…}` literal after `tea: liveTea(tea),`.
- Add `setVessel` to the returned object.

- [ ] **Step 5: Write the vessel sheet**

Create `frontend/src/apps/tea/components/PickVesselSheet.vue`:

```vue
<template>
  <div class="sheet" data-testid="vessel-sheet">
    <p class="sheet__title">Brewing in</p>
    <p v-if="vessels.length === 0" class="vessel__empty" data-testid="vessel-empty">
      No gaiwans or pots yet — add them under Teaware.
    </p>
    <ul v-else class="vessel__list">
      <li v-for="item in vessels" :key="item.id">
        <button
          :class="['vessel__row', { 'vessel__row--current': item.id === currentId }]"
          :data-testid="`vessel-${item.id}`"
          @click="emit('pick', item)"
        >
          <span class="vessel__name">{{ item.name }}</span>
          <span class="vessel__meta">{{ wareSummary(item) }}</span>
        </button>
      </li>
    </ul>
    <button v-if="currentId" class="sheet__cancel" data-testid="vessel-none" @click="emit('pick', null)">
      No vessel
    </button>
    <button class="sheet__cancel" data-testid="vessel-close" @click="emit('close')">Done</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { isBrewingVessel, wareSummary } from "../ware";
import type { Teaware } from "../types";

const props = defineProps<{ items: Teaware[]; currentId: string | null }>();
const emit = defineEmits<{ pick: [item: Teaware | null]; close: [] }>();

const vessels = computed(() =>
  props.items.filter(isBrewingVessel).sort((a, b) => a.name.localeCompare(b.name)),
);
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.vessel__list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  max-height: 42vh;
  overflow-y: auto;
}
.vessel__row {
  display: flex;
  align-items: baseline;
  gap: 12px;
  width: 100%;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #241e19;
  padding: 12px 2px;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.vessel__row--current .vessel__name {
  color: #efe7da;
  font-weight: 600;
}
.vessel__name {
  flex: 1;
}
.vessel__meta {
  color: #8b7a63;
  font-size: 13px;
}
.vessel__empty {
  color: #8b7a63;
  font-size: 14px;
}
</style>
```

- [ ] **Step 6: Put the vessel in the timer bar**

In `frontend/src/apps/tea/pages/TimerPage.vue`:
- Wrap the existing `timer__tea` button in `<div class="timer__what">…</div>` and add, inside that div after it:

```vue
        <button class="timer__tea timer__vessel" data-testid="timer-vessel" @click="pickingVessel = true">
          <template v-if="timer.live?.teaware">
            in {{ timer.live.teaware.name
            }}<template v-if="timer.live.teaware.volume_ml"> · {{ timer.live.teaware.volume_ml }} ml</template>
            <small>change vessel</small>
          </template>
          <template v-else>
            + vessel
            <small>what you're brewing in</small>
          </template>
        </button>
```

- After the `PickTeaSheet` element add:

```vue
    <PickVesselSheet
      v-if="pickingVessel"
      :items="teaware.items"
      :current-id="timer.live?.teaware?.id ?? null"
      @pick="onPickVessel"
      @close="pickingVessel = false"
    />
```

- Script: `import PickVesselSheet from "../components/PickVesselSheet.vue";`, `import { useTeawareStore } from "../stores/useTeawareStore";`, `import type { Teaware } from "../types";` (merge with the existing type import), `const teaware = useTeawareStore();`, `const pickingVessel = ref(false);`, and:

```ts
async function onPickVessel(item: Teaware | null): Promise<void> {
  pickingVessel.value = false;
  await timer.setVessel(item);
}
```

- In `onResume`, pass the vessel: `timer.resume(session, tea, teaware.items.find((w) => w.id === session.teaware_id) ?? null);`.
- At the top of `onMounted`, add `if (teaware.items.length === 0) await teaware.fetchItems();`.
- Styles: add

```scss
.timer__what {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.timer__vessel {
  font-size: 14px;
}
```

- [ ] **Step 7: Run the tests, typecheck and lint**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): pick the brewing vessel on the timer, prefilled from last time

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Vessels on a tea's session rows

**Files:**
- Modify: `frontend/src/apps/tea/components/TeaSessionsList.vue` (+ spec)
- Modify: `frontend/src/apps/tea/pages/TeaDetailPage.vue` (+ spec)

**Interfaces:**
- Consumes: `vesselLabel` from `ware.ts`; `useTeawareStore().items`, `.fetchItems`.
- Produces: `TeaSessionsList` prop `vessels?: Teaware[]`, test id `sessions-vessel-{id}`.

- [ ] **Step 1: Write the failing tests**

Append to `TeaSessionsList.spec.ts` inside its `describe` (add `import type { Teaware } from "../types";` if needed):

```ts
  it("says which vessel each session was brewed in, or that it was removed", () => {
    const pot = { id: "w-1", name: "Zhuni" } as Teaware;
    const wrapper = mount(TeaSessionsList, {
      props: {
        sessions: [
          session("s-1", { teaware_id: "w-1", vessel_volume_ml: 110 }),
          session("s-2", { teaware_id: null, vessel_volume_ml: 110 }),
          session("s-3"),
        ],
        vessels: [pot],
      },
    });
    expect(wrapper.get("[data-testid=sessions-vessel-s-1]").text()).toBe("· Zhuni 110 ml");
    expect(wrapper.get("[data-testid=sessions-vessel-s-2]").text()).toBe("· 110 ml, vessel removed");
    expect(wrapper.find("[data-testid=sessions-vessel-s-3]").exists()).toBe(false);
  });
```

(the partial `Teaware` cast is acceptable in a test: `vesselLabel` reads only `id` and `name`.)

Append to `TeaDetailPage.spec.ts` inside its `describe`, reusing that file's `SOLO`, `tea()`, `OOLONG`, `WUYI`, `STUBS` and the existing finished-session fixture shape:

```ts
  it("names the vessel each session was brewed in", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/teas") return Promise.resolve([tea()]);
      if (path === "/tea/catalogue") return Promise.resolve([OOLONG, WUYI]);
      if (path === "/tea/cabinet") return Promise.resolve(SOLO);
      if (path === "/tea/teaware") return Promise.resolve([{ id: "w-1", name: "Zhuni" }]);
      if (path === "/tea/teas/t-1/sessions")
        return Promise.resolve([
          {
            id: "s-1", brewed_by: "jakub", tea_id: "t-1", status: "finalised",
            started_at: "2026-09-25T19:40:00Z", updated_at: "2026-09-25T20:10:00Z",
            finished_at: "2026-09-25T20:10:00Z", leaf_grams: 6, water_temp_c: 95, rating: 5,
            curve_source: "almanac", curve_source_label: "almanac: Tieguanyin",
            infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
            teaware_id: "w-1", vessel_volume_ml: 110,
          },
        ]);
      return Promise.resolve([]);
    });
    const wrapper = mount(TeaDetailPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.get("[data-testid=sessions-vessel-s-1]").text()).toBe("· Zhuni 110 ml");
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/components/TeaSessionsList.spec.ts src/apps/tea/pages/TeaDetailPage.spec.ts`
Expected: FAIL — no `sessions-vessel-*`.

- [ ] **Step 3: Label the vessel**

In `TeaSessionsList.vue`: add `vessels?: Teaware[]` to the props, import `vesselLabel` from `../ware` and `Teaware` from `../types`, and inside the `sessions__meta` span, after the grams `<template>`, add:

```vue
        <span
          v-if="vessels && vesselLabel(session, vessels)"
          :data-testid="`sessions-vessel-${session.id}`"
          >· {{ vesselLabel(session, vessels) }}</span
        >
```

In `TeaDetailPage.vue`: import `useTeawareStore`, add `const teaware = useTeawareStore();`, pass `:vessels="teaware.items"` to `TeaSessionsList`, and add `if (teaware.items.length === 0) void teaware.fetchItems();` to `onMounted`.

- [ ] **Step 4: Run the tests, typecheck and lint**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): show the vessel on a tea's sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: PRD update and full verification

**Files:**
- Modify: `docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md` (§4.2)

- [ ] **Step 1: Point the PRD at the spec**

In §4.2 "The Teaware Cabinet", append to the **Description** paragraph:

"Designed in `docs/superpowers/specs/2026-09-27-tea-teaware-cabinet-design.md`, which supersedes the details below where they differ: materials are porcelain / clay / stoneware / glass / other; the Seasoning Log is derived from the sessions that name a pot rather than stored; a pot is dedicated to a catalogue node; archiving is an undoable Retire, and a hard delete exists."

- [ ] **Step 2: Run everything**

Run: `cd backend && .venv/bin/pytest -q && black --check . && ruff check .`
Expected: all pass.

Run: `cd frontend && npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 3: Commit**

```bash
git add docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md
git commit -m "docs(tea): point the PRD's teaware section at its design

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
