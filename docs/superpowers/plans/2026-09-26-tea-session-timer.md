# Gongfu Session Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A count-up gongfu steep timer at `/tea/timer`, drawn as a teacup filling with the tea's colour, that works as a plain timer and — once a tea is attached — records each sitting, syncs it to the server after every steep, suggests steep times from the tea's best session, and deducts leaf grams on finish.

**Architecture:** Backend adds `TeaSession` records inside the existing per-user tea doc (schema v2), a session service (snapshot upsert / finalise-with-deduction / discard), a curve service (best session → tea → Almanac ancestor → generic), and five routes on the tea router. Frontend adds a Pinia timer store that is the source of truth for the live session (persisted to `localStorage`, pushed as a whole snapshot through `useApi`), three small composables (clock, wake lock, chime), an SVG teacup, the timer page with its sheets, and entry points on the Cabinet and tea detail.

**Tech Stack:** FastAPI + Pydantic v2 (Python 3.12), pytest; Vue 3 `<script setup lang="ts">`, Pinia, Quasar v2, Vitest + @vue/test-utils (happy-dom).

**Spec:** `docs/superpowers/specs/2026-09-26-tea-session-timer-design.md`

## Global Constraints

- Backend is strict 3-layer: routers translate exceptions → `HTTPException`; services raise stdlib/custom exceptions only; only `app/repositories/*` touch the filesystem. All writes via `tea_repo.doc_transaction` (atomic).
- API: snake_case JSON, direct serialisation (no envelopes), ISO 8601 strings, errors as `{ detail }`.
- All frontend HTTP through `@/composables/useApi` (`api.get/put/del`). No raw `fetch`.
- Every Pinia store exposes `loading` and `error` refs; async actions set `loading` in `try/finally` and route errors into `error.value`, never bare `console.error`.
- `<script setup lang="ts">`, `defineProps<{}>()` / `defineEmits<{}>()` generic syntax, no `any`.
- Comments only for the non-obvious *why*. YAGNI. Match surrounding naming (`data-testid` on every interactive element, BEM-ish scoped classes, palette from `tokens.ts` `GROUND`).
- Black + ruff clean (line length 100) for backend; `npm run lint` and `npm run typecheck` clean for frontend.
- Session rules: rating 1–5; `target_seconds` > 0; `actual_seconds` ≥ 0; infusion numbers contiguous from 1; `leaf_grams` > 0; `water_temp_c` 1–100.
- Generic curve: `10, 15, 20, 25`, then +5 s per infusion. Nudge step: 5 s.
- Cup liquor colours: green `#d6cf86`, yellow `#e3c65e`, white `#ead9a4`, oolong `#d49a3f`, red `#a8492a`, dark `#5e2e17`, other / no tea `#bdb56a`. Target line `#d9a45b`.
- Commit directly on `main` (personal repo). Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Reload or phone sleep mid-steep** — a steep that was running before a reload must still be running afterwards, and stopping it records the full wall-clock time since it started. (Task 9, `hydrates a running steep and records the whole elapsed time`.)
2. **A best session containing a 0-second steep** (a double tap) — the suggested target for that infusion must be at least 1 s, never 0, or the next upsert would 422. (Task 4, `test_best_session_zero_second_steep_suggests_one_second`.)
3. **The attached tea is deleted from another device mid-session** — the timer drops to plain mode, keeps every recorded time, and shows a notice instead of an error loop. (Task 9, `detaches the tea when the server says it is gone`.)
4. **Corrupt or old-shape `localStorage`** — the timer opens fresh instead of crashing. (Task 9, `drops an invalid saved session`.)
5. **Finishing a tea session before any steep was brewed** — the server keeps a finalised session with zero infusions, and it never becomes the "best session". (Task 3 `test_finalise_with_nothing_brewed_keeps_an_empty_session`, Task 4 `test_best_session_ignores_sessions_with_no_brewed_infusions`.)

---

## File Structure

**Backend (`backend/`)**
- Modify `app/schemas/tea.py` — `BrewingWrite`, `Tea.brewing`, `TeaWriteRequest.brewing`, `TeaDoc.sessions`, `schema_version = 2`.
- Create `app/schemas/tea_session.py` — `Infusion`, `TeaSessionWrite`, `TeaSession`, `BrewingCurve`, literals.
- Modify `app/repositories/tea_repo.py` — `_CURRENT_SCHEMA_VERSION = 2`, `migrate` v1 → v2.
- Modify `app/services/tea_catalogue_service.py` — public `ancestry()`.
- Modify `app/services/tea_service.py` — `delete_tea` removes the tea's sessions.
- Create `app/services/tea_session_service.py` — upsert / finalise / discard / listing.
- Create `app/services/tea_curve_service.py` — the fallback chain.
- Modify `app/routers/tea.py` — five routes.
- Tests: `tests/test_tea_brewing.py`, `tests/test_tea_sessions.py`, `tests/test_tea_curve.py`, `tests/test_tea_sessions_api.py`; extend `tests/test_tea_repo.py`.

**Frontend (`frontend/src/apps/tea/`)**
- Modify `types.ts` — `Tea.brewing`, session types, `BrewingCurve`.
- Modify `components/TeaForm.vue` (+spec) — Brewing group.
- Modify `stores/useTeaCabinetStore.ts`, `pages/NewTeaPage.vue` — carry `brewing`.
- Create `timer.ts` (+spec) — pure timer rules: targets, generic curve, cup fill, colours, formatting, id minting.
- Create `composables/useSteepClock.ts`, `composables/useWakeLock.ts`, `composables/useTargetChime.ts` (+specs).
- Create `stores/useTeaTimerStore.ts` (+spec) — the live session.
- Create `stores/useTeaSessionsStore.ts` (+spec) — server reads.
- Create `components/TeaCup.vue`, `components/PickTeaSheet.vue`, `components/FinishSheet.vue`, `components/RecoveryCard.vue`, `components/TeaSessionsList.vue` (+specs).
- Create `pages/TimerPage.vue` (+spec).
- Modify `src/router/routes.ts` (+`routes.spec.ts`), `pages/TeaDetailPage.vue` (+spec), `pages/CabinetPage.vue` (+spec).

---

### Task 1: Brewing parameters on a Tea (backend)

**Files:**
- Modify: `backend/app/schemas/tea.py`
- Test: `backend/tests/test_tea_brewing.py`

**Interfaces:**
- Consumes: `app.schemas.almanac.BrewingParameters` (`leaf_grams: float | None`, `water_temp_c: int | None`, `steep_seconds: list[int]`).
- Produces: `Tea.brewing: BrewingParameters | None`; `TeaWriteRequest.brewing: BrewingWrite | None`; `BrewingWrite` (validated variant).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tea_brewing.py`:

```python
"""A tea's own brewing parameters: stored, returned, validated."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import tea_repo as repo

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _payload(**overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "name": "Tieguanyin",
        "catalogue_node_id": "oolong.anxi.tieguanyin",
        "grams_remaining": 50,
    }
    body.update(overrides)
    return body


def test_a_tea_without_brewing_returns_null() -> None:
    created = client.post("/api/tea/teas", json=_payload()).json()
    assert created["brewing"] is None


def test_brewing_round_trips() -> None:
    brewing = {"leaf_grams": 7, "water_temp_c": 95, "steep_seconds": [15, 20, 30]}
    created = client.post("/api/tea/teas", json=_payload(brewing=brewing)).json()
    assert created["brewing"] == brewing

    fetched = client.get(f"/api/tea/teas/{created['id']}").json()
    assert fetched["brewing"] == brewing


@pytest.mark.parametrize(
    "brewing",
    [
        {"leaf_grams": 0, "water_temp_c": None, "steep_seconds": []},
        {"leaf_grams": None, "water_temp_c": 0, "steep_seconds": []},
        {"leaf_grams": None, "water_temp_c": 101, "steep_seconds": []},
        {"leaf_grams": None, "water_temp_c": None, "steep_seconds": [10, 0]},
    ],
)
def test_invalid_brewing_is_422(brewing: dict[str, object]) -> None:
    response = client.post("/api/tea/teas", json=_payload(brewing=brewing))
    assert response.status_code == 422
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_tea_brewing.py -v`
Expected: FAIL — `KeyError: 'brewing'` / the 422 cases return 201.

- [ ] **Step 3: Implement**

In `backend/app/schemas/tea.py`, change the pydantic import and add the almanac import below the existing imports:

```python
from pydantic import BaseModel, Field, PositiveInt

from app.schemas.almanac import BrewingParameters
```

Add after `_MIN_YEAR = 1900`:

```python


class BrewingWrite(BaseModel):
    """A tea's own brewing parameters as the form sends them.

    Stricter than the Almanac's `BrewingParameters`, which describes curated seed
    data rather than input.
    """

    leaf_grams: float | None = Field(default=None, gt=0)
    water_temp_c: int | None = Field(default=None, ge=1, le=100)
    steep_seconds: list[PositiveInt] = Field(default_factory=list)
```

Add to `class Tea`, directly after `image_url: str | None = None`:

```python
    brewing: BrewingParameters | None = None
```

Add to `class TeaWriteRequest`, directly after `image_url: str | None = None`:

```python
    brewing: BrewingWrite | None = None
```

(`tea_service.create_tea` / `replace_tea` already build `Tea` from `req.model_dump(...)`, so the field flows through with no service change.)

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && .venv/bin/pytest tests/test_tea_brewing.py tests/test_tea_api.py tests/test_tea_service.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && black . && ruff check .
git add app/schemas/tea.py tests/test_tea_brewing.py
git commit -m "feat(tea): let a tea hold its own brewing parameters

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Session schemas and tea doc v2

**Files:**
- Create: `backend/app/schemas/tea_session.py`
- Modify: `backend/app/schemas/tea.py`, `backend/app/repositories/tea_repo.py`
- Test: `backend/tests/test_tea_repo.py` (append), `backend/tests/test_tea_sessions.py` (create, schema tests only for now)

**Interfaces:**
- Produces:
  - `SessionStatus = Literal["in_progress", "finalised"]`, `CurveSource = Literal["best_session", "tea", "almanac", "generic"]`
  - `Infusion(number: int ≥1, target_seconds: int >0, actual_seconds: int | None ≥0)`
  - `TeaSessionWrite(tea_id, status, started_at, leaf_grams, water_temp_c, rating, curve_source, curve_source_label, infusions)` — validates contiguous numbering
  - `TeaSession(TeaSessionWrite)` + `id: str`, `updated_at: str`, `finished_at: str | None`
  - `BrewingCurve(leaf_grams, water_temp_c, steep_seconds: list[int], source: CurveSource, source_label: str)`
  - `TeaDoc.sessions: list[TeaSession]`, `TeaDoc.schema_version` default 2; `tea_repo.migrate` upgrades v1.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_tea_repo.py`:

```python


def test_migrate_upgrades_a_v1_doc_to_v2_with_no_sessions() -> None:
    raw: dict[str, object] = {"schema_version": 1, "teas": [], "catalogue_nodes": []}
    upgraded = repo.migrate(raw)
    assert upgraded["schema_version"] == 2
    assert upgraded["sessions"] == []


def test_an_empty_doc_is_v2() -> None:
    assert repo.read_doc("nobody").schema_version == 2
```

(If `test_tea_repo.py` does not already patch `settings.data_dir` via an autouse fixture, it does — every tea test file does; confirm at the top of the file.)

Create `backend/tests/test_tea_sessions.py`:

```python
"""Tea sessions: schema rules, snapshot upsert, finalise, discard, listing."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import tea_repo as repo
from app.schemas.tea_session import TeaSessionWrite


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _write(**overrides: object) -> TeaSessionWrite:
    payload: dict[str, object] = {
        "tea_id": "t-1",
        "status": "in_progress",
        "started_at": "2026-09-26T18:00:00+00:00",
        "curve_source": "generic",
        "curve_source_label": "generic gongfu",
        "infusions": [
            {"number": 1, "target_seconds": 10, "actual_seconds": 11},
            {"number": 2, "target_seconds": 15, "actual_seconds": None},
        ],
    }
    payload.update(overrides)
    return TeaSessionWrite.model_validate(payload)


def test_a_valid_snapshot_parses() -> None:
    assert len(_write().infusions) == 2


