# Shared Cabinets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let household members share one tea cabinet — teas, grams, catalogue nodes and sessions — with per-person live sessions and a household-aware Brewing Curve.

**Architecture:** A cabinet becomes a first-class JSON document `DATA_DIR/tea/cabinets/{cabinet_id}.json` (schema v3, with `id` and `owner`). `DATA_DIR/tea/memberships.json` maps every member to their cabinet id and is the only record of membership. A new `tea_cabinet_service` resolves the caller's cabinet (lazily migrating legacy `users/{username}.json` files) before every existing tea service touches the repository, and owns the membership rules.

**Tech Stack:** FastAPI + Pydantic v2 (Python 3.12), pytest; Vue 3 `<script setup lang="ts">`, Pinia setup stores, vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-09-27-tea-shared-cabinets-design.md`

## Global Constraints

- Backend is strictly 3-layer: routers translate exceptions to `HTTPException` (nowhere else); services raise stdlib/domain exceptions; `app/repositories/tea_repo.py` is the only tea code touching the filesystem.
- All persisted JSON goes through `atomic_write_json` (`app/core/storage.py`).
- **Lock order is always membership lock, then a cabinet's lock.** No service may call `tea_cabinet_service.resolve`/`ensure` inside a `repo.doc_transaction` block.
- `brewed_by` is server-owned — never read from a request body.
- A single-member cabinet must look and behave exactly as today (NFR-d).
- Frontend: all HTTP through `src/composables/useApi.ts`; Pinia stores expose `loading` and `error`, set `loading` in `try/finally`, route failures into `error.value`.
- Black + ruff, line length 100. `npm run lint` and `npm run typecheck` must pass.
- Commit directly on `main` (no feature branches). End every commit message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Minimal comments: only the non-obvious *why*.

## Deviations from the spec (decided while planning)

1. **Stale cabinet is HTTP 410, not 409.** `useTeaTimerStore.finish()` treats a 409 as "an earlier finish landed" and clears the session as a success (`useTeaTimerStore.ts:291`). A stale-cabinet 409 would silently lose a finish. `CabinetGoneError` → **410 "Your cabinet changed — reload"**.
2. **No automatic refetch on 410.** The existing per-store error banners already show the backend `detail` ("Your cabinet changed — reload"), and a reload fixes it. The full refetch runs only after *you* leave a cabinet (the one action that swaps your cabinet under you). Removes a cross-store interceptor for a rare race.
3. **The frontend store is `useTeaHouseholdStore`**, because `useTeaCabinetStore` already exists (it is the teas store).

## Review Focus

1. **A leaver whose legacy file survived a crash** must not have it re-adopted when they leave — covered in Task 2 (`test_a_leftover_legacy_file_is_deleted_once_mapped`) and Task 4 (`test_leaving_after_a_migration_starts_empty`).
2. **Username typed with surrounding spaces** (" bob ") when adding a member should still add `bob` — Task 4 (`test_add_member_strips_whitespace`).
3. **A brand-new user firing concurrent first writes** must end with exactly one cabinet — Task 3 (`test_concurrent_first_writes_create_one_cabinet`).
4. **A leaver's still-running timer** keeps pushing to a tea that is no longer in their (new, empty) cabinet — must be a 404 (the timer already detaches the tea on 404), not a 500 — Task 5 (`test_a_leaver_pushing_an_old_session_gets_not_found`).
5. **A member viewing the owner's tea photos** through `?token=` must work — Task 4 API (`test_a_member_can_see_the_owners_tea_photo`).

---

## File Structure

**Backend**
- Modify `backend/app/schemas/tea.py` — `TeaDoc` v3 (`id`, `owner`), `CabinetView`, `AddMemberRequest`.
- Modify `backend/app/schemas/tea_session.py` — `TeaSession.brewed_by`.
- Rewrite `backend/app/repositories/tea_repo.py` — cabinet-keyed docs and images, membership map, legacy adoption, `CabinetGoneError`.
- Create `backend/app/services/tea_cabinet_service.py` — `resolve`, `ensure`, `read_doc_for`, `get_cabinet`, `add_member`, `remove_member`.
- Modify `backend/app/services/tea_service.py`, `tea_catalogue_service.py`, `tea_session_service.py`, `tea_curve_service.py` — resolve the cabinet first; session ownership; household curve.
- Modify `backend/app/routers/tea.py` — 410 route class, cabinet routes, 403 on sessions.
- Tests: rewrite `backend/tests/test_tea_repo.py`; create `backend/tests/tea_support.py`, `backend/tests/test_tea_cabinets.py`, `backend/tests/test_tea_cabinets_api.py`; update `test_tea_schemas.py`, `test_tea_catalogue.py`, `test_tea_service.py`, `test_tea_sessions.py`, `test_tea_concurrency.py`, `test_tea_curve.py`, `test_tea_sessions_api.py`.

**Frontend (`frontend/src/apps/tea/`)**
- Modify `types.ts` — `brewed_by`, `Cabinet`.
- Create `stores/useTeaHouseholdStore.ts` (+ spec).
- Create `components/HouseholdSheet.vue` (+ spec).
- Modify `pages/CabinetPage.vue` (+ spec) — title button, "with …", sheet.
- Modify `components/TeaSessionsList.vue` (+ spec) — brewer label.
- Modify `pages/TeaDetailPage.vue` (+ spec) — brewer labels, delete count.
- Add `brewed_by` to `TeaSession` fixtures in existing specs.

**Docs**
- Modify `docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md` — narrow the no-sharing non-goal.

---

### Task 1: Schema v3 and cabinet-keyed repository

**Files:**
- Modify: `backend/app/schemas/tea.py` (module docstring, `TeaDoc`)
- Modify: `backend/app/schemas/tea_session.py` (`TeaSession`)
- Rewrite: `backend/app/repositories/tea_repo.py`
- Rewrite: `backend/tests/test_tea_repo.py`
- Modify: `backend/tests/test_tea_schemas.py:22`

**Interfaces:**
- Produces (repo): `CabinetGoneError(LookupError)`; `migrate(raw, *, cabinet_id=None, owner=None) -> dict[str, object]`; `read_doc(cabinet_id: str) -> TeaDoc` (raises `CabinetGoneError` if missing); `write_doc(cabinet_id: str, doc: TeaDoc) -> None`; `cabinet_lock(cabinet_id) -> ContextManager`; `doc_transaction(cabinet_id) -> ContextManager[TeaDoc]` (never creates the file); `new_cabinet(owner: str) -> str`; `delete_cabinet(cabinet_id: str) -> None`; `membership_lock() -> ContextManager`; `read_memberships() -> dict[str, str]`; `write_memberships(members: dict[str, str]) -> None`; `legacy_exists(username) -> bool`; `delete_legacy(username) -> None`; `adopt_legacy(username: str, referenced: set[str]) -> str`; `find_image/save_image/delete_image(cabinet_id, tea_id, ...)` (same signatures as today with `username` → `cabinet_id`); `read_seed_catalogue()` unchanged.
- Produces (schemas): `TeaDoc(schema_version=3, id="", owner="", teas, catalogue_nodes, sessions)`; `TeaSession.brewed_by: str` (required).

Note: after this task the services still call the repo with usernames, so service/API tests fail until Task 3. Run only the repo and schema tests here.

- [ ] **Step 1: Write the failing repo tests**

Replace the whole of `backend/tests/test_tea_repo.py` with:

```python
"""Cabinet-keyed persistence for the Tea Cabinet."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, Tea, TeaDoc


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea(tea_id: str = "t-abc12345") -> Tea:
    return Tea(
        id=tea_id,
        name="Da Hong Pao",
        catalogue_node_id="oolong.wuyi-yancha.da-hong-pao",
        grams_purchased=100,
        grams_remaining=38,
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )


_SESSION = {
    "id": "s-1",
    "tea_id": "t-abc12345",
    "status": "finalised",
    "started_at": "2026-09-20T18:00:00+00:00",
    "updated_at": "2026-09-20T18:30:00+00:00",
    "finished_at": "2026-09-20T18:30:00+00:00",
    "rating": 4,
    "curve_source": "generic",
    "infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": 12}],
}


def _write_legacy(tmp_path: Path, username: str = "alice", version: int = 2) -> None:
    raw: dict[str, object] = {
        "schema_version": version,
        "teas": [_tea().model_dump(mode="json")],
        "catalogue_nodes": [],
    }
    if version == 2:
        raw["sessions"] = [_SESSION]
    path = tmp_path / "tea" / "users" / f"{username}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw), encoding="utf-8")


def test_new_cabinet_writes_an_empty_v3_doc_owned_by_the_user(tmp_path: Path) -> None:
    cabinet_id = repo.new_cabinet("alice")
    assert cabinet_id.startswith("c_")
    doc = repo.read_doc(cabinet_id)
    assert (doc.schema_version, doc.id, doc.owner) == (3, cabinet_id, "alice")
    assert doc.teas == [] and doc.sessions == [] and doc.catalogue_nodes == []
    assert (tmp_path / "tea" / "cabinets" / f"{cabinet_id}.json").is_file()


def test_read_doc_of_a_missing_cabinet_is_gone() -> None:
    with pytest.raises(repo.CabinetGoneError):
        repo.read_doc("c_" + "0" * 32)


def test_write_then_read_round_trips_teas_and_nodes() -> None:
    cabinet_id = repo.new_cabinet("alice")
    doc = TeaDoc(
        id=cabinet_id,
        owner="alice",
        teas=[_tea()],
        catalogue_nodes=[
            CatalogueNode(id="u-11112222", parent_id="oolong", name="Mystery", source="user")
        ],
    )
    repo.write_doc(cabinet_id, doc)
    again = repo.read_doc(cabinet_id)
    assert [t.id for t in again.teas] == ["t-abc12345"]
    assert [n.id for n in again.catalogue_nodes] == ["u-11112222"]


def test_doc_transaction_persists_on_clean_exit() -> None:
    cabinet_id = repo.new_cabinet("alice")
    with repo.doc_transaction(cabinet_id) as doc:
        doc.teas.append(_tea())
    assert len(repo.read_doc(cabinet_id).teas) == 1


def test_doc_transaction_writes_nothing_when_the_block_raises() -> None:
    cabinet_id = repo.new_cabinet("alice")
    with pytest.raises(RuntimeError):
        with repo.doc_transaction(cabinet_id) as doc:
            doc.teas.append(_tea())
            raise RuntimeError("boom")
    assert repo.read_doc(cabinet_id).teas == []


def test_doc_transaction_never_recreates_a_deleted_cabinet(tmp_path: Path) -> None:
    cabinet_id = repo.new_cabinet("alice")
    repo.delete_cabinet(cabinet_id)
    with pytest.raises(repo.CabinetGoneError):
        with repo.doc_transaction(cabinet_id) as doc:
            doc.teas.append(_tea())
    assert not (tmp_path / "tea" / "cabinets" / f"{cabinet_id}.json").exists()


@pytest.mark.parametrize("bad", ["", "alice", "c_../x", "c_" + "g" * 32, "c_" + "0" * 31])
def test_unsafe_cabinet_ids_are_refused(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.read_doc(bad)


@pytest.mark.parametrize("bad", ["", "  ", "../etc", "a/b", "a\\b", " alice"])
def test_unsafe_usernames_are_refused(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.legacy_exists(bad)


def test_memberships_round_trip_and_start_empty() -> None:
    assert repo.read_memberships() == {}
    repo.write_memberships({"alice": "c_" + "1" * 32})
    assert repo.read_memberships() == {"alice": "c_" + "1" * 32}


def test_images_are_scoped_per_cabinet(tmp_path: Path) -> None:
    alice = repo.new_cabinet("alice")
    bob = repo.new_cabinet("bob")
    repo.save_image(alice, "t-abc12345", b"alice-photo", "jpg")
    found = repo.find_image(alice, "t-abc12345")
    assert found is not None and found.parent == tmp_path / "tea" / "images" / alice
    assert repo.find_image(bob, "t-abc12345") is None


def test_save_image_replaces_a_previous_upload_of_a_different_extension() -> None:
    cabinet_id = repo.new_cabinet("alice")
    repo.save_image(cabinet_id, "t-abc12345", b"first", "jpg")
    repo.save_image(cabinet_id, "t-abc12345", b"second", "png")
    found = repo.find_image(cabinet_id, "t-abc12345")
    assert found is not None and found.suffix == ".png"
    assert found.read_bytes() == b"second"


def test_delete_image_is_harmless_when_none_exists() -> None:
    repo.delete_image(repo.new_cabinet("alice"), "t-nosuchimage")


def test_delete_cabinet_removes_the_doc_and_its_photos(tmp_path: Path) -> None:
    cabinet_id = repo.new_cabinet("alice")
    repo.save_image(cabinet_id, "t-abc12345", b"photo", "jpg")
    repo.delete_cabinet(cabinet_id)
    assert not (tmp_path / "tea" / "cabinets" / f"{cabinet_id}.json").exists()
    assert not (tmp_path / "tea" / "images" / cabinet_id).exists()


def test_migrate_v1_goes_all_the_way_to_v3() -> None:
    raw: dict[str, object] = {"schema_version": 1, "teas": [], "catalogue_nodes": []}
    upgraded = repo.migrate(raw, cabinet_id="c_" + "1" * 32, owner="alice")
    assert upgraded["schema_version"] == 3
    assert upgraded["sessions"] == []
    assert (upgraded["id"], upgraded["owner"]) == ("c_" + "1" * 32, "alice")


def test_migrate_v2_marks_every_session_as_brewed_by_the_owner() -> None:
    raw: dict[str, object] = {"schema_version": 2, "teas": [], "sessions": [dict(_SESSION)]}
    upgraded = repo.migrate(raw, cabinet_id="c_" + "1" * 32, owner="alice")
    assert [s["brewed_by"] for s in upgraded["sessions"]] == ["alice"]  # type: ignore[union-attr]


def test_migrate_v2_without_an_owner_is_refused() -> None:
    with pytest.raises(ValueError):
        repo.migrate({"schema_version": 2, "sessions": []})


def test_adopt_legacy_copies_the_doc_and_moves_its_photos(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    legacy_images = tmp_path / "tea" / "images" / "alice"
    legacy_images.mkdir(parents=True)
    (legacy_images / "t-abc12345.jpg").write_bytes(b"photo")

    cabinet_id = repo.adopt_legacy("alice", referenced=set())

    doc = repo.read_doc(cabinet_id)
    assert (doc.id, doc.owner) == (cabinet_id, "alice")
    assert [t.id for t in doc.teas] == ["t-abc12345"]
    assert [s.brewed_by for s in doc.sessions] == ["alice"]
    assert repo.find_image(cabinet_id, "t-abc12345") is not None
    assert not legacy_images.exists()
    # The caller deletes the legacy file only after mapping the id.
    assert repo.legacy_exists("alice")


def test_adopt_legacy_reuses_the_cabinet_an_interrupted_attempt_wrote(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    first = repo.adopt_legacy("alice", referenced=set())
    again = repo.adopt_legacy("alice", referenced=set())
    assert again == first
    assert len(list((tmp_path / "tea" / "cabinets").glob("c_*.json"))) == 1


def test_adopt_legacy_never_reuses_a_mapped_cabinet(tmp_path: Path) -> None:
    mapped = repo.new_cabinet("alice")
    _write_legacy(tmp_path)
    assert repo.adopt_legacy("alice", referenced={mapped}) != mapped


def test_seed_catalogue_loads_and_is_cached() -> None:
    first = repo.read_seed_catalogue()
    assert first is repo.read_seed_catalogue()
    assert len(first) > 0
```

In `backend/tests/test_tea_schemas.py`, change line 22 `assert doc.schema_version == 2` to `assert doc.schema_version == 3`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_repo.py tests/test_tea_schemas.py -q`
Expected: FAIL — `AttributeError: module 'app.repositories.tea_repo' has no attribute 'new_cabinet'` (and schema version 2 ≠ 3).

- [ ] **Step 3: Update the schemas**

In `backend/app/schemas/tea.py`, replace the first paragraph of the module docstring with:

```python
"""Pydantic v2 schemas for the Tea Cabinet.