@pytest.mark.parametrize(
    "overrides",
    [
        {"rating": 6},
        {"rating": 0},
        {"leaf_grams": 0},
        {"water_temp_c": 101},
        {"infusions": [{"number": 2, "target_seconds": 10, "actual_seconds": None}]},
        {"infusions": [{"number": 1, "target_seconds": 0, "actual_seconds": None}]},
        {"infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": -1}]},
    ],
)
def test_an_invalid_snapshot_is_rejected(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _write(**overrides)
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_tea_repo.py tests/test_tea_sessions.py -v`
Expected: FAIL — `ModuleNotFoundError: app.schemas.tea_session`; migrate returns the doc unchanged.

- [ ] **Step 3: Implement**

Create `backend/app/schemas/tea_session.py`:

```python
"""Pydantic v2 schemas for Gongfu Session Timer sessions.

A session is stored inside the user's tea doc (see `app/schemas/tea.py`) so that
finalising and the grams deduction it causes are one atomic write. The phone
owns a live session and sends it as a whole snapshot; the server only ever
replaces it.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator

SessionStatus = Literal["in_progress", "finalised"]
CurveSource = Literal["best_session", "tea", "almanac", "generic"]


class Infusion(BaseModel):
    number: int = Field(ge=1)
    target_seconds: int = Field(gt=0)
    # null = not brewed yet (the pending next steep), distinct from a 0-second pour.
    actual_seconds: int | None = Field(default=None, ge=0)


class TeaSessionWrite(BaseModel):
    """The snapshot body: a session minus the fields the server owns."""

    tea_id: str
    status: SessionStatus
    started_at: str
    leaf_grams: float | None = Field(default=None, gt=0)
    water_temp_c: int | None = Field(default=None, ge=1, le=100)
    rating: int | None = Field(default=None, ge=1, le=5)
    curve_source: CurveSource
    curve_source_label: str = ""
    infusions: list[Infusion] = Field(default_factory=list)

    @model_validator(mode="after")
    def _numbered_in_order(self) -> TeaSessionWrite:
        if [i.number for i in self.infusions] != list(range(1, len(self.infusions) + 1)):
            raise ValueError("Infusions must be numbered 1, 2, 3… in order")
        return self


class TeaSession(TeaSessionWrite):
    id: str
    updated_at: str
    finished_at: str | None = None


class BrewingCurve(BaseModel):
    leaf_grams: float | None = None
    water_temp_c: int | None = None
    steep_seconds: list[int]
    source: CurveSource
    source_label: str
```

In `backend/app/schemas/tea.py` add below the almanac import:

```python
from app.schemas.tea_session import TeaSession
```

and replace `class TeaDoc` with:

```python
class TeaDoc(BaseModel):
    schema_version: int = 2
    teas: list[Tea] = Field(default_factory=list)
    catalogue_nodes: list[CatalogueNode] = Field(default_factory=list)
    sessions: list[TeaSession] = Field(default_factory=list)
```

Update the module docstring's first paragraph in `tea.py` to mention sessions:

```python
The persisted document is one JSON file per user
(`DATA_DIR/tea/users/{username}.json`) holding that user's teas, the catalogue
nodes they added themselves, and their brewing sessions. Seeded nodes are never
written there — they ship in `app/data/tea_catalogue.json` and are merged on read.
```

In `backend/app/repositories/tea_repo.py` set `_CURRENT_SCHEMA_VERSION = 2` and replace `migrate`:

```python
def migrate(raw: dict[str, object]) -> dict[str, object]:
    """Upgrade a raw document to the current schema. v2 added `sessions`."""
    if raw.get("schema_version", 1) == 1:
        raw = {**raw, "schema_version": 2, "sessions": []}
    return raw
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && .venv/bin/pytest tests/ -k tea -v`
Expected: all PASS (existing tea tests still pass: a v1 file on disk upgrades on read).

- [ ] **Step 5: Commit**

```bash
cd backend && black . && ruff check .
git add app/schemas/tea_session.py app/schemas/tea.py app/repositories/tea_repo.py tests/test_tea_repo.py tests/test_tea_sessions.py
git commit -m "feat(tea): add session schemas and move the tea doc to v2

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Session service — upsert, finalise, discard, listing

**Files:**
- Create: `backend/app/services/tea_session_service.py`
- Modify: `backend/app/services/tea_service.py` (`delete_tea`)
- Test: `backend/tests/test_tea_sessions.py` (append)

**Interfaces:**
- Consumes: `tea_repo.doc_transaction`, `tea_repo.read_doc`, `TeaSessionWrite`, `TeaSession`.
- Produces (module `app.services.tea_session_service`):
  - `class SessionFinalisedError(Exception)`
  - `upsert(username: str, session_id: str, req: TeaSessionWrite) -> TeaSession` — `FileNotFoundError` for unknown tea, `SessionFinalisedError` if the stored session is finalised
  - `discard(username: str, session_id: str) -> None` — `FileNotFoundError`, `SessionFinalisedError`
  - `list_in_progress(username: str) -> list[TeaSession]` — newest `updated_at` first
  - `list_for_tea(username: str, tea_id: str) -> list[TeaSession]` — finalised only, newest `finished_at` first; `FileNotFoundError` for unknown tea

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_tea_sessions.py` (add these imports to the top of the file alongside the existing ones):

```python
from app.schemas.tea import TeaWriteRequest
from app.services import tea_service
from app.services import tea_session_service as sessions
```

```python


def _tea(grams: float = 40) -> str:
    req = TeaWriteRequest.model_validate(
        {"name": "Tieguanyin", "catalogue_node_id": "oolong.anxi.tieguanyin", "grams_remaining": grams}
    )
    return tea_service.create_tea("alice", req).id


def _grams(tea_id: str) -> float:
    return tea_service.get_tea("alice", tea_id).grams_remaining


def test_upsert_creates_then_replaces() -> None:
    tea_id = _tea()
    first = sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    assert first.id == "s-1"
    assert first.finished_at is None

    three = [
        {"number": 1, "target_seconds": 10, "actual_seconds": 11},
        {"number": 2, "target_seconds": 15, "actual_seconds": 16},
        {"number": 3, "target_seconds": 20, "actual_seconds": None},
    ]
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id, infusions=three))

    stored = repo.read_doc("alice").sessions
    assert len(stored) == 1
    assert len(stored[0].infusions) == 3


def test_upsert_for_an_unknown_tea_is_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.upsert("alice", "s-1", _write(tea_id="t-nosuch"))


def test_finalise_deducts_grams_and_drops_the_pending_steep() -> None:
    tea_id = _tea(grams=40)
    done = sessions.upsert(
        "alice", "s-1", _write(tea_id=tea_id, status="finalised", leaf_grams=6, rating=4)
    )
    assert done.finished_at is not None
    assert [i.number for i in done.infusions] == [1]
    assert _grams(tea_id) == 34


def test_a_retried_finalise_is_refused_and_never_deducts_twice() -> None:
    tea_id = _tea(grams=40)
    final = _write(tea_id=tea_id, status="finalised", leaf_grams=6)
    sessions.upsert("alice", "s-1", final)
    with pytest.raises(sessions.SessionFinalisedError):
        sessions.upsert("alice", "s-1", final)
    assert _grams(tea_id) == 34


def test_finalise_clamps_grams_at_zero() -> None:
    tea_id = _tea(grams=3)
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id, status="finalised", leaf_grams=6))
    assert _grams(tea_id) == 0


def test_finalise_without_leaf_grams_leaves_grams_alone() -> None:
    tea_id = _tea(grams=40)
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id, status="finalised"))
    assert _grams(tea_id) == 40


def test_finalise_with_nothing_brewed_keeps_an_empty_session() -> None:
    tea_id = _tea()
    pending_only = [{"number": 1, "target_seconds": 10, "actual_seconds": None}]
    done = sessions.upsert(
        "alice", "s-1", _write(tea_id=tea_id, status="finalised", infusions=pending_only)
    )
    assert done.infusions == []


def test_discard_removes_an_in_progress_session() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.discard("alice", "s-1")
    assert repo.read_doc("alice").sessions == []


def test_discard_refuses_a_finalised_session() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id, status="finalised"))
    with pytest.raises(sessions.SessionFinalisedError):
        sessions.discard("alice", "s-1")


def test_discard_of_an_unknown_session_is_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.discard("alice", "s-nosuch")


def test_listing_splits_in_progress_from_finalised() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-live", _write(tea_id=tea_id))
    sessions.upsert("alice", "s-old", _write(tea_id=tea_id, status="finalised"))
    sessions.upsert("alice", "s-new", _write(tea_id=tea_id, status="finalised"))

    assert [s.id for s in sessions.list_in_progress("alice")] == ["s-live"]
    assert [s.id for s in sessions.list_for_tea("alice", tea_id)] == ["s-new", "s-old"]


def test_listing_for_an_unknown_tea_is_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.list_for_tea("alice", "t-nosuch")


def test_deleting_a_tea_deletes_its_sessions() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    tea_service.delete_tea("alice", tea_id)
    assert repo.read_doc("alice").sessions == []
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_tea_sessions.py -v`
Expected: FAIL — `ImportError: cannot import name 'tea_session_service'`.

- [ ] **Step 3: Implement**

Create `backend/app/services/tea_session_service.py`:

```python
"""Business logic for Gongfu Session Timer sessions.

The phone owns a live session and sends it whole after every steep; this module
only ever replaces the stored copy. Finalising is the one transition with side
effects — it deducts the leaf used from the tea — so it happens inside the same
`doc_transaction` that marks the session finalised, and a finalised session is
frozen so a retried finish can never deduct twice.

Raises `FileNotFoundError`, `SessionFinalisedError`; the router translates.
"""

from __future__ import annotations

from datetime import UTC, datetime

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc
from app.schemas.tea_session import TeaSession, TeaSessionWrite


class SessionFinalisedError(Exception):
    """A finalised session can no longer be changed or discarded."""


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _tea_position(doc: TeaDoc, tea_id: str) -> int:
    for position, tea in enumerate(doc.teas):
        if tea.id == tea_id:
            return position
    raise FileNotFoundError(f"No tea with id {tea_id!r}")


def _session_position(doc: TeaDoc, session_id: str) -> int | None:
    for position, session in enumerate(doc.sessions):
        if session.id == session_id:
            return position
    return None


def upsert(username: str, session_id: str, req: TeaSessionWrite) -> TeaSession:
    """Store `req` as session `session_id`, finalising it if its status says so."""
    with repo.doc_transaction(username) as doc:
        tea_position = _tea_position(doc, req.tea_id)
        existing = _session_position(doc, session_id)
        if existing is not None and doc.sessions[existing].status == "finalised":
            raise SessionFinalisedError("This session is already finished")

        stamp = _now_iso()
        infusions = req.infusions
        finished_at = None
        if req.status == "finalised":
            # The phone always carries one pending steep; a finished session keeps
            # only what was actually brewed, renumbered so numbering stays 1..N.
            brewed = [i for i in req.infusions if i.actual_seconds is not None]
            infusions = [i.model_copy(update={"number": n}) for n, i in enumerate(brewed, 1)]
            finished_at = stamp
            if req.leaf_grams is not None:
                tea = doc.teas[tea_position]
                doc.teas[tea_position] = tea.model_copy(
                    update={
                        "grams_remaining": max(0.0, tea.grams_remaining - req.leaf_grams),
                        "updated_at": stamp,
                    }
                )

        session = TeaSession(
            **req.model_dump(exclude={"infusions"}),
            infusions=infusions,
            id=session_id,
            updated_at=stamp,
            finished_at=finished_at,
        )
        if existing is None:
            doc.sessions.append(session)
        else:
            doc.sessions[existing] = session
        return session


def discard(username: str, session_id: str) -> None:
    """Remove an in-progress session. Nothing it recorded touches the tea."""
    with repo.doc_transaction(username) as doc:
        position = _session_position(doc, session_id)
        if position is None:
            raise FileNotFoundError(f"No session with id {session_id!r}")
        if doc.sessions[position].status == "finalised":
            raise SessionFinalisedError("A finished session cannot be discarded")
        del doc.sessions[position]


def list_in_progress(username: str) -> list[TeaSession]:
    live = [s for s in repo.read_doc(username).sessions if s.status == "in_progress"]
    return sorted(live, key=lambda s: s.updated_at, reverse=True)


def list_for_tea(username: str, tea_id: str) -> list[TeaSession]:
    doc = repo.read_doc(username)
    _tea_position(doc, tea_id)
    done = [s for s in doc.sessions if s.tea_id == tea_id and s.status == "finalised"]
    return sorted(done, key=lambda s: s.finished_at or "", reverse=True)
```

In `backend/app/services/tea_service.py` replace `delete_tea`:

```python
def delete_tea(username: str, tea_id: str) -> None:
    with repo.doc_transaction(username) as doc:
        remaining = [tea for tea in doc.teas if tea.id != tea_id]
        if len(remaining) == len(doc.teas):
            raise FileNotFoundError(f"No tea with id {tea_id!r}")
        doc.teas = remaining
        doc.sessions = [session for session in doc.sessions if session.tea_id != tea_id]
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && .venv/bin/pytest tests/test_tea_sessions.py tests/test_tea_service.py -v`
Expected: all PASS. (`test_listing_splits…` relies on `finished_at` strings increasing between calls; ISO timestamps with microseconds do. If it flakes on a very fast machine, it is the test, not the code — but it should not.)

- [ ] **Step 5: Commit**

```bash
cd backend && black . && ruff check .
git add app/services/tea_session_service.py app/services/tea_service.py tests/test_tea_sessions.py
git commit -m "feat(tea): add the session service with once-only grams deduction

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Brewing curve service

**Files:**
- Create: `backend/app/services/tea_curve_service.py`
- Modify: `backend/app/services/tea_catalogue_service.py` (add `ancestry`)
- Test: `backend/tests/test_tea_curve.py`

**Interfaces:**
- Consumes: `tea_repo.read_doc`, `almanac_repo.read_seed_entries()`, `tea_catalogue_service.merged_nodes / node_index`, `BrewingCurve`.
- Produces:
  - `tea_catalogue_service.ancestry(index: dict[str, CatalogueNode], node_id: str) -> list[CatalogueNode]` — node first, then parents up to the root; `[]` on unknown id; stops on a cycle.
  - `tea_curve_service.GENERIC_STEEPS: list[int] = [10, 15, 20, 25]`
  - `tea_curve_service.curve_for(username: str, tea_id: str) -> BrewingCurve` — `FileNotFoundError` for unknown tea.

Seed facts the tests rely on: `oolong.anxi.tieguanyin` has an Almanac entry with `leaf_grams 6, water_temp_c 95, steep_seconds [20, 25, 30, 40]`; the root `oolong` has no entry.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tea_curve.py`:

```python
"""The Brewing Curve: best session → tea → Almanac ancestor → generic."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CreateNodeRequest, TeaWriteRequest
from app.schemas.tea_session import TeaSessionWrite
from app.services import tea_catalogue_service as catalogue
from app.services import tea_curve_service as curves
from app.services import tea_service
from app.services import tea_session_service as sessions

TIEGUANYIN = "oolong.anxi.tieguanyin"


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea(node: str = TIEGUANYIN, brewing: dict[str, object] | None = None) -> str:
    req = TeaWriteRequest.model_validate(
        {"name": "Tea", "catalogue_node_id": node, "grams_remaining": 50, "brewing": brewing}
    )
    return tea_service.create_tea("alice", req).id


def _finish(
    tea_id: str,
    session_id: str,
    actuals: list[int],
    rating: int | None,
    leaf_grams: float | None = None,
    water_temp_c: int | None = None,
) -> None:
    infusions = [
        {"number": n, "target_seconds": 10, "actual_seconds": s}
        for n, s in enumerate(actuals, 1)
    ]
    sessions.upsert(
        "alice",
        session_id,
        TeaSessionWrite.model_validate(
            {
                "tea_id": tea_id,
                "status": "finalised",
                "started_at": "2026-09-12T18:00:00+00:00",
                "rating": rating,
                "leaf_grams": leaf_grams,
                "water_temp_c": water_temp_c,
                "curve_source": "generic",
                "infusions": infusions,
            }
        ),
    )


def test_unknown_tea_is_file_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        curves.curve_for("alice", "t-nosuch")


def test_generic_when_nothing_else_exists() -> None:
    curve = curves.curve_for("alice", _tea(node="oolong"))
    assert curve.source == "generic"
    assert curve.source_label == "generic gongfu"
    assert curve.steep_seconds == [10, 15, 20, 25]
    assert curve.leaf_grams is None


def test_almanac_entry_of_the_tea_itself() -> None:
    curve = curves.curve_for("alice", _tea())
    assert curve.source == "almanac"
    assert curve.source_label.startswith("almanac: ")
    assert curve.steep_seconds == [20, 25, 30, 40]
    assert (curve.leaf_grams, curve.water_temp_c) == (6, 95)


def test_almanac_entry_of_the_nearest_ancestor() -> None:
    node = catalogue.create_node(
        "alice", CreateNodeRequest(parent_id=TIEGUANYIN, name="Monkey-picked")
    )
    curve = curves.curve_for("alice", _tea(node=node.id))
    assert curve.source == "almanac"
    assert curve.steep_seconds == [20, 25, 30, 40]


def test_tea_brewing_beats_the_almanac_and_missing_fields_fall_through() -> None:
    tea_id = _tea(brewing={"leaf_grams": 8, "water_temp_c": None, "steep_seconds": [12, 18]})
    curve = curves.curve_for("alice", tea_id)
    assert curve.source == "tea"
    assert curve.source_label == "tea default"
    assert curve.steep_seconds == [12, 18]
    assert curve.leaf_grams == 8
    assert curve.water_temp_c == 95  # from the Almanac


def test_highest_rated_session_wins() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-five", [11, 16, 22], rating=5, leaf_grams=7, water_temp_c=98)
    _finish(tea_id, "s-three", [30, 30], rating=3)
    curve = curves.curve_for("alice", tea_id)
    assert curve.source == "best_session"
    assert curve.steep_seconds == [11, 16, 22]
    assert (curve.leaf_grams, curve.water_temp_c) == (7, 98)
    assert curve.source_label.startswith("from your best session (★5, ")


def test_a_tie_goes_to_the_most_recent_session() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-older", [10], rating=4)
    _finish(tea_id, "s-newer", [40], rating=4)
    assert curves.curve_for("alice", tea_id).steep_seconds == [40]


def test_unrated_and_in_progress_sessions_are_ignored() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-unrated", [99], rating=None)
    sessions.upsert(
        "alice",
        "s-live",
        TeaSessionWrite.model_validate(
            {
                "tea_id": tea_id,
                "status": "in_progress",
                "started_at": "2026-09-26T18:00:00+00:00",
                "rating": 5,
                "curve_source": "generic",
                "infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": 77}],
            }
        ),
    )
    assert curves.curve_for("alice", tea_id).source == "almanac"


def test_best_session_ignores_sessions_with_no_brewed_infusions() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-empty", [], rating=5)
    assert curves.curve_for("alice", tea_id).source == "almanac"


def test_best_session_zero_second_steep_suggests_one_second() -> None:
    tea_id = _tea()
    _finish(tea_id, "s-1", [0, 15], rating=5)
    assert curves.curve_for("alice", tea_id).steep_seconds == [1, 15]


def test_ancestry_is_node_first_and_empty_for_unknown() -> None:
    index = catalogue.node_index(catalogue.merged_nodes("alice"))
    assert [n.id for n in catalogue.ancestry(index, TIEGUANYIN)] == [
        TIEGUANYIN,
        "oolong.anxi",
        "oolong",
    ]
    assert catalogue.ancestry(index, "nope") == []
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_tea_curve.py -v`
Expected: FAIL — `ImportError: cannot import name 'tea_curve_service'`.

- [ ] **Step 3: Implement**

Append to `backend/app/services/tea_catalogue_service.py` (after `resolve_class`):

```python


def ancestry(index: dict[str, CatalogueNode], node_id: str) -> list[CatalogueNode]:
    """`node_id`'s node, then each parent up to the root. Stops rather than loop on a cycle."""
    chain: list[CatalogueNode] = []
    seen: set[str] = set()
    current = index.get(node_id)
    while current is not None and current.id not in seen:
        seen.add(current.id)
        chain.append(current)
        current = index.get(current.parent_id) if current.parent_id else None
    return chain