The persisted document is one JSON file per cabinet
(`DATA_DIR/tea/cabinets/{cabinet_id}.json`) holding the cabinet's teas, the
catalogue nodes its members added, and their brewing sessions. Who belongs to a
cabinet is recorded separately, in `DATA_DIR/tea/memberships.json`. Seeded nodes
are never written there — they ship in `app/data/tea_catalogue.json` and are
merged on read.
```

(keep the second paragraph about `name` and `catalogue_node_id` as is), and replace `TeaDoc` with:

```python
class TeaDoc(BaseModel):
    schema_version: int = 3
    # Empty only on the implicit cabinet of a user who has not written anything yet.
    id: str = ""
    owner: str = ""
    teas: list[Tea] = Field(default_factory=list)
    catalogue_nodes: list[CatalogueNode] = Field(default_factory=list)
    sessions: list[TeaSession] = Field(default_factory=list)
```

In `backend/app/schemas/tea_session.py`, change the docstring's "inside the user's tea doc" to "inside the cabinet's tea doc", and replace `TeaSession` with:

```python
class TeaSession(TeaSessionWrite):
    id: str
    # Server-owned like `id`: set from the caller on first write, never read from a body.
    brewed_by: str
    updated_at: str
    finished_at: str | None = None
```

- [ ] **Step 4: Rewrite the repository**

Replace the whole of `backend/app/repositories/tea_repo.py` with:

```python
"""Filesystem persistence for the Tea Cabinet — one JSON document per cabinet.

This module is the ONLY code in the app that touches the filesystem for tea,
including the read of the shipped seed catalogue. All writes go through the
atomic write-then-rename helper.

A cabinet's teas, the catalogue nodes its members added and its sessions live in
one document because they are edited together (AR-1). Who belongs to which
cabinet lives in `memberships.json` alone, so membership can never disagree with
itself.

Lock order is always membership, then cabinet: never take the membership lock
while holding a cabinet's.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import tempfile
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path
from typing import cast

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.tea import CatalogueNode, TeaDoc

_APP_DIR = "tea"
_SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "tea_catalogue.json"
_CABINET_ID = re.compile(r"c_[0-9a-f]{32}")


class CabinetGoneError(LookupError):
    """The cabinet a request resolved was removed by a membership change before it ran."""


def _validate_username(username: str) -> str:
    """Ensure `username` is a safe bare filename, never a path.

    Mirrors `context_switch_repo`: rejects separators and anything that could
    be read as a parent reference, so the on-disk path can never escape
    `users/`.
    """
    if not username or not username.strip():
        raise ValueError("username must not be empty")
    if username != username.strip():
        raise ValueError("username must not have surrounding whitespace")
    if "/" in username or "\\" in username or ".." in username:
        raise ValueError(f"unsafe username: {username!r}")
    return username


def _validate_cabinet_id(cabinet_id: str) -> str:
    if not _CABINET_ID.fullmatch(cabinet_id):
        raise ValueError(f"unsafe cabinet id: {cabinet_id!r}")
    return cabinet_id


def _root() -> Path:
    return settings.data_dir / _APP_DIR


def _cabinet_path(cabinet_id: str) -> Path:
    return _root() / "cabinets" / f"{_validate_cabinet_id(cabinet_id)}.json"


def _legacy_path(username: str) -> Path:
    return _root() / "users" / f"{_validate_username(username)}.json"


def _memberships_path() -> Path:
    return _root() / "memberships.json"


def _images_dir(cabinet_id: str) -> Path:
    return _root() / "images" / _validate_cabinet_id(cabinet_id)


def migrate(
    raw: dict[str, object], *, cabinet_id: str | None = None, owner: str | None = None
) -> dict[str, object]:
    """Upgrade a raw document to the current schema.

    v2 added `sessions`. v3 made the document a cabinet with an `id` and an
    `owner`, and gave every session a `brewed_by`. Only a legacy per-user file is
    ever below v3, and its user owns and brewed everything in it.
    """
    if raw.get("schema_version", 1) == 1:
        raw = {**raw, "schema_version": 2, "sessions": []}
    if raw["schema_version"] == 2:
        if cabinet_id is None or owner is None:
            raise ValueError("Upgrading to v3 needs the cabinet id and owner")
        sessions = cast(list[dict[str, object]], raw.get("sessions", []))
        raw = {
            **raw,
            "schema_version": 3,
            "id": cabinet_id,
            "owner": owner,
            "sessions": [{**session, "brewed_by": owner} for session in sessions],
        }
    return raw


def read_doc(cabinet_id: str) -> TeaDoc:
    """Read a cabinet. A missing file means a membership change removed it."""
    try:
        raw = _cabinet_path(cabinet_id).read_text(encoding="utf-8")
    except FileNotFoundError as exc:
        raise CabinetGoneError(f"No cabinet {cabinet_id!r}") from exc
    return TeaDoc.model_validate(migrate(json.loads(raw)))


def write_doc(cabinet_id: str, doc: TeaDoc) -> None:
    atomic_write_json(_cabinet_path(cabinet_id), doc.model_dump(mode="json"))


@contextmanager
def cabinet_lock(cabinet_id: str) -> Iterator[None]:
    with key_lock(str(_cabinet_path(cabinet_id))):
        yield


@contextmanager
def doc_transaction(cabinet_id: str) -> Iterator[TeaDoc]:
    """Read-modify-write a cabinet under that file's lock.

    The lock spans the whole block, so a concurrent request cannot read the
    same stale document and overwrite the change made here (NFR-2). If the
    block raises, nothing is written — a rejected request leaves no partial
    mutation behind. It never creates the file: a request that resolved its
    cabinet just before a membership change deleted it gets `CabinetGoneError`
    rather than resurrecting it.
    """
    with cabinet_lock(cabinet_id):
        doc = read_doc(cabinet_id)
        yield doc
        write_doc(cabinet_id, doc)


def new_cabinet(owner: str) -> str:
    """Write an empty cabinet owned by `owner` and return its id."""
    cabinet_id = f"c_{uuid.uuid4().hex}"
    write_doc(cabinet_id, TeaDoc(id=cabinet_id, owner=owner))
    return cabinet_id


def delete_cabinet(cabinet_id: str) -> None:
    """Remove a cabinet's document and its photos. Call under its lock."""
    _cabinet_path(cabinet_id).unlink(missing_ok=True)
    shutil.rmtree(_images_dir(cabinet_id), ignore_errors=True)