```

Create `backend/app/services/tea_curve_service.py`:

```python
"""The Brewing Curve: where a session's suggested steep times come from.

A chain of sources, most personal first — the best-rated past session of the
tea, the tea's own brewing parameters, the nearest Almanac entry up the
catalogue tree, then a generic gongfu curve. Steep times come from the first
source that has any; leaf grams and water temperature each fall through the
chain on their own, so a tea with a steep list but no temperature still gets
the Almanac's temperature.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.repositories import almanac_repo
from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc
from app.schemas.tea_session import BrewingCurve, CurveSource, TeaSession
from app.services import tea_catalogue_service as catalogue

GENERIC_STEEPS: list[int] = [10, 15, 20, 25]


@dataclass(frozen=True)
class _Link:
    source: CurveSource
    label: str
    leaf_grams: float | None
    water_temp_c: int | None
    steep_seconds: list[int]


def _best_session(doc: TeaDoc, tea_id: str) -> TeaSession | None:
    rated = [
        s
        for s in doc.sessions
        if s.tea_id == tea_id
        and s.status == "finalised"
        and s.rating is not None
        and any(i.actual_seconds is not None for i in s.infusions)
    ]
    # Most recent wins a tie: technique drifts, and the curve should follow it.
    return max(rated, key=lambda s: (s.rating, s.finished_at or ""), default=None)


def _short_date(iso: str | None) -> str:
    if not iso:
        return ""
    moment = datetime.fromisoformat(iso)
    return f"{moment.day} {moment:%b}"


def curve_for(username: str, tea_id: str) -> BrewingCurve:
    doc = repo.read_doc(username)
    tea = next((t for t in doc.teas if t.id == tea_id), None)
    if tea is None:
        raise FileNotFoundError(f"No tea with id {tea_id!r}")

    links: list[_Link] = []

    best = _best_session(doc, tea_id)
    if best is not None:
        links.append(
            _Link(
                "best_session",
                f"from your best session (★{best.rating}, {_short_date(best.finished_at)})",
                best.leaf_grams,
                best.water_temp_c,
                # A double-tapped 0 s steep must still suggest a target the next
                # snapshot can carry (targets are > 0).
                [max(1, i.actual_seconds) for i in best.infusions if i.actual_seconds is not None],
            )
        )

    if tea.brewing is not None:
        links.append(
            _Link(
                "tea",
                "tea default",
                tea.brewing.leaf_grams,
                tea.brewing.water_temp_c,
                tea.brewing.steep_seconds,
            )
        )

    index = catalogue.node_index(catalogue.merged_nodes(username))
    entries = {e.catalogue_node_id: e for e in almanac_repo.read_seed_entries()}
    for node in catalogue.ancestry(index, tea.catalogue_node_id):
        entry = entries.get(node.id)
        if entry is not None:
            links.append(
                _Link(
                    "almanac",
                    f"almanac: {node.name}",
                    entry.brewing.leaf_grams,
                    entry.brewing.water_temp_c,
                    entry.brewing.steep_seconds,
                )
            )

    links.append(_Link("generic", "generic gongfu", None, None, GENERIC_STEEPS))

    steeps = next(link for link in links if link.steep_seconds)
    return BrewingCurve(
        leaf_grams=next((l.leaf_grams for l in links if l.leaf_grams is not None), None),
        water_temp_c=next((l.water_temp_c for l in links if l.water_temp_c is not None), None),
        steep_seconds=list(steeps.steep_seconds),
        source=steeps.source,
        source_label=steeps.label,
    )
```

(ruff may flag `l` as an ambiguous name, E741. If so, rename it to `link` in those two generator expressions.)

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && .venv/bin/pytest tests/test_tea_curve.py tests/test_tea_catalogue.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
cd backend && black . && ruff check .
git add app/services/tea_curve_service.py app/services/tea_catalogue_service.py tests/test_tea_curve.py
git commit -m "feat(tea): resolve the brewing curve from best session, tea, almanac, generic

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Session and curve routes

**Files:**
- Modify: `backend/app/routers/tea.py`
- Test: `backend/tests/test_tea_sessions_api.py`

**Interfaces:**
- Consumes: `tea_session_service.{upsert, discard, list_in_progress, list_for_tea, SessionFinalisedError}`, `tea_curve_service.curve_for`.
- Produces HTTP:
  - `GET /api/tea/sessions?status=in_progress` → `list[TeaSession]`
  - `GET /api/tea/teas/{tea_id}/sessions` → `list[TeaSession]` (404)
  - `PUT /api/tea/sessions/{session_id}` body `TeaSessionWrite` → `TeaSession` (404 / 409 / 422)
  - `DELETE /api/tea/sessions/{session_id}` → 204 (404 / 409)
  - `GET /api/tea/teas/{tea_id}/curve` → `BrewingCurve` (404)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tea_sessions_api.py`:

```python
"""The session and curve routes: status codes and exception translation."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories import tea_repo as repo

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea() -> dict[str, object]:
    body = {"name": "Tieguanyin", "catalogue_node_id": "oolong.anxi.tieguanyin", "grams_remaining": 40}
    return client.post("/api/tea/teas", json=body).json()


def _snapshot(tea_id: object, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "tea_id": tea_id,
        "status": "in_progress",
        "started_at": "2026-09-26T18:00:00+00:00",
        "leaf_grams": 6,
        "curve_source": "almanac",
        "curve_source_label": "almanac: Tieguanyin",
        "infusions": [
            {"number": 1, "target_seconds": 20, "actual_seconds": 21},
            {"number": 2, "target_seconds": 25, "actual_seconds": None},
        ],
    }
    body.update(overrides)
    return body


def test_put_creates_and_lists_in_progress() -> None:
    tea = _tea()
    response = client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    assert response.status_code == 200
    assert response.json()["id"] == "s-1"

    live = client.get("/api/tea/sessions", params={"status": "in_progress"}).json()
    assert [s["id"] for s in live] == ["s-1"]


def test_finalise_deducts_and_appears_on_the_tea() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"], status="finalised", rating=5))

    assert client.get(f"/api/tea/teas/{tea['id']}").json()["grams_remaining"] == 34
    listed = client.get(f"/api/tea/teas/{tea['id']}/sessions").json()
    assert [s["id"] for s in listed] == ["s-1"]


def test_put_after_finalise_is_409() -> None:
    tea = _tea()
    final = _snapshot(tea["id"], status="finalised")
    client.put("/api/tea/sessions/s-1", json=final)
    response = client.put("/api/tea/sessions/s-1", json=final)
    assert response.status_code == 409
    assert response.json()["detail"] == "This session is already finished"


def test_put_for_an_unknown_tea_is_404() -> None:
    response = client.put("/api/tea/sessions/s-1", json=_snapshot("t-nosuch"))
    assert response.status_code == 404
    assert response.json()["detail"] == "Tea not found"


def test_an_invalid_snapshot_is_422() -> None:
    tea = _tea()
    response = client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"], rating=6))
    assert response.status_code == 422


def test_delete_discards_then_404s() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    assert client.delete("/api/tea/sessions/s-1").status_code == 204
    assert client.delete("/api/tea/sessions/s-1").status_code == 404


def test_delete_of_a_finalised_session_is_409() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"], status="finalised"))
    assert client.delete("/api/tea/sessions/s-1").status_code == 409


def test_curve_and_its_404() -> None:
    tea = _tea()
    curve = client.get(f"/api/tea/teas/{tea['id']}/curve").json()
    assert curve["source"] == "almanac"
    assert curve["steep_seconds"] == [20, 25, 30, 40]
    assert client.get("/api/tea/teas/t-nosuch/curve").status_code == 404
    assert client.get("/api/tea/teas/t-nosuch/sessions").status_code == 404
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && .venv/bin/pytest tests/test_tea_sessions_api.py -v`
Expected: FAIL — 404/405 from unrouted paths.

- [ ] **Step 3: Implement**

In `backend/app/routers/tea.py`:

Update the module docstring's last paragraph:

```python
This module is the only place tea exceptions become HTTP: `FileNotFoundError`
-> 404, `ValueError` -> 422, `NodeInUseError` and `SessionFinalisedError` -> 409.
```

Change `from typing import Annotated` to `from typing import Annotated, Literal`. Add imports:

```python
from app.schemas.tea_session import BrewingCurve, TeaSession, TeaSessionWrite
from app.services import tea_curve_service as curves
from app.services import tea_session_service as sessions
```

Append at the end of the file:

```python


@router.get("/sessions", response_model=list[TeaSession])
def list_sessions(
    status: Literal["in_progress"], current_user: str = Depends(get_current_user)
) -> list[TeaSession]:
    # Only the recovery check lists across teas; finished sessions are read per tea.
    return sessions.list_in_progress(current_user)


@router.put("/sessions/{session_id}", response_model=TeaSession)
def upsert_session(
    session_id: str,
    req: TeaSessionWrite,
    current_user: str = Depends(get_current_user),
) -> TeaSession:
    try:
        return sessions.upsert(current_user, session_id, req)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc
    except sessions.SessionFinalisedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/sessions/{session_id}", status_code=204)
def discard_session(session_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        sessions.discard(current_user, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except sessions.SessionFinalisedError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/teas/{tea_id}/sessions", response_model=list[TeaSession])
def list_tea_sessions(tea_id: str, current_user: str = Depends(get_current_user)) -> list[TeaSession]:
    try:
        return sessions.list_for_tea(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc


@router.get("/teas/{tea_id}/curve", response_model=BrewingCurve)
def get_curve(tea_id: str, current_user: str = Depends(get_current_user)) -> BrewingCurve:
    try:
        return curves.curve_for(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && .venv/bin/pytest -v`
Expected: the whole backend suite PASSES.

- [ ] **Step 5: Commit**

```bash
cd backend && black . && ruff check .
git add app/routers/tea.py tests/test_tea_sessions_api.py
git commit -m "feat(tea): expose session upsert, discard, listing and curve routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend types and the tea form's Brewing group

**Files:**
- Modify: `frontend/src/apps/tea/types.ts`, `frontend/src/apps/tea/components/TeaForm.vue`, `frontend/src/apps/tea/stores/useTeaCabinetStore.ts`, `frontend/src/apps/tea/pages/NewTeaPage.vue`
- Modify (fixtures): every `*.spec.ts` under `frontend/src/apps/tea/` that builds a `Tea` or `TeaWrite` literal
- Test: `frontend/src/apps/tea/components/TeaForm.spec.ts` (append)

**Interfaces:**
- Produces (in `types.ts`):

```ts
// on Tea:
brewing: BrewingParameters | null;

export type SessionStatus = "in_progress" | "finalised";
export type CurveSource = "best_session" | "tea" | "almanac" | "generic";
export interface Infusion { number: number; target_seconds: number; actual_seconds: number | null; }
export interface TeaSessionWrite {
  tea_id: string; status: SessionStatus; started_at: string;
  leaf_grams: number | null; water_temp_c: number | null; rating: number | null;
  curve_source: CurveSource; curve_source_label: string; infusions: Infusion[];
}
export interface TeaSession extends TeaSessionWrite { id: string; updated_at: string; finished_at: string | null; }
export interface BrewingCurve {
  leaf_grams: number | null; water_temp_c: number | null; steep_seconds: number[];
  source: CurveSource; source_label: string;
}
```

- `TeaForm` new test ids: `field-brew-grams`, `field-brew-temp`, `field-brew-steeps`, `brew-steeps-error`.

- [ ] **Step 1: Write the failing tests**

Append inside the top-level `describe` of `frontend/src/apps/tea/components/TeaForm.spec.ts` (or as a new `describe` block at the end of the file if the file has none — keep `form()` / `blank()` helpers):

```ts
describe("TeaForm brewing", () => {
  it("patches leaf grams and water temperature into brewing", async () => {
    const wrapper = form();
    await wrapper.get("[data-testid=field-brew-grams]").setValue("7");
    const emitted = wrapper.emitted("update:modelValue")!.at(-1)![0] as TeaWrite;
    expect(emitted.brewing).toEqual({ leaf_grams: 7, water_temp_c: null, steep_seconds: [] });
  });

  it("parses a comma list of steep times", async () => {
    const wrapper = form();
    await wrapper.get("[data-testid=field-brew-steeps]").setValue("10, 15,20 ,");
    const emitted = wrapper.emitted("update:modelValue")!.at(-1)![0] as TeaWrite;
    expect(emitted.brewing?.steep_seconds).toEqual([10, 15, 20]);
    expect(wrapper.find("[data-testid=brew-steeps-error]").exists()).toBe(false);
  });

  it("flags a bad steep list and keeps the last good one", async () => {
    const wrapper = form({
      ...blank(),
      brewing: { leaf_grams: null, water_temp_c: null, steep_seconds: [10] },
    });
    await wrapper.get("[data-testid=field-brew-steeps]").setValue("10, abc");
    expect(wrapper.get("[data-testid=brew-steeps-error]").text()).toContain("whole seconds");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("collapses brewing back to null when every field is cleared", async () => {
    const wrapper = form({
      ...blank(),
      brewing: { leaf_grams: 5, water_temp_c: null, steep_seconds: [] },
    });
    await wrapper.get("[data-testid=field-brew-grams]").setValue("");
    const emitted = wrapper.emitted("update:modelValue")!.at(-1)![0] as TeaWrite;
    expect(emitted.brewing).toBeNull();
  });
});
```

Also add `brewing: null,` to `blank()` in this spec (after `image_url: null,`).

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/apps/tea/components/TeaForm.spec.ts`
Expected: FAIL — `Unable to get [data-testid=field-brew-grams]`.

- [ ] **Step 3: Implement**

`frontend/src/apps/tea/types.ts`: add `brewing: BrewingParameters | null;` to `interface Tea` directly after `image_url: string | null;`, and append the session types from **Interfaces** above at the end of the file (formatted one field per line, as the rest of the file is).

`frontend/src/apps/tea/stores/useTeaCabinetStore.ts` `toWrite`: add `brewing: tea.brewing,` after `image_url: tea.image_url,`.

`frontend/src/apps/tea/pages/NewTeaPage.vue`: in the blank `TeaWrite` literal add `brewing: null,` after `image_url: null,`.

`frontend/src/apps/tea/components/TeaForm.vue` template — insert before `<p class="form__group form__group--notes">Notes</p>`:

```vue
    <p class="form__group" data-testid="group">Brewing</p>
    <input
      class="form__field"
      data-testid="field-brew-grams"
      placeholder="Leaf (grams)"
      inputmode="decimal"
      :value="modelValue.brewing?.leaf_grams ?? ''"
      @input="patchBrewing({ leaf_grams: asNumber($event) })"
    />
    <input
      class="form__field"
      data-testid="field-brew-temp"
      placeholder="Water (°C)"
      inputmode="numeric"
      :value="modelValue.brewing?.water_temp_c ?? ''"
      @input="patchBrewing({ water_temp_c: asNumber($event) })"
    />
    <input
      class="form__field"
      data-testid="field-brew-steeps"
      placeholder="Steeps in seconds (10, 15, 20, 30)"
      inputmode="numeric"
      :value="steepsText"
      @input="onSteeps"
    />
    <span v-if="steepsError" class="form__sub" data-testid="brew-steeps-error">
      Steep times are whole seconds, like 10, 15, 20
    </span>
```

`TeaForm.vue` script — extend the type import with `BrewingParameters`, and add after `patch()`:

```ts
function patchBrewing(change: Partial<BrewingParameters>): void {
  const current = props.modelValue.brewing ?? {
    leaf_grams: null,
    water_temp_c: null,
    steep_seconds: [],
  };
  const next = { ...current, ...change };
  const empty =
    next.leaf_grams === null && next.water_temp_c === null && next.steep_seconds.length === 0;
  patch({ brewing: empty ? null : next });
}

// Held as text so "10, " survives while typing; the model only takes a list
// that fully parses.
const steepsText = ref((props.modelValue.brewing?.steep_seconds ?? []).join(", "));
const steepsError = ref(false);

function onSteeps(event: Event): void {
  steepsText.value = asText(event);
  const tokens = steepsText.value
    .split(",")
    .map((token) => token.trim())
    .filter((token) => token !== "");
  const valid = tokens.every((token) => /^\d+$/.test(token) && Number(token) > 0);
  steepsError.value = !valid;
  if (valid) patchBrewing({ steep_seconds: tokens.map(Number) });
}
```

Fixtures: add `brewing: null,` after the `image_url: null,` line in every `Tea`/`TeaWrite` factory in the tea specs. Find them with:

```bash
cd frontend && grep -rln "image_url: null" src/apps/tea --include=*.spec.ts
```

(Expected list: `shelf.spec.ts`, `filters.spec.ts`, `validation.spec.ts`, `stores/useTeaCabinetStore.spec.ts`, `components/GramsSheet.spec.ts`, `components/CabinetFilters.spec.ts`, `components/TeaForm.spec.ts`, `components/TeaCard.spec.ts`, `components/ShelfSection.spec.ts`, `pages/NewTeaPage.spec.ts`, `pages/TeaDetailPage.spec.ts`, `pages/CabinetPage.spec.ts`.) `npm run typecheck` will point at any literal that was missed.

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: all PASS, typecheck and lint clean. (Existing store tests asserting the exact PUT body of `setGrams` may need `brewing: null` in the expected object — that is the fixture change, not a behaviour change.)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): add session types and a Brewing group to the tea form

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Pure timer rules (`timer.ts`)

**Files:**
- Create: `frontend/src/apps/tea/timer.ts`
- Test: `frontend/src/apps/tea/timer.spec.ts`

**Interfaces:**
- Consumes: `BrewingCurve`, `TeaClass` from `./types`.
- Produces:

```ts
export const GENERIC_STEEPS: number[];            // [10, 15, 20, 25]
export const STEP_SECONDS: number;                // 5
export const TARGET_LEVEL: number;                // 0.85 — where the dashed line sits (fraction of cup depth)
export const CUP_LIQUOR: Record<TeaClass, string>;
export function genericCurve(label?: string): BrewingCurve;
export function targetFor(steeps: number[], infusionNumber: number): number;
export function fillLevel(elapsedSeconds: number, targetSeconds: number): number;   // 0..1
export function overSteep(elapsedSeconds: number, targetSeconds: number): number;   // 0..1
export function darken(hex: string, amount: number): string;
export function formatElapsed(seconds: number): string;  // "m:ss"
export function newSessionId(): string;                  // "s-" + 32 hex chars
```

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/timer.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  CUP_LIQUOR,
  TARGET_LEVEL,
  darken,
  fillLevel,
  formatElapsed,
  genericCurve,
  newSessionId,
  overSteep,
  targetFor,
} from "./timer";

describe("targetFor", () => {
  it("reads the curve, then extends by 5s past its end", () => {
    expect(targetFor([20, 25, 30], 1)).toBe(20);
    expect(targetFor([20, 25, 30], 3)).toBe(30);
    expect(targetFor([20, 25, 30], 5)).toBe(40);
  });

  it("falls back to the generic curve for an empty list", () => {
    expect(targetFor([], 1)).toBe(10);
    expect(targetFor([], 6)).toBe(35);
  });
});

describe("genericCurve", () => {
  it("is the generic source with its label", () => {
    const curve = genericCurve();
    expect(curve.source).toBe("generic");
    expect(curve.source_label).toBe("generic gongfu");
    expect(curve.steep_seconds).toEqual([10, 15, 20, 25]);
    expect(genericCurve("generic gongfu (couldn't load tea curve)").source_label).toContain(
      "couldn't",
    );
  });
});

describe("fillLevel", () => {
  it("is empty at 0, reaches the line at the target, stops at the rim", () => {
    expect(fillLevel(0, 20)).toBe(0);
    expect(fillLevel(10, 20)).toBeCloseTo(TARGET_LEVEL / 2);
    expect(fillLevel(20, 20)).toBeCloseTo(TARGET_LEVEL);
    expect(fillLevel(30, 20)).toBeGreaterThan(TARGET_LEVEL);
    expect(fillLevel(40, 20)).toBe(1);
    expect(fillLevel(400, 20)).toBe(1);
  });

  it("never divides by a zero target", () => {
    expect(fillLevel(5, 0)).toBe(0);
  });
});

describe("overSteep", () => {
  it("is 0 up to the target and grows to 1 at twice the target", () => {
    expect(overSteep(20, 20)).toBe(0);
    expect(overSteep(30, 20)).toBeCloseTo(0.5);
    expect(overSteep(90, 20)).toBe(1);
  });
});

describe("colours", () => {
  it("has the cup palette chosen in the design session", () => {
    expect(CUP_LIQUOR.oolong).toBe("#d49a3f");
    expect(CUP_LIQUOR.other).toBe("#bdb56a");
  });

  it("darken(…, 0) is identity and darken(…, 1) is darker", () => {
    expect(darken("#d49a3f", 0)).toBe("#d49a3f");
    expect(darken("#d49a3f", 1)).not.toBe("#d49a3f");
    expect(darken("#ffffff", 1)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("formatElapsed", () => {
  it("renders m:ss", () => {
    expect(formatElapsed(0)).toBe("0:00");
    expect(formatElapsed(17.6)).toBe("0:17");
    expect(formatElapsed(75)).toBe("1:15");
  });
});

describe("newSessionId", () => {
  it("mints distinct ids", () => {
    const a = newSessionId();
    expect(a).toMatch(/^s-[0-9a-f]{32}$/);
    expect(newSessionId()).not.toBe(a);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/apps/tea/timer.spec.ts`
Expected: FAIL — cannot resolve `./timer`.

- [ ] **Step 3: Implement**

Create `frontend/src/apps/tea/timer.ts`:

```ts
// Pure rules for the Session Timer: targets, the cup's fill, its colours.
// No Vue, no stores — unit-tested without mounting anything.

import type { BrewingCurve, TeaClass } from "./types";

export const GENERIC_STEEPS = [10, 15, 20, 25];
export const STEP_SECONDS = 5;

// The dashed target line sits this far up the cup, leaving room above it for an
// over-steep to be visible before the liquor reaches the rim.
export const TARGET_LEVEL = 0.85;

// Brighter than the shelf's `CLASS_TOKENS.liquor`: the shelf mutes liquor into a
// palette, the cup shows it as it looks poured (chosen in the design session,
// see the Session Timer spec).
export const CUP_LIQUOR: Record<TeaClass, string> = {
  green: "#d6cf86",
  yellow: "#e3c65e",
  white: "#ead9a4",
  oolong: "#d49a3f",
  red: "#a8492a",
  dark: "#5e2e17",
  other: "#bdb56a",
};

export function genericCurve(label = "generic gongfu"): BrewingCurve {
  return {
    leaf_grams: null,
    water_temp_c: null,
    steep_seconds: [...GENERIC_STEEPS],
    source: "generic",
    source_label: label,
  };
}

/** The suggested seconds for infusion `infusionNumber` (1-based). */
export function targetFor(steeps: number[], infusionNumber: number): number {
  const list = steeps.length > 0 ? steeps : GENERIC_STEEPS;
  if (infusionNumber <= list.length) return list[infusionNumber - 1];
  return list[list.length - 1] + STEP_SECONDS * (infusionNumber - list.length);
}

export function fillLevel(elapsedSeconds: number, targetSeconds: number): number {
  if (targetSeconds <= 0) return 0;
  const ratio = elapsedSeconds / targetSeconds;
  if (ratio <= 1) return ratio * TARGET_LEVEL;
  // Past the target the liquor climbs the last stretch over one more target's
  // length, then stops at the rim.
  return Math.min(1, TARGET_LEVEL + (ratio - 1) * (1 - TARGET_LEVEL));
}

export function overSteep(elapsedSeconds: number, targetSeconds: number): number {
  if (targetSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, elapsedSeconds / targetSeconds - 1));
}

/** Mix `hex` toward black; `amount` 1 is the darkest an over-steep gets. */
export function darken(hex: string, amount: number): string {
  const keep = 1 - 0.45 * Math.min(1, Math.max(0, amount));
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${channels
    .map((c) => Math.round(c * keep).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// getRandomValues rather than randomUUID: randomUUID only exists in secure
// contexts, and the dock may be reached over plain http on the LAN.
export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `s-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/apps/tea/timer.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/timer.ts frontend/src/apps/tea/timer.spec.ts
git commit -m "feat(tea): add pure timer rules — targets, cup fill, liquor colours

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Clock, wake lock and chime composables

**Files:**
- Create: `frontend/src/apps/tea/composables/useSteepClock.ts`, `useWakeLock.ts`, `useTargetChime.ts`
- Test: `useSteepClock.spec.ts`, `useWakeLock.spec.ts`, `useTargetChime.spec.ts` (same folder)

**Interfaces:**
- Produces:
  - `useSteepClock(startedAt: Ref<number | null>, now?: () => number): { elapsed: ComputedRef<number> }` — seconds (float) since `startedAt` (epoch ms), `0` when `null`; ticks every 200 ms while running. Elapsed is derived from the wall clock, so a throttled or backgrounded tab reads correctly on the next tick.
  - `useWakeLock(active: Ref<boolean>): void` — holds a screen wake lock while `active`; re-acquires on `visibilitychange` → visible; silently no-ops when `navigator.wakeLock` is missing or the request rejects.
  - `useTargetChime(elapsed: Ref<number>, target: Ref<number | null>, enabled: Ref<boolean>): { unlock: () => void }` — plays once per steep when `elapsed` crosses `target`, if `enabled`; re-arms when `elapsed` drops below `target`. `unlock()` must be called from a tap (creates/resumes the `AudioContext`).

The composables use `watch` / `onScopeDispose`, so tests run them inside `effectScope()`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/apps/tea/composables/useSteepClock.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useSteepClock } from "./useSteepClock";

afterEach(() => {
  vi.useRealTimers();
});

describe("useSteepClock", () => {
  it("is 0 while stopped and counts up from startedAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
    const startedAt = ref<number | null>(null);
    const scope = effectScope();
    const { elapsed } = scope.run(() => useSteepClock(startedAt))!;

    expect(elapsed.value).toBe(0);
    startedAt.value = Date.now();
    await nextTick();
    vi.advanceTimersByTime(3000);
    expect(elapsed.value).toBeCloseTo(3, 0);
    scope.stop();
  });

  it("reads the wall clock after a background gap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
    const startedAt = ref<number | null>(Date.now());
    const scope = effectScope();
    const { elapsed } = scope.run(() => useSteepClock(startedAt))!;

    // The tab was throttled: no intervals ran, but a minute passed.
    vi.setSystemTime(new Date("2026-09-26T18:01:00Z"));
    vi.advanceTimersByTime(200);
    expect(elapsed.value).toBeCloseTo(60, 0);
    scope.stop();
  });
});
```

`frontend/src/apps/tea/composables/useWakeLock.spec.ts`:

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { useWakeLock } from "./useWakeLock";

function installWakeLock() {
  const release = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn().mockResolvedValue({ release });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, release };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("useWakeLock", () => {
  it("requests a screen lock while active and releases it after", async () => {
    const { request, release } = installWakeLock();
    const active = ref(true);
    const scope = effectScope();
    scope.run(() => useWakeLock(active));
    await flushPromises();
    expect(request).toHaveBeenCalledWith("screen");

    active.value = false;
    await nextTick();
    await flushPromises();
    expect(release).toHaveBeenCalled();
    scope.stop();
  });

  it("re-acquires when the page becomes visible again", async () => {
    const { request } = installWakeLock();
    const scope = effectScope();
    scope.run(() => useWakeLock(ref(true)));
    await flushPromises();

    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(request).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("does nothing where the API is missing", async () => {
    const scope = effectScope();
    expect(() => scope.run(() => useWakeLock(ref(true)))).not.toThrow();
    await flushPromises();
    scope.stop();
  });
});
```

`frontend/src/apps/tea/composables/useTargetChime.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useTargetChime } from "./useTargetChime";

const started = vi.fn();

class FakeContext {
  currentTime = 0;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  createOscillator() {
    return {
      type: "",
      frequency: { value: 0 },
      connect: (node: unknown) => node,
      start: started,
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: (node: unknown) => node,
    };
  }
}

beforeEach(() => {
  started.mockReset();
  vi.stubGlobal("AudioContext", FakeContext);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(enabled: boolean) {
  const elapsed = ref(0);
  const target = ref<number | null>(20);
  const scope = effectScope();
  const { unlock } = scope.run(() => useTargetChime(elapsed, target, ref(enabled)))!;
  return { elapsed, target, unlock, scope };
}

describe("useTargetChime", () => {
  it("chimes once when the target is crossed", async () => {
    const { elapsed, unlock, scope } = setup(true);
    unlock();
    elapsed.value = 19;
    await nextTick();
    expect(started).not.toHaveBeenCalled();
    elapsed.value = 20.1;
    await nextTick();
    elapsed.value = 25;
    await nextTick();
    expect(started).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("re-arms for the next steep", async () => {
    const { elapsed, unlock, scope } = setup(true);
    unlock();
    elapsed.value = 21;
    await nextTick();
    elapsed.value = 0;
    await nextTick();
    elapsed.value = 22;
    await nextTick();
    expect(started).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("stays silent when disabled or never unlocked", async () => {
    const off = setup(false);
    off.unlock();
    off.elapsed.value = 30;
    await nextTick();
    const locked = setup(true);
    locked.elapsed.value = 30;
    await nextTick();
    expect(started).not.toHaveBeenCalled();
    off.scope.stop();
    locked.scope.stop();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/apps/tea/composables`
Expected: FAIL — cannot resolve the three modules (the existing `useSectionInView` spec still passes).

- [ ] **Step 3: Implement**

`frontend/src/apps/tea/composables/useSteepClock.ts`:

```ts
import { computed, onScopeDispose, ref, watch, type Ref } from "vue";

/**
 * Seconds since `startedAt`, recomputed from the wall clock on every tick —
 * never by counting ticks, so a throttled or backgrounded tab is right again
 * the moment it next runs.
 */
export function useSteepClock(startedAt: Ref<number | null>, now: () => number = () => Date.now()) {
  const current = ref(now());
  let handle: ReturnType<typeof setInterval> | null = null;

  function stopTicking(): void {
    if (handle !== null) clearInterval(handle);
    handle = null;
  }

  watch(
    startedAt,
    (value) => {
      stopTicking();
      current.value = now();
      if (value !== null) handle = setInterval(() => (current.value = now()), 200);
    },
    { immediate: true },
  );
  onScopeDispose(stopTicking);

  const elapsed = computed(() =>
    startedAt.value === null ? 0 : Math.max(0, (current.value - startedAt.value) / 1000),
  );
  return { elapsed };
}
```

`frontend/src/apps/tea/composables/useWakeLock.ts`:

```ts
import { onScopeDispose, watch, type Ref } from "vue";

/**
 * Keeps the screen on while `active`. Browsers drop the lock whenever the tab
 * is hidden, so it is taken again on return. Unsupported browsers (and
 * insecure origins, where the API is absent) just get no lock.
 */
export function useWakeLock(active: Ref<boolean>): void {
  let sentinel: WakeLockSentinel | null = null;

  async function acquire(): Promise<void> {
    if (!("wakeLock" in navigator) || sentinel !== null) return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
    } catch {
      sentinel = null;
    }
  }

  async function release(): Promise<void> {
    const held = sentinel;
    sentinel = null;
    await held?.release().catch(() => undefined);
  }

  function onVisibility(): void {
    if (document.visibilityState !== "visible" || !active.value) return;
    sentinel = null;
    void acquire();
  }

  watch(active, (on) => void (on ? acquire() : release()), { immediate: true });
  document.addEventListener("visibilitychange", onVisibility);
  onScopeDispose(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    void release();
  });
}
```

`frontend/src/apps/tea/composables/useTargetChime.ts`:

```ts
import { watch, type Ref } from "vue";

/**
 * A soft chime the moment a steep reaches its target. Mobile browsers only
 * allow audio after a user gesture, so `unlock()` is called from the Start tap.
 */
export function useTargetChime(
  elapsed: Ref<number>,
  target: Ref<number | null>,
  enabled: Ref<boolean>,
): { unlock: () => void } {
  let context: AudioContext | null = null;
  let fired = false;

  function unlock(): void {
    if (context) {
      void context.resume();
      return;
    }
    if (typeof AudioContext === "undefined") return;
    context = new AudioContext();
  }

  function play(): void {
    if (!context) return;
    const at = context.currentTime;
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = "sine";
    tone.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
    tone.connect(gain).connect(context.destination);
    tone.start(at);
    tone.stop(at + 1.5);
  }

  watch([elapsed, target], ([seconds, goal]) => {
    if (goal === null || seconds < goal) {
      fired = false;
      return;
    }
    if (fired) return;
    fired = true;
    if (enabled.value) play();
  });

  return { unlock };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/apps/tea/composables && npm run typecheck`
Expected: PASS; typecheck clean (`WakeLockSentinel` and `navigator.wakeLock` come from TS's DOM lib).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/composables
git commit -m "feat(tea): add steep clock, wake lock and target chime composables

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The live timer store (`useTeaTimerStore`)

**Files:**
- Create: `frontend/src/apps/tea/stores/useTeaTimerStore.ts`
- Test: `frontend/src/apps/tea/stores/useTeaTimerStore.spec.ts`

**Interfaces:**
- Consumes: `api.get/put/del`; `timer.ts` (`genericCurve`, `targetFor`, `newSessionId`, `CUP_LIQUOR`, `STEP_SECONDS`); types `Tea`, `TeaClass`, `BrewingCurve`, `Infusion`, `TeaSession`, `TeaSessionWrite`.
- Produces `useTeaTimerStore()` (Pinia id `tea-timer`) with:
  - state: `live: Ref<LiveSession | null>`, `unsynced: Ref<boolean>`, `loading: Ref<boolean>`, `error: Ref<string | null>`, `notice: Ref<string | null>`, `chimeOn: Ref<boolean>`
  - getters: `current: ComputedRef<Infusion | null>` (the last infusion — always the pending one), `running: ComputedRef<boolean>`, `brewed: ComputedRef<Infusion[]>` (infusions with a recorded time), `liquor: ComputedRef<string>`
  - actions: `start(): void`, `stop(): Promise<void>`, `nudge(deltaSeconds: number): void`, `redoLast(): Promise<void>`, `attachTea(tea: Tea): Promise<void>`, `setLeafGrams(g: number | null): void`, `setWaterTemp(c: number | null): void`, `push(): Promise<void>`, `finish(rating: number | null): Promise<string | null>` (returns the tea id on success), `end(): void`, `discard(): Promise<boolean>`, `resume(session: TeaSession, tea: Tea): void`, `toggleChime(): void`
  - exported type:

```ts
export interface LiveTea { id: string; name: string; class_id: TeaClass; grams_remaining: number; }
export interface LiveSession {
  version: 1;
  sessionId: string;
  startedAt: string;              // ISO, sent to the server
  tea: LiveTea | null;
  curve: BrewingCurve;
  leafGrams: number | null;
  waterTempC: number | null;
  infusions: Infusion[];          // always ends with the pending (actual_seconds: null) infusion
  steepStartedAt: number | null;  // epoch ms of the running steep
  pushed: boolean;                // ever reached the server
}
```

  - `localStorage` keys: `tea-timer:live` (the `LiveSession` JSON), `tea-timer:chime` (`"1"` / `"0"`, default on).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/stores/useTeaTimerStore.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: delMock, post: vi.fn() },
}));

import { useTeaTimerStore } from "./useTeaTimerStore";
import type { BrewingCurve, Tea, TeaSession } from "../types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Tieguanyin",
    catalogue_node_id: "oolong.anxi.tieguanyin",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 42,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    brewing: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

const ALMANAC: BrewingCurve = {
  leaf_grams: 6,
  water_temp_c: 95,
  steep_seconds: [20, 25, 30, 40],
  source: "almanac",
  source_label: "almanac: Tieguanyin",
};