@contextmanager
def membership_lock() -> Iterator[None]:
    with key_lock(str(_memberships_path())):
        yield


def read_memberships() -> dict[str, str]:
    """Every member, owner included, mapped to their cabinet id."""
    try:
        raw = _memberships_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    return {str(user): str(cabinet) for user, cabinet in json.loads(raw).items()}


def write_memberships(members: dict[str, str]) -> None:
    """Replace the membership map. Call under the membership lock."""
    atomic_write_json(_memberships_path(), members)


def legacy_exists(username: str) -> bool:
    return _legacy_path(username).is_file()


def delete_legacy(username: str) -> None:
    _legacy_path(username).unlink(missing_ok=True)


def _orphan_owned_by(username: str, referenced: set[str]) -> str | None:
    """A cabinet an interrupted migration of `username` wrote but never mapped."""
    directory = _root() / "cabinets"
    if not directory.is_dir():
        return None
    for path in sorted(directory.glob("c_*.json")):
        if path.stem in referenced:
            continue
        if json.loads(path.read_text(encoding="utf-8")).get("owner") == username:
            return path.stem
    return None


def adopt_legacy(username: str, referenced: set[str]) -> str:
    """Copy `username`'s legacy document into a cabinet they own; return its id.

    Safe to repeat after a crash: a retry reuses the cabinet the interrupted
    attempt wrote, so photos never end up split across two folders. The legacy
    file is left in place — the caller deletes it only after mapping the id.
    Call under the membership lock.
    """
    cabinet_id = _orphan_owned_by(username, referenced) or f"c_{uuid.uuid4().hex}"
    raw = json.loads(_legacy_path(username).read_text(encoding="utf-8"))
    write_doc(
        cabinet_id,
        TeaDoc.model_validate(migrate(raw, cabinet_id=cabinet_id, owner=username)),
    )
    legacy_images = _root() / "images" / _validate_username(username)
    if legacy_images.is_dir() and not _images_dir(cabinet_id).exists():
        legacy_images.rename(_images_dir(cabinet_id))
    return cabinet_id


def find_image(cabinet_id: str, tea_id: str) -> Path | None:
    """The one stored image file for `tea_id`, whatever its extension."""
    directory = _images_dir(cabinet_id)
    if not directory.is_dir():
        return None
    matches = sorted(directory.glob(f"{tea_id}.*"))
    return matches[0] if matches else None


def save_image(cabinet_id: str, tea_id: str, content: bytes, extension: str) -> Path:
    """Store `content` as `tea_id`'s image, atomically and replacing any prior upload."""
    delete_image(cabinet_id, tea_id)
    directory = _images_dir(cabinet_id)
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"{tea_id}.{extension}"

    fd, tmp_name = tempfile.mkstemp(dir=directory, prefix=f"{path.name}.", suffix=".tmp")
    tmp = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, path)
    except BaseException:
        tmp.unlink(missing_ok=True)
        raise
    return path


def delete_image(cabinet_id: str, tea_id: str) -> None:
    """Remove `tea_id`'s stored image, if any. Harmless when none exists."""
    existing = find_image(cabinet_id, tea_id)
    if existing is not None:
        existing.unlink(missing_ok=True)


@lru_cache(maxsize=1)
def read_seed_catalogue() -> tuple[CatalogueNode, ...]:
    """The shipped catalogue tree, read once.

    It is immutable and ships with the image, so it is cached for the life of
    the process. A tuple rather than a list so a caller cannot mutate the
    cached value out from under everyone else.
    """
    raw = json.loads(_SEED_PATH.read_text(encoding="utf-8"))
    return tuple(CatalogueNode.model_validate(node) for node in raw)
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_tea_repo.py tests/test_tea_schemas.py -q`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/tea.py backend/app/schemas/tea_session.py backend/app/repositories/tea_repo.py backend/tests/test_tea_repo.py backend/tests/test_tea_schemas.py
git commit -m "feat(tea): key the tea store by cabinet, with a membership map and schema v3

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Cabinet resolution and lazy legacy migration

**Files:**
- Create: `backend/app/services/tea_cabinet_service.py`
- Create: `backend/tests/test_tea_cabinets.py`

**Interfaces:**
- Consumes: Task 1 repo functions.
- Produces: `tea_cabinet_service.CabinetGoneError` (alias of the repo's); `resolve(username: str) -> str | None`; `ensure(username: str) -> str`; `read_doc_for(username: str) -> TeaDoc`; private `_resolve_locked(members: dict[str, str], username: str) -> str | None` (used by Task 4).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tea_cabinets.py`:

```python
"""Resolving a user's cabinet, and migrating legacy per-user files into one."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import Tea
from app.services import tea_cabinet_service as cabinets


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _write_legacy(tmp_path: Path, username: str = "alice") -> None:
    tea = Tea(
        id="t-abc12345",
        name="Da Hong Pao",
        catalogue_node_id="oolong",
        grams_remaining=38,
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )
    raw = {"schema_version": 2, "teas": [tea.model_dump(mode="json")], "sessions": []}
    path = tmp_path / "tea" / "users" / f"{username}.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw), encoding="utf-8")


def test_a_new_user_has_no_cabinet_and_reads_an_empty_one_they_own(tmp_path: Path) -> None:
    assert cabinets.resolve("alice") is None
    doc = cabinets.read_doc_for("alice")
    assert (doc.id, doc.owner, doc.teas) == ("", "alice", [])
    assert not (tmp_path / "tea" / "memberships.json").exists()


def test_ensure_creates_one_cabinet_and_is_idempotent() -> None:
    first = cabinets.ensure("alice")
    assert cabinets.ensure("alice") == first
    assert cabinets.resolve("alice") == first
    assert repo.read_memberships() == {"alice": first}
    assert repo.read_doc(first).owner == "alice"


def test_resolve_migrates_a_legacy_file(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    cabinet_id = cabinets.resolve("alice")
    assert cabinet_id is not None
    assert repo.read_memberships() == {"alice": cabinet_id}
    assert [t.id for t in cabinets.read_doc_for("alice").teas] == ["t-abc12345"]
    assert not repo.legacy_exists("alice")


def test_a_crash_before_the_map_write_is_redone_on_the_same_cabinet(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    interrupted = repo.adopt_legacy("alice", referenced=set())  # crashed before mapping
    assert cabinets.resolve("alice") == interrupted
    assert len(list((tmp_path / "tea" / "cabinets").glob("c_*.json"))) == 1


def test_a_leftover_legacy_file_is_deleted_once_mapped(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    cabinet_id = repo.adopt_legacy("alice", referenced=set())
    repo.write_memberships({"alice": cabinet_id})  # crashed before deleting the legacy file
    assert cabinets.resolve("alice") == cabinet_id
    assert not repo.legacy_exists("alice")


def test_ensure_on_a_legacy_user_migrates_rather_than_starting_empty(tmp_path: Path) -> None:
    _write_legacy(tmp_path)
    cabinet_id = cabinets.ensure("alice")
    assert [t.id for t in repo.read_doc(cabinet_id).teas] == ["t-abc12345"]


def test_a_cabinet_deleted_under_a_mapped_user_reads_as_gone() -> None:
    cabinet_id = cabinets.ensure("alice")
    repo.delete_cabinet(cabinet_id)
    with pytest.raises(cabinets.CabinetGoneError):
        cabinets.read_doc_for("alice")
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_cabinets.py -q`
Expected: FAIL — `ImportError: cannot import name 'tea_cabinet_service'`.

- [ ] **Step 3: Write the service**

Create `backend/app/services/tea_cabinet_service.py`:

```python
"""Which cabinet a user's tea lives in.

Every tea service resolves the caller's cabinet here before touching the
repository. A user with no cabinet yet has an implicit empty one: reads see an
empty document they would own, and the first write creates it. A user who still
has a pre-v3 per-user file is migrated into a cabinet on first resolve.

Never call `resolve` or `ensure` inside a `repo.doc_transaction` block — they may
take the membership lock, which must always be taken before a cabinet's.
"""

from __future__ import annotations

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc

CabinetGoneError = repo.CabinetGoneError


def _resolve_locked(members: dict[str, str], username: str) -> str | None:
    """Resolve under the membership lock, finishing or running a legacy migration."""
    known = members.get(username)
    if known is not None:
        # A crash after the map write left the legacy file behind; kept, it would
        # be adopted again the day this user leaves the cabinet.
        repo.delete_legacy(username)
        return known
    if not repo.legacy_exists(username):
        return None
    cabinet_id = repo.adopt_legacy(username, set(members.values()))
    members[username] = cabinet_id
    repo.write_memberships(members)
    repo.delete_legacy(username)
    return cabinet_id


def resolve(username: str) -> str | None:
    """The caller's cabinet id, or None while they have none."""
    if not repo.legacy_exists(username):
        return repo.read_memberships().get(username)
    with repo.membership_lock():
        return _resolve_locked(repo.read_memberships(), username)


def ensure(username: str) -> str:
    """The caller's cabinet id, creating an empty cabinet they own if they have none."""
    cabinet_id = resolve(username)
    if cabinet_id is not None:
        return cabinet_id
    with repo.membership_lock():
        members = repo.read_memberships()
        cabinet_id = _resolve_locked(members, username)
        if cabinet_id is None:
            cabinet_id = repo.new_cabinet(username)
            members[username] = cabinet_id
            repo.write_memberships(members)
        return cabinet_id


def read_doc_for(username: str) -> TeaDoc:
    """The caller's cabinet document, or an empty one they would own."""
    cabinet_id = resolve(username)
    if cabinet_id is None:
        return TeaDoc(owner=username)
    return repo.read_doc(cabinet_id)
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_tea_cabinets.py tests/test_tea_repo.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/tea_cabinet_service.py backend/tests/test_tea_cabinets.py
git commit -m "feat(tea): resolve a user's cabinet, migrating legacy files lazily

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Route every tea service through the cabinet; 410 on a stale cabinet

**Files:**
- Modify: `backend/app/services/tea_service.py`
- Modify: `backend/app/services/tea_catalogue_service.py:44-55, 92-128`
- Modify: `backend/app/services/tea_session_service.py`
- Modify: `backend/app/services/tea_curve_service.py:57`
- Modify: `backend/app/routers/tea.py` (docstring, `router =` line)
- Create: `backend/tests/tea_support.py`
- Modify tests: `test_tea_catalogue.py`, `test_tea_service.py`, `test_tea_sessions.py`, `test_tea_concurrency.py`, `test_tea_api.py`

**Interfaces:**
- Consumes: `cabinets.resolve`, `cabinets.ensure`, `cabinets.read_doc_for`, `cabinets.CabinetGoneError`.
- Produces: `tests/tea_support.py` with `seed_doc(username, doc) -> str`, `doc_of(username) -> TeaDoc`, `cabinet_of(username) -> str`. Every existing service keeps its `username`-first signature. Sessions created by `upsert` carry `brewed_by=username`.

- [ ] **Step 1: Add the test helpers and the new failing tests**

Create `backend/tests/tea_support.py`:

```python
"""Helpers for tests that reach past a tea service into the cabinet on disk."""

from __future__ import annotations

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaDoc
from app.services import tea_cabinet_service as cabinets


def seed_doc(username: str, doc: TeaDoc) -> str:
    """Write `doc` as `username`'s cabinet, creating it if needed; return its id."""
    cabinet_id = cabinets.ensure(username)
    repo.write_doc(cabinet_id, doc.model_copy(update={"id": cabinet_id, "owner": username}))
    return cabinet_id


def doc_of(username: str) -> TeaDoc:
    return cabinets.read_doc_for(username)


def cabinet_of(username: str) -> str:
    cabinet_id = cabinets.resolve(username)
    assert cabinet_id is not None
    return cabinet_id
```

Append to `backend/tests/test_tea_concurrency.py`:

```python
def test_concurrent_first_writes_create_one_cabinet(tmp_path: Path) -> None:
    def add(n: int) -> None:
        service.create_tea("carol", TeaWriteRequest(name=f"Tea {n}", catalogue_node_id="oolong"))

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(add, range(16)))

    assert len(list((tmp_path / "tea" / "cabinets").glob("c_*.json"))) == 1
    assert len(service.list_teas("carol")) == 16
```

Append to `backend/tests/test_tea_api.py` (it already has `client` and a data-dir fixture; add the imports at the top if missing: `from app.repositories import tea_repo as repo` and `from tests.tea_support import cabinet_of`):

```python
def test_a_stale_cabinet_is_410_on_reads_and_writes() -> None:
    created = client.post(
        "/api/tea/teas", json={"name": "Longjing", "catalogue_node_id": "green"}
    ).json()
    repo.delete_cabinet(cabinet_of("test_user"))

    assert client.get("/api/tea/teas").status_code == 410
    response = client.delete(f"/api/tea/teas/{created['id']}")
    assert response.status_code == 410
    assert response.json()["detail"] == "Your cabinet changed — reload"