function httpError(status: number): Error {
  return Object.assign(new Error(`${status}`), { status, detail: `HTTP ${status}` });
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  getMock.mockReset();
  putMock.mockReset().mockImplementation((_path: string, body: unknown) => Promise.resolve(body));
  delMock.mockReset().mockResolvedValue(undefined);
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

async function steep(store: ReturnType<typeof useTeaTimerStore>, seconds: number) {
  store.start();
  vi.setSystemTime(Date.now() + seconds * 1000);
  await store.stop();
}

describe("plain timer", () => {
  it("starts on the generic curve and never touches the server", async () => {
    const store = useTeaTimerStore();
    await steep(store, 11);
    expect(store.brewed.map((i) => i.actual_seconds)).toEqual([11]);
    expect(store.current).toEqual({ number: 2, target_seconds: 15, actual_seconds: null });
    expect(store.live?.curve.source).toBe("generic");
    expect(putMock).not.toHaveBeenCalled();
  });

  it("nudges only the upcoming target, never below 1s", () => {
    const store = useTeaTimerStore();
    store.nudge(5);
    expect(store.current?.target_seconds).toBe(15);
    store.nudge(-100);
    expect(store.current?.target_seconds).toBe(1);
  });

  it("redo clears the last steep and drops the pending one", async () => {
    const store = useTeaTimerStore();
    await steep(store, 11);
    await steep(store, 16);
    await store.redoLast();
    expect(store.live?.infusions).toEqual([
      { number: 1, target_seconds: 10, actual_seconds: 11 },
      { number: 2, target_seconds: 15, actual_seconds: null },
    ]);
  });

  it("end clears everything", async () => {
    const store = useTeaTimerStore();
    await steep(store, 11);
    store.end();
    expect(store.live).toBeNull();
    expect(localStorage.getItem("tea-timer:live")).toBeNull();
  });
});

describe("attaching a tea", () => {
  it("re-targets unbrewed steeps only, prefills grams and pushes", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await steep(store, 11);
    await store.attachTea(tea());

    expect(getMock).toHaveBeenCalledWith("/tea/teas/t-1/curve");
    expect(store.live?.infusions).toEqual([
      { number: 1, target_seconds: 10, actual_seconds: 11 },
      { number: 2, target_seconds: 25, actual_seconds: null },
    ]);
    expect(store.live?.leafGrams).toBe(6);
    expect(store.liquor).toBe("#d49a3f");
    const [path, body] = putMock.mock.calls[0];
    expect(path).toBe(`/tea/sessions/${store.live?.sessionId}`);
    expect(body).toMatchObject({ tea_id: "t-1", status: "in_progress", curve_source: "almanac" });
    expect(store.live?.pushed).toBe(true);
  });

  it("keeps a running steep running while it re-targets", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    store.start();
    await store.attachTea(tea());
    expect(store.running).toBe(true);
    expect(store.current?.target_seconds).toBe(20);
  });

  it("falls back to generic with a label when the curve cannot load", async () => {
    getMock.mockRejectedValue(httpError(0));
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    expect(store.live?.curve.source).toBe("generic");
    expect(store.live?.curve.source_label).toBe("generic gongfu (couldn't load tea curve)");
  });

  it("pushes after every steep once a tea is attached", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await steep(store, 21);
    expect(putMock).toHaveBeenCalledTimes(2);
  });
});

describe("sync failures", () => {
  it("marks unsynced on a failed push and clears it on the next success", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    putMock.mockRejectedValueOnce(httpError(0));
    await store.attachTea(tea());
    expect(store.unsynced).toBe(true);
    await steep(store, 21);
    expect(store.unsynced).toBe(false);
  });

  it("detaches the tea when the server says it is gone", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(404));
    await steep(store, 21);
    expect(store.live?.tea).toBeNull();
    expect(store.brewed.map((i) => i.actual_seconds)).toEqual([21]);
    expect(store.notice).toContain("Tieguanyin");
    expect(store.unsynced).toBe(false);
  });
});

describe("finishing", () => {
  it("finalises with the rating, clears, and returns the tea id", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    await steep(store, 21);
    const teaId = await store.finish(5);
    expect(teaId).toBe("t-1");
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({
      status: "finalised",
      rating: 5,
      leaf_grams: 6,
    });
    expect(store.live).toBeNull();
  });

  it("treats a 409 as already finished", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(409));
    expect(await store.finish(null)).toBe("t-1");
    expect(store.live).toBeNull();
  });

  it("keeps the session and reports the error when finishing fails", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockRejectedValueOnce(httpError(500));
    expect(await store.finish(4)).toBeNull();
    expect(store.live).not.toBeNull();
    expect(store.error).toBe("HTTP 500");
    expect(store.loading).toBe(false);
  });
});

describe("discard", () => {
  it("deletes a pushed session on the server", async () => {
    getMock.mockResolvedValue(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    const id = store.live!.sessionId;
    expect(await store.discard()).toBe(true);
    expect(delMock).toHaveBeenCalledWith(`/tea/sessions/${id}`);
    expect(store.live).toBeNull();
  });

  it("clears a never-pushed session without a request", async () => {
    const store = useTeaTimerStore();
    store.start();
    expect(await store.discard()).toBe(true);
    expect(delMock).not.toHaveBeenCalled();
  });
});

describe("persistence", () => {
  it("hydrates a running steep and records the whole elapsed time", async () => {
    const first = useTeaTimerStore();
    first.start();

    // Reload 45 seconds later.
    vi.setSystemTime(Date.now() + 45_000);
    setActivePinia(createPinia());
    const reloaded = useTeaTimerStore();
    expect(reloaded.running).toBe(true);
    await reloaded.stop();
    expect(reloaded.brewed[0].actual_seconds).toBe(45);
  });

  it("drops an invalid saved session", () => {
    localStorage.setItem("tea-timer:live", '{"version":1,"infusions":"nope"}');
    const store = useTeaTimerStore();
    expect(store.live).toBeNull();
    expect(localStorage.getItem("tea-timer:live")).toBeNull();
  });

  it("remembers the chime toggle", () => {
    const store = useTeaTimerStore();
    expect(store.chimeOn).toBe(true);
    store.toggleChime();
    setActivePinia(createPinia());
    expect(useTeaTimerStore().chimeOn).toBe(false);
  });
});

describe("resume", () => {
  it("loads a server snapshot and adds the pending steep", () => {
    const session: TeaSession = {
      id: "s-abc",
      tea_id: "t-1",
      status: "in_progress",
      started_at: "2026-09-25T19:40:00Z",
      updated_at: "2026-09-25T19:55:00Z",
      finished_at: null,
      leaf_grams: 6,
      water_temp_c: 95,
      rating: null,
      curve_source: "almanac",
      curve_source_label: "almanac: Tieguanyin",
      infusions: [{ number: 1, target_seconds: 20, actual_seconds: 22 }],
    };
    const store = useTeaTimerStore();
    store.resume(session, tea());
    expect(store.live?.sessionId).toBe("s-abc");
    expect(store.live?.pushed).toBe(true);
    expect(store.current).toEqual({ number: 2, target_seconds: 25, actual_seconds: null });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaTimerStore.spec.ts`
Expected: FAIL — cannot resolve `./useTeaTimerStore`.

- [ ] **Step 3: Implement**

Create `frontend/src/apps/tea/stores/useTeaTimerStore.ts`:

```ts
import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { CUP_LIQUOR, genericCurve, newSessionId, targetFor } from "@/apps/tea/timer";
import type {
  BrewingCurve,
  Infusion,
  Tea,
  TeaClass,
  TeaSession,
  TeaSessionWrite,
} from "@/apps/tea/types";

export interface LiveTea {
  id: string;
  name: string;
  class_id: TeaClass;
  grams_remaining: number;
}

export interface LiveSession {
  version: 1;
  sessionId: string;
  startedAt: string;
  tea: LiveTea | null;
  curve: BrewingCurve;
  leafGrams: number | null;
  waterTempC: number | null;
  infusions: Infusion[];
  steepStartedAt: number | null;
  pushed: boolean;
}

const LIVE_KEY = "tea-timer:live";
const CHIME_KEY = "tea-timer:chime";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

function statusOf(e: unknown): number | null {
  if (e && typeof e === "object" && "status" in e) {
    const status = (e as { status: unknown }).status;
    if (typeof status === "number") return status;
  }
  return null;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode or blocked storage: the timer still works, it just won't
    // survive a reload.
  }
}

function isLiveSession(value: unknown): value is LiveSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.version === 1 &&
    typeof v.sessionId === "string" &&
    typeof v.startedAt === "string" &&
    Array.isArray(v.infusions) &&
    v.infusions.length > 0 &&
    typeof v.curve === "object" &&
    v.curve !== null &&
    (v.steepStartedAt === null || typeof v.steepStartedAt === "number")
  );
}

function hydrate(): LiveSession | null {
  const raw = read(LIVE_KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isLiveSession(parsed)) return parsed;
  } catch {
    // fall through
  }
  write(LIVE_KEY, null);
  return null;
}

function liveTea(tea: Tea): LiveTea {
  return {
    id: tea.id,
    name: tea.name,
    class_id: tea.class_id,
    grams_remaining: tea.grams_remaining,
  };
}

export const useTeaTimerStore = defineStore("tea-timer", () => {
  const live = ref<LiveSession | null>(hydrate());
  const unsynced = ref(false);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const notice = ref<string | null>(null);
  const chimeOn = ref(read(CHIME_KEY) !== "0");

  // Synchronous so a reload straight after a tap still finds the tap saved.
  watch(live, (value) => write(LIVE_KEY, value === null ? null : JSON.stringify(value)), {
    deep: true,
    flush: "sync",
  });

  const current = computed(() => live.value?.infusions.at(-1) ?? null);
  const running = computed(() => live.value?.steepStartedAt != null);
  const brewed = computed(
    () => live.value?.infusions.filter((i) => i.actual_seconds !== null) ?? [],
  );
  const liquor = computed(() => CUP_LIQUOR[live.value?.tea?.class_id ?? "other"]);

  function ensureSession(): LiveSession {
    if (live.value === null) {
      const curve = genericCurve();
      live.value = {
        version: 1,
        sessionId: newSessionId(),
        startedAt: new Date().toISOString(),
        tea: null,
        curve,
        leafGrams: null,
        waterTempC: null,
        infusions: [{ number: 1, target_seconds: targetFor(curve.steep_seconds, 1), actual_seconds: null }],
        steepStartedAt: null,
        pushed: false,
      };
    }
    return live.value;
  }

  function snapshot(session: LiveSession, status: TeaSessionWrite["status"], rating: number | null): TeaSessionWrite {
    return {
      tea_id: session.tea!.id,
      status,
      started_at: session.startedAt,
      leaf_grams: session.leafGrams,
      water_temp_c: session.waterTempC,
      rating,
      curve_source: session.curve.source,
      curve_source_label: session.curve.source_label,
      infusions: session.infusions,
    };
  }

  function clear(): void {
    live.value = null;
    unsynced.value = false;
    error.value = null;
  }

  async function push(): Promise<void> {
    const session = live.value;
    if (!session?.tea) return;
    try {
      await api.put<TeaSession>(`/tea/sessions/${session.sessionId}`, {
        ...snapshot(session, "in_progress", null),
      });
      session.pushed = true;
      unsynced.value = false;
    } catch (e) {
      if (statusOf(e) === 404) {
        // The tea was removed elsewhere: keep timing as a plain timer rather
        // than retrying a push that can never land.
        notice.value = `${session.tea.name} is no longer in your cabinet — carrying on as a plain timer.`;
        session.tea = null;
        unsynced.value = false;
        return;
      }
      unsynced.value = true;
    }
  }

  function start(): void {
    const session = ensureSession();
    if (session.steepStartedAt === null) session.steepStartedAt = Date.now();
  }

  async function stop(): Promise<void> {
    const session = live.value;
    if (!session || session.steepStartedAt === null) return;
    const pending = session.infusions.at(-1)!;
    pending.actual_seconds = Math.max(0, Math.round((Date.now() - session.steepStartedAt) / 1000));
    session.steepStartedAt = null;
    const next = pending.number + 1;
    session.infusions.push({
      number: next,
      target_seconds: targetFor(session.curve.steep_seconds, next),
      actual_seconds: null,
    });
    await push();
  }

  function nudge(deltaSeconds: number): void {
    const pending = ensureSession().infusions.at(-1)!;
    pending.target_seconds = Math.max(1, pending.target_seconds + deltaSeconds);
  }

  async function redoLast(): Promise<void> {
    const session = live.value;
    if (!session || session.steepStartedAt !== null || session.infusions.length < 2) return;
    session.infusions.pop();
    session.infusions.at(-1)!.actual_seconds = null;
    await push();
  }

  async function attachTea(tea: Tea): Promise<void> {
    const session = ensureSession();
    let curve: BrewingCurve;
    try {
      curve = await api.get<BrewingCurve>(`/tea/teas/${tea.id}/curve`);
    } catch {
      curve = genericCurve("generic gongfu (couldn't load tea curve)");
    }
    session.tea = liveTea(tea);
    session.curve = curve;
    session.leafGrams = curve.leaf_grams;
    session.waterTempC = curve.water_temp_c;
    session.infusions = session.infusions.map((i) =>
      i.actual_seconds === null ? { ...i, target_seconds: targetFor(curve.steep_seconds, i.number) } : i,
    );
    notice.value = null;
    await push();
  }

  function setLeafGrams(grams: number | null): void {
    if (live.value) live.value.leafGrams = grams !== null && grams > 0 ? grams : null;
  }

  function setWaterTemp(celsius: number | null): void {
    if (live.value) live.value.waterTempC = celsius;
  }

  async function finish(rating: number | null): Promise<string | null> {
    const session = live.value;
    if (!session?.tea) return null;
    const teaId = session.tea.id;
    loading.value = true;
    try {
      await api.put<TeaSession>(`/tea/sessions/${session.sessionId}`, {
        ...snapshot(session, "finalised", rating),
      });
      clear();
      return teaId;
    } catch (e) {
      // 409: an earlier attempt landed but its response was lost.
      if (statusOf(e) === 409) {
        clear();
        return teaId;
      }
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  function end(): void {
    clear();
    notice.value = null;
  }

  async function discard(): Promise<boolean> {
    const session = live.value;
    if (!session) return true;
    if (session.pushed) {
      loading.value = true;
      try {
        await api.del(`/tea/sessions/${session.sessionId}`);
      } catch (e) {
        if (statusOf(e) !== 404) {
          error.value = message(e);
          return false;
        }
      } finally {
        loading.value = false;
      }
    }
    end();
    return true;
  }

  function resume(session: TeaSession, tea: Tea): void {
    const infusions = session.infusions.map((i) => ({ ...i }));
    const curve: BrewingCurve = {
      leaf_grams: session.leaf_grams,
      water_temp_c: session.water_temp_c,
      steep_seconds: infusions.map((i) => i.target_seconds),
      source: session.curve_source,
      source_label: session.curve_source_label,
    };
    const last = infusions.at(-1);
    if (!last || last.actual_seconds !== null) {
      const next = (last?.number ?? 0) + 1;
      infusions.push({
        number: next,
        target_seconds: targetFor(curve.steep_seconds, next),
        actual_seconds: null,
      });
    }
    live.value = {
      version: 1,
      sessionId: session.id,
      startedAt: session.started_at,
      tea: liveTea(tea),
      curve,
      leafGrams: session.leaf_grams,
      waterTempC: session.water_temp_c,
      infusions,
      steepStartedAt: null,
      pushed: true,
    };
    unsynced.value = false;
  }

  function toggleChime(): void {
    chimeOn.value = !chimeOn.value;
    write(CHIME_KEY, chimeOn.value ? "1" : "0");
  }

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      if (unsynced.value) void push();
    });
  }

  return {
    live,
    unsynced,
    loading,
    error,
    notice,
    chimeOn,
    current,
    running,
    brewed,
    liquor,
    start,
    stop,
    nudge,
    redoLast,
    attachTea,
    setLeafGrams,
    setWaterTemp,
    push,
    finish,
    end,
    discard,
    resume,
    toggleChime,
  };
});
```

Notes for the implementer:
- The persistence watcher is `flush: "sync"`: the reload test creates a second Pinia in the same tick as `start()`, and a pre-flush watcher would not have written yet.
- If eslint rejects the non-null assertions (`session.tea!`, `.at(-1)!`), replace each with an explicit guard that returns early — the invariants (a tea exists when `snapshot` is called; `infusions` is never empty) hold, so the guard never fires.
- `resume`: the resumed session's future targets extend from its own recorded targets (the original curve is not re-fetched — the phone owns the session from here).

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaTimerStore.spec.ts && npm run typecheck && npm run lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/stores/useTeaTimerStore.ts frontend/src/apps/tea/stores/useTeaTimerStore.spec.ts
git commit -m "feat(tea): add the live timer store with snapshot sync and local persistence

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Server-side sessions store (`useTeaSessionsStore`)

**Files:**
- Create: `frontend/src/apps/tea/stores/useTeaSessionsStore.ts`
- Test: `frontend/src/apps/tea/stores/useTeaSessionsStore.spec.ts`

**Interfaces:**
- Produces `useTeaSessionsStore()` (Pinia id `tea-sessions`):
  - `inProgress: Ref<TeaSession[]>`, `byTea: Ref<Record<string, TeaSession[]>>`, `loading`, `error`
  - `fetchInProgress(): Promise<void>` — `GET /tea/sessions?status=in_progress`
  - `fetchForTea(teaId: string): Promise<void>` — `GET /tea/teas/{teaId}/sessions` into `byTea[teaId]`
  - `discard(sessionId: string): Promise<void>` — `DELETE /tea/sessions/{id}` (404 counts as done), then `forget`
  - `forget(sessionId: string): void` — drop from `inProgress`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/stores/useTeaSessionsStore.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, delMock } = vi.hoisted(() => ({ getMock: vi.fn(), delMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, del: delMock, put: vi.fn(), post: vi.fn() },
}));

import { useTeaSessionsStore } from "./useTeaSessionsStore";
import type { TeaSession } from "../types";

function session(id: string, overrides: Partial<TeaSession> = {}): TeaSession {
  return {
    id,
    tea_id: "t-1",
    status: "in_progress",
    started_at: "2026-09-25T19:40:00Z",
    updated_at: "2026-09-25T19:55:00Z",
    finished_at: null,
    leaf_grams: 6,
    water_temp_c: 95,
    rating: null,
    curve_source: "almanac",
    curve_source_label: "almanac: Tieguanyin",
    infusions: [],
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  delMock.mockReset();
});

describe("useTeaSessionsStore", () => {
  it("fetches in-progress sessions", async () => {
    getMock.mockResolvedValue([session("s-1")]);
    const store = useTeaSessionsStore();
    await store.fetchInProgress();
    expect(getMock).toHaveBeenCalledWith("/tea/sessions?status=in_progress");
    expect(store.inProgress.map((s) => s.id)).toEqual(["s-1"]);
    expect(store.loading).toBe(false);
  });

  it("fetches a tea's finished sessions", async () => {
    getMock.mockResolvedValue([session("s-2", { status: "finalised" })]);
    const store = useTeaSessionsStore();
    await store.fetchForTea("t-1");
    expect(getMock).toHaveBeenCalledWith("/tea/teas/t-1/sessions");
    expect(store.byTea["t-1"].map((s) => s.id)).toEqual(["s-2"]);
  });

  it("routes a failure into error", async () => {
    getMock.mockRejectedValue(Object.assign(new Error("x"), { detail: "Server down" }));
    const store = useTeaSessionsStore();
    await store.fetchInProgress();
    expect(store.error).toBe("Server down");
    expect(store.loading).toBe(false);
  });

  it("discards on the server and forgets locally, treating 404 as done", async () => {
    getMock.mockResolvedValue([session("s-1"), session("s-2")]);
    delMock.mockRejectedValueOnce(Object.assign(new Error("404"), { status: 404 }));
    const store = useTeaSessionsStore();
    await store.fetchInProgress();
    await store.discard("s-1");
    expect(delMock).toHaveBeenCalledWith("/tea/sessions/s-1");
    expect(store.inProgress.map((s) => s.id)).toEqual(["s-2"]);
    expect(store.error).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaSessionsStore.spec.ts`