```

Now update the existing tests that reach the repo with a username:

- `test_tea_catalogue.py`: add `from tests.tea_support import seed_doc` and `from app.services import tea_cabinet_service as cabinets`; replace each `repo.write_doc(\n        "alice",\n        TeaDoc(...),\n    )` with `seed_doc(\n        "alice",\n        TeaDoc(...),\n    )` (three places: the shadow test at line 53, the orphan test at line 99, the cycle test at line 114); replace line 144 `with repo.doc_transaction("alice") as doc:` with `with repo.doc_transaction(cabinets.ensure("alice")) as doc:`.
- `test_tea_service.py`: add `from tests.tea_support import cabinet_of, doc_of, seed_doc`; line 104 `repo.write_doc(` → `seed_doc(`; line 181 `repo.read_doc("alice")` → `doc_of("alice")`; lines 195 and 224 `repo.find_image("alice", tea.id)` → `repo.find_image(cabinet_of("alice"), tea.id)`.
- `test_tea_sessions.py`: add `from tests.tea_support import doc_of`; lines 87, 141, 175 `repo.read_doc("alice")` → `doc_of("alice")`.
- `test_tea_concurrency.py`: add `from tests.tea_support import doc_of`; line 49 `repo.read_doc("alice")` → `doc_of("alice")`.

- [ ] **Step 2: Run the tea tests to verify the failures**

Run: `cd backend && .venv/bin/pytest tests -q -k tea`
Expected: FAIL — services still pass usernames to the repo (`ValueError: unsafe cabinet id: 'alice'`), and the new 410 test fails.

- [ ] **Step 3: Route `tea_service` through the cabinet**

In `backend/app/services/tea_service.py`:
- Docstring: replace "Operates on a single user's document via `tea_repo`." with "Operates on the caller's cabinet, resolved by `tea_cabinet_service`."
- Imports: add `from app.services import tea_cabinet_service as cabinets`.
- In `list_teas`, `get_tea`: `repo.read_doc(username)` → `cabinets.read_doc_for(username)`.
- In `create_tea`, `replace_tea`, `delete_tea`: `repo.doc_transaction(username)` → `repo.doc_transaction(cabinets.ensure(username))`.
- Replace `save_image`, `delete_image`, `image_path` with:

```python
def save_image(username: str, tea_id: str, content: bytes, content_type: str) -> TeaView:
    """Store an uploaded photo for `tea_id` and point `image_url` at its served route."""
    extension = _IMAGE_EXTENSIONS.get(content_type)
    if extension is None:
        raise ValueError("Only JPEG, PNG, WebP, or GIF images are supported")
    if len(content) > _MAX_IMAGE_BYTES:
        raise ValueError("Images must be 5MB or smaller")

    index = catalogue.node_index(catalogue.merged_nodes(username))
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        for position, existing in enumerate(doc.teas):
            if existing.id == tea_id:
                repo.save_image(cabinet_id, tea_id, content, extension)
                updated = existing.model_copy(
                    update={"image_url": f"/api/tea/teas/{tea_id}/image", "updated_at": _now_iso()}
                )
                doc.teas[position] = updated
                return _view(updated, index)
        raise FileNotFoundError(f"No tea with id {tea_id!r}")


def delete_image(username: str, tea_id: str) -> TeaView:
    """Remove a tea's stored photo and clear `image_url`."""
    index = catalogue.node_index(catalogue.merged_nodes(username))
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        for position, existing in enumerate(doc.teas):
            if existing.id == tea_id:
                repo.delete_image(cabinet_id, tea_id)
                updated = existing.model_copy(update={"image_url": None, "updated_at": _now_iso()})
                doc.teas[position] = updated
                return _view(updated, index)
        raise FileNotFoundError(f"No tea with id {tea_id!r}")


def image_path(username: str, tea_id: str) -> Path:
    """The on-disk path of `tea_id`'s stored photo. 404s cover both a missing tea and no photo."""
    cabinet_id = cabinets.resolve(username)
    if cabinet_id is None or not any(t.id == tea_id for t in repo.read_doc(cabinet_id).teas):
        raise FileNotFoundError(f"No tea with id {tea_id!r}")
    path = repo.find_image(cabinet_id, tea_id)
    if path is None:
        raise FileNotFoundError(f"No image for tea {tea_id!r}")
    return path
```

- [ ] **Step 4: Route the catalogue, session and curve services**

`backend/app/services/tea_catalogue_service.py`: add `from app.services import tea_cabinet_service as cabinets`; in `merged_nodes` replace `repo.read_doc(username).catalogue_nodes` with `cabinets.read_doc_for(username).catalogue_nodes`; in `create_node` and `delete_node` replace `repo.doc_transaction(username)` with `repo.doc_transaction(cabinets.ensure(username))`.

`backend/app/services/tea_session_service.py`: add `from app.services import tea_cabinet_service as cabinets`; in `upsert` and `discard` replace `repo.doc_transaction(username)` with `repo.doc_transaction(cabinets.ensure(username))`; in `list_in_progress` and `list_for_tea` replace `repo.read_doc(username)` with `cabinets.read_doc_for(username)`; in `upsert`, build the session with `brewed_by=username`:

```python
        session = TeaSession(
            **req.model_dump(exclude={"infusions"}),
            infusions=infusions,
            id=session_id,
            brewed_by=username,
            updated_at=stamp,
            finished_at=finished_at,
        )
```

`backend/app/services/tea_curve_service.py`: add `from app.services import tea_cabinet_service as cabinets`; in `curve_for` replace `doc = repo.read_doc(username)` with `doc = cabinets.read_doc_for(username)`; remove the now-unused `from app.repositories import tea_repo as repo` import.

- [ ] **Step 5: Translate a stale cabinet to 410 for every tea route**

In `backend/app/routers/tea.py`:
- Module docstring: replace the first paragraph with "A cabinet of teas, classified against a shared catalogue tree, that household members may share. Every route is scoped to the authenticated user via `get_current_user`; the username resolves the caller's cabinet and is never taken from request input." and append to the exception list: "`CabinetGoneError` -> 410 on every route, via `_TeaRoute`."
- Imports: add `from collections.abc import Callable, Coroutine` and `from typing import Any`; add `from fastapi import Request, Response` to the fastapi import; add `from fastapi.routing import APIRoute`; add `from app.services import tea_cabinet_service as cabinets`.
- Replace `router = APIRouter(prefix="/api/tea", tags=["tea"])` with:

```python
class _TeaRoute(APIRoute):
    """Turns a stale cabinet into 410 on every tea route, so no handler repeats it.

    Not 409: the timer reads a 409 on finish as "already finished" and clears it.
    """

    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def guarded(request: Request) -> Response:
            try:
                return await handler(request)
            except cabinets.CabinetGoneError as exc:
                raise HTTPException(status_code=410, detail="Your cabinet changed — reload") from exc

        return guarded


router = APIRouter(prefix="/api/tea", tags=["tea"], route_class=_TeaRoute)
```

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS (all tea tests, including the new concurrency and 410 tests).

- [ ] **Step 7: Lint and commit**

```bash
cd backend && black . && ruff check . && cd ..
git add backend/app/services backend/app/routers/tea.py backend/tests
git commit -m "feat(tea): resolve the caller's cabinet in every tea service; 410 when it went stale

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Membership — add, remove, leave, and the cabinet API

**Files:**
- Modify: `backend/app/schemas/tea.py` (append `CabinetView`, `AddMemberRequest`)
- Modify: `backend/app/services/tea_cabinet_service.py` (append membership functions)
- Modify: `backend/app/routers/tea.py` (three routes)
- Modify: `backend/tests/tea_support.py` (append `share`)
- Modify: `backend/tests/test_tea_cabinets.py` (append)
- Create: `backend/tests/test_tea_cabinets_api.py`

**Interfaces:**
- Consumes: Task 2 `resolve`, `ensure`, `_resolve_locked`; `auth_service.list_usernames()`.
- Produces: `CabinetView(id: str | None, owner: str, members: list[str], is_owner: bool)`; `AddMemberRequest(username: str)`; `get_cabinet(username) -> CabinetView`; `add_member(caller, username) -> CabinetView`; `remove_member(caller, username) -> CabinetView`; routes `GET /api/tea/cabinet`, `POST /api/tea/cabinet/members`, `DELETE /api/tea/cabinet/members/{username}`; test helper `share(owner, *members)`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/tea_support.py`:

```python
def share(owner: str, *members: str) -> None:
    """Put `members` in `owner`'s cabinet, registering everyone on the dock roster."""
    for name in (owner, *members):
        if name not in auth_service.list_usernames():
            auth_service.create_user(name)
    for name in members:
        cabinets.add_member(owner, name)
```

and add `from app.services import auth_service` to that file's import block.

Append to `backend/tests/test_tea_cabinets.py` (add the imports at the top: `from app.schemas.tea import TeaWriteRequest`, `from app.services import auth_service`, `from app.services import tea_service`, `from tests.tea_support import share`):

```python
def _users(*names: str) -> None:
    for name in names:
        auth_service.create_user(name)


def _add_tea(username: str) -> str:
    req = TeaWriteRequest(name="Longjing", catalogue_node_id="green")
    return tea_service.create_tea(username, req).id


def test_a_new_user_sees_a_cabinet_of_their_own() -> None:
    view = cabinets.get_cabinet("alice")
    assert (view.id, view.owner, view.members, view.is_owner) == (None, "alice", ["alice"], True)


def test_the_owner_adds_a_member_who_then_shares_everything() -> None:
    tea_id = _add_tea("alice")
    share("alice", "bob")

    view = cabinets.get_cabinet("bob")
    assert view.members == ["alice", "bob"]
    assert (view.owner, view.is_owner) == ("alice", False)
    assert cabinets.resolve("bob") == cabinets.resolve("alice")
    assert [t.id for t in tea_service.list_teas("bob")] == [tea_id]


def test_add_member_strips_whitespace() -> None:
    _users("alice", "bob")
    assert cabinets.add_member("alice", " bob ").members == ["alice", "bob"]


def test_joining_removes_the_joiners_empty_cabinet(tmp_path: Path) -> None:
    _users("alice", "bob")
    old = cabinets.ensure("bob")
    cabinets.add_member("alice", "bob")
    assert not (tmp_path / "tea" / "cabinets" / f"{old}.json").exists()


@pytest.mark.parametrize(
    ("username", "message"),
    [("nobody", "no one called"), ("alice", "already in this cabinet")],
)
def test_add_member_refuses_unknown_names_and_yourself(username: str, message: str) -> None:
    _users("alice")
    with pytest.raises(ValueError, match=message):
        cabinets.add_member("alice", username)


def test_add_member_refuses_someone_already_here() -> None:
    share("alice", "bob")
    with pytest.raises(ValueError, match="already in this cabinet"):
        cabinets.add_member("alice", "bob")


def test_only_the_owner_adds_people() -> None:
    share("alice", "bob")
    _users("carol")
    with pytest.raises(PermissionError):
        cabinets.add_member("bob", "carol")


def test_add_member_refuses_someone_with_teas() -> None:
    _users("alice", "bob")
    _add_tea("bob")
    with pytest.raises(ValueError, match="bob already has teas in their cabinet"):
        cabinets.add_member("alice", "bob")
    assert cabinets.get_cabinet("alice").members == ["alice"]


def test_add_member_refuses_a_legacy_user_with_teas(tmp_path: Path) -> None:
    _users("alice", "bob")
    _write_legacy(tmp_path, "bob")
    with pytest.raises(ValueError, match="already has teas"):
        cabinets.add_member("alice", "bob")


@pytest.mark.parametrize("target", ["bob", "carol"])
def test_add_member_refuses_someone_who_shares_another_cabinet(target: str) -> None:
    share("bob", "carol")
    _users("alice")
    with pytest.raises(ValueError, match="already shares a cabinet"):
        cabinets.add_member("alice", target)


def test_the_owner_removes_a_member_who_then_starts_empty() -> None:
    share("alice", "bob")
    view = cabinets.remove_member("alice", "bob")
    assert view.members == ["alice"]
    assert cabinets.resolve("bob") is None
    assert cabinets.get_cabinet("bob").members == ["bob"]


def test_a_member_leaves_and_starts_empty() -> None:
    _add_tea("alice")
    share("alice", "bob")
    view = cabinets.remove_member("bob", "bob")
    assert (view.id, view.members) == (None, ["bob"])
    assert tea_service.list_teas("bob") == []
    assert len(tea_service.list_teas("alice")) == 1


def test_leaving_after_a_migration_starts_empty(tmp_path: Path) -> None:
    _users("alice", "bob")
    cabinets.ensure("bob")
    share("alice", "bob")
    _write_legacy(tmp_path, "bob")  # a stale leftover that must never come back
    cabinets.resolve("bob")
    cabinets.remove_member("bob", "bob")
    assert tea_service.list_teas("bob") == []


def test_a_member_cannot_remove_someone_else() -> None:
    share("alice", "bob", "carol")
    with pytest.raises(PermissionError):
        cabinets.remove_member("bob", "carol")


def test_the_owner_cannot_leave() -> None:
    share("alice", "bob")
    with pytest.raises(ValueError, match="owner can't leave"):
        cabinets.remove_member("alice", "alice")


def test_removing_a_non_member_is_not_found() -> None:
    share("alice", "bob")
    _users("carol")
    with pytest.raises(FileNotFoundError):
        cabinets.remove_member("alice", "carol")
```

Create `backend/tests/test_tea_cabinets_api.py`:

```python
"""The cabinet routes: membership status codes, and what a member can reach."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.dependencies import get_current_user
from app.main import app
from app.repositories import tea_repo as repo
from app.services import auth_service
from app.services import tea_cabinet_service as cabinets

client = TestClient(app)


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)
    for name in ("alice", "bob", "carol"):
        auth_service.create_user(name)
    yield


def _as(username: str) -> None:
    app.dependency_overrides[get_current_user] = lambda: username


def test_get_cabinet_for_a_new_user() -> None:
    _as("alice")
    assert client.get("/api/tea/cabinet").json() == {
        "id": None,
        "owner": "alice",
        "members": ["alice"],
        "is_owner": True,
    }


def test_add_then_remove_a_member() -> None:
    _as("alice")
    added = client.post("/api/tea/cabinet/members", json={"username": "bob"})
    assert added.status_code == 200
    assert added.json()["members"] == ["alice", "bob"]

    removed = client.delete("/api/tea/cabinet/members/bob")
    assert removed.status_code == 200
    assert removed.json()["members"] == ["alice"]


def test_refusals_map_to_422_with_the_reason() -> None:
    _as("alice")
    response = client.post("/api/tea/cabinet/members", json={"username": "nobody"})
    assert response.status_code == 422
    assert "no one called" in response.json()["detail"]


def test_a_member_adding_people_is_403() -> None:
    cabinets.add_member("alice", "bob")
    _as("bob")
    assert client.post("/api/tea/cabinet/members", json={"username": "carol"}).status_code == 403


def test_removing_a_stranger_is_404() -> None:
    cabinets.ensure("alice")
    _as("alice")
    assert client.delete("/api/tea/cabinet/members/carol").status_code == 404


def test_a_member_can_see_the_owners_tea_photo() -> None:
    _as("alice")
    tea = client.post("/api/tea/teas", json={"name": "Longjing", "catalogue_node_id": "green"})
    tea_id = tea.json()["id"]
    client.post(
        f"/api/tea/teas/{tea_id}/image", files={"file": ("p.jpg", b"jpeg-bytes", "image/jpeg")}
    )
    cabinets.add_member("alice", "bob")

    token = auth_service.create_access_token("bob")
    response = client.get(f"/api/tea/teas/{tea_id}/image", params={"token": token})
    assert response.status_code == 200
    assert response.content == b"jpeg-bytes"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_cabinets.py tests/test_tea_cabinets_api.py -q`
Expected: FAIL — `AttributeError: module 'app.services.tea_cabinet_service' has no attribute 'add_member'` / 404 on `/api/tea/cabinet`.

- [ ] **Step 3: Add the schemas**

Append to `backend/app/schemas/tea.py`:

```python
class CabinetView(BaseModel):
    """The caller's cabinet as the Household sheet shows it. `members` includes the owner.

    `id` is None while the caller has no cabinet yet — they own an implicit empty one.
    """

    id: str | None
    owner: str
    members: list[str]
    is_owner: bool


class AddMemberRequest(BaseModel):
    username: str
```

- [ ] **Step 4: Add the membership rules**

In `backend/app/services/tea_cabinet_service.py`: extend the module docstring with a final paragraph "Membership changes raise `ValueError` (refused), `PermissionError` (not the owner) and `FileNotFoundError` (no such member); the router translates them."; change the imports to:

```python
from app.repositories import tea_repo as repo
from app.schemas.tea import CabinetView, TeaDoc
from app.services import auth_service
```

and append:

```python
def get_cabinet(username: str) -> CabinetView:
    cabinet_id = resolve(username)
    if cabinet_id is None:
        return CabinetView(id=None, owner=username, members=[username], is_owner=True)
    owner = repo.read_doc(cabinet_id).owner
    members = sorted(user for user, cabinet in repo.read_memberships().items() if cabinet == cabinet_id)
    return CabinetView(id=cabinet_id, owner=owner, members=members, is_owner=owner == username)


def _is_empty(doc: TeaDoc) -> bool:
    return not doc.teas and not doc.sessions and not doc.catalogue_nodes


def add_member(caller: str, username: str) -> CabinetView:
    """Move `username` into the caller's cabinet. Only an empty cabinet can be left behind."""
    username = username.strip()
    if username == caller:
        raise ValueError("You're already in this cabinet")
    if username not in auth_service.list_usernames():
        raise ValueError(f"There's no one called {username!r} on the dock")

    cabinet_id = ensure(caller)
    with repo.membership_lock():
        members = repo.read_memberships()
        if repo.read_doc(cabinet_id).owner != caller:
            raise PermissionError("Only the cabinet's owner can add people")
        theirs = _resolve_locked(members, username)
        if theirs == cabinet_id:
            raise ValueError(f"{username} is already in this cabinet")
        if theirs is None:
            members[username] = cabinet_id
            repo.write_memberships(members)
        else:
            if any(cabinet == theirs for user, cabinet in members.items() if user != username):
                raise ValueError(f"{username} already shares a cabinet with someone else")
            with repo.cabinet_lock(theirs):
                if not _is_empty(repo.read_doc(theirs)):
                    raise ValueError(f"{username} already has teas in their cabinet")
                members[username] = cabinet_id
                repo.write_memberships(members)
                # Only after the map write: a crash here leaves an unreferenced empty
                # file, never a member pointing at a cabinet that is gone.
                repo.delete_cabinet(theirs)
    return get_cabinet(caller)


def remove_member(caller: str, username: str) -> CabinetView:
    """The owner removes anyone else; a member removes themself (leaving)."""
    cabinet_id = resolve(caller)
    with repo.membership_lock():
        members = repo.read_memberships()
        if cabinet_id is None or members.get(username) != cabinet_id:
            raise FileNotFoundError(f"{username} isn't in this cabinet")
        owner = repo.read_doc(cabinet_id).owner
        if caller not in (owner, username):
            raise PermissionError("Only the cabinet's owner can remove other people")
        if username == owner:
            raise ValueError("The owner can't leave the cabinet — remove the other members instead")
        del members[username]
        repo.write_memberships(members)
    return get_cabinet(caller)
```

(Wrap the `members = sorted(...)` line in `get_cabinet` if black makes it exceed 100 columns — let `black` do it.)

- [ ] **Step 5: Add the routes**

In `backend/app/routers/tea.py`, add `AddMemberRequest` and `CabinetView` to the `app.schemas.tea` import, and append:

```python
@router.get("/cabinet", response_model=CabinetView)
def get_cabinet(current_user: str = Depends(get_current_user)) -> CabinetView:
    return cabinets.get_cabinet(current_user)


@router.post("/cabinet/members", response_model=CabinetView)
def add_cabinet_member(
    req: AddMemberRequest, current_user: str = Depends(get_current_user)
) -> CabinetView:
    try:
        return cabinets.add_member(current_user, req.username)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/cabinet/members/{username}", response_model=CabinetView)
def remove_cabinet_member(
    username: str, current_user: str = Depends(get_current_user)
) -> CabinetView:
    try:
        return cabinets.remove_member(current_user, username)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Member not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
```

Also add `-> 403` for `PermissionError` and `/cabinet` membership refusals to the router docstring's exception list.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
cd backend && black . && ruff check . && cd ..
git add backend/app backend/tests
git commit -m "feat(tea): add, remove and leave cabinet members

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Session ownership and the household Brewing Curve

**Files:**
- Modify: `backend/app/services/tea_session_service.py` (`upsert`, `discard`, `list_in_progress`, docstring)
- Modify: `backend/app/services/tea_curve_service.py` (`_best_session`, `curve_for`, docstring)
- Modify: `backend/app/routers/tea.py` (`upsert_session`, `discard_session`)
- Modify: `backend/tests/test_tea_sessions.py`, `backend/tests/test_tea_curve.py`, `backend/tests/test_tea_sessions_api.py`

**Interfaces:**
- Consumes: `tests.tea_support.share`, `doc_of`.
- Produces: `upsert`/`discard` raise `PermissionError` on another member's session; `list_in_progress(username)` returns only the caller's; curve label `"from your best session (★N, D Mon)"` or `"from {user}'s best session (★N, D Mon)"`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_tea_sessions.py` (add `from tests.tea_support import share` and `from app.services import tea_cabinet_service as cabinets` to the imports):

```python
def test_a_session_records_who_brewed_it_and_ignores_the_body() -> None:
    tea_id = _tea()
    body = TeaSessionWrite.model_validate(
        {**_write(tea_id=tea_id).model_dump(), "brewed_by": "mallory"}
    )
    assert sessions.upsert("alice", "s-1", body).brewed_by == "alice"


def test_a_member_cannot_touch_someone_elses_session() -> None:
    tea_id = _tea()
    share("alice", "bob")
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))

    with pytest.raises(PermissionError):
        sessions.upsert("bob", "s-1", _write(tea_id=tea_id))
    with pytest.raises(PermissionError):
        sessions.discard("bob", "s-1")
    assert [s.brewed_by for s in doc_of("alice").sessions] == ["alice"]


def test_recovery_lists_only_your_own_live_sessions() -> None:
    tea_id = _tea()
    share("alice", "bob")
    sessions.upsert("alice", "s-alice", _write(tea_id=tea_id))
    sessions.upsert("bob", "s-bob", _write(tea_id=tea_id))
    assert [s.id for s in sessions.list_in_progress("bob")] == ["s-bob"]


def test_a_teas_history_shows_everyones_finished_sessions() -> None:
    tea_id = _tea()
    share("alice", "bob")
    sessions.upsert("alice", "s-a", _write(tea_id=tea_id, status="finalised"))
    sessions.upsert("bob", "s-b", _write(tea_id=tea_id, status="finalised"))
    assert {s.brewed_by for s in sessions.list_for_tea("bob", tea_id)} == {"alice", "bob"}


def test_finishing_a_shared_tea_takes_the_grams_off_for_everyone() -> None:
    tea_id = _tea()
    share("alice", "bob")
    sessions.upsert("bob", "s-1", _write(tea_id=tea_id, status="finalised", leaf_grams=5))
    grams = next(t.grams_remaining for t in tea_service.list_teas("alice") if t.id == tea_id)
    assert grams == 35


def test_a_leaver_pushing_an_old_session_gets_not_found() -> None:
    tea_id = _tea()
    share("alice", "bob")
    sessions.upsert("bob", "s-1", _write(tea_id=tea_id))
    cabinets.remove_member("bob", "bob")
    with pytest.raises(FileNotFoundError):
        sessions.upsert("bob", "s-1", _write(tea_id=tea_id))
```

(`_tea()` in that file creates a 40 g tea for `"alice"`, hence 35.)

In `backend/tests/test_tea_curve.py`: add `username: str = "alice"` as the last parameter of `_finish` and pass it instead of the hard-coded `"alice"` to `sessions.upsert`; add `from tests.tea_support import share`; then append:

```python
def test_your_own_best_session_beats_a_better_rated_partners() -> None:
    tea_id = _tea()
    share("alice", "bob")
    _finish(tea_id, "s-mine", [30], rating=3)
    _finish(tea_id, "s-theirs", [12], rating=5, username="bob")

    curve = curves.curve_for("alice", tea_id)
    assert curve.steep_seconds == [30]
    assert curve.source_label.startswith("from your best session (★3")


def test_a_partners_best_session_beats_the_tea_defaults() -> None:
    tea_id = _tea(brewing={"steep_seconds": [40]})
    share("alice", "bob")
    _finish(tea_id, "s-theirs", [12], rating=5, username="bob")

    curve = curves.curve_for("alice", tea_id)
    assert curve.source == "best_session"
    assert curve.steep_seconds == [12]
    assert curve.source_label.startswith("from bob's best session (★5")
```

Append to `backend/tests/test_tea_sessions_api.py` (add `from app.core.dependencies import get_current_user` and `from tests.tea_support import share`):

```python
def test_another_members_session_is_403() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    share("test_user", "bob")

    app.dependency_overrides[get_current_user] = lambda: "bob"
    assert client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"])).status_code == 403
    assert client.delete("/api/tea/sessions/s-1").status_code == 403


def test_the_response_names_the_brewer() -> None:
    tea = _tea()
    body = {**_snapshot(tea["id"]), "brewed_by": "mallory"}
    assert client.put("/api/tea/sessions/s-1", json=body).json()["brewed_by"] == "test_user"
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_sessions.py tests/test_tea_curve.py tests/test_tea_sessions_api.py -q`
Expected: FAIL — no `PermissionError` raised, bob sees alice's live session, curve label "from your best session (★5" for bob's session.

- [ ] **Step 3: Enforce session ownership**

In `backend/app/services/tea_session_service.py`, update the docstring's last line to "Raises `FileNotFoundError`, `SessionFinalisedError`, `PermissionError` (another member's session); the router translates.", then in `upsert` replace

```python
        existing = _session_position(doc, session_id)
        if existing is not None and doc.sessions[existing].status == "finalised":
            raise SessionFinalisedError("This session is already finished")
```

with

```python
        existing = _session_position(doc, session_id)
        if existing is not None:
            _check_brewer(doc.sessions[existing], username)
            if doc.sessions[existing].status == "finalised":
                raise SessionFinalisedError("This session is already finished")
```

in `discard`, after the `if position is None:` block, add `_check_brewer(doc.sessions[position], username)`; add above `upsert`:

```python
def _check_brewer(session: TeaSession, username: str) -> None:
    if session.brewed_by != username:
        raise PermissionError(f"That session belongs to {session.brewed_by}")
```

and replace `list_in_progress` with:

```python
def list_in_progress(username: str) -> list[TeaSession]:
    """The caller's own live sessions — never another member's timer."""
    live = [
        s
        for s in cabinets.read_doc_for(username).sessions
        if s.status == "in_progress" and s.brewed_by == username
    ]
    return sorted(live, key=lambda s: s.updated_at, reverse=True)
```

In `backend/app/routers/tea.py`, add to both `upsert_session` and `discard_session`, before the `SessionFinalisedError` clause:

```python
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
```

- [ ] **Step 4: Make the curve household-aware**

In `backend/app/services/tea_curve_service.py`: change the docstring's first sentence to "A chain of sources, most personal first — the caller's own best-rated past session of the tea, then any member's, the tea's own brewing parameters, the nearest Almanac entry up the catalogue tree, then a generic gongfu curve." Replace `_best_session` with:

```python
def _best_session(doc: TeaDoc, tea_id: str, brewed_by: str | None = None) -> TeaSession | None:
    rated = [
        s
        for s in doc.sessions
        if s.tea_id == tea_id
        and s.status == "finalised"
        and s.rating is not None
        and (brewed_by is None or s.brewed_by == brewed_by)
        and any(i.actual_seconds is not None for i in s.infusions)
    ]
    # Most recent wins a tie: technique drifts, and the curve should follow it.
    return max(rated, key=lambda s: (s.rating, s.finished_at or ""), default=None)
```

and in `curve_for` replace the `best = ...` block's first lines with:

```python
    # Your own taste first; a tea only your partner has brewed still starts from theirs.
    best = _best_session(doc, tea_id, username) or _best_session(doc, tea_id)
    if best is not None:
        whose = "your" if best.brewed_by == username else f"{best.brewed_by}'s"
        links.append(
            _Link(
                "best_session",
                f"from {whose} best session (★{best.rating}, {_short_date(best.finished_at)})",
```

(the remaining `_Link` arguments are unchanged).

- [ ] **Step 5: Run the whole backend suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
cd backend && black . && ruff check . && cd ..
git add backend/app backend/tests
git commit -m "feat(tea): sessions belong to their brewer; the curve prefers your own best

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Frontend types and the household store

**Files:**
- Modify: `frontend/src/apps/tea/types.ts` (`TeaSession`, new `Cabinet`)
- Create: `frontend/src/apps/tea/stores/useTeaHouseholdStore.ts`
- Create: `frontend/src/apps/tea/stores/useTeaHouseholdStore.spec.ts`
- Modify fixtures: `stores/useTeaSessionsStore.spec.ts`, `stores/useTeaTimerStore.spec.ts`, `components/RecoveryCard.spec.ts`, `components/TeaSessionsList.spec.ts`, `pages/TimerPage.spec.ts`, `pages/TeaDetailPage.spec.ts`

**Interfaces:**
- Produces: `interface Cabinet { id: string | null; owner: string; members: string[]; is_owner: boolean }`; `TeaSession.brewed_by: string`; `useTeaHouseholdStore()` exposing `cabinet: Ref<Cabinet | null>`, `loading`, `error`, `shared: ComputedRef<boolean>`, `others: ComputedRef<string[]>`, `fetchCabinet(): Promise<void>`, `fetchRoster(): Promise<string[]>`, `addMember(username): Promise<boolean>`, `removeMember(username): Promise<boolean>`, `leave(): Promise<boolean>`.

- [ ] **Step 1: Write the failing store spec**

Create `frontend/src/apps/tea/stores/useTeaHouseholdStore.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, del: delMock, put: vi.fn() },
}));

import { useTeaHouseholdStore } from "./useTeaHouseholdStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Cabinet } from "../types";

const SHARED: Cabinet = { id: "c_1", owner: "jakub", members: ["jakub", "mia"], is_owner: true };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  useAuthStore().username = "jakub";
});

describe("useTeaHouseholdStore", () => {
  it("fetches the cabinet and knows it is shared, naming the others", async () => {
    getMock.mockResolvedValue(SHARED);
    const store = useTeaHouseholdStore();
    await store.fetchCabinet();
    expect(getMock).toHaveBeenCalledWith("/tea/cabinet");
    expect(store.shared).toBe(true);
    expect(store.others).toEqual(["mia"]);
    expect(store.loading).toBe(false);
  });

  it("is not shared with only one member", async () => {
    getMock.mockResolvedValue({ id: null, owner: "jakub", members: ["jakub"], is_owner: true });
    const store = useTeaHouseholdStore();
    await store.fetchCabinet();
    expect(store.shared).toBe(false);
    expect(store.others).toEqual([]);
  });

  it("adds a member and takes the returned cabinet", async () => {
    postMock.mockResolvedValue(SHARED);
    const store = useTeaHouseholdStore();
    expect(await store.addMember("mia")).toBe(true);
    expect(postMock).toHaveBeenCalledWith("/tea/cabinet/members", { username: "mia" });
    expect(store.cabinet).toEqual(SHARED);
  });

  it("shows the server's reason when an add is refused", async () => {
    postMock.mockRejectedValue(
      Object.assign(new Error("422"), { detail: "mia already has teas in their cabinet" }),
    );
    const store = useTeaHouseholdStore();
    expect(await store.addMember("mia")).toBe(false);
    expect(store.error).toBe("mia already has teas in their cabinet");
    expect(store.loading).toBe(false);
  });

  it("leaves with my own name and then reloads every tea store", async () => {
    delMock.mockResolvedValue({ id: null, owner: "jakub", members: ["jakub"], is_owner: true });
    getMock.mockResolvedValue([]);
    const store = useTeaHouseholdStore();
    expect(await store.leave()).toBe(true);
    expect(delMock).toHaveBeenCalledWith("/tea/cabinet/members/jakub");
    const paths = getMock.mock.calls.map((call) => call[0]);
    expect(paths).toEqual(
      expect.arrayContaining(["/tea/teas", "/tea/catalogue", "/tea/sessions?status=in_progress"]),
    );
  });

  it("reads the dock roster, and yields nothing if it fails", async () => {
    getMock.mockResolvedValueOnce({ usernames: ["jakub", "mia"] });
    const store = useTeaHouseholdStore();
    expect(await store.fetchRoster()).toEqual(["jakub", "mia"]);
    getMock.mockRejectedValueOnce(new Error("down"));
    expect(await store.fetchRoster()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaHouseholdStore.spec.ts`
Expected: FAIL — cannot resolve `./useTeaHouseholdStore`.

- [ ] **Step 3: Add the types**

In `frontend/src/apps/tea/types.ts`, replace `TeaSession` with:

```ts
export interface TeaSession extends TeaSessionWrite {
  id: string;
  brewed_by: string;
  updated_at: string;
  finished_at: string | null;
}
```

and append:

```ts
/** The caller's cabinet. `members` includes the owner; `id` is null until the first write. */
export interface Cabinet {
  id: string | null;
  owner: string;
  members: string[];
  is_owner: boolean;
}
```

- [ ] **Step 4: Write the store**

Create `frontend/src/apps/tea/stores/useTeaHouseholdStore.ts`:

```ts
import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { useAuthStore } from "@/stores/useAuthStore";
import { useTeaCabinetStore } from "./useTeaCabinetStore";
import { useTeaCatalogueStore } from "./useTeaCatalogueStore";
import { useTeaSessionsStore } from "./useTeaSessionsStore";
import type { Cabinet } from "../types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

export const useTeaHouseholdStore = defineStore("tea-household", () => {
  const cabinet = ref<Cabinet | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const shared = computed(() => (cabinet.value?.members.length ?? 0) > 1);
  /** Everyone in the cabinet but me — who the title and brewer labels name. */
  const others = computed(() =>
    (cabinet.value?.members ?? []).filter((u) => u !== useAuthStore().username),
  );

  async function fetchCabinet(): Promise<void> {
    loading.value = true;
    try {
      cabinet.value = await api.get<Cabinet>("/tea/cabinet");
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  /** The dock roster for the add field; a failure yields an empty list. */
  async function fetchRoster(): Promise<string[]> {
    try {
      const data = await api.get<{ usernames: string[] }>("/auth/users");
      return data.usernames;
    } catch (e) {
      error.value = message(e);
      return [];
    }
  }

  async function addMember(username: string): Promise<boolean> {
    loading.value = true;
    try {
      cabinet.value = await api.post<Cabinet>("/tea/cabinet/members", { username });
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function removeMember(username: string): Promise<boolean> {
    loading.value = true;
    try {
      cabinet.value = await api.del<Cabinet>(
        `/tea/cabinet/members/${encodeURIComponent(username)}`,
      );
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** Leaving swaps the whole cabinet under every other tea store, so they all reload. */
  async function leave(): Promise<boolean> {
    const me = useAuthStore().username;
    if (!me || !(await removeMember(me))) return false;
    await Promise.all([
      useTeaCabinetStore().fetchTeas(),
      useTeaCatalogueStore().fetchNodes(true),
      useTeaSessionsStore().fetchInProgress(),
    ]);
    return true;
  }

  return {
    cabinet,
    loading,
    error,
    shared,
    others,
    fetchCabinet,
    fetchRoster,
    addMember,
    removeMember,
    leave,
  };
});
```

- [ ] **Step 5: Add `brewed_by` to existing session fixtures**

Run: `cd frontend && grep -ln "curve_source_label" src/apps/tea --include=*.spec.ts`
In each listed spec, add `brewed_by: "jakub",` directly after the `id` field of every object literal that builds a `TeaSession` (fixture functions such as `session(id, overrides)` and inline objects like `finished` in `TeaDetailPage.spec.ts`). Do not add it to `TeaSessionWrite` bodies (objects without `id`/`updated_at`).

- [ ] **Step 6: Run the tests, typecheck and lint**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS, no type errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): household store and brewed_by on sessions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Household sheet and the cabinet title

**Files:**
- Create: `frontend/src/apps/tea/components/HouseholdSheet.vue`
- Create: `frontend/src/apps/tea/components/HouseholdSheet.spec.ts`
- Modify: `frontend/src/apps/tea/pages/CabinetPage.vue` (title span line 5, `onMounted`, styles `.cabinet__title`)
- Modify: `frontend/src/apps/tea/pages/CabinetPage.spec.ts`

**Interfaces:**
- Consumes: `useTeaHouseholdStore` (Task 6), `useAuthStore().username`.
- Produces: `<HouseholdSheet @close>`; test ids `household-sheet`, `household-member-{name}`, `household-remove-{name}`, `household-add-input`, `household-add`, `household-error`, `household-leave`, `household-leave-yes`, `household-leave-no`, `household-close`, `cabinet-household`.

- [ ] **Step 1: Write the failing specs**

Create `frontend/src/apps/tea/components/HouseholdSheet.spec.ts`:

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
  api: { get: getMock, post: postMock, del: delMock, put: vi.fn() },
}));

import HouseholdSheet from "./HouseholdSheet.vue";
import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Cabinet } from "../types";

async function sheet(cabinet: Cabinet, me = "jakub") {
  useAuthStore().username = me;
  useTeaHouseholdStore().cabinet = cabinet;
  getMock.mockResolvedValue({ usernames: ["jakub", "mia", "ola"] });
  const wrapper = mount(HouseholdSheet);
  await flushPromises();
  return wrapper;
}