Expected: FAIL — cannot resolve the module.

- [ ] **Step 3: Implement**

Create `frontend/src/apps/tea/stores/useTeaSessionsStore.ts`:

```ts
import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { TeaSession } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Sessions as the server holds them: unfinished ones to recover, finished ones per tea. */
export const useTeaSessionsStore = defineStore("tea-sessions", () => {
  const inProgress = ref<TeaSession[]>([]);
  const byTea = ref<Record<string, TeaSession[]>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchInProgress(): Promise<void> {
    loading.value = true;
    try {
      inProgress.value = await api.get<TeaSession[]>("/tea/sessions?status=in_progress");
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchForTea(teaId: string): Promise<void> {
    loading.value = true;
    try {
      const sessions = await api.get<TeaSession[]>(`/tea/teas/${teaId}/sessions`);
      byTea.value = { ...byTea.value, [teaId]: sessions };
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  function forget(sessionId: string): void {
    inProgress.value = inProgress.value.filter((s) => s.id !== sessionId);
  }

  async function discard(sessionId: string): Promise<void> {
    loading.value = true;
    try {
      await api.del(`/tea/sessions/${sessionId}`);
      error.value = null;
      forget(sessionId);
    } catch (e) {
      const status = (e as { status?: unknown }).status;
      if (status === 404) {
        error.value = null;
        forget(sessionId);
      } else {
        error.value = message(e);
      }
    } finally {
      loading.value = false;
    }
  }

  return { inProgress, byTea, loading, error, fetchInProgress, fetchForTea, forget, discard };
});
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaSessionsStore.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/stores/useTeaSessionsStore.ts frontend/src/apps/tea/stores/useTeaSessionsStore.spec.ts
git commit -m "feat(tea): add the sessions store for recovery and per-tea history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: The teacup (`TeaCup.vue`)

**Files:**
- Create: `frontend/src/apps/tea/components/TeaCup.vue`
- Test: `frontend/src/apps/tea/components/TeaCup.spec.ts`

**Interfaces:**
- Consumes: `fillLevel`, `overSteep`, `darken`, `TARGET_LEVEL` from `../timer`.
- Produces: `<TeaCup :elapsed="number" :target="number" :color="string" :running="boolean" />`. Test hooks: `data-testid="cup-liquor"` with `data-level` (fill level rounded to 3 dp) and `fill`; `data-testid="cup-target"` (the dashed line); `data-testid="cup-target-label"` (`"20s"`).

Geometry (viewBox `0 0 238 180`, from the approved mockup): cup interior from rim `y=30` to bottom `y=140` (depth 110). The liquor is a full-depth rect clipped to the cup and translated down by `(1 - level) * 110`, so the drain on Stop is a CSS transform transition. The target line sits at `y = 140 - TARGET_LEVEL * 110`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/components/TeaCup.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TeaCup from "./TeaCup.vue";

const cup = (elapsed: number, target = 20, color = "#d49a3f") =>
  mount(TeaCup, { props: { elapsed, target, color, running: true } });

describe("TeaCup", () => {
  it("is empty before a steep", () => {
    expect(cup(0).get("[data-testid=cup-liquor]").attributes("data-level")).toBe("0");
  });

  it("reaches the dashed line exactly at the target", () => {
    expect(cup(20).get("[data-testid=cup-liquor]").attributes("data-level")).toBe("0.85");
  });

  it("rises past the line and caps at the rim", () => {
    expect(Number(cup(30).get("[data-testid=cup-liquor]").attributes("data-level"))).toBeGreaterThan(
      0.85,
    );
    expect(cup(400).get("[data-testid=cup-liquor]").attributes("data-level")).toBe("1");
  });

  it("uses the tea colour, darkening only once over-steeped", () => {
    expect(cup(10).get("[data-testid=cup-liquor]").attributes("fill")).toBe("#d49a3f");
    expect(cup(35).get("[data-testid=cup-liquor]").attributes("fill")).not.toBe("#d49a3f");
  });

  it("labels the target line", () => {
    expect(cup(0, 25).get("[data-testid=cup-target-label]").text()).toBe("25s");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/apps/tea/components/TeaCup.spec.ts`
Expected: FAIL — cannot resolve `./TeaCup.vue`.

- [ ] **Step 3: Implement**

Create `frontend/src/apps/tea/components/TeaCup.vue`:

```vue
<template>
  <svg class="cup" viewBox="0 0 238 180" role="img" :aria-label="`Steep at ${Math.floor(elapsed)} of ${target} seconds`">
    <defs>
      <clipPath :id="clipId">
        <path d="M44 30 Q46 118 92 140 L146 140 Q192 118 194 30 Z" />
      </clipPath>
    </defs>
    <g :clip-path="`url(#${clipId})`">
      <rect
        :class="['cup__liquor', { 'cup__liquor--draining': !running }]"
        data-testid="cup-liquor"
        x="30"
        y="30"
        width="180"
        :height="DEPTH"
        :fill="fill"
        :data-level="Number(level.toFixed(3))"
        :style="{ transform: `translateY(${(1 - level) * DEPTH}px)` }"
      />
    </g>
    <path class="cup__line" d="M40 28 Q44 120 92 142 L146 142 Q194 120 198 28" />
    <path class="cup__line" d="M100 142 L102 152 L136 152 L138 142" />
    <line
      class="cup__target"
      data-testid="cup-target"
      x1="36"
      :y1="targetY"
      x2="202"
      :y2="targetY"
    />
    <text class="cup__target-label" data-testid="cup-target-label" x="206" :y="targetY + 3">
      {{ target }}s
    </text>
  </svg>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { TARGET_LEVEL, darken, fillLevel, overSteep } from "../timer";

const props = defineProps<{ elapsed: number; target: number; color: string; running: boolean }>();

const BOTTOM = 140;
const DEPTH = 110;
const clipId = `cup-clip-${useId()}`;

const level = computed(() => fillLevel(props.elapsed, props.target));
const fill = computed(() => darken(props.color, overSteep(props.elapsed, props.target)));
const targetY = BOTTOM - TARGET_LEVEL * DEPTH;
</script>

<style scoped lang="scss">
.cup {
  display: block;
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
}
.cup__liquor {
  // Short linear easing smooths the 200ms clock ticks while steeping.
  transition: transform 0.2s linear;
}
.cup__liquor--draining {
  transition: transform 0.6s ease-in;
}
.cup__line {
  fill: none;
  stroke: #e4d9c6;
  stroke-width: 2.5;
}
.cup__target {
  stroke: #d9a45b;
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}
.cup__target-label {
  fill: #d9a45b;
  font-size: 10px;
  font-family: inherit;
}
</style>
```

(`useId` is available from Vue 3.5; the repo is on `^3.5.12`.)

`data-level` rendering: `Number((0).toFixed(3))` renders `"0"`, `0.85` renders `"0.85"`, `1` renders `"1"` — matching the tests.

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/apps/tea/components/TeaCup.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/components/TeaCup.vue frontend/src/apps/tea/components/TeaCup.spec.ts
git commit -m "feat(tea): add the teacup that fills to its target line

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Timer sheets — pick a tea, finish, recovery card

**Files:**
- Create: `frontend/src/apps/tea/components/PickTeaSheet.vue`, `FinishSheet.vue`, `RecoveryCard.vue`
- Test: `PickTeaSheet.spec.ts`, `FinishSheet.spec.ts`, `RecoveryCard.spec.ts` (same folder)

**Interfaces:**
- `PickTeaSheet` props `{ teas: Tea[]; currentTeaId: string | null; leafGrams: number | null; waterTempC: number | null }`; emits `pick: [tea: Tea]`, `update-grams: [grams: number | null]`, `update-temp: [celsius: number | null]`, `close: []`. Test ids: `pick-sheet`, `pick-search`, `pick-tea-{id}`, `pick-grams`, `pick-temp`, `pick-close`. Ordering: teas with grams first, then empty ones; each group by name. The grams/temp inputs show only when `currentTeaId` is set.
- `FinishSheet` props `{ teaName: string; gramsRemaining: number; leafGrams: number | null; saving: boolean; error: string | null }`; emits `save: [payload: { rating: number | null; leafGrams: number | null }]`, `cancel: []`. Test ids: `finish-sheet`, `finish-star-{1..5}`, `finish-grams`, `finish-preview`, `finish-error`, `finish-save`, `finish-cancel`. Tapping the selected star again clears the rating.
- `RecoveryCard` props `{ session: TeaSession; teaName: string }`; emits `resume: []`, `discard: []`. Test ids: `recovery-card`, `recovery-text`, `recovery-resume`, `recovery-discard`.

All three reuse the Cabinet's sheet look (`#1e1712` panel, `#e4d9c6` primary button, `#6b5f52` cancel), as in `GramsSheet.vue`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/apps/tea/components/PickTeaSheet.spec.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useApi", () => ({ ApiError: class extends Error {}, api: {} }));

import PickTeaSheet from "./PickTeaSheet.vue";
import type { Tea } from "../types";

function tea(id: string, name: string, grams: number): Tea {
  return {
    id,
    name,
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: grams,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    brewing: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
  };
}

const TEAS = [tea("t-a", "Rou Gui", 0), tea("t-b", "Tieguanyin", 42), tea("t-c", "Bai Hao", 10)];

function sheet(currentTeaId: string | null = null) {
  setActivePinia(createPinia());
  return mount(PickTeaSheet, {
    props: { teas: TEAS, currentTeaId, leafGrams: 6, waterTempC: 95 },
  });
}

describe("PickTeaSheet", () => {
  it("lists teas with leaf first, empty ones last", () => {
    const ids = sheet()
      .findAll("[data-testid^=pick-tea-]")
      .map((el) => el.attributes("data-testid"));
    expect(ids).toEqual(["pick-tea-t-c", "pick-tea-t-b", "pick-tea-t-a"]);
  });

  it("filters by name and emits the pick", async () => {
    const wrapper = sheet();
    await wrapper.get("[data-testid=pick-search]").setValue("tie");
    const rows = wrapper.findAll("[data-testid^=pick-tea-]");
    expect(rows).toHaveLength(1);
    await rows[0].trigger("click");
    expect(wrapper.emitted("pick")![0][0]).toMatchObject({ id: "t-b" });
  });

  it("offers grams and temperature only once a tea is attached", async () => {
    expect(sheet().find("[data-testid=pick-grams]").exists()).toBe(false);
    const attached = sheet("t-b");
    await attached.get("[data-testid=pick-grams]").setValue("7");
    await attached.get("[data-testid=pick-temp]").setValue("");
    expect(attached.emitted("update-grams")![0]).toEqual([7]);
    expect(attached.emitted("update-temp")![0]).toEqual([null]);
  });
});
```

`frontend/src/apps/tea/components/FinishSheet.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FinishSheet from "./FinishSheet.vue";

const sheet = (overrides: Record<string, unknown> = {}) =>
  mount(FinishSheet, {
    props: {
      teaName: "Tieguanyin",
      gramsRemaining: 42,
      leafGrams: 5,
      saving: false,
      error: null,
      ...overrides,
    },
  });

describe("FinishSheet", () => {
  it("previews the grams that will come off", () => {
    expect(sheet().get("[data-testid=finish-preview]").text()).toBe(
      "−5 g from Tieguanyin (42 g → 37 g)",
    );
  });

  it("says grams stay put when no leaf is recorded", async () => {
    const wrapper = sheet();
    await wrapper.get("[data-testid=finish-grams]").setValue("");
    expect(wrapper.get("[data-testid=finish-preview]").text()).toContain("stay as they are");
  });

  it("emits the rating and grams; tapping the chosen star again clears it", async () => {
    const wrapper = sheet();
    await wrapper.get("[data-testid=finish-star-4]").trigger("click");
    await wrapper.get("[data-testid=finish-save]").trigger("click");
    expect(wrapper.emitted("save")![0][0]).toEqual({ rating: 4, leafGrams: 5 });

    await wrapper.get("[data-testid=finish-star-4]").trigger("click");
    await wrapper.get("[data-testid=finish-save]").trigger("click");
    expect(wrapper.emitted("save")![1][0]).toEqual({ rating: null, leafGrams: 5 });
  });

  it("shows the error and disables save while saving", () => {
    const wrapper = sheet({ error: "HTTP 500", saving: true });
    expect(wrapper.get("[data-testid=finish-error]").text()).toBe("HTTP 500");
    expect(wrapper.get("[data-testid=finish-save]").attributes("disabled")).toBeDefined();
  });
});
```

`frontend/src/apps/tea/components/RecoveryCard.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RecoveryCard from "./RecoveryCard.vue";
import type { TeaSession } from "../types";

const SESSION: TeaSession = {
  id: "s-1",
  tea_id: "t-1",
  status: "in_progress",
  started_at: "2026-09-25T19:40:00Z",
  updated_at: "2026-09-25T19:55:00Z",
  finished_at: null,
  leaf_grams: 6,
  water_temp_c: 95,
  rating: null,
  curve_source: "almanac",
  curve_source_label: "almanac: Tieguanyin",
  infusions: [
    { number: 1, target_seconds: 20, actual_seconds: 21 },
    { number: 2, target_seconds: 25, actual_seconds: 26 },
    { number: 3, target_seconds: 30, actual_seconds: null },
  ],
};

describe("RecoveryCard", () => {
  it("names the tea and counts only brewed infusions", () => {
    const text = mount(RecoveryCard, { props: { session: SESSION, teaName: "Tieguanyin" } })
      .get("[data-testid=recovery-text]")
      .text();
    expect(text).toContain("Unfinished Tieguanyin session");
    expect(text).toContain("2 infusions");
  });

  it("emits resume and discard", async () => {
    const wrapper = mount(RecoveryCard, { props: { session: SESSION, teaName: "Tieguanyin" } });
    await wrapper.get("[data-testid=recovery-resume]").trigger("click");
    await wrapper.get("[data-testid=recovery-discard]").trigger("click");
    expect(wrapper.emitted("resume")).toHaveLength(1);
    expect(wrapper.emitted("discard")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/apps/tea/components/PickTeaSheet.spec.ts src/apps/tea/components/FinishSheet.spec.ts src/apps/tea/components/RecoveryCard.spec.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement**

`frontend/src/apps/tea/components/PickTeaSheet.vue`:

```vue
<template>
  <div class="sheet" data-testid="pick-sheet">
    <p class="sheet__title">Which tea?</p>
    <input
      v-model="query"
      class="sheet__field"
      data-testid="pick-search"
      placeholder="Search your cabinet"
    />
    <ul class="pick__list">
      <li v-for="tea in shown" :key="tea.id">
        <button
          :class="['pick__row', { 'pick__row--current': tea.id === currentTeaId }]"
          :data-testid="`pick-tea-${tea.id}`"
          @click="emit('pick', tea)"
        >
          <img v-if="photo(tea)" class="pick__photo" :src="photo(tea)!" alt="" />
          <span v-else class="pick__swatch" :style="{ background: CUP_LIQUOR[tea.class_id] }"></span>
          <span class="pick__name">{{ tea.name }}</span>
          <span class="pick__grams">{{ tea.grams_remaining }} g</span>
        </button>
      </li>
    </ul>

    <div v-if="currentTeaId" class="pick__brew">
      <label class="pick__label">
        Leaf (g)
        <input
          class="sheet__field"
          data-testid="pick-grams"
          inputmode="decimal"
          :value="leafGrams ?? ''"
          @input="emit('update-grams', asNumber($event))"
        />
      </label>
      <label class="pick__label">
        Water (°C)
        <input
          class="sheet__field"
          data-testid="pick-temp"
          inputmode="numeric"
          :value="waterTempC ?? ''"
          @input="emit('update-temp', asNumber($event))"
        />
      </label>
    </div>

    <button class="sheet__cancel" data-testid="pick-close" @click="emit('close')">Done</button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { CUP_LIQUOR } from "../timer";
import { imageSrc } from "../shelf";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Tea } from "../types";

const props = defineProps<{
  teas: Tea[];
  currentTeaId: string | null;
  leafGrams: number | null;
  waterTempC: number | null;
}>();
const emit = defineEmits<{
  pick: [tea: Tea];
  "update-grams": [grams: number | null];
  "update-temp": [celsius: number | null];
  close: [];
}>();

const auth = useAuthStore();
const query = ref("");

const shown = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return props.teas
    .filter((tea) => tea.name.toLowerCase().includes(needle))
    .sort(
      (a, b) =>
        Number(a.grams_remaining <= 0) - Number(b.grams_remaining <= 0) ||
        a.name.localeCompare(b.name),
    );
});

function photo(tea: Tea): string | null {
  return imageSrc(tea.image_url, auth.token);
}

function asNumber(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.pick__list {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
  max-height: 42vh;
  overflow-y: auto;
}
.pick__row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  background: transparent;
  border: 0;
  border-bottom: 1px solid #241e19;
  padding: 10px 2px;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  text-align: left;
  cursor: pointer;
}
.pick__row--current .pick__name {
  color: #d9a45b;
}
.pick__photo,
.pick__swatch {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}
.pick__name {
  flex: 1;
}
.pick__grams {
  color: #8b7a63;
  font-size: 13px;
}
.pick__brew {
  display: flex;
  gap: 12px;
}
.pick__label {
  flex: 1;
  color: #8b7a63;
  font-size: 12px;
}
</style>
```

Create the shared sheet styles `frontend/src/apps/tea/components/timer-sheet.scss` (used by PickTeaSheet and FinishSheet):

```scss
.sheet {
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
.sheet__title {
  color: #efe7da;
  font-size: 15px;
  margin: 0 0 14px;
}
.sheet__field {
  width: 100%;
  background: #241c16;
  border: 1px solid #3b3026;
  border-radius: 3px;
  padding: 11px 12px;
  color: #efe7da;
  font-size: 15px;
  font-family: inherit;
  margin: 4px 0 10px;
}
.sheet__save {
  display: block;
  width: 100%;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;

  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
}
.sheet__cancel {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 0;
  color: #6b5f52;
  font-size: 13.5px;
  font-family: inherit;
  cursor: pointer;
}
.sheet__error {
  border-left: 2px solid #e4d9c6;
  color: #efe7da;
  padding: 8px 12px;
  margin: 0 0 12px;
  font-size: 14px;
}
```

`frontend/src/apps/tea/components/FinishSheet.vue`:

```vue
<template>
  <div class="sheet" data-testid="finish-sheet">
    <p class="sheet__title">How was it?</p>
    <div class="finish__stars">
      <button
        v-for="n in 5"
        :key="n"
        :class="['finish__star', { 'finish__star--on': rating !== null && n <= rating }]"
        :data-testid="`finish-star-${n}`"
        :aria-label="`${n} star${n === 1 ? '' : 's'}`"
        @click="rating = rating === n ? null : n"
      >
        ★
      </button>
    </div>

    <label class="finish__label">
      Leaf used (g)
      <input
        class="sheet__field"
        data-testid="finish-grams"
        inputmode="decimal"
        :value="grams ?? ''"
        @input="onGrams"
      />
    </label>
    <p class="finish__preview" data-testid="finish-preview">{{ preview }}</p>

    <p v-if="error" class="sheet__error" data-testid="finish-error">{{ error }}</p>

    <button
      class="sheet__save"
      data-testid="finish-save"
      :disabled="saving"
      @click="emit('save', { rating, leafGrams: grams })"
    >
      {{ error ? "Try again" : "Save session" }}
    </button>
    <button class="sheet__cancel" data-testid="finish-cancel" @click="emit('cancel')">
      Keep brewing
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
  teaName: string;
  gramsRemaining: number;
  leafGrams: number | null;
  saving: boolean;
  error: string | null;
}>();
const emit = defineEmits<{
  save: [payload: { rating: number | null; leafGrams: number | null }];
  cancel: [];
}>();

const rating = ref<number | null>(null);
const grams = ref<number | null>(props.leafGrams);

function onGrams(event: Event): void {
  const raw = (event.target as HTMLInputElement).value.trim();
  const parsed = Number(raw);
  grams.value = raw !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const preview = computed(() => {
  if (grams.value === null) return "No leaf recorded — grams stay as they are";
  const after = Math.max(0, props.gramsRemaining - grams.value);
  return `−${grams.value} g from ${props.teaName} (${props.gramsRemaining} g → ${after} g)`;
});
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.finish__stars {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 16px;
}
.finish__star {
  background: transparent;
  border: 0;
  font-size: 34px;
  color: #3b3026;
  cursor: pointer;
  padding: 4px;
}
.finish__star--on {
  color: #d9a45b;
}
.finish__label {
  display: block;
  color: #8b7a63;
  font-size: 12px;
}
.finish__preview {
  color: #8b7a63;
  font-size: 13px;
  margin: 0 0 14px;
}
</style>
```

`frontend/src/apps/tea/components/RecoveryCard.vue`:

```vue
<template>
  <div class="recovery" data-testid="recovery-card">
    <p class="recovery__text" data-testid="recovery-text">
      Unfinished {{ teaName }} session · {{ when }} · {{ brewedCount }}
      {{ brewedCount === 1 ? "infusion" : "infusions" }}
    </p>
    <div class="recovery__actions">
      <button class="recovery__resume" data-testid="recovery-resume" @click="emit('resume')">
        Resume
      </button>
      <button class="recovery__discard" data-testid="recovery-discard" @click="emit('discard')">
        Discard
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { TeaSession } from "../types";

const props = defineProps<{ session: TeaSession; teaName: string }>();
const emit = defineEmits<{ resume: []; discard: [] }>();

const brewedCount = computed(
  () => props.session.infusions.filter((i) => i.actual_seconds !== null).length,
);
const when = computed(() =>
  new Date(props.session.started_at).toLocaleString([], {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }),
);
</script>

<style scoped lang="scss">
.recovery {
  background: #1e1712;
  border-left: 2px solid #d9a45b;
  margin: 8px 18px;
  padding: 12px 14px;
}
.recovery__text {
  color: #efe7da;
  font-size: 14px;
  margin: 0 0 10px;
}
.recovery__actions {
  display: flex;
  gap: 16px;
}
.recovery__resume,
.recovery__discard {
  background: transparent;
  border: 0;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;
  padding: 0;
}
.recovery__resume {
  color: #d9a45b;
}
.recovery__discard {
  color: #8b7a63;
}
</style>
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/apps/tea/components && npm run lint`
Expected: PASS; lint clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/components
git commit -m "feat(tea): add the pick-a-tea, finish and recovery sheets

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: The timer page and its route

**Files:**
- Create: `frontend/src/apps/tea/pages/TimerPage.vue`
- Modify: `frontend/src/router/routes.ts`, `frontend/src/router/routes.spec.ts`
- Test: `frontend/src/apps/tea/pages/TimerPage.spec.ts`

**Interfaces:**
- Consumes: `useTeaTimerStore` (Task 9), `useTeaSessionsStore` (Task 10), `useTeaCabinetStore.fetchTeas / teas`, `useSteepClock`, `useWakeLock`, `useTargetChime` (Task 8), `TeaCup` (Task 11), `PickTeaSheet`, `FinishSheet`, `RecoveryCard` (Task 12), `formatElapsed`, `STEP_SECONDS` (Task 7).
- Produces: route `name: "tea-timer"`, `path: "tea/timer"`, `meta: { title: "Brew", requiresAuth: true, backTo: "/tea" }`, optional query `tea=<id>`. Test ids: `timer-tea` (name / "+ pick a tea"), `timer-unsynced`, `timer-chime`, `timer-menu`, `timer-redo`, `timer-discard`, `timer-elapsed`, `timer-minus`, `timer-plus`, `timer-chip-{n}`, `timer-source`, `timer-finish`, `timer-band`, `timer-notice`, `timer-error`.

- [ ] **Step 1: Write the failing tests**

Add to `frontend/src/router/routes.spec.ts` inside `describe("tea back navigation", …)`:

```ts
  it("points the timer's back arrow at the cabinet, not at a tea called 'timer'", async () => {
    const router = makeRouter();
    await router.push("/tea/timer");

    expect(router.currentRoute.value.name).toBe("tea-timer");
    expect(router.currentRoute.value.meta.backTo).toBe("/tea");
  });
```

Create `frontend/src/apps/tea/pages/TimerPage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, push, routeQuery } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
  routeQuery: { value: {} as Record<string, string> },
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: delMock, post: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: routeQuery.value }),
}));

import TimerPage from "./TimerPage.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";
import type { BrewingCurve, Tea, TeaSession } from "../types";

function tea(): Tea {
  return {
    id: "t-1",
    name: "Tieguanyin",
    catalogue_node_id: "oolong.anxi.tieguanyin",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 42,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    brewing: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
  };
}

const CURVE: BrewingCurve = {
  leaf_grams: 6,
  water_temp_c: 95,
  steep_seconds: [20, 25],
  source: "almanac",
  source_label: "almanac: Tieguanyin",
};

function routes(inProgress: TeaSession[] = []) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teas") return Promise.resolve([tea()]);
    if (path === "/tea/sessions?status=in_progress") return Promise.resolve(inProgress);
    if (path === "/tea/teas/t-1/curve") return Promise.resolve(CURVE);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  getMock.mockReset();
  putMock.mockReset().mockImplementation((_p: string, body: unknown) => Promise.resolve(body));
  delMock.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  routeQuery.value = {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TimerPage", () => {
  it("opens as a plain timer ready to start", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-tea]").text()).toContain("pick a tea");
    expect(wrapper.get("[data-testid=timer-band]").text()).toContain("tap to start");
    expect(wrapper.get("[data-testid=timer-finish]").text()).toBe("End");
  });

  it("starts and stops a steep from the band", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    expect(wrapper.get("[data-testid=timer-band]").text()).toContain("tap to stop");
    vi.setSystemTime(Date.now() + 11_000);
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-chip-1]").text()).toBe("1 · 11s");
  });

  it("attaches the tea from ?tea= and shows its curve source", async () => {
    routes();
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-tea]").text()).toContain("Tieguanyin");
    expect(wrapper.get("[data-testid=timer-source]").text()).toBe("almanac: Tieguanyin");
    expect(wrapper.get("[data-testid=timer-finish]").text()).toBe("Finish");
  });

  it("offers to resume an unfinished server session", async () => {
    routes([
      {
        id: "s-9",
        tea_id: "t-1",
        status: "in_progress",
        started_at: "2026-09-25T19:40:00Z",
        updated_at: "2026-09-25T19:55:00Z",
        finished_at: null,
        leaf_grams: 6,
        water_temp_c: 95,
        rating: null,
        curve_source: "almanac",
        curve_source_label: "almanac: Tieguanyin",
        infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
      },
    ]);
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=recovery-resume]").trigger("click");
    expect(useTeaTimerStore().live?.sessionId).toBe("s-9");
    expect(wrapper.find("[data-testid=recovery-card]").exists()).toBe(false);
  });

  it("finishes, refreshes the cabinet and goes to the tea", async () => {
    routes();
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-finish]").trigger("click");
    await wrapper.get("[data-testid=finish-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({ status: "finalised" });
    expect(push).toHaveBeenCalledWith({ name: "tea-detail", params: { teaId: "t-1" } });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/apps/tea/pages/TimerPage.spec.ts src/router/routes.spec.ts`
Expected: FAIL — `TimerPage.vue` missing; `/tea/timer` resolves to `tea-detail`.

- [ ] **Step 3: Implement**

In `frontend/src/router/routes.ts`, insert directly **before** the `tea/:teaId` route:

```ts
      {
        path: "tea/timer",
        name: "tea-timer",
        component: () => import("@/apps/tea/pages/TimerPage.vue"),
        meta: { title: "Brew", requiresAuth: true, backTo: "/tea" },
      },
```

Create `frontend/src/apps/tea/pages/TimerPage.vue`:

```vue
<template>
  <q-page class="timer">
    <header class="timer__bar">
      <button class="timer__tea" data-testid="timer-tea" @click="picking = true">
        <template v-if="timer.live?.tea">
          {{ timer.live.tea.name }}
          <small>change tea</small>
        </template>
        <template v-else>
          + pick a tea
          <small>just a timer</small>
        </template>
      </button>
      <span
        v-if="timer.unsynced"
        class="timer__unsynced"
        data-testid="timer-unsynced"
        title="Not synced yet — it will retry"
      ></span>
      <div class="timer__tools">
        <button
          class="timer__tool"
          data-testid="timer-chime"
          :aria-label="timer.chimeOn ? 'Turn chime off' : 'Turn chime on'"
          @click="timer.toggleChime()"
        >
          {{ timer.chimeOn ? "🔔" : "🔕" }}
        </button>
        <button class="timer__tool" data-testid="timer-menu" aria-label="More" @click="menu = !menu">
          ⋯
        </button>
      </div>
      <div v-if="menu" class="timer__menu">
        <button
          data-testid="timer-redo"
          :disabled="timer.running || timer.brewed.length === 0"
          @click="menu = false; timer.redoLast()"
        >
          Redo last infusion
        </button>
        <button data-testid="timer-discard" :disabled="!timer.live" @click="onDiscard">
          Discard session
        </button>
      </div>
    </header>

    <p v-if="timer.notice" class="timer__notice" data-testid="timer-notice">{{ timer.notice }}</p>
    <p v-if="timer.error && !finishing" class="timer__notice" data-testid="timer-error">
      {{ timer.error }}
    </p>

    <template v-if="!timer.live">
      <RecoveryCard
        v-for="session in sessions.inProgress"
        :key="session.id"
        :session="session"
        :tea-name="teaName(session.tea_id)"
        @resume="onResume(session)"
        @discard="sessions.discard(session.id)"
      />
    </template>

    <TeaCup :elapsed="elapsed" :target="target" :color="timer.liquor" :running="timer.running" />

    <p class="timer__elapsed" data-testid="timer-elapsed">{{ formatElapsed(elapsed) }}</p>

    <div class="timer__nudge">
      <button data-testid="timer-minus" @click="timer.nudge(-STEP_SECONDS)">−{{ STEP_SECONDS }}s</button>
      <button data-testid="timer-plus" @click="timer.nudge(STEP_SECONDS)">+{{ STEP_SECONDS }}s</button>
    </div>

    <div class="timer__chips">
      <span
        v-for="infusion in timer.live?.infusions ?? []"
        :key="infusion.number"
        :class="['timer__chip', { 'timer__chip--now': infusion.actual_seconds === null }]"
        :data-testid="`timer-chip-${infusion.number}`"
      >
        {{ infusion.actual_seconds === null ? infusion.number : `${infusion.number} · ${infusion.actual_seconds}s` }}
      </span>
    </div>

    <p class="timer__source" data-testid="timer-source">
      {{ timer.live?.curve.source_label ?? "generic gongfu" }}
    </p>

    <button
      class="timer__finish"
      data-testid="timer-finish"
      :disabled="timer.running"
      @click="onFinishTap"
    >
      {{ timer.live?.tea ? "Finish" : "End" }}
    </button>

    <button class="timer__band" data-testid="timer-band" @click="onBand">
      {{ timer.running ? "tap to stop · pour" : "tap to start" }}
    </button>

    <PickTeaSheet
      v-if="picking"
      :teas="cabinet.teas"
      :current-tea-id="timer.live?.tea?.id ?? null"
      :leaf-grams="timer.live?.leafGrams ?? null"
      :water-temp-c="timer.live?.waterTempC ?? null"
      @pick="onPick"
      @update-grams="timer.setLeafGrams($event)"
      @update-temp="timer.setWaterTemp($event)"
      @close="picking = false"
    />

    <FinishSheet
      v-if="finishing && timer.live?.tea"
      :tea-name="timer.live.tea.name"
      :grams-remaining="timer.live.tea.grams_remaining"
      :leaf-grams="timer.live.leafGrams"
      :saving="timer.loading"
      :error="timer.error"
      @save="onSave"
      @cancel="finishing = false"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import TeaCup from "../components/TeaCup.vue";
import PickTeaSheet from "../components/PickTeaSheet.vue";
import FinishSheet from "../components/FinishSheet.vue";
import RecoveryCard from "../components/RecoveryCard.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";
import { useTeaSessionsStore } from "../stores/useTeaSessionsStore";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useSteepClock } from "../composables/useSteepClock";
import { useWakeLock } from "../composables/useWakeLock";
import { useTargetChime } from "../composables/useTargetChime";
import { STEP_SECONDS, formatElapsed, targetFor } from "../timer";
import type { Tea, TeaSession } from "../types";

const route = useRoute();
const router = useRouter();
const timer = useTeaTimerStore();
const sessions = useTeaSessionsStore();
const cabinet = useTeaCabinetStore();

const picking = ref(false);
const finishing = ref(false);
const menu = ref(false);

const steepStartedAt = computed(() => timer.live?.steepStartedAt ?? null);
const { elapsed } = useSteepClock(steepStartedAt);
const target = computed(() => timer.current?.target_seconds ?? targetFor([], 1));
const { unlock } = useTargetChime(
  elapsed,
  computed(() => (timer.running ? target.value : null)),
  computed(() => timer.chimeOn),
);
useWakeLock(computed(() => timer.live !== null));

function teaName(teaId: string): string {
  return cabinet.teas.find((t) => t.id === teaId)?.name ?? "a tea";
}

function onBand(): void {
  if (timer.running) {
    void timer.stop();
  } else {
    unlock();
    timer.start();
  }
}

async function onPick(tea: Tea): Promise<void> {
  await timer.attachTea(tea);
}

function onResume(session: TeaSession): void {
  const tea = cabinet.teas.find((t) => t.id === session.tea_id);
  if (!tea) return;
  timer.resume(session, tea);
  sessions.forget(session.id);
}

function onFinishTap(): void {
  if (timer.live?.tea) {
    finishing.value = true;
  } else {
    timer.end();
  }
}

async function onSave(payload: { rating: number | null; leafGrams: number | null }): Promise<void> {
  timer.setLeafGrams(payload.leafGrams);
  const teaId = await timer.finish(payload.rating);
  if (teaId === null) return;
  finishing.value = false;
  await cabinet.fetchTeas();
  void router.push({ name: "tea-detail", params: { teaId } });
}

async function onDiscard(): Promise<void> {
  menu.value = false;
  if (!window.confirm("Discard this session? Nothing from it will be saved.")) return;
  await timer.discard();
}

onMounted(async () => {
  if (cabinet.teas.length === 0) await cabinet.fetchTeas();
  const wanted = typeof route.query.tea === "string" ? route.query.tea : null;
  const tea = wanted ? cabinet.teas.find((t) => t.id === wanted) : undefined;
  if (tea && timer.live?.tea?.id !== tea.id) {
    await timer.attachTea(tea);
  } else if (!timer.live) {
    await sessions.fetchInProgress();
  }
});
</script>

<style scoped lang="scss">
.timer {
  background: #17120e;
  min-height: 100%;
  position: relative;
  padding-bottom: 130px;
  color: #efe7da;
}
.timer__bar {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 16px 18px 6px;
  position: relative;
}
.timer__tea {
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  text-align: left;
  cursor: pointer;
  padding: 0;

  small {
    display: block;
    color: #8b7a63;
    font-size: 11px;
  }
}
.timer__unsynced {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #d9a45b;
  margin-top: 7px;
}
.timer__tools {
  margin-left: auto;
  display: flex;
  gap: 6px;
}
.timer__tool {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-size: 18px;
  cursor: pointer;
  min-width: 36px;
  min-height: 36px;
}
.timer__menu {
  position: absolute;
  right: 18px;
  top: 52px;
  z-index: 10;
  background: #1e1712;
  border: 1px solid #33291f;
  border-radius: 6px;
  display: flex;
  flex-direction: column;

  button {
    background: transparent;
    border: 0;
    color: #efe7da;
    font-family: inherit;
    font-size: 14px;
    text-align: left;
    padding: 12px 16px;
    cursor: pointer;

    &:disabled {
      color: #574d43;
      cursor: default;
    }
  }
}
.timer__notice {
  background: #1e1712;
  border-left: 2px solid #e4d9c6;
  margin: 8px 18px;
  padding: 10px 14px;
  font-size: 14px;
}
.timer__elapsed {
  text-align: center;
  font-size: 44px;
  line-height: 1;
  margin: 0;
  font-variant-numeric: tabular-nums;
}
.timer__nudge {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-top: 12px;

  button {
    background: transparent;
    border: 1px solid #3a2f25;
    border-radius: 14px;
    color: #8b7a63;
    font-family: inherit;
    font-size: 13px;
    padding: 6px 14px;
    cursor: pointer;
  }
}
.timer__chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
  margin: 12px 18px 0;
}
.timer__chip {
  font-size: 12px;
  padding: 3px 8px;
  border-radius: 10px;
  background: #1e1712;
  color: #e4d9c6;
}
.timer__chip--now {
  background: #e4d9c6;
  color: #17120e;
}
.timer__source {
  text-align: center;
  font-size: 12px;
  font-style: italic;
  color: #8b7a63;
  margin: 10px 0 0;
}
.timer__finish {
  display: block;
  margin: 14px auto 0;
  background: transparent;
  border: 0;
  color: #c7a271;
  font-family: inherit;
  font-size: 14px;
  cursor: pointer;

  &:disabled {
    color: #574d43;
    cursor: default;
  }
}
// The whole thumb zone is the control: at the table there is no aiming.
.timer__band {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 112px;
  border: 0;
  border-radius: 40px 40px 0 0;
  background: #e4d9c6;
  color: #17120e;
  font-family: inherit;
  font-size: 13px;
  letter-spacing: 2px;
  text-transform: uppercase;
  cursor: pointer;
  z-index: 5;
}
</style>
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/apps/tea src/router && npm run typecheck && npm run lint`
Expected: PASS; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/pages/TimerPage.vue frontend/src/apps/tea/pages/TimerPage.spec.ts frontend/src/router/routes.ts frontend/src/router/routes.spec.ts
git commit -m "feat(tea): add the Session Timer page at /tea/timer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: Entry points and history — Cabinet Brew, tea detail Brew + Sessions

**Files:**
- Create: `frontend/src/apps/tea/components/TeaSessionsList.vue`, `TeaSessionsList.spec.ts`
- Modify: `frontend/src/apps/tea/pages/CabinetPage.vue` (+spec), `frontend/src/apps/tea/pages/TeaDetailPage.vue` (+spec)

**Interfaces:**
- Consumes: `useTeaSessionsStore.fetchForTea / byTea` (Task 10), route `tea-timer` (Task 13).
- Produces: `<TeaSessionsList :sessions="TeaSession[]" />` (test ids `sessions-row-{id}`, `sessions-empty`); Cabinet header button `cabinet-brew`; tea detail header button `tea-brew`, section `tea-sessions`, fact `fact-brewing`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/apps/tea/components/TeaSessionsList.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TeaSessionsList from "./TeaSessionsList.vue";
import type { TeaSession } from "../types";

function session(id: string, overrides: Partial<TeaSession> = {}): TeaSession {
  return {
    id,
    tea_id: "t-1",
    status: "finalised",
    started_at: "2026-09-25T19:40:00Z",
    updated_at: "2026-09-25T20:10:00Z",
    finished_at: "2026-09-25T20:10:00Z",
    leaf_grams: 6,
    water_temp_c: 95,
    rating: 4,
    curve_source: "almanac",
    curve_source_label: "almanac: Tieguanyin",
    infusions: [
      { number: 1, target_seconds: 20, actual_seconds: 21 },
      { number: 2, target_seconds: 25, actual_seconds: 26 },
    ],
    ...overrides,
  };
}

describe("TeaSessionsList", () => {
  it("shows stars, infusion count and leaf per session in the given order", () => {
    const wrapper = mount(TeaSessionsList, {
      props: { sessions: [session("s-2"), session("s-1", { rating: null, leaf_grams: null })] },
    });
    const rows = wrapper.findAll("[data-testid^=sessions-row-]");
    expect(rows.map((r) => r.attributes("data-testid"))).toEqual(["sessions-row-s-2", "sessions-row-s-1"]);
    expect(rows[0].text()).toContain("★★★★☆");
    expect(rows[0].text()).toContain("2 infusions");
    expect(rows[0].text()).toContain("6 g");
    expect(rows[1].text()).toContain("unrated");
  });

  it("says so when there are none", () => {
    expect(mount(TeaSessionsList, { props: { sessions: [] } }).find("[data-testid=sessions-empty]").exists()).toBe(true);
  });
});
```

Append to `frontend/src/apps/tea/pages/CabinetPage.spec.ts` (inside its top-level `describe`; the file has a `render()` helper and a `push` router mock):

```ts
  it("opens the timer from the Brew button", async () => {
    getMock.mockResolvedValue([]);
    const wrapper = render();
    await flushPromises();
    await wrapper.get("[data-testid=cabinet-brew]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-timer" });
  });
```

Append to `frontend/src/apps/tea/pages/TeaDetailPage.spec.ts` (inside `describe("TeaDetailPage", …)`; the file has `tea()`, `page(teas)`, `STUBS`, and `mockApi()` which routes `getMock` by path and returns `[]` for anything else — so the new sessions fetch is harmless to existing tests):

```ts
  it("opens the timer with this tea from the Brew button", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=tea-brew]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-timer", query: { tea: "t-1" } });
  });

  it("lists the tea's finished sessions", async () => {
    const finished = {
      id: "s-1",
      tea_id: "t-1",
      status: "finalised",
      started_at: "2026-09-25T19:40:00Z",
      updated_at: "2026-09-25T20:10:00Z",
      finished_at: "2026-09-25T20:10:00Z",
      leaf_grams: 6,
      water_temp_c: 95,
      rating: 5,
      curve_source: "almanac",
      curve_source_label: "almanac: Tieguanyin",
      infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
    };
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/teas") return Promise.resolve([tea()]);
      if (path === "/tea/catalogue") return Promise.resolve([OOLONG, WUYI]);
      if (path === "/tea/teas/t-1/sessions") return Promise.resolve([finished]);
      return Promise.resolve([]);
    });
    const wrapper = mount(TeaDetailPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.get("[data-testid=tea-sessions]").text()).toContain("★★★★★");
  });

  it("shows the tea's own brewing parameters as a fact", async () => {
    const wrapper = await page([
      tea({ brewing: { leaf_grams: 7, water_temp_c: 95, steep_seconds: [15, 20] } }),
    ]);
    expect(wrapper.get("[data-testid=fact-brewing]").text()).toBe("7g · 95°C · 15s, 20s");
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/apps/tea/components/TeaSessionsList.spec.ts src/apps/tea/pages/CabinetPage.spec.ts src/apps/tea/pages/TeaDetailPage.spec.ts`
Expected: FAIL — missing component and test ids.

- [ ] **Step 3: Implement**

`frontend/src/apps/tea/components/TeaSessionsList.vue`:

```vue
<template>
  <p v-if="sessions.length === 0" class="sessions__empty" data-testid="sessions-empty">
    No sessions yet. Brew it and it will show up here.
  </p>
  <ul v-else class="sessions">
    <li
      v-for="session in sessions"
      :key="session.id"
      class="sessions__row"
      :data-testid="`sessions-row-${session.id}`"
    >
      <span class="sessions__date">{{ dateOf(session) }}</span>
      <span class="sessions__stars">{{ starsOf(session) }}</span>
      <span class="sessions__meta">
        {{ session.infusions.length }} {{ session.infusions.length === 1 ? "infusion" : "infusions" }}
        <template v-if="session.leaf_grams !== null"> · {{ session.leaf_grams }} g</template>
      </span>
    </li>
  </ul>
</template>

<script setup lang="ts">
import type { TeaSession } from "../types";

defineProps<{ sessions: TeaSession[] }>();

function dateOf(session: TeaSession): string {
  return new Date(session.finished_at ?? session.started_at).toLocaleDateString([], {
    day: "numeric",
    month: "short",
  });
}

function starsOf(session: TeaSession): string {
  if (session.rating === null) return "unrated";
  return "★".repeat(session.rating) + "☆".repeat(5 - session.rating);
}
</script>

<style scoped lang="scss">
.sessions {
  list-style: none;
  margin: 0;
  padding: 0;
}
.sessions__row {
  display: flex;
  gap: 12px;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px solid #241e19;
  font-size: 14px;
}
.sessions__date {
  color: #efe7da;
  min-width: 56px;
}
.sessions__stars {
  color: #d9a45b;
  letter-spacing: 1px;
}
.sessions__meta {
  color: #8b7a63;
  margin-left: auto;
}
.sessions__empty {
  color: #8b7a63;
  font-size: 14px;
  margin: 0;
}
</style>
```

`frontend/src/apps/tea/pages/CabinetPage.vue` — add as the first child of `.cabinet__header-right`:

```vue
          <button
            class="cabinet__almanac"
            data-testid="cabinet-brew"
            aria-label="Open the brewing timer"
            @click="router.push({ name: 'tea-timer' })"
          >
            Brew
          </button>
```

`frontend/src/apps/tea/pages/TeaDetailPage.vue`:

1. In the header, inside `<template v-if="tea">`, before the Edit button:

```vue
        <button
          v-if="!editMode"
          class="tea-page__mode"
          data-testid="tea-brew"
          @click="router.push({ name: 'tea-timer', query: { tea: teaId } })"
        >
          Brew
        </button>
```

If the header uses `justify-content: space-between` with exactly two children, wrap the Brew and Edit/Done buttons in `<div class="tea-page__actions">` and add `.tea-page__actions { display: flex; gap: 14px; }` to the scoped styles.

2. In the read view (`<template v-if="!editMode">`), after the almanac `<section>`:

```vue
        <section class="tea-view__section" data-testid="tea-sessions">
          <h2 class="tea-view__heading">Sessions</h2>
          <TeaSessionsList :sessions="sessions.byTea[teaId] ?? []" />
        </section>
```

3. Script: import and wire:

```ts
import TeaSessionsList from "../components/TeaSessionsList.vue";
import { useTeaSessionsStore } from "../stores/useTeaSessionsStore";
// …
const sessions = useTeaSessionsStore();
```

In `onMounted`, add `void sessions.fetchForTea(teaId.value);`.

4. In `facts`, add after the `["low", …]` row:

```ts
    ["brewing", "Brewing", brewingLabel(t)],
```

and add above `const facts`:

```ts
function brewingLabel(t: Tea): string {
  if (!t.brewing) return "";
  const parts = [
    t.brewing.leaf_grams !== null ? `${t.brewing.leaf_grams}g` : "",
    t.brewing.water_temp_c !== null ? `${t.brewing.water_temp_c}°C` : "",
    t.brewing.steep_seconds.map((s) => `${s}s`).join(", "),
  ];
  return parts.filter(Boolean).join(" · ");
}
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npm test && npm run typecheck && npm run lint`
Expected: the whole frontend suite PASSES; clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): brew from the cabinet and a tea, list a tea's sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: End-to-end check in the running app

**Files:** none (verification only; fix-ups go in the task they belong to, committed separately).

- [ ] **Step 1: Run the full suites**

```bash
cd backend && .venv/bin/pytest && black --check . && ruff check .
cd ../frontend && npm test && npm run typecheck && npm run lint
```

Expected: all green.

- [ ] **Step 2: Drive the real app** (use the `run` skill or the VS Code "Launch App" task: backend on :9000 with `DATA_DIR=./local-data`, frontend on :9100), at a phone-sized viewport (≈390×844):

1. Cabinet → **Brew** → timer opens as a plain timer, "+ pick a tea", `tap to start`.
2. Tap the band, wait ~5 s, tap again → chip `1 · 5s`, the cup drains, the next target is on the line.
3. Pick a tea that has an Almanac entry (e.g. Tieguanyin) → liquor turns oolong amber, source label reads `almanac: …`, the pending target changes, leaf grams prefilled.
4. Reload mid-steep → still running, elapsed continues.
5. Let a steep run past its target → the liquor rises above the dashed line and darkens; chime sounds once (if on).
6. **Finish** → rate 5 stars → lands on the tea's detail; grams went down by the leaf used; the session is listed with ★★★★★.
7. Brew the same tea again → source label reads `from your best session (★5, …)` and targets match the recorded steeps.
8. Start a tea session, reload the page after clearing site data → recovery card appears → Resume works.

Expected: every step behaves as listed. Record anything that doesn't and fix it in its owning task's files with its own commit.