const MINE: Cabinet = { id: "c_1", owner: "jakub", members: ["jakub", "mia"], is_owner: true };
const THEIRS: Cabinet = { id: "c_1", owner: "mia", members: ["jakub", "mia"], is_owner: false };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("HouseholdSheet", () => {
  it("lists members, marking the owner and me", async () => {
    const wrapper = await sheet(MINE);
    expect(wrapper.get("[data-testid=household-member-jakub]").text()).toContain("owner");
    expect(wrapper.get("[data-testid=household-member-jakub]").text()).toContain("you");
    expect(wrapper.get("[data-testid=household-member-mia]").text()).toContain("mia");
  });

  it("lets the owner remove others but not themself", async () => {
    const wrapper = await sheet(MINE);
    expect(wrapper.find("[data-testid=household-remove-jakub]").exists()).toBe(false);
    delMock.mockResolvedValue({ ...MINE, members: ["jakub"] });
    await wrapper.get("[data-testid=household-remove-mia]").trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/tea/cabinet/members/mia");
  });

  it("offers only people not already here, and adds the typed name", async () => {
    const wrapper = await sheet(MINE);
    const options = wrapper.findAll("datalist option").map((o) => o.attributes("value"));
    expect(options).toEqual(["ola"]);

    postMock.mockResolvedValue({ ...MINE, members: ["jakub", "mia", "ola"] });
    await wrapper.get("[data-testid=household-add-input]").setValue(" ola ");
    await wrapper.get("[data-testid=household-add]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith("/tea/cabinet/members", { username: "ola" });
    expect((wrapper.get("[data-testid=household-add-input]").element as HTMLInputElement).value).toBe("");
  });

  it("shows why an add was refused", async () => {
    const wrapper = await sheet(MINE);
    postMock.mockRejectedValue(
      Object.assign(new Error("422"), { detail: "ola already has teas in their cabinet" }),
    );
    await wrapper.get("[data-testid=household-add-input]").setValue("ola");
    await wrapper.get("[data-testid=household-add]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=household-error]").text()).toBe(
      "ola already has teas in their cabinet",
    );
  });

  it("gives a member leave behind a confirmation, and no add field", async () => {
    const wrapper = await sheet(THEIRS);
    expect(wrapper.find("[data-testid=household-add-input]").exists()).toBe(false);
    await wrapper.get("[data-testid=household-leave]").trigger("click");
    expect(wrapper.text()).toContain("You'll start with an empty cabinet");

    delMock.mockResolvedValue({ id: null, owner: "jakub", members: ["jakub"], is_owner: true });
    await wrapper.get("[data-testid=household-leave-yes]").trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/tea/cabinet/members/jakub");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
```

Append to the `describe("CabinetPage", ...)` block in `frontend/src/apps/tea/pages/CabinetPage.spec.ts` (add `import { useAuthStore } from "@/stores/useAuthStore";` to the imports):

```ts
  it("says who the cabinet is shared with and opens the household sheet", async () => {
    useAuthStore().username = "jakub";
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/cabinet")
        return Promise.resolve({ id: "c_1", owner: "jakub", members: ["jakub", "mia"], is_owner: true });
      if (path === "/auth/users") return Promise.resolve({ usernames: [] });
      return Promise.resolve([]);
    });
    const wrapper = render();
    await flushPromises();
    expect(wrapper.get("[data-testid=cabinet-household]").text()).toContain("with mia");

    await wrapper.get("[data-testid=cabinet-household]").trigger("click");
    expect(wrapper.find("[data-testid=household-sheet]").exists()).toBe(true);
  });

  it("keeps the plain title when nobody shares the cabinet", async () => {
    mockApi([]);
    const wrapper = render();
    await flushPromises();
    expect(wrapper.get("[data-testid=cabinet-household]").text()).toBe("Cabinet");
  });
```

(`render()` and `mockApi(teas, nodes = [NODE])` already exist in that spec.)

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/components/HouseholdSheet.spec.ts src/apps/tea/pages/CabinetPage.spec.ts`
Expected: FAIL — cannot resolve `./HouseholdSheet.vue`; no `cabinet-household` element.

- [ ] **Step 3: Write the sheet**

Create `frontend/src/apps/tea/components/HouseholdSheet.vue`:

```vue
<template>
  <div class="sheet" data-testid="household-sheet">
    <p class="sheet__title">Who shares this cabinet</p>

    <ul class="household__members">
      <li
        v-for="member in members"
        :key="member"
        class="household__member"
        :data-testid="`household-member-${member}`"
      >
        <span>
          {{ member }}
          <small v-if="member === household.cabinet?.owner"> · owner</small>
          <small v-if="member === me"> · you</small>
        </span>
        <button
          v-if="isOwner && member !== me"
          class="household__remove"
          :data-testid="`household-remove-${member}`"
          @click="household.removeMember(member)"
        >
          Remove
        </button>
      </li>
    </ul>

    <p v-if="household.error" class="household__error" data-testid="household-error">
      {{ household.error }}
    </p>

    <template v-if="isOwner">
      <label class="household__label" for="household-add">Add someone</label>
      <input
        id="household-add"
        v-model="draft"
        class="sheet__field"
        list="household-roster"
        placeholder="their dock username"
        data-testid="household-add-input"
      />
      <datalist id="household-roster">
        <option v-for="name in addable" :key="name" :value="name" />
      </datalist>
      <button
        class="sheet__save"
        data-testid="household-add"
        :disabled="draft.trim() === '' || household.loading"
        @click="add"
      >
        Add to cabinet
      </button>
    </template>

    <template v-else-if="confirmingLeave">
      <p class="household__hint">
        You'll start with an empty cabinet. Everything you logged stays here.
      </p>
      <button class="sheet__save" data-testid="household-leave-yes" @click="leave">
        Leave cabinet
      </button>
      <button class="sheet__cancel" data-testid="household-leave-no" @click="confirmingLeave = false">
        Stay
      </button>
    </template>
    <button v-else class="sheet__cancel" data-testid="household-leave" @click="confirmingLeave = true">
      Leave cabinet
    </button>

    <button class="sheet__cancel" data-testid="household-close" @click="emit('close')">Close</button>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";
import { useAuthStore } from "@/stores/useAuthStore";

const emit = defineEmits<{ close: [] }>();

const household = useTeaHouseholdStore();
const auth = useAuthStore();

const roster = ref<string[]>([]);
const draft = ref("");
const confirmingLeave = ref(false);

const me = computed(() => auth.username);
const members = computed(() => household.cabinet?.members ?? []);
// A user with no cabinet yet owns their implicit one.
const isOwner = computed(() => household.cabinet?.is_owner ?? true);
const addable = computed(() =>
  roster.value.filter((u) => u !== me.value && !members.value.includes(u)),
);

onMounted(async () => {
  household.error = null;
  roster.value = await household.fetchRoster();
});

async function add(): Promise<void> {
  if (await household.addMember(draft.value.trim())) draft.value = "";
}

async function leave(): Promise<void> {
  if (await household.leave()) emit("close");
}
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.household__members {
  list-style: none;
  margin: 0 0 12px;
  padding: 0;
}
.household__member {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 8px 0;
  border-bottom: 1px solid #241e19;
  color: #efe7da;
  font-size: 14px;
}
.household__member small {
  color: #8b7a63;
}
.household__remove {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-size: 13px;
  cursor: pointer;
}
.household__label {
  display: block;
  color: #8b7a63;
  font-size: 13px;
  margin-top: 6px;
}
.household__error,
.household__hint {
  color: #d9a45b;
  font-size: 13px;
  margin: 6px 0;
}
</style>
```

- [ ] **Step 4: Wire it into the cabinet page**

In `frontend/src/apps/tea/pages/CabinetPage.vue`, replace line 5 `<span class="cabinet__title">Cabinet</span>` with:

```vue
        <button
          class="cabinet__title"
          data-testid="cabinet-household"
          aria-label="Who shares this cabinet"
          @click="householding = true"
        >
          Cabinet<small v-if="household.shared" class="cabinet__with"> · with {{ sharedWith }}</small>
        </button>
```

Immediately before the closing `</q-page>` add:

```vue
    <HouseholdSheet v-if="householding" @close="householding = false" />
```

In the script: add `import HouseholdSheet from "../components/HouseholdSheet.vue";` and `import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";`, then beside the other store instances:

```ts
const household = useTeaHouseholdStore();
const householding = ref(false);
const sharedWith = computed(() =>
  household.others.length === 1 ? household.others[0] : `${household.others.length} others`,
);
```

and add `void household.fetchCabinet();` inside `onMounted`. In the styles, replace the `.cabinet__title` rule with:

```scss
.cabinet__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
  font-family: inherit;
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
}
.cabinet__with {
  color: #8b7a63;
  font-size: 13px;
  font-weight: 400;
}
```

- [ ] **Step 5: Run the tests, typecheck and lint**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS. (Existing CabinetPage tests keep passing: their default mock returns `[]` for `/tea/cabinet`, which reads as not shared.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): household sheet behind the cabinet title

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Brewer labels and the delete count on a tea's page

**Files:**
- Modify: `frontend/src/apps/tea/components/TeaSessionsList.vue` (+ `TeaSessionsList.spec.ts`)
- Modify: `frontend/src/apps/tea/pages/TeaDetailPage.vue` (line 156 list, lines 178-184 remove sheet, script, `onMounted` near line 454) (+ `TeaDetailPage.spec.ts`)

**Interfaces:**
- Consumes: `useTeaHouseholdStore().shared`, `useAuthStore().username`, `TeaSession.brewed_by`.
- Produces: `TeaSessionsList` props `{ sessions: TeaSession[]; shared?: boolean; me?: string | null }`; test id `sessions-brewer-{id}`.

- [ ] **Step 1: Write the failing specs**

Append to the `describe("TeaSessionsList", ...)` block in `TeaSessionsList.spec.ts`:

```ts
  it("names who brewed others' sessions once the cabinet is shared", () => {
    const wrapper = mount(TeaSessionsList, {
      props: {
        sessions: [session("s-1", { brewed_by: "mia" }), session("s-2", { brewed_by: "jakub" })],
        shared: true,
        me: "jakub",
      },
    });
    expect(wrapper.get("[data-testid=sessions-brewer-s-1]").text()).toBe("· mia");
    expect(wrapper.find("[data-testid=sessions-brewer-s-2]").exists()).toBe(false);
  });

  it("names nobody in a cabinet of one", () => {
    const wrapper = mount(TeaSessionsList, {
      props: { sessions: [session("s-1", { brewed_by: "mia" })], shared: false, me: "jakub" },
    });
    expect(wrapper.find("[data-testid=sessions-brewer-s-1]").exists()).toBe(false);
  });
```

Append to the `describe("TeaDetailPage", ...)` block in `TeaDetailPage.spec.ts` (add `import { useAuthStore } from "@/stores/useAuthStore";`):

```ts
  it("says how many sessions go with a shared tea, and how many are someone else's", async () => {
    useAuthStore().username = "jakub";
    const finished = (id: string, brewedBy: string) => ({
      id,
      brewed_by: brewedBy,
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
    });
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/teas") return Promise.resolve([tea()]);
      if (path === "/tea/catalogue") return Promise.resolve([OOLONG, WUYI]);
      if (path === "/tea/cabinet")
        return Promise.resolve({ id: "c_1", owner: "jakub", members: ["jakub", "mia"], is_owner: true });
      if (path === "/tea/teas/t-1/sessions")
        return Promise.resolve([finished("s-1", "jakub"), finished("s-2", "mia")]);
      return Promise.resolve([]);
    });
    const wrapper = mount(TeaDetailPage, { global: { stubs: STUBS } });
    await flushPromises();
    // The sessions list shows only outside edit mode.
    expect(wrapper.get("[data-testid=sessions-brewer-s-2]").text()).toBe("· mia");

    await wrapper.get('[data-testid="tea-edit"]').trigger("click");
    await wrapper.get('[data-testid="tea-remove"]').trigger("click");
    expect(wrapper.get('[data-testid="remove-confirm"]').text()).toContain(
      "Also deletes 2 sessions (1 by others).",
    );
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/components/TeaSessionsList.spec.ts src/apps/tea/pages/TeaDetailPage.spec.ts`
Expected: FAIL — no `sessions-brewer-*` element; no "Also deletes" text.

- [ ] **Step 3: Label the brewer**

In `TeaSessionsList.vue`, after the `sessions__stars` span add:

```vue
      <span
        v-if="shared && session.brewed_by !== me"
        class="sessions__brewer"
        :data-testid="`sessions-brewer-${session.id}`"
        >· {{ session.brewed_by }}</span
      >
```

replace `defineProps<{ sessions: TeaSession[] }>();` with:

```ts
// Brewers are named only once the cabinet is shared, so a cabinet of one looks as it always did.
defineProps<{ sessions: TeaSession[]; shared?: boolean; me?: string | null }>();
```

and add the style:

```scss
.sessions__brewer {
  color: #8b7a63;
}
```

- [ ] **Step 4: Count others' sessions on delete, and pass the labels through**

In `TeaDetailPage.vue`:
- Line 156: `<TeaSessionsList :sessions="sessions.byTea[teaId] ?? []" />` → `<TeaSessionsList :sessions="teaSessions" :shared="household.shared" :me="auth.username" />`.
- The remove sheet title (line ~179) becomes:

```vue
        <p class="sheet__title">
          Remove {{ tea.name }} from the cabinet? Its notes go with it.
          <template v-if="othersSessions > 0">
            Also deletes {{ teaSessions.length }} sessions ({{ othersSessions }} by others).
          </template>
        </p>
```

- Script: add `import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";`, and after `const auth = useAuthStore();`:

```ts
const household = useTeaHouseholdStore();
const teaSessions = computed(() => sessions.byTea[teaId.value] ?? []);
const othersSessions = computed(
  () => teaSessions.value.filter((s) => s.brewed_by !== auth.username).length,
);
```

- In the `onMounted` that calls `sessions.fetchForTea(teaId.value)` (line ~454), add `void household.fetchCabinet();`.

- [ ] **Step 5: Run the tests, typecheck and lint**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): name the brewer and count shared sessions before deleting a tea

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: PRD update and full verification

**Files:**
- Modify: `docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md` (§2.2 line 38, §5 line 297, NFR-5 line 363)

- [ ] **Step 1: Narrow the non-goal in the PRD**

- §2.2 line 38: replace the "Anyone but the builder — no multi-user accounts, …" bullet with: "- Anyone outside the household — no guests, followers, or public sharing. Household members may share one cabinet (see `docs/superpowers/specs/2026-09-27-tea-shared-cabinets-design.md`). A session may *note* guests as free text, but they are not users."
- §5 line 297: replace the "Not multi-user, not social." bullet with: "- **Not social.** Household members can share one cabinet, but there is no sharing beyond it: no feed, publishing, leaderboards, or read-only viewers. Guests are free text on a Session, not users."
- NFR-5 line 363: replace with: "- **NFR-5 — Household privacy.** All data sits behind the existing dock JWT auth. A cabinet is visible only to its members; there is no other sharing surface and no third-party data egress beyond the maps/place-search the platform already uses."

- [ ] **Step 2: Run everything**

Run: `cd backend && .venv/bin/pytest -q && black --check . && ruff check .`
Expected: all pass.

Run: `cd frontend && npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 3: Smoke test the migration on a copy of real data**

With the dev servers stopped and a scratch copy of the local data dir:

```bash
cd backend
cp -R ./local-data /tmp/tea-smoke && export DATA_DIR=/tmp/tea-smoke
.venv/bin/python -c "from app.services import tea_cabinet_service as c; import sys; u=sys.argv[1]; print(c.resolve(u)); print(len(c.read_doc_for(u).teas), 'teas')" <your-username>
ls /tmp/tea-smoke/tea
```

Expected: a `c_…` id, the same tea count you see in the app today, `cabinets/`, `images/c_…/`, `memberships.json`, and no `users/<your-username>.json`.

- [ ] **Step 4: Commit**

```bash
git add docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md
git commit -m "docs(tea): allow household sharing in the PRD

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
