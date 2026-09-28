# Cha Xi Journal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a tea sitting carry its cha xi (moods, guests, notes, one photo), written during the
brew from a Cha Xi page that keeps the running steep in reach, and browse every finished sitting in
a Journal that can also record, edit and delete sittings.

**Architecture:** Cha xi is a nested `cha_xi` object plus a server-owned `image_url` on the
existing `TeaSession`, stored in the cabinet's tea doc (schema v5). A journal-only entry is a
finished session with `timed: false`, for a Cabinet tea or for an away tea named in free text.
The frontend adds a Cha Xi page fed by the timer store's live session, a shared brew strip, and
Journal wall / entry / form pages over a new `useTeaJournalStore`.

**Tech Stack:** FastAPI + Pydantic v2 (Python 3.12), pytest; Vue 3 `<script setup lang="ts">`,
Quasar v2, Pinia, vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-09-28-tea-cha-xi-journal-design.md`

## Global Constraints

- Backend is strict 3-layer: routers translate exceptions to HTTP, services raise stdlib
  exceptions only, `tea_repo` is the only filesystem code. Every doc write goes through
  `repo.doc_transaction`.
- `black . && ruff check .` clean, line length 100. Type hints on all public signatures.
- Frontend: all HTTP through `@/composables/useApi` (`api.get/put/del/upload`); stores expose
  `loading` and `error` and set `loading` in `try/finally`; no `console.error`.
- `defineProps<{}>()` / `defineEmits<{}>()` generic syntax; no `any`; `interface` for shapes,
  `type` for unions.
- Mood vocabulary, exactly and in this order:
  `calm, bright, contemplative, cosy, social, focused, tired, restless`.
- A finished session is edited only by its brewer (`brewed_by`); other members read it.
- Grams are never taken below 0; given back, never above `max(grams_purchased, grams_remaining)`
  when `grams_purchased` is known.
- Pages have no title of their own — the shell bar shows `meta.title`, and `meta.backTo` drives
  its back arrow.
- Commit straight to `main` (user preference, no feature branches). Commit messages end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
- Commands: backend `cd backend && .venv/bin/pytest …`; frontend `cd frontend && npx vitest run …`,
  `npm run typecheck`, `npm run lint`.

## Review Focus

1. **Timer Discard after a finish whose response was lost.** The finished sitting must survive:
   `DELETE /sessions/{id}` keeps refusing a finalised session (409) and hands back no grams; only
   `DELETE /sessions/{id}/journal` deletes one. Pinned in Task 4.
2. **Editing only the notes of a finished session** must leave the tea's grams exactly as they
   were, even where clamping would make a return-then-take round trip drift. Pinned in Task 3.
3. **`started_at` strings in mixed shapes** (`…Z`, `…+00:00`, a bare `2026-09-20`, garbage) must
   sort the Journal without a 500. Pinned in Task 3.
4. **A snapshot pushed after the photo was uploaded** must not wipe the session's `image_url`
   (the phone never sends it). Pinned in Task 2.
5. **Opening the Cha Xi page, or returning to the timer, after the target has already passed**
   must not chime a second time for the same steep; and a live session stored before this release
   (no `chaXi` key) must still hydrate. Pinned in Tasks 6 and 7.

---

## File map

**Backend**
- Create `backend/app/schemas/tea_class.py` — the `TeaClass` literal (moved out of `tea.py`).
- Modify `backend/app/schemas/tea_session.py` — `Mood`, `ChaXi`, new session fields and rules,
  `JournalEdit`, `JournalEntry`.
- Modify `backend/app/schemas/tea.py` — import `TeaClass`; `schema_version = 5`.
- Modify `backend/app/repositories/tea_repo.py` — `migrate()` v4 → v5.
- Modify `backend/app/services/tea_session_service.py` — journal-only upsert, grams helper,
  photos, `edit_journal`, `delete_journal`, `list_journal`.
- Modify `backend/app/services/tea_curve_service.py` — skip untimed sessions.
- Modify `backend/app/services/tea_service.py` — `delete_tea` removes session photos.
- Modify `backend/app/routers/tea.py` — journal and session-photo routes.
- Create `backend/tests/test_tea_journal.py`, `backend/tests/test_tea_journal_api.py`.
- Modify `backend/tests/test_tea_schemas.py`, `backend/tests/test_tea_repo.py` (version 5).

**Frontend** (`frontend/src/…`)
- Modify `apps/tea/types.ts` — `Mood`, `ChaXi`, session fields, `JournalEntry`, `JournalEdit`.
- Create `apps/tea/journal.ts` (+ spec) — `MOODS`, `emptyChaXi`, `toggleMood`, `hasChaXi`,
  `groupByMonth`, `gramsReturned`, `toDateInput`, `fromDateInput`.
- Modify `apps/tea/composables/useTargetChime.ts` (+ spec) — module-scope context, no re-chime.
- Modify `apps/tea/stores/useTeaTimerStore.ts` (+ spec) — `chaXi`, `imageUrl`, photo actions.
- Create `apps/tea/components/ChaXiFields.vue` (+ spec), `apps/tea/components/BrewStrip.vue`
  (+ spec), `apps/tea/components/JournalCard.vue`.
- Create `apps/tea/pages/ChaXiPage.vue`, `JournalPage.vue`, `JournalEntryPage.vue`,
  `JournalFormPage.vue` (each + spec).
- Create `apps/tea/stores/useTeaJournalStore.ts` (+ spec).
- Modify `apps/tea/pages/TimerPage.vue` (+ spec), `apps/tea/components/TeaSessionsList.vue`
  (+ spec), `apps/tea/components/SectionIcon.vue`, `apps/tea/pages/TeaHomePage.vue` (+ spec),
  `router/routes.ts` (+ `router/routes.spec.ts`).
- Modify the `TeaSession` fixtures in: `apps/tea/ware.spec.ts`,
  `apps/tea/stores/useTeaSessionsStore.spec.ts`, `apps/tea/stores/useTeaTimerStore.spec.ts`,
  `apps/tea/components/RecoveryCard.spec.ts`, `apps/tea/components/TeaSessionsList.spec.ts`,
  `apps/tea/pages/TimerPage.spec.ts`, `apps/tea/pages/TeaDetailPage.spec.ts`,
  `apps/tea/pages/WareDetailPage.spec.ts`.

**Docs**
- Create `docs/stories/tea/cha-xi-journal.story.md` (moved to `for-review/` in Task 15).
- Modify `docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md` — pointer under §4.7.

Stages: Tasks 1–4 are the backend (shippable on their own), Tasks 5–9 cha xi while brewing,
Tasks 10–14 the Journal, Task 15 docs and final verification.

---

### Task 1: Session schema — cha xi, journal-only, away teas, v5

**Files:**
- Create: `backend/app/schemas/tea_class.py`
- Modify: `backend/app/schemas/tea_session.py`
- Modify: `backend/app/schemas/tea.py:24` and `:100`
- Modify: `backend/app/repositories/tea_repo.py` (`migrate`)
- Modify: `backend/tests/test_tea_schemas.py:22`, `backend/tests/test_tea_repo.py:164,248`
- Create: `backend/tests/test_tea_journal.py`

**Interfaces:**
- Produces: `app.schemas.tea_class.TeaClass`; in `app.schemas.tea_session`: `Mood`, `MOODS`,
  `ChaXi(moods, guests, notes)`, `TeaSessionWrite` gains `tea_id: str | None`,
  `away_tea_name: str`, `away_class_id: TeaClass | None`, `timed: bool`, `cha_xi: ChaXi | None`;
  `TeaSession` gains `image_url: str | None`; `JournalEdit`; `JournalEntry(TeaSession)` with
  `tea_name: str`, `class_id: TeaClass`, `tea_image_url: str | None`. `TeaDoc.schema_version == 5`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tea_journal.py`:

```python
"""Cha Xi Journal: session schema rules, journal-only entries, photos, edits, deletes, listing."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import tea_repo as repo
from app.schemas.tea_session import ChaXi, TeaSessionWrite


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _write(**overrides: object) -> TeaSessionWrite:
    """A live timed snapshot."""
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


def _entry(**overrides: object) -> TeaSessionWrite:
    """A journal-only entry: finished, untimed, no infusions."""
    payload: dict[str, object] = {
        "tea_id": "t-1",
        "status": "finalised",
        "started_at": "2026-09-20T12:00:00+00:00",
        "curve_source": "generic",
        "timed": False,
        "infusions": [],
    }
    payload.update(overrides)
    return TeaSessionWrite.model_validate(payload)


def test_moods_are_kept_once_each_in_vocabulary_order() -> None:
    assert ChaXi(moods=["social", "calm"]).moods == ["calm", "social"]


@pytest.mark.parametrize("moods", [["calm", "calm"], ["grumpy"]])
def test_a_repeated_or_unknown_mood_is_refused(moods: list[str]) -> None:
    with pytest.raises(ValidationError):
        ChaXi.model_validate({"moods": moods})


def test_a_snapshot_carries_its_cha_xi() -> None:
    snapshot = _write(cha_xi={"moods": ["calm"], "guests": "Eva", "notes": "honey"})
    assert snapshot.cha_xi is not None
    assert snapshot.cha_xi.guests == "Eva"
    assert snapshot.timed is True


def test_a_journal_only_entry_may_name_an_away_tea() -> None:
    entry = _entry(tea_id=None, away_tea_name="Teahouse Dancong", away_class_id="oolong")
    assert entry.tea_id is None
    assert entry.away_class_id == "oolong"


@pytest.mark.parametrize(
    "overrides",
    [
        {"tea_id": None},
        {"away_tea_name": "Dancong"},
        {"away_class_id": "oolong"},
        {"status": "in_progress"},
        {"infusions": [{"number": 1, "target_seconds": 10, "actual_seconds": 10}]},
    ],
)
def test_an_invalid_journal_only_entry_is_refused(overrides: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _entry(**overrides)


def test_an_away_tea_cannot_be_timed() -> None:
    with pytest.raises(ValidationError):
        _write(tea_id=None, away_tea_name="Dancong")


def test_a_v4_cabinet_upgrades_to_v5() -> None:
    raw: dict[str, object] = {
        "schema_version": 4,
        "id": "c-1",
        "owner": "alice",
        "teas": [],
        "catalogue_nodes": [],
        "sessions": [],
        "teaware": [],
    }
    assert repo.migrate(raw)["schema_version"] == 5
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_journal.py -v`
Expected: FAIL — `ImportError: cannot import name 'ChaXi'`.

- [ ] **Step 3: Move `TeaClass` into its own module**

Create `backend/app/schemas/tea_class.py`:

```python
"""The seven root classes of the Chinese classification, shared by teas and sessions."""

from typing import Literal

TeaClass = Literal["green", "yellow", "white", "oolong", "red", "dark", "other"]
```

In `backend/app/schemas/tea.py`, replace line 24
(`TeaClass = Literal["green", "yellow", "white", "oolong", "red", "dark", "other"]`) with an
import placed with the other `app.schemas` imports:

```python
from app.schemas.tea_class import TeaClass
```

and change `schema_version: int = 4` to `schema_version: int = 5`.

- [ ] **Step 4: Extend the session schema**

In `backend/app/schemas/tea_session.py`:

Change the imports to:

```python
from typing import Literal, get_args

from pydantic import BaseModel, Field, field_validator, model_validator

from app.schemas.tea_class import TeaClass
```

After `CurveSource = …` add:

```python
Mood = Literal[
    "calm", "bright", "contemplative", "cosy", "social", "focused", "tired", "restless"
]
MOODS: tuple[str, ...] = get_args(Mood)
```

After `class Infusion` add:

```python
class ChaXi(BaseModel):
    """The aesthetic layer of a sitting. Its photo is the session's own `image_url`."""

    moods: list[Mood] = Field(default_factory=list)
    guests: str = ""
    notes: str = ""

    @field_validator("moods")
    @classmethod
    def _each_once_in_order(cls, moods: list[Mood]) -> list[Mood]:
        if len(set(moods)) != len(moods):
            raise ValueError("Pick each mood once")
        return sorted(moods, key=MOODS.index)
```

Replace `class TeaSessionWrite` with:

```python
class TeaSessionWrite(BaseModel):
    """The snapshot body: a session minus the fields the server owns."""

    # None only for a journal-only entry of a tea that is not in the cabinet.
    tea_id: str | None = None
    away_tea_name: str = ""
    away_class_id: TeaClass | None = None
    status: SessionStatus
    started_at: str
    leaf_grams: float | None = Field(default=None, gt=0)
    water_temp_c: int | None = Field(default=None, ge=1, le=100)
    rating: int | None = Field(default=None, ge=1, le=5)
    curve_source: CurveSource
    curve_source_label: str = ""
    infusions: list[Infusion] = Field(default_factory=list)
    teaware_id: str | None = None
    # False = journal-only: brewed away from the timer, so it has no infusions.
    timed: bool = True
    cha_xi: ChaXi | None = None

    @model_validator(mode="after")
    def _numbered_in_order(self) -> TeaSessionWrite:
        if [i.number for i in self.infusions] != list(range(1, len(self.infusions) + 1)):
            raise ValueError("Infusions must be numbered 1, 2, 3… in order")
        return self

    @model_validator(mode="after")
    def _one_tea(self) -> TeaSessionWrite:
        away = bool(self.away_tea_name.strip())
        if (self.tea_id is None) != away:
            raise ValueError("A session names either a cabinet tea or an away tea")
        if self.tea_id is not None and self.away_class_id is not None:
            raise ValueError("Only an away tea takes a class of its own")
        if away and self.timed:
            raise ValueError("An away tea can only be a journal-only entry")
        return self

    @model_validator(mode="after")
    def _untimed_is_finished(self) -> TeaSessionWrite:
        if not self.timed and (self.status != "finalised" or self.infusions):
            raise ValueError("A journal-only entry is saved finished, with no infusions")
        return self
```

In `class TeaSession`, after `finished_at`, add:

```python
    # Server-owned: set by a photo upload, never read from a snapshot body.
    image_url: str | None = None
```

At the end of the file add:

```python
class JournalEdit(BaseModel):
    """What a finished session lets its brewer change.

    The last four fields belong to journal-only entries; leaving them out keeps them.
    """

    cha_xi: ChaXi | None = None
    rating: int | None = Field(default=None, ge=1, le=5)
    leaf_grams: float | None = Field(default=None, gt=0)
    water_temp_c: int | None = Field(default=None, ge=1, le=100)
    teaware_id: str | None = None
    started_at: str | None = None
    tea_id: str | None = None
    away_tea_name: str = ""
    away_class_id: TeaClass | None = None


class JournalEntry(TeaSession):
    """A finished session with its tea resolved for a Journal card."""

    tea_name: str
    class_id: TeaClass
    tea_image_url: str | None = None
```

- [ ] **Step 5: Migrate v4 → v5**

In `backend/app/repositories/tea_repo.py` `migrate()`, after the v3 → v4 block and before
`return raw`:

```python
    if raw["schema_version"] == 4:
        # Every v5 field has a default: old sessions read as timed, cabinet-tea, no cha xi.
        raw = {**raw, "schema_version": 5}
```

and extend its docstring's history line to end with `v4 added `teaware`. v5 added cha xi,
journal-only sessions and session photos.`

Update the three existing assertions that pin the current version:
`tests/test_tea_schemas.py:22` → `assert doc.schema_version == 5`;
`tests/test_tea_repo.py:164` and `:248` → `assert upgraded["schema_version"] == 5`.

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd backend && .venv/bin/pytest tests/test_tea_journal.py tests/test_tea_schemas.py tests/test_tea_repo.py tests/test_tea_sessions.py -v`
Expected: PASS.

- [ ] **Step 7: Format, lint, commit**

```bash
cd backend && black . && ruff check .
git add app/schemas/tea_class.py app/schemas/tea_session.py app/schemas/tea.py app/repositories/tea_repo.py tests/test_tea_journal.py tests/test_tea_schemas.py tests/test_tea_repo.py
git commit -m "feat(tea): sessions carry cha xi, and can be journal-only or for an away tea

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Journal-only upsert, grams helper, session photos

**Files:**
- Modify: `backend/app/services/tea_session_service.py`
- Modify: `backend/app/services/tea_curve_service.py` (`_best_session`)
- Modify: `backend/app/services/tea_service.py` (`delete_tea`)
- Test: `backend/tests/test_tea_journal.py`

**Interfaces:**
- Consumes: Task 1 schemas.
- Produces in `tea_session_service`: `_adjust_grams(doc: TeaDoc, session: TeaSession, sign: int,
  stamp: str) -> None`; `save_image(username: str, session_id: str, content: bytes,
  content_type: str) -> TeaSession`; `delete_image(username: str, session_id: str) -> TeaSession`;
  `image_path(username: str, session_id: str) -> Path`. Photo URL form:
  `/api/tea/sessions/{session_id}/image`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_tea_journal.py` (add the imports to the file's import block):

```python
from app.schemas.tea import TeaWriteRequest
from app.services import tea_curve_service as curves
from app.services import tea_service
from app.services import tea_session_service as sessions
from tests.tea_support import cabinet_of, share

JPEG = b"\xff\xd8\xff-jpeg-bytes"


def _tea(grams: float = 40, purchased: float | None = None, name: str = "Tieguanyin") -> str:
    req = TeaWriteRequest.model_validate(
        {
            "name": name,
            "catalogue_node_id": "oolong.anxi.tieguanyin",
            "grams_remaining": grams,
            "grams_purchased": purchased,
        }
    )
    return tea_service.create_tea("alice", req).id


def _grams(tea_id: str) -> float:
    return tea_service.get_tea("alice", tea_id).grams_remaining


def test_a_journal_only_entry_for_a_cabinet_tea_takes_its_grams() -> None:
    tea_id = _tea(40)
    saved = sessions.upsert("alice", "s-1", _entry(tea_id=tea_id, leaf_grams=5))
    assert saved.status == "finalised"
    assert saved.timed is False
    assert saved.finished_at is not None
    assert _grams(tea_id) == 35


def test_a_journal_only_entry_without_grams_leaves_the_tea_alone() -> None:
    tea_id = _tea(40)
    sessions.upsert("alice", "s-1", _entry(tea_id=tea_id))
    assert _grams(tea_id) == 40


def test_an_away_entry_touches_no_tea() -> None:
    tea_id = _tea(40)
    saved = sessions.upsert(
        "alice", "s-1", _entry(tea_id=None, away_tea_name="Teahouse Dancong", leaf_grams=5)
    )
    assert saved.tea_id is None
    assert saved.away_tea_name == "Teahouse Dancong"
    assert _grams(tea_id) == 40


def test_a_journal_only_entry_for_an_unknown_tea_is_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.upsert("alice", "s-1", _entry(tea_id="t-missing"))


def test_a_snapshot_after_a_photo_keeps_the_photo() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    again = sessions.upsert("alice", "s-1", _write(tea_id=tea_id, cha_xi={"notes": "orchid"}))
    assert again.image_url == "/api/tea/sessions/s-1/image"
    assert again.cha_xi is not None and again.cha_xi.notes == "orchid"


def test_only_the_brewer_changes_a_sessions_photo_but_members_see_it() -> None:
    tea_id = _tea()
    share("alice", "bob")
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    with pytest.raises(PermissionError):
        sessions.save_image("bob", "s-1", JPEG, "image/jpeg")
    with pytest.raises(PermissionError):
        sessions.delete_image("bob", "s-1")
    assert sessions.image_path("bob", "s-1").exists()


def test_a_photo_for_an_unknown_session_is_not_found() -> None:
    with pytest.raises(FileNotFoundError):
        sessions.save_image("alice", "s-missing", JPEG, "image/jpeg")


def test_deleting_a_photo_clears_it() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    cleared = sessions.delete_image("alice", "s-1")
    assert cleared.image_url is None
    with pytest.raises(FileNotFoundError):
        sessions.image_path("alice", "s-1")


def test_discarding_a_live_session_removes_its_photo() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    sessions.discard("alice", "s-1")
    assert repo.find_image(cabinet_of("alice"), "s-1") is None


def test_deleting_a_tea_removes_its_sessions_photos() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    tea_service.delete_tea("alice", tea_id)
    assert repo.find_image(cabinet_of("alice"), "s-1") is None


def test_a_rated_journal_only_entry_never_becomes_the_brewing_curve() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _entry(tea_id=tea_id, rating=5))
    assert curves.curve_for("alice", tea_id).source != "best_session"
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_journal.py -v`
Expected: FAIL — `AttributeError: module … has no attribute 'save_image'`, and the away-tea test
raises `FileNotFoundError` (today's `upsert` looks up `tea_id` even when it is `None`).

- [ ] **Step 3: Implement the service changes**

In `backend/app/services/tea_session_service.py`:

Update the module docstring's last paragraph to:

```python
Raises `FileNotFoundError`, `SessionFinalisedError`, `PermissionError` (another
member's session), `ValueError` (a vessel it can't be brewed in, a Journal edit it
can't take); the router translates.
```

Add imports:

```python
from pathlib import Path

from app.services import tea_service
```

Add after `_vessel_volume`:

```python
def _adjust_grams(doc: TeaDoc, session: TeaSession, sign: int, stamp: str) -> None:
    """Take (`sign=-1`) or give back (`sign=+1`) the leaf `session` used from its cabinet tea.

    Never below 0; a give-back never lifts the tea above what was bought (or above what it
    already holds, if someone typed in more). An away tea, no grams, or a tea since removed
    changes nothing.
    """
    if session.tea_id is None or session.leaf_grams is None:
        return
    position = next((i for i, tea in enumerate(doc.teas) if tea.id == session.tea_id), None)
    if position is None:
        return
    tea = doc.teas[position]
    grams = max(0.0, tea.grams_remaining + sign * session.leaf_grams)
    if sign > 0 and tea.grams_purchased is not None:
        grams = min(grams, max(tea.grams_purchased, tea.grams_remaining))
    doc.teas[position] = tea.model_copy(update={"grams_remaining": grams, "updated_at": stamp})
```

Replace `upsert` with:

```python
def upsert(username: str, session_id: str, req: TeaSessionWrite) -> TeaSession:
    """Store `req` as session `session_id`, finalising it if its status says so.

    A journal-only entry (`timed=False`) arrives already finalised, in one call.
    """
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        if req.tea_id is not None:
            _tea_position(doc, req.tea_id)
        existing = _session_position(doc, session_id)
        image_url = None
        if existing is not None:
            _check_brewer(doc.sessions[existing], username)
            if doc.sessions[existing].status == "finalised":
                raise SessionFinalisedError("This session is already finished")
            image_url = doc.sessions[existing].image_url
        vessel_volume_ml = _vessel_volume(doc, req.teaware_id)

        stamp = _now_iso()
        infusions = req.infusions
        finished_at = None
        if req.status == "finalised":
            # The phone always carries one pending steep; a finished session keeps
            # only what was actually brewed, renumbered so numbering stays 1..N.
            brewed = [i for i in req.infusions if i.actual_seconds is not None]
            infusions = [i.model_copy(update={"number": n}) for n, i in enumerate(brewed, 1)]
            finished_at = stamp

        session = TeaSession(
            **req.model_dump(exclude={"infusions"}),
            infusions=infusions,
            id=session_id,
            brewed_by=username,
            vessel_volume_ml=vessel_volume_ml,
            image_url=image_url,
            updated_at=stamp,
            finished_at=finished_at,
        )
        if req.status == "finalised":
            _adjust_grams(doc, session, -1, stamp)
        if existing is None:
            doc.sessions.append(session)
        else:
            doc.sessions[existing] = session
        return session
```

Replace `discard` with:

```python
def discard(username: str, session_id: str) -> None:
    """Remove an in-progress session and its photo. Nothing it recorded touches the tea."""
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _session_position(doc, session_id)
        if position is None:
            raise FileNotFoundError(f"No session with id {session_id!r}")
        _check_brewer(doc.sessions[position], username)
        if doc.sessions[position].status == "finalised":
            raise SessionFinalisedError("A finished session cannot be discarded")
        del doc.sessions[position]
    # After the write commits, so a failed write never loses the photo.
    repo.delete_image(cabinet_id, session_id)
```

Add at the end of the module:

```python
def _own_session(doc: TeaDoc, session_id: str, username: str) -> int:
    position = _session_position(doc, session_id)
    if position is None:
        raise FileNotFoundError(f"No session with id {session_id!r}")
    _check_brewer(doc.sessions[position], username)
    return position


def save_image(username: str, session_id: str, content: bytes, content_type: str) -> TeaSession:
    """Store the sitting's table photo and point `image_url` at its served route."""
    extension = tea_service.image_extension(content, content_type)
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _own_session(doc, session_id, username)
        repo.save_image(cabinet_id, session_id, content, extension)
        updated = doc.sessions[position].model_copy(
            update={
                "image_url": f"/api/tea/sessions/{session_id}/image",
                "updated_at": _now_iso(),
            }
        )
        doc.sessions[position] = updated
        return updated


def delete_image(username: str, session_id: str) -> TeaSession:
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _own_session(doc, session_id, username)
        repo.delete_image(cabinet_id, session_id)
        updated = doc.sessions[position].model_copy(
            update={"image_url": None, "updated_at": _now_iso()}
        )
        doc.sessions[position] = updated
        return updated


def image_path(username: str, session_id: str) -> Path:
    """The stored photo of a session any member can see. 404s cover no session and no photo."""
    cabinet_id = cabinets.resolve(username)
    if cabinet_id is None or not any(
        s.id == session_id for s in repo.read_doc(cabinet_id).sessions
    ):
        raise FileNotFoundError(f"No session with id {session_id!r}")
    path = repo.find_image(cabinet_id, session_id)
    if path is None:
        raise FileNotFoundError(f"No image for session {session_id!r}")
    return path
```

In `backend/app/services/tea_curve_service.py` `_best_session`, add `and s.timed` right after
`if s.tea_id == tea_id` so the condition reads:

```python
        if s.tea_id == tea_id
        and s.timed
        and s.status == "finalised"
```

In `backend/app/services/tea_service.py`, replace `delete_tea` with:

```python
def delete_tea(username: str, tea_id: str) -> None:
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        remaining = [tea for tea in doc.teas if tea.id != tea_id]
        if len(remaining) == len(doc.teas):
            raise FileNotFoundError(f"No tea with id {tea_id!r}")
        doc.teas = remaining
        gone = [session.id for session in doc.sessions if session.tea_id == tea_id]
        doc.sessions = [session for session in doc.sessions if session.tea_id != tea_id]
    for session_id in gone:
        repo.delete_image(cabinet_id, session_id)
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd backend && .venv/bin/pytest tests/test_tea_journal.py tests/test_tea_sessions.py tests/test_tea_curve.py tests/test_tea_service.py -v`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
cd backend && black . && ruff check .
git add app/services/tea_session_service.py app/services/tea_curve_service.py app/services/tea_service.py tests/test_tea_journal.py
git commit -m "feat(tea): journal-only sessions, and a table photo per session

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Edit, delete and list finished sessions

**Files:**
- Modify: `backend/app/services/tea_session_service.py`
- Test: `backend/tests/test_tea_journal.py`

**Interfaces:**
- Consumes: `_adjust_grams`, `_own_session` (Task 2); `JournalEdit`, `JournalEntry` (Task 1).
- Produces: `edit_journal(username: str, session_id: str, req: JournalEdit) -> JournalEntry`;
  `delete_journal(username: str, session_id: str) -> None`;
  `list_journal(username: str) -> list[JournalEntry]`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_tea_journal.py` (add `from app.schemas.tea_session import
JournalEdit` to the imports):

```python
def _finished(tea_id: str, session_id: str = "s-1", grams: float | None = 5) -> None:
    sessions.upsert("alice", session_id, _write(tea_id=tea_id, leaf_grams=grams))
    sessions.upsert(
        "alice", session_id, _write(tea_id=tea_id, leaf_grams=grams, status="finalised")
    )


def _edit(**fields: object) -> JournalEdit:
    return JournalEdit.model_validate({"leaf_grams": 5, **fields})


def test_editing_only_the_notes_leaves_the_grams_exactly() -> None:
    tea_id = _tea(48, purchased=50)
    _finished(tea_id)
    assert _grams(tea_id) == 43
    sessions.edit_journal("alice", "s-1", _edit(cha_xi={"notes": "orchid, stone"}))
    assert _grams(tea_id) == 43


@pytest.mark.parametrize(("grams", "remaining"), [(7, 41), (3, 45), (None, 48)])
def test_changing_the_leaf_moves_the_grams_by_the_difference(
    grams: float | None, remaining: float
) -> None:
    tea_id = _tea(48, purchased=50)
    _finished(tea_id)
    sessions.edit_journal("alice", "s-1", _edit(leaf_grams=grams))
    assert _grams(tea_id) == remaining


def test_moving_a_journal_only_entry_to_another_tea_moves_its_grams() -> None:
    first = _tea(40, name="Tieguanyin")
    second = _tea(30, name="Rougui")
    sessions.upsert("alice", "s-1", _entry(tea_id=first, leaf_grams=5))
    sessions.edit_journal("alice", "s-1", _edit(tea_id=second))
    assert _grams(first) == 40
    assert _grams(second) == 25


def test_an_edit_saves_cha_xi_rating_and_date() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _entry(tea_id=tea_id))
    entry = sessions.edit_journal(
        "alice",
        "s-1",
        _edit(
            leaf_grams=None,
            rating=4,
            started_at="2026-09-18T12:00:00+00:00",
            tea_id=tea_id,
            cha_xi={"moods": ["cosy"], "guests": "Eva"},
        ),
    )
    assert entry.rating == 4
    assert entry.started_at == "2026-09-18T12:00:00+00:00"
    assert entry.cha_xi is not None and entry.cha_xi.moods == ["cosy"]
    assert entry.tea_name == "Tieguanyin"


def test_a_timed_session_cannot_change_its_tea_or_date() -> None:
    tea_id = _tea()
    _finished(tea_id)
    with pytest.raises(ValueError):
        sessions.edit_journal("alice", "s-1", _edit(started_at="2026-09-01T12:00:00+00:00"))


def test_a_live_session_is_not_edited_through_the_journal() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    with pytest.raises(ValueError):
        sessions.edit_journal("alice", "s-1", _edit())


def test_only_the_brewer_edits_or_deletes_a_sitting() -> None:
    tea_id = _tea()
    share("alice", "bob")
    _finished(tea_id)
    with pytest.raises(PermissionError):
        sessions.edit_journal("bob", "s-1", _edit())
    with pytest.raises(PermissionError):
        sessions.delete_journal("bob", "s-1")


def test_deleting_a_sitting_gives_its_grams_back_and_removes_its_photo() -> None:
    tea_id = _tea(40)
    _finished(tea_id)
    sessions.save_image("alice", "s-1", JPEG, "image/jpeg")
    sessions.delete_journal("alice", "s-1")
    assert _grams(tea_id) == 40
    assert repo.find_image(cabinet_of("alice"), "s-1") is None
    assert sessions.list_journal("alice") == []


def test_a_give_back_never_lifts_a_tea_above_what_was_bought() -> None:
    tea_id = _tea(10, purchased=10)
    sessions.upsert("alice", "s-1", _entry(tea_id=tea_id, leaf_grams=20))
    assert _grams(tea_id) == 0
    sessions.delete_journal("alice", "s-1")
    assert _grams(tea_id) == 10


def test_a_live_session_is_not_deleted_through_the_journal() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id=tea_id))
    with pytest.raises(ValueError):
        sessions.delete_journal("alice", "s-1")


def test_the_journal_lists_newest_first_whatever_shape_the_dates_take() -> None:
    tea_id = _tea()
    for session_id, started in [
        ("s-a", "2026-09-20"),
        ("s-b", "2026-09-21T08:00:00Z"),
        ("s-c", "2026-09-19T10:00:00+00:00"),
        ("s-d", "not a date"),
    ]:
        sessions.upsert("alice", session_id, _entry(tea_id=tea_id, started_at=started))
    assert [e.id for e in sessions.list_journal("alice")] == ["s-b", "s-a", "s-c", "s-d"]


def test_the_journal_resolves_each_tea_and_includes_every_member() -> None:
    tea_id = _tea()
    share("alice", "bob")
    sessions.upsert("bob", "s-1", _entry(tea_id=tea_id))
    sessions.upsert("alice", "s-2", _entry(tea_id=None, away_tea_name="Teahouse Dancong"))
    sessions.upsert(
        "alice", "s-3", _entry(tea_id=None, away_tea_name="Dian Hong", away_class_id="red")
    )
    sessions.upsert("alice", "s-4", _write(tea_id=tea_id))
    by_id = {e.id: e for e in sessions.list_journal("alice")}
    assert set(by_id) == {"s-1", "s-2", "s-3"}
    assert (by_id["s-1"].tea_name, by_id["s-1"].class_id, by_id["s-1"].brewed_by) == (
        "Tieguanyin",
        "oolong",
        "bob",
    )
    assert (by_id["s-2"].tea_name, by_id["s-2"].class_id) == ("Teahouse Dancong", "other")
    assert by_id["s-3"].class_id == "red"
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_journal.py -v`
Expected: FAIL — `AttributeError: … has no attribute 'edit_journal'`.

- [ ] **Step 3: Implement**

In `backend/app/services/tea_session_service.py`, change these imports (`datetime` and `UTC` are
already imported):

```python
from app.schemas.tea import CatalogueNode, TeaDoc
from app.schemas.tea_session import JournalEdit, JournalEntry, TeaSession, TeaSessionWrite
from app.services import tea_catalogue_service as catalogue
```

Add at the end of the module:

```python
_JOURNAL_ONLY_FIELDS = {"started_at", "tea_id", "away_tea_name", "away_class_id"}
_TEA_FIELDS = {"tea_id", "away_tea_name", "away_class_id"}


def _finished_position(doc: TeaDoc, session_id: str, username: str) -> int:
    position = _own_session(doc, session_id, username)
    if doc.sessions[position].status != "finalised":
        raise ValueError("That session is still brewing — finish it on the timer first")
    return position


def _entry(doc: TeaDoc, session: TeaSession, index: dict[str, CatalogueNode]) -> JournalEntry:
    tea = next((t for t in doc.teas if t.id == session.tea_id), None) if session.tea_id else None
    if tea is not None:
        name = tea.name
        class_id = catalogue.resolve_class(index, tea.catalogue_node_id)
        image = tea.image_url
    else:
        name = session.away_tea_name or "a removed tea"
        class_id = session.away_class_id or "other"
        image = None
    return JournalEntry(
        **session.model_dump(), tea_name=name, class_id=class_id, tea_image_url=image
    )


def _moment(iso: str) -> datetime:
    """`started_at` as an aware moment; a string the phone wrote oddly sorts last, not 500s."""
    try:
        moment = datetime.fromisoformat(iso)
    except ValueError:
        return datetime.min.replace(tzinfo=UTC)
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


def list_journal(username: str) -> list[JournalEntry]:
    """Every finished session in the cabinet, any member's, newest sitting first."""
    index = catalogue.node_index(catalogue.merged_nodes(username))
    doc = cabinets.read_doc_for(username)
    done = sorted(
        (s for s in doc.sessions if s.status == "finalised"),
        key=lambda s: _moment(s.started_at),
        reverse=True,
    )
    return [_entry(doc, s, index) for s in done]


def edit_journal(username: str, session_id: str, req: JournalEdit) -> JournalEntry:
    """Apply a Journal edit to a finished session, moving grams only if the leaf changed."""
    index = catalogue.node_index(catalogue.merged_nodes(username))
    with repo.doc_transaction(cabinets.ensure(username)) as doc:
        position = _finished_position(doc, session_id, username)
        old = doc.sessions[position]
        moved = req.model_fields_set & _JOURNAL_ONLY_FIELDS
        if old.timed and moved:
            raise ValueError("Only a journal-only entry can change its tea or date")

        stamp = _now_iso()
        update: dict[str, object] = {
            "cha_xi": req.cha_xi,
            "rating": req.rating,
            "leaf_grams": req.leaf_grams,
            "water_temp_c": req.water_temp_c,
            "teaware_id": req.teaware_id,
            "updated_at": stamp,
        }
        # An unchanged vessel keeps its recorded volume, even if the pot has since retired.
        if req.teaware_id != old.teaware_id:
            update["vessel_volume_ml"] = _vessel_volume(doc, req.teaware_id)
        if "started_at" in moved and req.started_at:
            update["started_at"] = req.started_at
        if moved & _TEA_FIELDS:
            update["tea_id"] = req.tea_id
            update["away_tea_name"] = req.away_tea_name.strip()
            update["away_class_id"] = req.away_class_id
        new = TeaSession.model_validate({**old.model_dump(), **update})
        if new.tea_id is not None:
            _tea_position(doc, new.tea_id)

        # Only a real change moves grams: a give-back-then-take of the same leaf could drift
        # against the clamps.
        if (new.tea_id, new.leaf_grams) != (old.tea_id, old.leaf_grams):
            _adjust_grams(doc, old, +1, stamp)
            _adjust_grams(doc, new, -1, stamp)
        doc.sessions[position] = new
        return _entry(doc, new, index)


def delete_journal(username: str, session_id: str) -> None:
    """Delete a finished sitting, giving its leaf back to its tea. Not the timer's discard."""
    cabinet_id = cabinets.ensure(username)
    with repo.doc_transaction(cabinet_id) as doc:
        position = _finished_position(doc, session_id, username)
        _adjust_grams(doc, doc.sessions[position], +1, _now_iso())
        del doc.sessions[position]
    repo.delete_image(cabinet_id, session_id)
```

Note: `TeaSession.model_validate` raises `pydantic.ValidationError`, a `ValueError` subclass —
the router's `except ValueError` turns it into a 422.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd backend && .venv/bin/pytest tests/test_tea_journal.py -v`
Expected: PASS.

- [ ] **Step 5: Format, lint, commit**

```bash
cd backend && black . && ruff check .
git add app/services/tea_session_service.py tests/test_tea_journal.py
git commit -m "feat(tea): edit, delete and list finished sittings for the Journal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Journal and session-photo routes

**Files:**
- Modify: `backend/app/routers/tea.py`
- Create: `backend/tests/test_tea_journal_api.py`

**Interfaces:**
- Consumes: `sessions.list_journal`, `edit_journal`, `delete_journal`, `save_image`,
  `delete_image`, `image_path` (Tasks 2–3).
- Produces HTTP: `GET /api/tea/journal` → `JournalEntry[]`;
  `PUT /api/tea/sessions/{id}/journal` (body `JournalEdit`) → `JournalEntry`;
  `DELETE /api/tea/sessions/{id}/journal` → 204;
  `POST /api/tea/sessions/{id}/image` (multipart `file`) → 201 `TeaSession`;
  `GET /api/tea/sessions/{id}/image?token=` → image; `DELETE /api/tea/sessions/{id}/image` →
  `TeaSession`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tea_journal_api.py`:

```python
"""The Journal and session-photo routes: status codes and exception translation."""

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


# conftest.py signs every request in as "test_user" and clears overrides after each test.
@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea(grams: float = 40) -> dict[str, object]:
    body = {
        "name": "Tieguanyin",
        "catalogue_node_id": "oolong.anxi.tieguanyin",
        "grams_remaining": grams,
    }
    return client.post("/api/tea/teas", json=body).json()


def _snapshot(tea_id: object, status: str = "in_progress") -> dict[str, object]:
    return {
        "tea_id": tea_id,
        "status": status,
        "started_at": "2026-09-26T18:00:00+00:00",
        "leaf_grams": 6,
        "curve_source": "generic",
        "infusions": [{"number": 1, "target_seconds": 20, "actual_seconds": 21}],
    }


def _finish(tea_id: object, session_id: str = "s-1") -> None:
    client.put(f"/api/tea/sessions/{session_id}", json=_snapshot(tea_id))
    response = client.put(f"/api/tea/sessions/{session_id}", json=_snapshot(tea_id, "finalised"))
    assert response.status_code == 200


def _grams(tea_id: object) -> float:
    return client.get(f"/api/tea/teas/{tea_id}").json()["grams_remaining"]


def test_the_timers_discard_still_refuses_a_finished_sitting() -> None:
    tea = _tea(40)
    _finish(tea["id"])
    assert client.delete("/api/tea/sessions/s-1").status_code == 409
    assert _grams(tea["id"]) == 34
    assert [e["id"] for e in client.get("/api/tea/journal").json()] == ["s-1"]


def test_the_journal_lists_resolved_entries() -> None:
    tea = _tea()
    _finish(tea["id"])
    [entry] = client.get("/api/tea/journal").json()
    assert entry["tea_name"] == "Tieguanyin"
    assert entry["class_id"] == "oolong"
    assert entry["timed"] is True
    assert entry["image_url"] is None


def test_an_edit_returns_the_entry() -> None:
    tea = _tea()
    _finish(tea["id"])
    response = client.put(
        "/api/tea/sessions/s-1/journal",
        json={"leaf_grams": 6, "rating": 5, "cha_xi": {"moods": ["calm"], "guests": "Eva"}},
    )
    assert response.status_code == 200
    assert response.json()["cha_xi"]["guests"] == "Eva"


@pytest.mark.parametrize(
    ("body", "status"),
    [
        ({"cha_xi": {"moods": ["grumpy"]}}, 422),
        ({"started_at": "2026-09-01T12:00:00+00:00"}, 422),
    ],
)
def test_a_bad_edit_is_unprocessable(body: dict[str, object], status: int) -> None:
    tea = _tea()
    _finish(tea["id"])
    assert client.put("/api/tea/sessions/s-1/journal", json=body).status_code == status


def test_editing_a_live_session_is_unprocessable() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    assert client.put("/api/tea/sessions/s-1/journal", json={}).status_code == 422


def test_editing_an_unknown_session_is_not_found() -> None:
    assert client.put("/api/tea/sessions/s-nope/journal", json={}).status_code == 404


def test_another_member_cannot_edit_or_delete() -> None:
    tea = _tea()
    _finish(tea["id"])
    share("test_user", "bob")
    app.dependency_overrides[get_current_user] = lambda: "bob"
    assert client.put("/api/tea/sessions/s-1/journal", json={}).status_code == 403
    assert client.delete("/api/tea/sessions/s-1/journal").status_code == 403


def test_deleting_a_sitting_returns_its_grams() -> None:
    tea = _tea(40)
    _finish(tea["id"])
    assert client.delete("/api/tea/sessions/s-1/journal").status_code == 204
    assert _grams(tea["id"]) == 40
    assert client.get("/api/tea/journal").json() == []


def test_a_journal_only_entry_is_one_put() -> None:
    body = {
        "tea_id": None,
        "away_tea_name": "Teahouse Dancong",
        "status": "finalised",
        "started_at": "2026-09-20T12:00:00+00:00",
        "curve_source": "generic",
        "timed": False,
    }
    assert client.put("/api/tea/sessions/s-9", json=body).status_code == 200
    [entry] = client.get("/api/tea/journal").json()
    assert entry["tea_name"] == "Teahouse Dancong"


def test_a_session_photo_round_trips_via_token() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    uploaded = client.post(
        "/api/tea/sessions/s-1/image",
        files={"file": ("p.jpg", b"jpeg-bytes", "image/jpeg")},
    )
    assert uploaded.status_code == 201
    assert uploaded.json()["image_url"] == "/api/tea/sessions/s-1/image"
    token = auth_service.create_access_token("test_user")
    fetched = client.get("/api/tea/sessions/s-1/image", params={"token": token})
    assert fetched.status_code == 200
    assert fetched.content == b"jpeg-bytes"
    assert client.delete("/api/tea/sessions/s-1/image").json()["image_url"] is None


def test_a_photo_that_cannot_be_kept_is_unprocessable() -> None:
    tea = _tea()
    client.put("/api/tea/sessions/s-1", json=_snapshot(tea["id"]))
    response = client.post(
        "/api/tea/sessions/s-1/image", files={"file": ("p.txt", b"hello", "text/plain")}
    )
    assert response.status_code == 422
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_journal_api.py -v`
Expected: FAIL — 404/405 from the missing routes.

- [ ] **Step 3: Add the routes**

In `backend/app/routers/tea.py`, change the session schema import to:

```python
from app.schemas.tea_session import (
    BrewingCurve,
    JournalEdit,
    JournalEntry,
    TeaSession,
    TeaSessionWrite,
)
```

Add after `discard_session`:

```python
@router.get("/journal", response_model=list[JournalEntry])
def list_journal(current_user: str = Depends(get_current_user)) -> list[JournalEntry]:
    return sessions.list_journal(current_user)


@router.put("/sessions/{session_id}/journal", response_model=JournalEntry)
def edit_journal(
    session_id: str,
    req: JournalEdit,
    current_user: str = Depends(get_current_user),
) -> JournalEntry:
    try:
        return sessions.edit_journal(current_user, session_id, req)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Session or tea not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.delete("/sessions/{session_id}/journal", status_code=204)
def delete_journal(session_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        sessions.delete_journal(current_user, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.post("/sessions/{session_id}/image", response_model=TeaSession, status_code=201)
async def upload_session_image(
    session_id: str,
    file: Annotated[UploadFile, File()],
    current_user: str = Depends(get_current_user),
) -> TeaSession:
    content = await file.read()
    try:
        return sessions.save_image(current_user, session_id, content, file.content_type or "")
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.get("/sessions/{session_id}/image")
def get_session_image(session_id: str, token: str = Query(...)) -> FileResponse:
    """`?token=` for the same reason as tea photos: an `<img>` can't send a header."""
    current_user = user_from_token(token)
    try:
        path = sessions.image_path(current_user, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Image not found") from exc
    media_type = _IMAGE_MEDIA_TYPES.get(path.suffix.removeprefix("."), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.delete("/sessions/{session_id}/image", response_model=TeaSession)
def delete_session_image(
    session_id: str, current_user: str = Depends(get_current_user)
) -> TeaSession:
    try:
        return sessions.delete_image(current_user, session_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Session not found") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
```

Add `/journal` to the module docstring's description only if it lists routes (it does not
today — leave it).

- [ ] **Step 4: Run the whole backend suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: all pass (baseline was 1877; now more).

- [ ] **Step 5: Format, lint, commit**

```bash
cd backend && black . && ruff check .
git add app/routers/tea.py tests/test_tea_journal_api.py
git commit -m "feat(tea): Journal and session-photo routes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Frontend types, journal helpers, session-row links

**Files:**
- Modify: `frontend/src/apps/tea/types.ts`
- Create: `frontend/src/apps/tea/journal.ts`, `frontend/src/apps/tea/journal.spec.ts`
- Modify: `frontend/src/apps/tea/stores/useTeaTimerStore.ts` (`snapshot` only)
- Modify: `frontend/src/apps/tea/components/TeaSessionsList.vue` (+ spec)
- Modify: `frontend/src/apps/tea/pages/TimerPage.vue` (`teaName` signature only)
- Modify: the eight `TeaSession` fixture files listed in the File map.

**Interfaces:**
- Produces in `types.ts`: `Mood`, `ChaXi`, `TeaSessionWrite` fields `tea_id: string | null`,
  `away_tea_name: string`, `away_class_id: TeaClass | null`, `timed: boolean`,
  `cha_xi: ChaXi | null`; `TeaSession.image_url: string | null`; `JournalEntry`; `JournalEdit`.
- Produces in `journal.ts`: `MOODS: Mood[]`, `emptyChaXi(): ChaXi`,
  `toggleMood(moods: Mood[], mood: Mood): Mood[]`,
  `hasChaXi(s: { cha_xi: ChaXi | null; image_url: string | null }): boolean`,
  `groupByMonth(entries: JournalEntry[]): MonthGroup[]` (`MonthGroup { key; label; entries }`),
  `gramsReturned(s: Pick<TeaSession, "tea_id" | "leaf_grams">): number | null`,
  `toDateInput(iso: string): string`, `fromDateInput(value: string): string`.
- Route name used by the session rows: `tea-journal-entry` with param `id` (added in Task 12).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/journal.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MOODS,
  emptyChaXi,
  fromDateInput,
  gramsReturned,
  groupByMonth,
  hasChaXi,
  toDateInput,
  toggleMood,
} from "./journal";
import type { JournalEntry } from "./types";

function entry(id: string, started_at: string): JournalEntry {
  return {
    id,
    tea_id: "t-1",
    away_tea_name: "",
    away_class_id: null,
    status: "finalised",
    started_at,
    leaf_grams: null,
    water_temp_c: null,
    rating: null,
    curve_source: "generic",
    curve_source_label: "",
    infusions: [],
    teaware_id: null,
    timed: true,
    cha_xi: null,
    brewed_by: "jakub",
    vessel_volume_ml: null,
    updated_at: started_at,
    finished_at: started_at,
    image_url: null,
    tea_name: "Tieguanyin",
    class_id: "oolong",
    tea_image_url: null,
  };
}

describe("journal helpers", () => {
  it("keeps moods in the vocabulary's order when toggling", () => {
    expect(MOODS).toEqual([
      "calm",
      "bright",
      "contemplative",
      "cosy",
      "social",
      "focused",
      "tired",
      "restless",
    ]);
    expect(toggleMood(["social"], "calm")).toEqual(["calm", "social"]);
    expect(toggleMood(["calm", "social"], "calm")).toEqual(["social"]);
  });

  it("counts a sitting as cha xi once anything of it is recorded", () => {
    expect(hasChaXi({ cha_xi: null, image_url: null })).toBe(false);
    expect(hasChaXi({ cha_xi: emptyChaXi(), image_url: null })).toBe(false);
    expect(hasChaXi({ cha_xi: { ...emptyChaXi(), guests: "  " }, image_url: null })).toBe(false);
    expect(hasChaXi({ cha_xi: { ...emptyChaXi(), moods: ["calm"] }, image_url: null })).toBe(
      true,
    );
    expect(hasChaXi({ cha_xi: { ...emptyChaXi(), notes: "honey" }, image_url: null })).toBe(true);
    expect(hasChaXi({ cha_xi: null, image_url: "/api/tea/sessions/s-1/image" })).toBe(true);
  });

  it("groups newest-first entries by month", () => {
    const groups = groupByMonth([
      entry("a", "2026-09-28T18:00:00Z"),
      entry("b", "2026-09-02T18:00:00Z"),
      entry("c", "2026-08-30T18:00:00Z"),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["September 2026", "August 2026"]);
    expect(groups.map((g) => g.entries.map((e) => e.id))).toEqual([["a", "b"], ["c"]]);
  });

  it("gives grams back only for a cabinet tea", () => {
    expect(gramsReturned({ tea_id: "t-1", leaf_grams: 5 })).toBe(5);
    expect(gramsReturned({ tea_id: null, leaf_grams: 5 })).toBeNull();
    expect(gramsReturned({ tea_id: "t-1", leaf_grams: null })).toBeNull();
  });

  it("round-trips a picked day through local noon", () => {
    const iso = fromDateInput("2026-09-20");
    expect(new Date(iso).getHours()).toBe(12);
    expect(toDateInput(iso)).toBe("2026-09-20");
  });
});
```

In `frontend/src/apps/tea/components/TeaSessionsList.spec.ts`, add `RouterLinkStub` to the
`@vue/test-utils` import and add these tests (they use the file's `session(id, overrides)`
helper):

```ts
  it("opens a session's Journal entry from its row", () => {
    const wrapper = mount(TeaSessionsList, {
      props: { sessions: [session("s-1")] },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    expect(wrapper.findComponent(RouterLinkStub).props("to")).toEqual({
      name: "tea-journal-entry",
      params: { id: "s-1" },
    });
  });

  it("names an away tea by the name it was given", () => {
    const away = session("s-2", { tea_id: null, away_tea_name: "Teahouse Dancong", timed: false });
    const wrapper = mount(TeaSessionsList, {
      props: { sessions: [away], teaNames: { "t-1": "Tieguanyin" } },
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
    expect(wrapper.get(`[data-testid=sessions-tea-${away.id}]`).text()).toBe("Teahouse Dancong");
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/journal.spec.ts src/apps/tea/components/TeaSessionsList.spec.ts`
Expected: FAIL — `Failed to resolve import "./journal"`.

- [ ] **Step 3: Extend the types**

In `frontend/src/apps/tea/types.ts`, replace `TeaSessionWrite` and `TeaSession` with:

```ts
export type Mood =
  | "calm"
  | "bright"
  | "contemplative"
  | "cosy"
  | "social"
  | "focused"
  | "tired"
  | "restless";

export interface ChaXi {
  moods: Mood[];
  guests: string;
  notes: string;
}

export interface TeaSessionWrite {
  // null only for a journal-only entry of a tea not in the cabinet.
  tea_id: string | null;
  away_tea_name: string;
  away_class_id: TeaClass | null;
  status: SessionStatus;
  started_at: string;
  leaf_grams: number | null;
  water_temp_c: number | null;
  rating: number | null;
  curve_source: CurveSource;
  curve_source_label: string;
  infusions: Infusion[];
  teaware_id: string | null;
  timed: boolean;
  cha_xi: ChaXi | null;
}

export interface TeaSession extends TeaSessionWrite {
  id: string;
  brewed_by: string;
  vessel_volume_ml: number | null;
  updated_at: string;
  finished_at: string | null;
  image_url: string | null;
}

/** A finished session with its tea resolved, as `GET /tea/journal` returns it. */
export interface JournalEntry extends TeaSession {
  tea_name: string;
  class_id: TeaClass;
  tea_image_url: string | null;
}

/** `PUT /tea/sessions/{id}/journal`. The optional fields are for journal-only entries. */
export interface JournalEdit {
  cha_xi: ChaXi | null;
  rating: number | null;
  leaf_grams: number | null;
  water_temp_c: number | null;
  teaware_id: string | null;
  started_at?: string;
  tea_id?: string | null;
  away_tea_name?: string;
  away_class_id?: TeaClass | null;
}
```

- [ ] **Step 4: Write `journal.ts`**

Create `frontend/src/apps/tea/journal.ts`:

```ts
// Pure helpers for the Cha Xi Journal.

import type { ChaXi, JournalEntry, Mood, TeaSession } from "./types";

/** Mirrors backend `Mood`; also the order moods are shown and stored in. */
export const MOODS: Mood[] = [
  "calm",
  "bright",
  "contemplative",
  "cosy",
  "social",
  "focused",
  "tired",
  "restless",
];

export function emptyChaXi(): ChaXi {
  return { moods: [], guests: "", notes: "" };
}

export function toggleMood(moods: Mood[], mood: Mood): Mood[] {
  const next = moods.includes(mood) ? moods.filter((m) => m !== mood) : [...moods, mood];
  return MOODS.filter((m) => next.includes(m));
}

/** Whether anything of a sitting's cha xi is recorded — the Journal's "Cha xi only" test. */
export function hasChaXi(session: { cha_xi: ChaXi | null; image_url: string | null }): boolean {
  if (session.image_url !== null) return true;
  const chaXi = session.cha_xi;
  if (chaXi === null) return false;
  return chaXi.moods.length > 0 || chaXi.guests.trim() !== "" || chaXi.notes.trim() !== "";
}

export interface MonthGroup {
  key: string;
  label: string;
  entries: JournalEntry[];
}

/** Newest-first entries cut into calendar months, in the viewer's own time zone. */
export function groupByMonth(entries: JournalEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const at = new Date(entry.started_at);
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        label: at.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        entries: [],
      };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/** Grams a delete gives back — only a cabinet tea's leaf was ever taken. */
export function gramsReturned(session: Pick<TeaSession, "tea_id" | "leaf_grams">): number | null {
  return session.tea_id !== null ? session.leaf_grams : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` for an `<input type="date">`, in local time. */
export function toDateInput(iso: string): string {
  const at = new Date(iso);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Local noon of a picked day, so no time zone can tip it into the day before or after. */
export function fromDateInput(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toISOString();
}
```

- [ ] **Step 5: Link session rows and handle away names**

In `frontend/src/apps/tea/components/TeaSessionsList.vue`, wrap each row's content in a link and
fix the tea name for away sessions. The `<li>` becomes:

```vue
    <li
      v-for="session in sessions"
      :key="session.id"
      class="sessions__row"
      :data-testid="`sessions-row-${session.id}`"
    >
      <router-link
        class="sessions__link"
        :to="{ name: 'tea-journal-entry', params: { id: session.id } }"
      >
        <span v-if="teaNames" class="sessions__tea" :data-testid="`sessions-tea-${session.id}`">{{
          teaOf(session, teaNames)
        }}</span>
        <!-- the existing date / stars / brewer / meta spans, unchanged -->
      </router-link>
    </li>
```

(Move the existing four spans inside the `router-link` unchanged.) Add to the script:

```ts
function teaOf(session: TeaSession, names: Record<string, string>): string {
  if (session.tea_id === null) return session.away_tea_name;
  return names[session.tea_id] ?? "a removed tea";
}
```

Add to the component's styles (so the link keeps the row's look):

```scss
.sessions__link {
  display: contents;
  color: inherit;
  text-decoration: none;
}
```

- [ ] **Step 6: Carry the new fields through the timer snapshot and fixtures**

In `frontend/src/apps/tea/stores/useTeaTimerStore.ts` `snapshot()`, add to the returned object:

```ts
      away_tea_name: "",
      away_class_id: null,
      timed: true,
      cha_xi: null,
```

In `frontend/src/apps/tea/pages/TimerPage.vue`, change `teaName` to accept a nullable id:

```ts
function teaName(teaId: string | null): string {
  return cabinet.teas.find((t) => t.id === teaId)?.name ?? "a tea";
}
```

In each of the eight fixture files in the File map, add these five fields to every object typed
as `TeaSession` (or built by a `session(…)` helper returning one):

```ts
    away_tea_name: "",
    away_class_id: null,
    timed: true,
    cha_xi: null,
    image_url: null,
```

Then run `cd frontend && npm run typecheck` and fix every remaining error the same way — each is
a `TeaSession` literal missing these fields, or a place treating `tea_id` as non-null (guard with
`session.tea_id !== null` or `?? ""` where it indexes a record).

- [ ] **Step 7: Run tests, typecheck, lint**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS, no type or lint errors.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): session types carry cha xi; session rows open their Journal entry

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: One chime context for every page, no re-chime on arrival

**Files:**
- Modify: `frontend/src/apps/tea/composables/useTargetChime.ts`
- Modify: `frontend/src/apps/tea/composables/useTargetChime.spec.ts`

**Interfaces:**
- Produces: `useTargetChime(elapsed, target, enabled): { unlock }` — same signature; the
  `AudioContext` is now shared module state and is never closed by a disposing page.

- [ ] **Step 1: Rewrite the spec to load a fresh module per test and add the new cases**

In `useTargetChime.spec.ts`, replace the static import line
`import { useTargetChime } from "./useTargetChime";` with:

```ts
let useTargetChime: typeof import("./useTargetChime").useTargetChime;
```

and make `beforeEach` async, loading a fresh copy of the module (the context is module state now):

```ts
beforeEach(async () => {
  started.mockReset();
  instances = [];
  vi.stubGlobal("AudioContext", FakeContext);
  vi.resetModules();
  ({ useTargetChime } = await import("./useTargetChime"));
});
```

Change `setup` to take a starting elapsed value:

```ts
function setup(enabled: boolean, startAt = 0) {
  const elapsed = ref(startAt);
  const target = ref<number | null>(20);
  const scope = effectScope();
  const { unlock } = scope.run(() => useTargetChime(elapsed, target, ref(enabled)))!;
  return { elapsed, target, unlock, scope };
}
```

Replace the test `"closes the audio context when its scope is disposed"` with:

```ts
  it("keeps one unlocked context for the next page's chime", async () => {
    const first = setup(true);
    first.unlock();
    first.scope.stop();

    const second = setup(true);
    second.elapsed.value = 21;
    await nextTick();

    expect(started).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(1);
    expect(instances[0].close).not.toHaveBeenCalled();
    second.scope.stop();
  });

  it("does not chime again for a target already passed when a page opens", async () => {
    const { elapsed, unlock, scope } = setup(true, 25);
    unlock();
    elapsed.value = 25.2;
    await nextTick();
    expect(started).not.toHaveBeenCalled();
    scope.stop();
  });
```

- [ ] **Step 2: Run the spec to see the new cases fail**

Run: `cd frontend && npx vitest run src/apps/tea/composables/useTargetChime.spec.ts`
Expected: FAIL — the second instance creates its own context (no chime), and the already-passed
target chimes.

- [ ] **Step 3: Implement**

Replace `frontend/src/apps/tea/composables/useTargetChime.ts` with:

```ts
import { watch, type Ref } from "vue";

// One context for every page: mobile browsers only allow audio after a tap, so
// a steep started on the timer must still chime on the Cha Xi page.
let context: AudioContext | null = null;

/**
 * A soft chime the moment a steep reaches its target. `unlock()` is called
 * from the Start tap, which is the user gesture the browser needs.
 */
export function useTargetChime(
  elapsed: Readonly<Ref<number>>,
  target: Readonly<Ref<number | null>>,
  enabled: Readonly<Ref<boolean>>,
): { unlock: () => void } {
  // A page opened mid-steep, past its target, must not chime a second time for it.
  let fired = target.value !== null && elapsed.value >= target.value;

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

- [ ] **Step 4: Run the chime and timer specs**

Run: `cd frontend && npx vitest run src/apps/tea/composables/useTargetChime.spec.ts src/apps/tea/pages/TimerPage.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/composables
git commit -m "fix(tea): the steep chime survives a page change and never rings twice

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Timer store — live cha xi and the table photo

**Files:**
- Modify: `frontend/src/apps/tea/stores/useTeaTimerStore.ts`
- Modify: `frontend/src/apps/tea/stores/useTeaTimerStore.spec.ts`

**Interfaces:**
- Consumes: `ChaXi` (Task 5), `downscaleImage` from `@/apps/tea/image`.
- Produces on `useTeaTimerStore()`: `live.chaXi?: ChaXi | null`, `live.imageUrl?: string | null`,
  `setChaXi(value: ChaXi): void`, `uploadPhoto(file: File): Promise<boolean>`,
  `removePhoto(): Promise<void>`, refs `photoSaving: boolean`, `photoError: string | null`.
  `snapshot()` sends `cha_xi: live.chaXi ?? null`; `resume()` restores `cha_xi` and `image_url`.

- [ ] **Step 1: Write the failing tests**

In `useTeaTimerStore.spec.ts`, add `uploadMock` to the hoisted mocks and to the mocked `api`
(`upload: uploadMock`), reset it in `beforeEach` (`uploadMock.mockReset();`), then add:

```ts
describe("cha xi", () => {
  async function brewing() {
    mockCurve(ALMANAC);
    const store = useTeaTimerStore();
    await store.attachTea(tea());
    putMock.mockClear();
    return store;
  }

  it("sends the live cha xi with the next snapshot", async () => {
    const store = await brewing();
    store.setChaXi({ moods: ["calm"], guests: "Eva", notes: "" });
    await store.push();
    const [, body] = putMock.mock.calls.at(-1)!;
    expect((body as { cha_xi: unknown }).cha_xi).toEqual({
      moods: ["calm"],
      guests: "Eva",
      notes: "",
    });
  });

  it("hydrates a session stored before cha xi existed", () => {
    localStorage.setItem(
      "tea-timer:live",
      JSON.stringify({
        version: 1,
        sessionId: "s-old",
        startedAt: "2026-09-26T18:00:00Z",
        tea: { id: "t-1", name: "Tieguanyin", class_id: "oolong", grams_remaining: 42 },
        curve: ALMANAC,
        leafGrams: 6,
        waterTempC: 95,
        infusions: [{ number: 1, target_seconds: 20, actual_seconds: null }],
        steepStartedAt: null,
        pushed: true,
      }),
    );
    const store = useTeaTimerStore();
    expect(store.live?.sessionId).toBe("s-old");
    expect(store.live?.chaXi ?? null).toBeNull();
  });

  it("syncs the session before uploading its photo", async () => {
    const store = await brewing();
    uploadMock.mockResolvedValue({ image_url: "/api/tea/sessions/x/image" });
    const ok = await store.uploadPhoto(new File(["x"], "t.jpg", { type: "image/jpeg" }));
    expect(ok).toBe(true);
    expect(putMock).toHaveBeenCalled();
    expect(uploadMock.mock.calls[0][0]).toBe(`/tea/sessions/${store.live!.sessionId}/image`);
    expect(store.live?.imageUrl).toBe("/api/tea/sessions/x/image");
  });

  it("keeps the photo error for a retry when the upload fails", async () => {
    const store = await brewing();
    uploadMock.mockRejectedValue(Object.assign(new Error("x"), { detail: "Too big" }));
    const ok = await store.uploadPhoto(new File(["x"], "t.jpg", { type: "image/jpeg" }));
    expect(ok).toBe(false);
    expect(store.photoError).toBe("Too big");
    expect(store.photoSaving).toBe(false);
    expect(store.live?.imageUrl ?? null).toBeNull();
  });

  it("does not upload while the session cannot sync", async () => {
    const store = await brewing();
    putMock.mockRejectedValue(httpError(503));
    const ok = await store.uploadPhoto(new File(["x"], "t.jpg", { type: "image/jpeg" }));
    expect(ok).toBe(false);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(store.photoError).not.toBeNull();
  });

  it("resumes a server session with its cha xi and photo", () => {
    const store = useTeaTimerStore();
    const saved: TeaSession = {
      id: "s-9",
      tea_id: "t-1",
      away_tea_name: "",
      away_class_id: null,
      status: "in_progress",
      started_at: "2026-09-26T18:00:00Z",
      leaf_grams: 6,
      water_temp_c: 95,
      rating: null,
      curve_source: "almanac",
      curve_source_label: "almanac: Tieguanyin",
      infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
      teaware_id: null,
      timed: true,
      cha_xi: { moods: ["cosy"], guests: "", notes: "rain" },
      brewed_by: "jakub",
      vessel_volume_ml: null,
      updated_at: "2026-09-26T18:05:00Z",
      finished_at: null,
      image_url: "/api/tea/sessions/s-9/image",
    };
    store.resume(saved, tea());
    expect(store.live?.chaXi).toEqual({ moods: ["cosy"], guests: "", notes: "rain" });
    expect(store.live?.imageUrl).toBe("/api/tea/sessions/s-9/image");
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaTimerStore.spec.ts`
Expected: FAIL — `store.setChaXi is not a function`.

- [ ] **Step 3: Implement**

In `frontend/src/apps/tea/stores/useTeaTimerStore.ts`:

Add `ChaXi` to the type import from `@/apps/tea/types`, and
`import { downscaleImage } from "@/apps/tea/image";`.

In `interface LiveSession`, after `vesselChosen?`, add:

```ts
  // Optional: sessions saved before the Journal existed still hydrate.
  chaXi?: ChaXi | null;
  imageUrl?: string | null;
```

After `const chimeOn = …`, add:

```ts
  const photoSaving = ref(false);
  const photoError = ref<string | null>(null);
```

In `snapshot()`, change `cha_xi: null,` to `cha_xi: session.chaXi ?? null,`.

In `clear()`, add `photoError.value = null;`.

Add after `setVessel`:

```ts
  function setChaXi(value: ChaXi): void {
    if (live.value) live.value.chaXi = value;
  }

  /** The server needs the session before its photo, so the session syncs first. */
  async function uploadPhoto(file: File): Promise<boolean> {
    const session = live.value;
    if (!session?.tea) return false;
    photoSaving.value = true;
    photoError.value = null;
    try {
      await push();
      if (live.value !== session) return false;
      if (unsynced.value) throw new Error("Not synced yet — try again in a moment");
      const saved = await api.upload<TeaSession>(
        `/tea/sessions/${session.sessionId}/image`,
        await downscaleImage(file),
      );
      if (live.value === session) session.imageUrl = saved.image_url;
      return true;
    } catch (e) {
      photoError.value = message(e);
      return false;
    } finally {
      photoSaving.value = false;
    }
  }

  async function removePhoto(): Promise<void> {
    const session = live.value;
    if (!session?.imageUrl) return;
    photoSaving.value = true;
    try {
      await api.del<TeaSession>(`/tea/sessions/${session.sessionId}/image`);
      if (live.value === session) session.imageUrl = null;
      photoError.value = null;
    } catch (e) {
      photoError.value = message(e);
    } finally {
      photoSaving.value = false;
    }
  }
```

In `resume()`, add to the `live.value = { … }` object:

```ts
      chaXi: session.cha_xi,
      imageUrl: session.image_url,
```

Add to the returned object: `photoSaving, photoError, setChaXi, uploadPhoto, removePhoto,`.

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaTimerStore.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/stores/useTeaTimerStore.ts frontend/src/apps/tea/stores/useTeaTimerStore.spec.ts
git commit -m "feat(tea): the live session holds its cha xi and table photo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: `ChaXiFields` and `BrewStrip`

**Files:**
- Create: `frontend/src/apps/tea/components/ChaXiFields.vue`, `ChaXiFields.spec.ts`
- Create: `frontend/src/apps/tea/components/BrewStrip.vue`, `BrewStrip.spec.ts`

**Interfaces:**
- `ChaXiFields` props: `modelValue: ChaXi`, `photoSrc: string | null`, `photoSaving: boolean`,
  `photoError: string | null`. Emits: `update:modelValue [ChaXi]`, `photo [File]`,
  `remove-photo []`. Test ids: `chaxi-mood-{mood}`, `chaxi-guests`, `chaxi-notes`,
  `chaxi-photo-pick`, `chaxi-photo-input`, `chaxi-photo-img`, `chaxi-photo-remove`,
  `chaxi-photo-error`, `chaxi-photo-retry`.
- `BrewStrip` emits `back []`; reads `useTeaTimerStore()`. Test ids: `brew-strip`,
  `brew-strip-back`, `brew-strip-toggle`, `brew-strip-unsynced`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/components/ChaXiFields.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChaXiFields from "./ChaXiFields.vue";
import { emptyChaXi } from "../journal";
import type { ChaXi } from "../types";

function render(overrides: Partial<{ modelValue: ChaXi; photoSrc: string | null; photoError: string | null }> = {}) {
  return mount(ChaXiFields, {
    props: {
      modelValue: emptyChaXi(),
      photoSrc: null,
      photoSaving: false,
      photoError: null,
      ...overrides,
    },
  });
}

describe("ChaXiFields", () => {
  it("toggles moods into vocabulary order", async () => {
    const wrapper = render({ modelValue: { ...emptyChaXi(), moods: ["social"] } });
    await wrapper.get("[data-testid=chaxi-mood-calm]").trigger("click");
    expect(wrapper.emitted("update:modelValue")![0][0]).toEqual({
      ...emptyChaXi(),
      moods: ["calm", "social"],
    });
    expect(wrapper.get("[data-testid=chaxi-mood-social]").attributes("aria-pressed")).toBe("true");
  });

  it("emits guests and notes as typed", async () => {
    const wrapper = render();
    await wrapper.get("[data-testid=chaxi-guests]").setValue("Eva");
    await wrapper.get("[data-testid=chaxi-notes]").setValue("orchid");
    const emitted = wrapper.emitted("update:modelValue")!.map((e) => e[0] as ChaXi);
    expect(emitted[0].guests).toBe("Eva");
    expect(emitted[1].notes).toBe("orchid");
  });

  it("hands a picked photo up, and offers the same file again after a failure", async () => {
    const wrapper = render();
    const file = new File(["x"], "t.jpg", { type: "image/jpeg" });
    const input = wrapper.get("[data-testid=chaxi-photo-input]");
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    expect(wrapper.emitted("photo")![0][0]).toBe(file);

    await wrapper.setProps({ photoError: "Too big" });
    await wrapper.get("[data-testid=chaxi-photo-retry]").trigger("click");
    expect(wrapper.emitted("photo")![1][0]).toBe(file);
  });

  it("shows the saved photo with a remove button", async () => {
    const wrapper = render({ photoSrc: "/api/tea/sessions/s-1/image?token=t" });
    expect(wrapper.get("[data-testid=chaxi-photo-img]").attributes("src")).toContain("s-1");
    await wrapper.get("[data-testid=chaxi-photo-remove]").trigger("click");
    expect(wrapper.emitted("remove-photo")).toHaveLength(1);
  });
});
```

Create `frontend/src/apps/tea/components/BrewStrip.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn(), put: vi.fn().mockResolvedValue({}), del: vi.fn(), upload: vi.fn() },
}));

import BrewStrip from "./BrewStrip.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("BrewStrip", () => {
  it("shows the infusion and its target, and starts and stops the steep", async () => {
    const timer = useTeaTimerStore();
    const wrapper = mount(BrewStrip);
    expect(wrapper.get("[data-testid=brew-strip-back]").text()).toContain("Inf 1");
    expect(wrapper.get("[data-testid=brew-strip-back]").text()).toContain("0:10");

    await wrapper.get("[data-testid=brew-strip-toggle]").trigger("click");
    expect(timer.running).toBe(true);
    vi.setSystemTime(Date.now() + 12_000);
    await wrapper.get("[data-testid=brew-strip-toggle]").trigger("click");
    expect(timer.running).toBe(false);
    expect(timer.brewed.map((i) => i.actual_seconds)).toEqual([12]);
  });

  it("asks to go back to the timer when tapped", async () => {
    const wrapper = mount(BrewStrip);
    await wrapper.get("[data-testid=brew-strip-back]").trigger("click");
    expect(wrapper.emitted("back")).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/components/ChaXiFields.spec.ts src/apps/tea/components/BrewStrip.spec.ts`
Expected: FAIL — the components don't exist.

- [ ] **Step 3: Write `ChaXiFields.vue`**

```vue
<template>
  <div class="chaxi">
    <div class="chaxi__photo">
      <img v-if="shown" class="chaxi__img" data-testid="chaxi-photo-img" :src="shown" alt="" />
      <div class="chaxi__photo-actions">
        <button
          class="chaxi__photo-pick"
          data-testid="chaxi-photo-pick"
          :disabled="photoSaving"
          @click="input?.click()"
        >
          {{ photoSaving ? "Saving photo…" : shown ? "Replace photo" : "+ photo of the table" }}
        </button>
        <button
          v-if="shown"
          class="chaxi__photo-remove"
          data-testid="chaxi-photo-remove"
          :disabled="photoSaving"
          @click="onRemove"
        >
          Remove
        </button>
      </div>
      <input
        ref="input"
        type="file"
        accept="image/*"
        hidden
        data-testid="chaxi-photo-input"
        @change="onFile"
      />
      <p v-if="photoError" class="chaxi__error" data-testid="chaxi-photo-error">
        {{ photoError }}
        <button v-if="pending" data-testid="chaxi-photo-retry" @click="emit('photo', pending)">
          Try again
        </button>
      </p>
    </div>

    <div class="chaxi__moods" role="group" aria-label="Mood">
      <button
        v-for="mood in MOODS"
        :key="mood"
        :class="['chaxi__mood', { 'chaxi__mood--on': modelValue.moods.includes(mood) }]"
        :aria-pressed="modelValue.moods.includes(mood) ? 'true' : 'false'"
        :data-testid="`chaxi-mood-${mood}`"
        @click="update({ moods: toggleMood(modelValue.moods, mood) })"
      >
        {{ mood }}
      </button>
    </div>

    <label class="chaxi__label">
      Guests
      <input
        class="chaxi__field"
        data-testid="chaxi-guests"
        placeholder="who shared the table"
        :value="modelValue.guests"
        @input="update({ guests: ($event.target as HTMLInputElement).value })"
      />
    </label>

    <label class="chaxi__label">
      Notes
      <textarea
        class="chaxi__field chaxi__notes"
        data-testid="chaxi-notes"
        rows="5"
        placeholder="the leaves, the liquor, the light…"
        :value="modelValue.notes"
        @input="update({ notes: ($event.target as HTMLTextAreaElement).value })"
      ></textarea>
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { MOODS, toggleMood } from "../journal";
import type { ChaXi } from "../types";

const props = defineProps<{
  modelValue: ChaXi;
  photoSrc: string | null;
  photoSaving: boolean;
  photoError: string | null;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: ChaXi];
  photo: [file: File];
  "remove-photo": [];
}>();

const input = ref<HTMLInputElement | null>(null);
// The last picked file: shown straight away, and re-sent by Try again.
const pending = ref<File | null>(null);
const preview = ref<string | null>(null);
// A replaced photo is served at the same URL, so the local preview beats a cached old image.
const shown = computed(() => preview.value ?? props.photoSrc);

function update(patch: Partial<ChaXi>): void {
  emit("update:modelValue", { ...props.modelValue, ...patch });
}

function revokePreview(): void {
  if (preview.value) URL.revokeObjectURL(preview.value);
  preview.value = null;
}

function onFile(event: Event): void {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = "";
  if (!file) return;
  pending.value = file;
  revokePreview();
  if (typeof URL.createObjectURL === "function") preview.value = URL.createObjectURL(file);
  emit("photo", file);
}

function onRemove(): void {
  pending.value = null;
  revokePreview();
  emit("remove-photo");
}

onBeforeUnmount(revokePreview);
</script>

<style scoped lang="scss">
.chaxi {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding-top: 12px;
}
.chaxi__img {
  width: 100%;
  max-height: 320px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}
.chaxi__photo-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.chaxi__photo-pick,
.chaxi__photo-remove {
  background: #1e1712;
  border: 1px dashed #2c241d;
  border-radius: 6px;
  color: #e4d9c6;
  font-family: inherit;
  font-size: 15px;
  padding: 14px;
  flex: 1;
  cursor: pointer;
}
.chaxi__photo-remove {
  flex: 0 0 auto;
  border-style: solid;
  color: #8b7a63;
}
.chaxi__error {
  color: #efe7da;
  border-left: 2px solid #e4d9c6;
  padding-left: 10px;
  margin: 8px 0 0;
}
.chaxi__error button {
  background: transparent;
  border: 0;
  color: #e4d9c6;
  text-decoration: underline;
  font-family: inherit;
  cursor: pointer;
}
.chaxi__moods {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.chaxi__mood {
  background: transparent;
  border: 1px solid #2c241d;
  border-radius: 999px;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  padding: 6px 12px;
  cursor: pointer;
}
.chaxi__mood--on {
  background: #2c241d;
  border-color: #6b5f52;
  color: #efe7da;
}
.chaxi__label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #8b7a63;
  font-size: 13px;
}
.chaxi__field {
  background: #1e1712;
  border: 1px solid #2c241d;
  border-radius: 6px;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  padding: 10px 12px;
}
.chaxi__notes {
  resize: vertical;
  min-height: 110px;
}
</style>
```

- [ ] **Step 4: Write `BrewStrip.vue`**

```vue
<template>
  <div
    :class="['strip', { 'strip--near': near, 'strip--reached': reached }]"
    data-testid="brew-strip"
  >
    <button class="strip__back" data-testid="brew-strip-back" @click="emit('back')">
      <span class="strip__dot" :style="{ background: timer.liquor }"></span>
      Inf {{ timer.current?.number ?? 1 }} · {{ formatElapsed(elapsed) }} /
      {{ formatElapsed(target) }}
      <span
        v-if="timer.unsynced"
        class="strip__unsynced"
        data-testid="brew-strip-unsynced"
        title="Not synced yet — it will retry"
      ></span>
    </button>
    <button
      class="strip__toggle"
      data-testid="brew-strip-toggle"
      :aria-label="timer.running ? 'Stop the steep' : 'Start the steep'"
      @click="onToggle"
    >
      {{ timer.running ? "■" : "▶" }}
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";
import { useSteepClock } from "../composables/useSteepClock";
import { useTargetChime } from "../composables/useTargetChime";
import { useWakeLock } from "../composables/useWakeLock";
import { TARGET_LEVEL, formatElapsed, targetFor } from "../timer";

const emit = defineEmits<{ back: [] }>();
const timer = useTeaTimerStore();

const steepStartedAt = computed(() => timer.live?.steepStartedAt ?? null);
const { elapsed } = useSteepClock(steepStartedAt);
const target = computed(() => timer.current?.target_seconds ?? targetFor([], 1));
const { unlock } = useTargetChime(
  elapsed,
  computed(() => (timer.running ? target.value : null)),
  computed(() => timer.chimeOn),
);
useWakeLock(computed(() => timer.live !== null));

const reached = computed(() => timer.running && elapsed.value >= target.value);
const near = computed(
  () => timer.running && !reached.value && elapsed.value >= target.value * TARGET_LEVEL,
);

function onToggle(): void {
  if (timer.running) {
    void timer.stop();
  } else {
    unlock();
    timer.start();
  }
}
</script>

<style scoped lang="scss">
.strip {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #1e1712;
  border-bottom: 1px solid #241e19;
  padding: 8px 12px 8px 16px;
  transition: background 0.3s;
}
.strip--near {
  background: #3a2a14;
}
.strip--reached {
  animation: strip-pulse 0.9s ease-out 1;
  background: #5a3d12;
}
@keyframes strip-pulse {
  from {
    background: #a8742a;
  }
}
.strip__back {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
}
.strip__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.strip__unsynced {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #8b7a63;
}
.strip__toggle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid #6b5f52;
  background: transparent;
  color: #efe7da;
  font-size: 16px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `cd frontend && npx vitest run src/apps/tea/components/ChaXiFields.spec.ts src/apps/tea/components/BrewStrip.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/tea/components/ChaXiFields.vue frontend/src/apps/tea/components/ChaXiFields.spec.ts frontend/src/apps/tea/components/BrewStrip.vue frontend/src/apps/tea/components/BrewStrip.spec.ts
git commit -m "feat(tea): cha xi fields and a brew strip that keeps the steep in reach

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: The Cha Xi page, reachable from the timer

**Files:**
- Create: `frontend/src/apps/tea/pages/ChaXiPage.vue`, `ChaXiPage.spec.ts`
- Modify: `frontend/src/router/routes.ts`, `frontend/src/router/routes.spec.ts`
- Modify: `frontend/src/apps/tea/pages/TimerPage.vue`, `TimerPage.spec.ts`

**Interfaces:**
- Consumes: `ChaXiFields`, `BrewStrip` (Task 8); timer store `setChaXi`, `push`, `uploadPhoto`,
  `removePhoto`, `photoSaving`, `photoError` (Task 7); `hasChaXi`, `emptyChaXi` (Task 5);
  `imageSrc` from `../shelf`; `useAuthStore` from `@/stores/useAuthStore`.
- Produces route `tea-timer-chaxi` at `/tea/timer/cha-xi`, meta
  `{ title: "Cha Xi", requiresAuth: true, backTo: "/tea/timer" }`. Timer test ids `timer-chaxi`,
  `timer-chaxi-dot`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/pages/ChaXiPage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { putMock, push, replace, leaveGuards } = vi.hoisted(() => ({
  putMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  leaveGuards: [] as Array<() => void>,
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn().mockResolvedValue(null), put: putMock, del: vi.fn(), upload: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ query: {}, params: {} }),
  onBeforeRouteLeave: (guard: () => void) => leaveGuards.push(guard),
}));

import ChaXiPage from "./ChaXiPage.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function liveWithTea(): void {
  localStorage.setItem(
    "tea-timer:live",
    JSON.stringify({
      version: 1,
      sessionId: "s-1",
      startedAt: "2026-09-28T18:00:00Z",
      tea: { id: "t-1", name: "Dan Cong", class_id: "oolong", grams_remaining: 40 },
      curve: { leaf_grams: 6, water_temp_c: 95, steep_seconds: [10], source: "generic", source_label: "" },
      leafGrams: 6,
      waterTempC: 95,
      infusions: [{ number: 1, target_seconds: 10, actual_seconds: null }],
      steepStartedAt: null,
      pushed: true,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  putMock.mockReset().mockResolvedValue({});
  push.mockReset();
  replace.mockReset();
  leaveGuards.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ChaXiPage", () => {
  it("sends the timer home when nothing is brewing", async () => {
    mount(ChaXiPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(replace).toHaveBeenCalledWith({ name: "tea-timer" });
  });

  it("writes edits into the live session and syncs once typing pauses", async () => {
    liveWithTea();
    const timer = useTeaTimerStore();
    const wrapper = mount(ChaXiPage, { global: { stubs: STUBS } });
    await wrapper.get("[data-testid=chaxi-guests]").setValue("E");
    await wrapper.get("[data-testid=chaxi-guests]").setValue("Eva");
    expect(timer.live?.chaXi?.guests).toBe("Eva");
    expect(putMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    await flushPromises();
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it("syncs straight away when leaving mid-typing", async () => {
    liveWithTea();
    const wrapper = mount(ChaXiPage, { global: { stubs: STUBS } });
    await wrapper.get("[data-testid=chaxi-notes]").setValue("orchid");
    leaveGuards.forEach((guard) => guard());
    await flushPromises();
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it("goes back to the timer from the brew strip", async () => {
    liveWithTea();
    const wrapper = mount(ChaXiPage, { global: { stubs: STUBS } });
    await wrapper.get("[data-testid=brew-strip-back]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-timer" });
  });
});
```

In `frontend/src/router/routes.spec.ts`, inside `describe("tea back navigation", …)` add:

```ts
  it("points Cha Xi's back arrow at the timer", async () => {
    const router = makeRouter();
    await router.push("/tea/timer/cha-xi");
    expect(router.currentRoute.value.name).toBe("tea-timer-chaxi");
    expect(router.currentRoute.value.meta.backTo).toBe("/tea/timer");
  });
```

In `frontend/src/apps/tea/pages/TimerPage.spec.ts`, inside `describe("TimerPage", …)`, add
(it uses the file's own `routes()` and `localLiveSession()` helpers):

```ts
  it("offers Cha Xi only once a tea is attached", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-chaxi]").exists()).toBe(false);
  });

  it("opens Cha Xi, marked once the session has any", async () => {
    routes();
    localStorage.setItem(
      "tea-timer:live",
      localLiveSession([{ number: 1, target_seconds: 20, actual_seconds: null }]),
    );
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-chaxi-dot]").exists()).toBe(false);

    useTeaTimerStore().setChaXi({ moods: ["calm"], guests: "", notes: "" });
    await flushPromises();
    expect(wrapper.find("[data-testid=timer-chaxi-dot]").exists()).toBe(true);

    await wrapper.get("[data-testid=timer-chaxi]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-timer-chaxi" });
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/pages/ChaXiPage.spec.ts src/apps/tea/pages/TimerPage.spec.ts src/router/routes.spec.ts`
Expected: FAIL — no `ChaXiPage.vue`, no route, no `timer-chaxi` button.

- [ ] **Step 3: Write `ChaXiPage.vue`**

```vue
<template>
  <q-page class="tea-page chaxi-page">
    <BrewStrip @back="toTimer" />
    <div v-if="timer.live?.tea" class="tea-page__body">
      <p class="chaxi-page__what" data-testid="chaxi-what">
        {{ timer.live.tea.name }} · {{ day }}
      </p>
      <ChaXiFields
        :model-value="chaXi"
        :photo-src="photoSrc"
        :photo-saving="timer.photoSaving"
        :photo-error="timer.photoError"
        @update:model-value="onEdit"
        @photo="timer.uploadPhoto($event)"
        @remove-photo="timer.removePhoto()"
      />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { onBeforeRouteLeave, useRouter } from "vue-router";
import BrewStrip from "../components/BrewStrip.vue";
import ChaXiFields from "../components/ChaXiFields.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { emptyChaXi } from "../journal";
import { imageSrc } from "../shelf";
import type { ChaXi } from "../types";

// Long enough to let a sentence finish, short enough that a lost phone loses little.
const PUSH_DELAY_MS = 1500;

const router = useRouter();
const timer = useTeaTimerStore();
const auth = useAuthStore();

const chaXi = computed(() => timer.live?.chaXi ?? emptyChaXi());
const photoSrc = computed(() => imageSrc(timer.live?.imageUrl ?? null, auth.token));
const day = computed(() =>
  timer.live
    ? new Date(timer.live.startedAt).toLocaleDateString([], { day: "numeric", month: "short" })
    : "",
);

let pending: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  if (pending === null) return;
  clearTimeout(pending);
  pending = null;
  void timer.push();
}

function onEdit(value: ChaXi): void {
  timer.setChaXi(value);
  if (pending !== null) clearTimeout(pending);
  pending = setTimeout(flush, PUSH_DELAY_MS);
}

function toTimer(): void {
  void router.push({ name: "tea-timer" });
}

onBeforeRouteLeave(() => {
  flush();
});

onMounted(() => {
  if (!timer.live?.tea) void router.replace({ name: "tea-timer" });
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.chaxi-page__what {
  color: #8b7a63;
  font-size: 14px;
  margin: 14px 0 0;
}
</style>
```

- [ ] **Step 4: Add the route**

In `frontend/src/router/routes.ts`, right after the `tea-timer` route object, add:

```ts
      {
        path: "tea/timer/cha-xi",
        name: "tea-timer-chaxi",
        component: () => import("@/apps/tea/pages/ChaXiPage.vue"),
        meta: { title: "Cha Xi", requiresAuth: true, backTo: "/tea/timer" },
      },
```

- [ ] **Step 5: Add the Cha Xi button to the timer**

In `frontend/src/apps/tea/pages/TimerPage.vue`, inside `<div class="timer__tools">`, before the
chime button, add:

```vue
        <button
          v-if="timer.live?.tea"
          class="timer__tool timer__chaxi"
          data-testid="timer-chaxi"
          @click="router.push({ name: 'tea-timer-chaxi' })"
        >
          Cha Xi<span
            v-if="hasLiveChaXi"
            class="timer__chaxi-dot"
            data-testid="timer-chaxi-dot"
          ></span>
        </button>
```

In the script, import `import { hasChaXi } from "../journal";` and add:

```ts
const hasLiveChaXi = computed(() =>
  timer.live
    ? hasChaXi({ cha_xi: timer.live.chaXi ?? null, image_url: timer.live.imageUrl ?? null })
    : false,
);
```

Add to the styles:

```scss
.timer__chaxi {
  font-size: 13px;
  letter-spacing: 0.04em;
  position: relative;
}
.timer__chaxi-dot {
  position: absolute;
  top: 2px;
  right: -4px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #e4d9c6;
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd frontend && npx vitest run src/apps/tea src/router`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/src/apps/tea/pages/ChaXiPage.vue frontend/src/apps/tea/pages/ChaXiPage.spec.ts frontend/src/apps/tea/pages/TimerPage.vue frontend/src/apps/tea/pages/TimerPage.spec.ts frontend/src/router/routes.ts frontend/src/router/routes.spec.ts
git commit -m "feat(tea): write the cha xi while you brew, with the steep in reach

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: `useTeaJournalStore`

**Files:**
- Create: `frontend/src/apps/tea/stores/useTeaJournalStore.ts`, `useTeaJournalStore.spec.ts`

**Interfaces:**
- Consumes: `JournalEntry`, `JournalEdit`, `TeaSessionWrite`, `TeaSession` (Task 5); HTTP from
  Task 4; `downscaleImage`.
- Produces `useTeaJournalStore()` with refs `entries: JournalEntry[]`, `loading`, `saving`,
  `error: string | null`; `byId(id: string): JournalEntry | null`;
  `fetchJournal(): Promise<void>`; `create(id: string, body: TeaSessionWrite): Promise<boolean>`;
  `edit(id: string, body: JournalEdit): Promise<boolean>`; `remove(id: string): Promise<boolean>`;
  `uploadPhoto(id: string, file: File): Promise<boolean>`; `removePhoto(id: string):
  Promise<boolean>`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/stores/useTeaJournalStore.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, uploadMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  uploadMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: delMock, upload: uploadMock, post: vi.fn() },
}));

import { useTeaJournalStore } from "./useTeaJournalStore";
import type { JournalEntry, TeaSessionWrite } from "../types";

function entry(id: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id,
    tea_id: "t-1",
    away_tea_name: "",
    away_class_id: null,
    status: "finalised",
    started_at: "2026-09-28T18:00:00Z",
    leaf_grams: 5,
    water_temp_c: null,
    rating: null,
    curve_source: "generic",
    curve_source_label: "",
    infusions: [],
    teaware_id: null,
    timed: true,
    cha_xi: null,
    brewed_by: "jakub",
    vessel_volume_ml: null,
    updated_at: "2026-09-28T18:30:00Z",
    finished_at: "2026-09-28T18:30:00Z",
    image_url: null,
    tea_name: "Tieguanyin",
    class_id: "oolong",
    tea_image_url: null,
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  for (const mock of [getMock, putMock, delMock, uploadMock]) mock.mockReset();
});

describe("useTeaJournalStore", () => {
  it("fetches the journal", async () => {
    getMock.mockResolvedValue([entry("s-1")]);
    const store = useTeaJournalStore();
    await store.fetchJournal();
    expect(getMock).toHaveBeenCalledWith("/tea/journal");
    expect(store.byId("s-1")?.tea_name).toBe("Tieguanyin");
    expect(store.loading).toBe(false);
  });

  it("creates a journal-only entry, then reloads the wall", async () => {
    putMock.mockResolvedValue({});
    getMock.mockResolvedValue([entry("s-2", { timed: false })]);
    const store = useTeaJournalStore();
    const ok = await store.create("s-2", { timed: false } as TeaSessionWrite);
    expect(ok).toBe(true);
    expect(putMock.mock.calls[0][0]).toBe("/tea/sessions/s-2");
    expect(store.entries.map((e) => e.id)).toEqual(["s-2"]);
  });

  it("replaces an edited entry in place", async () => {
    getMock.mockResolvedValue([entry("s-1")]);
    putMock.mockResolvedValue(entry("s-1", { rating: 5 }));
    const store = useTeaJournalStore();
    await store.fetchJournal();
    await store.edit("s-1", {
      cha_xi: null,
      rating: 5,
      leaf_grams: 5,
      water_temp_c: null,
      teaware_id: null,
    });
    expect(putMock.mock.calls[0][0]).toBe("/tea/sessions/s-1/journal");
    expect(store.byId("s-1")?.rating).toBe(5);
  });

  it("removes a deleted entry", async () => {
    getMock.mockResolvedValue([entry("s-1")]);
    delMock.mockResolvedValue(undefined);
    const store = useTeaJournalStore();
    await store.fetchJournal();
    expect(await store.remove("s-1")).toBe(true);
    expect(delMock).toHaveBeenCalledWith("/tea/sessions/s-1/journal");
    expect(store.entries).toEqual([]);
  });

  it("patches the photo onto its entry", async () => {
    getMock.mockResolvedValue([entry("s-1")]);
    uploadMock.mockResolvedValue({ image_url: "/api/tea/sessions/s-1/image" });
    const store = useTeaJournalStore();
    await store.fetchJournal();
    await store.uploadPhoto("s-1", new File(["x"], "t.jpg", { type: "image/jpeg" }));
    expect(store.byId("s-1")?.image_url).toBe("/api/tea/sessions/s-1/image");
  });

  it("routes a failure into error", async () => {
    delMock.mockRejectedValue(Object.assign(new Error("x"), { detail: "Forbidden" }));
    const store = useTeaJournalStore();
    expect(await store.remove("s-1")).toBe(false);
    expect(store.error).toBe("Forbidden");
    expect(store.saving).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaJournalStore.spec.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `frontend/src/apps/tea/stores/useTeaJournalStore.ts`:

```ts
import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import { downscaleImage } from "@/apps/tea/image";
import type { JournalEdit, JournalEntry, TeaSession, TeaSessionWrite } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Every finished sitting in the cabinet, newest first, as the Journal shows them. */
export const useTeaJournalStore = defineStore("tea-journal", () => {
  const entries = ref<JournalEntry[]>([]);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref<string | null>(null);

  function byId(id: string): JournalEntry | null {
    return entries.value.find((e) => e.id === id) ?? null;
  }

  function patch(id: string, fields: Partial<JournalEntry>): void {
    entries.value = entries.value.map((e) => (e.id === id ? { ...e, ...fields } : e));
  }

  async function fetchJournal(): Promise<void> {
    loading.value = true;
    try {
      entries.value = await api.get<JournalEntry[]>("/tea/journal");
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function write(action: () => Promise<void>): Promise<boolean> {
    saving.value = true;
    try {
      await action();
      error.value = null;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    } finally {
      saving.value = false;
    }
  }

  function create(id: string, body: TeaSessionWrite): Promise<boolean> {
    return write(async () => {
      await api.put<TeaSession>(`/tea/sessions/${id}`, { ...body });
      // The server resolves the tea's name and class; reload rather than guess them.
      await fetchJournal();
    });
  }

  function edit(id: string, body: JournalEdit): Promise<boolean> {
    return write(async () => {
      const saved = await api.put<JournalEntry>(`/tea/sessions/${id}/journal`, { ...body });
      entries.value = entries.value.map((e) => (e.id === id ? saved : e));
    });
  }

  function remove(id: string): Promise<boolean> {
    return write(async () => {
      await api.del(`/tea/sessions/${id}/journal`);
      entries.value = entries.value.filter((e) => e.id !== id);
    });
  }

  function uploadPhoto(id: string, file: File): Promise<boolean> {
    return write(async () => {
      const saved = await api.upload<TeaSession>(
        `/tea/sessions/${id}/image`,
        await downscaleImage(file),
      );
      patch(id, { image_url: saved.image_url });
    });
  }

  function removePhoto(id: string): Promise<boolean> {
    return write(async () => {
      await api.del<TeaSession>(`/tea/sessions/${id}/image`);
      patch(id, { image_url: null });
    });
  }

  return {
    entries,
    loading,
    saving,
    error,
    byId,
    fetchJournal,
    create,
    edit,
    remove,
    uploadPhoto,
    removePhoto,
  };
});
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaJournalStore.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/stores/useTeaJournalStore.ts frontend/src/apps/tea/stores/useTeaJournalStore.spec.ts
git commit -m "feat(tea): a store for the Journal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Journal wall, card, home tile and icon

**Files:**
- Create: `frontend/src/apps/tea/components/JournalCard.vue`
- Create: `frontend/src/apps/tea/pages/JournalPage.vue`, `JournalPage.spec.ts`
- Modify: `frontend/src/apps/tea/components/SectionIcon.vue`
- Modify: `frontend/src/apps/tea/pages/TeaHomePage.vue`, `TeaHomePage.spec.ts`
- Modify: `frontend/src/router/routes.ts`, `frontend/src/router/routes.spec.ts`

**Interfaces:**
- Consumes: `useTeaJournalStore` (Task 10); `groupByMonth`, `hasChaXi` (Task 5); `imageSrc`;
  `CLASS_TOKENS`; `useAuthStore` (`username`, `token`).
- Produces routes: `tea-journal` at `/tea/journal` (meta
  `{ title: "Journal", requiresAuth: true, backTo: "/tea" }`). Card links to
  `tea-journal-entry`; `+ Entry` pushes `tea-journal-new` (both added in Tasks 12–13; add all
  three journal routes now so links resolve — see Step 5). Test ids: `journal-chaxi-only`,
  `journal-new`, `journal-month`, `journal-card-{id}`, `journal-card-hint`, `journal-empty`.
- The "Cha xi only" choice is kept for the browser session in `sessionStorage` key
  `tea-journal:chaxi-only`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/pages/JournalPage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises, RouterLinkStub } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push } = vi.hoisted(() => ({ getMock: vi.fn(), push: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: vi.fn(), del: vi.fn(), upload: vi.fn(), post: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: {}, query: {} }),
}));

import JournalPage from "./JournalPage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import type { JournalEntry } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" }, RouterLink: RouterLinkStub };

function entry(id: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id,
    tea_id: "t-1",
    away_tea_name: "",
    away_class_id: null,
    status: "finalised",
    started_at: "2026-09-28T18:00:00Z",
    leaf_grams: 5,
    water_temp_c: null,
    rating: 4,
    curve_source: "generic",
    curve_source_label: "",
    infusions: [{ number: 1, target_seconds: 10, actual_seconds: 11 }],
    teaware_id: null,
    timed: true,
    cha_xi: null,
    brewed_by: "jakub",
    vessel_volume_ml: null,
    updated_at: "2026-09-28T18:30:00Z",
    finished_at: "2026-09-28T18:30:00Z",
    image_url: null,
    tea_name: "Tieguanyin",
    class_id: "oolong",
    tea_image_url: null,
    ...overrides,
  };
}

async function render(entries: JournalEntry[]) {
  getMock.mockResolvedValue(entries);
  const wrapper = mount(JournalPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  sessionStorage.clear();
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.username = "jakub";
  // imageSrc needs a token to build a photo URL at all.
  auth.token = "a-token";
  getMock.mockReset();
  push.mockReset();
});

describe("JournalPage", () => {
  it("lists sittings under month headings, newest first", async () => {
    const wrapper = await render([
      entry("s-1"),
      entry("s-2", { started_at: "2026-08-20T18:00:00Z" }),
    ]);
    expect(wrapper.findAll("[data-testid=journal-month]").map((h) => h.text())).toEqual([
      "September 2026",
      "August 2026",
    ]);
  });

  it("gives a photo sitting the big card and nudges your plain ones toward cha xi", async () => {
    const wrapper = await render([
      entry("s-1", { image_url: "/api/tea/sessions/s-1/image" }),
      entry("s-2"),
      entry("s-3", { brewed_by: "eva" }),
    ]);
    expect(wrapper.get("[data-testid=journal-card-s-1]").classes()).toContain("jcard--photo");
    expect(wrapper.get("[data-testid=journal-card-s-2]").classes()).toContain("jcard--compact");
    expect(wrapper.get("[data-testid=journal-card-s-2]").find("[data-testid=journal-card-hint]").exists()).toBe(true);
    expect(wrapper.get("[data-testid=journal-card-s-3]").find("[data-testid=journal-card-hint]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=journal-card-s-3]").text()).toContain("eva");
  });

  it("narrows to sittings with cha xi, and remembers it", async () => {
    const wrapper = await render([
      entry("s-1", { cha_xi: { moods: ["calm"], guests: "", notes: "" } }),
      entry("s-2"),
    ]);
    await wrapper.get("[data-testid=journal-chaxi-only]").trigger("click");
    expect(wrapper.find("[data-testid=journal-card-s-2]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=journal-card-s-1]").exists()).toBe(true);
    expect(sessionStorage.getItem("tea-journal:chaxi-only")).toBe("1");
  });

  it("says so when the Journal is empty, and starts a new entry", async () => {
    const wrapper = await render([]);
    expect(wrapper.find("[data-testid=journal-empty]").exists()).toBe(true);
    await wrapper.get("[data-testid=journal-new]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-journal-new" });
  });

  it("names an away sitting as away", async () => {
    const wrapper = await render([
      entry("s-1", { tea_id: null, timed: false, away_tea_name: "Dancong", tea_name: "Dancong", infusions: [] }),
    ]);
    expect(wrapper.get("[data-testid=journal-card-s-1]").text()).toContain("away");
  });
});
```

In `TeaHomePage.spec.ts`, update the three expectations to include the Journal between Brew and
Almanac: labels `["Cabinet", "Teaware", "Brew", "Journal", "Almanac"]`, icons
`["leaf", "pot", "pour", "journal", "tome"]`, and add `["Journal", "tea-journal"]` to the
`it.each` table.

In `routes.spec.ts`, inside `describe("tea back navigation", …)` add:

```ts
  it("opens the Journal from the tea home, and its entries from the Journal", async () => {
    const router = makeRouter();
    await router.push("/tea/journal");
    expect(router.currentRoute.value.name).toBe("tea-journal");
    expect(router.currentRoute.value.meta.backTo).toBe("/tea");

    await router.push("/tea/journal/new");
    expect(router.currentRoute.value.name).toBe("tea-journal-new");
    expect(router.currentRoute.value.meta.backTo).toBe("/tea/journal");

    await router.push("/tea/journal/s-1");
    expect(router.currentRoute.value.name).toBe("tea-journal-entry");
    expect(router.currentRoute.value.meta.backTo).toBe("/tea/journal");

    await router.push("/tea/journal/s-1/edit");
    expect(router.currentRoute.value.name).toBe("tea-journal-edit");
    expect(router.currentRoute.value.meta.backTo).toBeUndefined();
  });
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/pages/JournalPage.spec.ts src/apps/tea/pages/TeaHomePage.spec.ts src/router/routes.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Write `JournalCard.vue`**

```vue
<template>
  <router-link
    :to="{ name: 'tea-journal-entry', params: { id: entry.id } }"
    :class="['jcard', photo ? 'jcard--photo' : 'jcard--compact']"
    :data-testid="`journal-card-${entry.id}`"
  >
    <img v-if="photo" class="jcard__img" :src="photo" alt="" />
    <div class="jcard__body">
      <span class="jcard__head">
        <span v-if="!photo" class="jcard__dot" :style="{ background: tokens.liquor }"></span>
        <span class="jcard__tea" :style="{ color: tokens.head }">{{ entry.tea_name }}</span>
        <span class="jcard__date">{{ date }}</span>
      </span>
      <span class="jcard__meta">
        {{ meta }}<template v-if="stars"> · {{ stars }}</template
        ><template v-if="showBrewer"> · {{ entry.brewed_by }}</template>
      </span>
      <span v-if="entry.cha_xi?.moods.length" class="jcard__moods">
        {{ entry.cha_xi.moods.join(" · ") }}
      </span>
      <span v-if="mine && !hasChaXi(entry)" class="jcard__hint" data-testid="journal-card-hint">
        + cha xi
      </span>
    </div>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useAuthStore } from "@/stores/useAuthStore";
import { CLASS_TOKENS } from "../tokens";
import { hasChaXi } from "../journal";
import { imageSrc } from "../shelf";
import type { JournalEntry } from "../types";

const props = defineProps<{ entry: JournalEntry; mine: boolean; showBrewer: boolean }>();

const auth = useAuthStore();
const tokens = computed(() => CLASS_TOKENS[props.entry.class_id]);
const photo = computed(() => imageSrc(props.entry.image_url, auth.token));
const date = computed(() =>
  new Date(props.entry.started_at).toLocaleDateString([], { day: "numeric", month: "short" }),
);
const stars = computed(() => (props.entry.rating === null ? "" : "★".repeat(props.entry.rating)));
const meta = computed(() => {
  const e = props.entry;
  const how = e.timed
    ? `${e.infusions.length} ${e.infusions.length === 1 ? "infusion" : "infusions"}`
    : e.tea_id === null
      ? "away"
      : "not timed";
  return e.leaf_grams !== null ? `${how} · ${e.leaf_grams} g` : how;
});
</script>

<style scoped lang="scss">
.jcard {
  display: block;
  background: #1e1712;
  border-radius: 8px;
  color: #e4d9c6;
  text-decoration: none;
  overflow: hidden;
}
.jcard__img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.jcard__body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
}
.jcard__head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.jcard__dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  align-self: center;
}
.jcard__tea {
  font-size: 17px;
  flex: 1;
}
.jcard__date,
.jcard__meta {
  color: #8b7a63;
  font-size: 13px;
}
.jcard__moods {
  color: #a99781;
  font-size: 13px;
  font-style: italic;
}
.jcard__hint {
  color: #6b5f52;
  font-size: 13px;
}
</style>
```

- [ ] **Step 4: Write `JournalPage.vue`**

```vue
<template>
  <q-page class="tea-page journal">
    <div class="journal__controls">
      <button
        :class="['journal__toggle', { 'journal__toggle--on': chaXiOnly }]"
        :aria-pressed="chaXiOnly ? 'true' : 'false'"
        data-testid="journal-chaxi-only"
        @click="setChaXiOnly(!chaXiOnly)"
      >
        Cha xi only
      </button>
      <button class="journal__new" data-testid="journal-new" @click="router.push({ name: 'tea-journal-new' })">
        + Entry
      </button>
    </div>

    <p v-if="journal.error" class="tea-page__error" data-testid="journal-error">
      {{ journal.error }}
      <button class="journal__retry" @click="journal.fetchJournal()">Try again</button>
    </p>

    <p
      v-if="!journal.loading && groups.length === 0"
      class="journal__empty"
      data-testid="journal-empty"
    >
      {{ chaXiOnly ? "No sittings with cha xi yet." : "No sittings yet. Brew a tea, or add one you drank elsewhere." }}
    </p>

    <section v-for="group in groups" :key="group.key" class="journal__month">
      <h2 class="journal__month-name" data-testid="journal-month">{{ group.label }}</h2>
      <div class="journal__grid">
        <JournalCard
          v-for="entry in group.entries"
          :key="entry.id"
          :entry="entry"
          :mine="entry.brewed_by === auth.username"
          :show-brewer="entry.brewed_by !== auth.username"
        />
      </div>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import JournalCard from "../components/JournalCard.vue";
import { useTeaJournalStore } from "../stores/useTeaJournalStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { groupByMonth, hasChaXi } from "../journal";

const CHAXI_ONLY_KEY = "tea-journal:chaxi-only";

function readChaXiOnly(): boolean {
  try {
    return sessionStorage.getItem(CHAXI_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

const router = useRouter();
const journal = useTeaJournalStore();
const auth = useAuthStore();
const chaXiOnly = ref(readChaXiOnly());

function setChaXiOnly(value: boolean): void {
  chaXiOnly.value = value;
  try {
    sessionStorage.setItem(CHAXI_ONLY_KEY, value ? "1" : "0");
  } catch {
    // Blocked storage: the toggle still works for this visit.
  }
}

const groups = computed(() =>
  groupByMonth(chaXiOnly.value ? journal.entries.filter(hasChaXi) : journal.entries),
);

onMounted(() => {
  void journal.fetchJournal();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.journal__controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px 4px;
}
.journal__toggle {
  background: transparent;
  border: 1px solid #2c241d;
  border-radius: 999px;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  padding: 6px 12px;
  cursor: pointer;
}
.journal__toggle--on {
  background: #2c241d;
  color: #efe7da;
}
.journal__new,
.journal__retry {
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
}
.journal__empty {
  color: #8b7a63;
  padding: 24px 18px;
}
.journal__month {
  padding: 0 18px;
}
.journal__month-name {
  color: #a99781;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 22px 0 10px;
}
.journal__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 768px) {
  .journal__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
```

- [ ] **Step 5: Add all four Journal routes, the home tile and the icon**

In `frontend/src/router/routes.ts`, before the `tea/:teaId` route (which would otherwise read
`journal` as a tea id), add:

```ts
      {
        path: "tea/journal",
        name: "tea-journal",
        component: () => import("@/apps/tea/pages/JournalPage.vue"),
        meta: { title: "Journal", requiresAuth: true, backTo: "/tea" },
      },
      {
        path: "tea/journal/new",
        name: "tea-journal-new",
        component: () => import("@/apps/tea/pages/JournalFormPage.vue"),
        meta: { title: "New entry", requiresAuth: true, backTo: "/tea/journal" },
      },
      {
        path: "tea/journal/:id",
        name: "tea-journal-entry",
        component: () => import("@/apps/tea/pages/JournalEntryPage.vue"),
        meta: { title: "Journal", requiresAuth: true, backTo: "/tea/journal" },
      },
      {
        // No backTo: back returns to wherever the edit was opened from.
        path: "tea/journal/:id/edit",
        name: "tea-journal-edit",
        component: () => import("@/apps/tea/pages/JournalFormPage.vue"),
        meta: { title: "Edit entry", requiresAuth: true },
      },
```

So the lazy imports resolve before Tasks 12–13, create placeholder pages now:
`frontend/src/apps/tea/pages/JournalEntryPage.vue` and `JournalFormPage.vue`, each containing
only `<template><q-page class="tea-page" /></template>`. Tasks 12 and 13 replace them.

In `frontend/src/apps/tea/components/SectionIcon.vue`, extend the type to
`export type SectionIconName = "leaf" | "pot" | "pour" | "tome" | "journal";` and add before the
closing `</svg>`:

```vue
    <!-- A thread-bound notebook with a small cup seal. -->
    <template v-if="name === 'journal'">
      <path
        :fill="INK"
        d="M11 6 H37 Q39 6 39 8 V40 Q39 42 37 42 H11 Q9 42 9 40 V8 Q9 6 11 6 Z"
      />
      <path d="M15 6 V42" fill="none" :stroke="CUT" stroke-width="1" />
      <g fill="none" :stroke="CUT" stroke-width="0.9" stroke-linecap="round">
        <path d="M9 11 H15 M9 19.7 H15 M9 28.3 H15 M9 37 H15" />
      </g>
      <g :fill="CUT">
        <circle cx="12" cy="11" r="1.1" />
        <circle cx="12" cy="19.7" r="1.1" />
        <circle cx="12" cy="28.3" r="1.1" />
        <circle cx="12" cy="37" r="1.1" />
        <rect x="21" y="16" width="12" height="12" rx="1.5" />
      </g>
      <g :fill="INK">
        <path d="M23.6 20.2 H30.4 Q30.4 25.4 27 25.4 Q23.6 25.4 23.6 20.2 Z" />
        <path d="M24.4 26.3 H29.6 V27 H24.4 Z" />
      </g>
    </template>
```

In `frontend/src/apps/tea/pages/TeaHomePage.vue`, set `SECTIONS` to:

```ts
const SECTIONS: Section[] = [
  { name: "Cabinet", icon: "leaf", route: "tea-cabinet" },
  { name: "Teaware", icon: "pot", route: "tea-ware" },
  { name: "Brew", icon: "pour", route: "tea-timer" },
  { name: "Journal", icon: "journal", route: "tea-journal" },
  { name: "Almanac", icon: "tome", route: "tea-almanac" },
];
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `cd frontend && npx vitest run src/apps/tea src/router`
Expected: PASS.

- [ ] **Step 7: Typecheck, lint, commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/src/apps/tea frontend/src/router
git commit -m "feat(tea): the Journal — every sitting, month by month

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Journal entry detail

**Files:**
- Modify (replace placeholder): `frontend/src/apps/tea/pages/JournalEntryPage.vue`
- Create: `frontend/src/apps/tea/pages/JournalEntryPage.spec.ts`

**Interfaces:**
- Consumes: `useTeaJournalStore` (`byId`, `fetchJournal`, `remove`, `saving`, `error`),
  `useTeawareStore` (`items`, `fetchItems`), `useTeaCabinetStore` (`fetchTeas`),
  `gramsReturned`, `vesselLabel` from `../ware`, `imageSrc`, `CLASS_TOKENS`.
- Route param `id`. Test ids: `journal-missing`, `journal-photo`, `journal-tea-link`,
  `journal-brewer`, `journal-facts`, `journal-moods`, `journal-guests`, `journal-notes`,
  `journal-timeline`, `journal-edit`, `journal-delete`, `journal-entry-error`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/pages/JournalEntryPage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, RouterLinkStub } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, delMock, push, replace } = vi.hoisted(() => ({
  getMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: vi.fn(), del: delMock, upload: vi.fn(), post: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ params: { id: "s-1" }, query: {} }),
}));

import JournalEntryPage from "./JournalEntryPage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import type { JournalEntry } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" }, RouterLink: RouterLinkStub };

const ENTRY: JournalEntry = {
  id: "s-1",
  tea_id: "t-1",
  away_tea_name: "",
  away_class_id: null,
  status: "finalised",
  started_at: "2026-09-28T18:00:00Z",
  leaf_grams: 5,
  water_temp_c: 95,
  rating: 4,
  curve_source: "generic",
  curve_source_label: "",
  infusions: [
    { number: 1, target_seconds: 20, actual_seconds: 21 },
    { number: 2, target_seconds: 25, actual_seconds: 25 },
  ],
  teaware_id: null,
  timed: true,
  cha_xi: { moods: ["calm", "social"], guests: "Eva", notes: "orchid\nstone" },
  brewed_by: "jakub",
  vessel_volume_ml: null,
  updated_at: "2026-09-28T18:30:00Z",
  finished_at: "2026-09-28T18:30:00Z",
  image_url: null,
  tea_name: "Dan Cong",
  class_id: "oolong",
  tea_image_url: null,
};

async function render(entry: JournalEntry | null = ENTRY) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/journal") return Promise.resolve(entry ? [entry] : []);
    return Promise.resolve([]);
  });
  const wrapper = mount(JournalEntryPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().username = "jakub";
  getMock.mockReset();
  delMock.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  replace.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("JournalEntryPage", () => {
  it("shows the whole sitting", async () => {
    const wrapper = await render();
    expect(wrapper.getComponent(RouterLinkStub).props("to")).toEqual({
      name: "tea-detail",
      params: { teaId: "t-1" },
    });
    expect(wrapper.get("[data-testid=journal-moods]").text()).toBe("calm · social");
    expect(wrapper.get("[data-testid=journal-guests]").text()).toContain("Eva");
    expect(wrapper.get("[data-testid=journal-notes]").text()).toContain("orchid");
    expect(wrapper.findAll("[data-testid=journal-timeline] li").map((li) => li.text())).toEqual([
      "21s / 20s",
      "25s / 25s",
    ]);
    expect(wrapper.get("[data-testid=journal-facts]").text()).toContain("95 °C");
  });

  it("lets only the brewer edit or delete", async () => {
    const wrapper = await render({ ...ENTRY, brewed_by: "eva" });
    expect(wrapper.find("[data-testid=journal-edit]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=journal-delete]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=journal-brewer]").text()).toContain("eva");
  });

  it("opens the edit form", async () => {
    const wrapper = await render();
    await wrapper.get("[data-testid=journal-edit]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-journal-edit", params: { id: "s-1" } });
  });

  it("names the grams a delete gives back, and goes to the Journal after", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = await render();
    await wrapper.get("[data-testid=journal-delete]").trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalledWith("Delete this sitting? 5 g goes back to Dan Cong.");
    expect(delMock).toHaveBeenCalledWith("/tea/sessions/s-1/journal");
    expect(replace).toHaveBeenCalledWith({ name: "tea-journal" });
  });

  it("keeps the sitting when the delete is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const wrapper = await render();
    await wrapper.get("[data-testid=journal-delete]").trigger("click");
    expect(delMock).not.toHaveBeenCalled();
  });

  it("says so when the sitting is gone", async () => {
    const wrapper = await render(null);
    expect(wrapper.find("[data-testid=journal-missing]").exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/pages/JournalEntryPage.spec.ts`
Expected: FAIL — the placeholder renders nothing.

- [ ] **Step 3: Write `JournalEntryPage.vue`**

```vue
<template>
  <q-page class="tea-page jentry">
    <p v-if="!entry && !journal.loading" class="jentry__missing" data-testid="journal-missing">
      That sitting isn't in the Journal. It may have been deleted.
    </p>

    <template v-if="entry">
      <img v-if="photo" class="jentry__photo" data-testid="journal-photo" :src="photo" alt="" />
      <div class="tea-page__body">
        <p class="jentry__tea">
          <router-link
            v-if="entry.tea_id"
            data-testid="journal-tea-link"
            :to="{ name: 'tea-detail', params: { teaId: entry.tea_id } }"
            :style="{ color: tokens.head }"
            >{{ entry.tea_name }}</router-link
          >
          <span v-else :style="{ color: tokens.head }">{{ entry.tea_name }}</span>
        </p>
        <p class="jentry__when" data-testid="journal-brewer">
          {{ date }}<template v-if="entry.brewed_by !== auth.username">
            · brewed by {{ entry.brewed_by }}</template
          ><template v-if="!entry.timed"> · {{ entry.tea_id ? "not timed" : "away" }}</template>
        </p>

        <dl v-if="facts.length" class="jentry__facts" data-testid="journal-facts">
          <template v-for="fact in facts" :key="fact.label">
            <dt>{{ fact.label }}</dt>
            <dd>{{ fact.value }}</dd>
          </template>
        </dl>

        <p v-if="entry.cha_xi?.moods.length" class="jentry__moods" data-testid="journal-moods">
          {{ entry.cha_xi.moods.join(" · ") }}
        </p>
        <p v-if="entry.cha_xi?.guests" class="jentry__guests" data-testid="journal-guests">
          with {{ entry.cha_xi.guests }}
        </p>
        <p v-if="entry.cha_xi?.notes" class="jentry__notes" data-testid="journal-notes">
          {{ entry.cha_xi.notes }}
        </p>

        <ol v-if="entry.infusions.length" class="jentry__timeline" data-testid="journal-timeline">
          <li v-for="infusion in entry.infusions" :key="infusion.number">
            {{ infusion.actual_seconds }}s <small>/ {{ infusion.target_seconds }}s</small>
          </li>
        </ol>

        <p v-if="journal.error" class="tea-page__error" data-testid="journal-entry-error">
          {{ journal.error }}
        </p>

        <div v-if="entry.brewed_by === auth.username" class="jentry__actions">
          <button
            class="jentry__action"
            data-testid="journal-edit"
            @click="router.push({ name: 'tea-journal-edit', params: { id: entry.id } })"
          >
            ✎ Edit
          </button>
          <button
            class="jentry__action jentry__action--quiet"
            data-testid="journal-delete"
            :disabled="journal.saving"
            @click="onDelete"
          >
            Delete
          </button>
        </div>
      </div>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTeaJournalStore } from "../stores/useTeaJournalStore";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { CLASS_TOKENS } from "../tokens";
import { gramsReturned } from "../journal";
import { imageSrc } from "../shelf";
import { vesselLabel } from "../ware";

const route = useRoute();
const router = useRouter();
const journal = useTeaJournalStore();
const teaware = useTeawareStore();
const cabinet = useTeaCabinetStore();
const auth = useAuthStore();

const id = computed(() => String(route.params.id));
const entry = computed(() => journal.byId(id.value));
const tokens = computed(() => CLASS_TOKENS[entry.value?.class_id ?? "other"]);
const photo = computed(() => imageSrc(entry.value?.image_url ?? null, auth.token));
const date = computed(() =>
  entry.value
    ? new Date(entry.value.started_at).toLocaleDateString([], {
        weekday: "short",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "",
);

const facts = computed(() => {
  const e = entry.value;
  if (!e) return [];
  const rows: { label: string; value: string }[] = [];
  const vessel = vesselLabel(e, teaware.items);
  if (vessel) rows.push({ label: "Vessel", value: vessel });
  if (e.leaf_grams !== null) rows.push({ label: "Leaf", value: `${e.leaf_grams} g` });
  if (e.water_temp_c !== null) rows.push({ label: "Water", value: `${e.water_temp_c} °C` });
  if (e.rating !== null)
    rows.push({ label: "Rating", value: "★".repeat(e.rating) + "☆".repeat(5 - e.rating) });
  return rows;
});

async function onDelete(): Promise<void> {
  const e = entry.value;
  if (!e) return;
  const grams = gramsReturned(e);
  const question =
    grams !== null
      ? `Delete this sitting? ${grams} g goes back to ${e.tea_name}.`
      : "Delete this sitting?";
  if (!window.confirm(question)) return;
  if (!(await journal.remove(e.id))) return;
  void cabinet.fetchTeas();
  void router.replace({ name: "tea-journal" });
}

onMounted(() => {
  if (!journal.byId(id.value)) void journal.fetchJournal();
  if (teaware.items.length === 0) void teaware.fetchItems();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.jentry__missing {
  color: #8b7a63;
  padding: 24px 18px;
}
.jentry__photo {
  display: block;
  width: 100%;
  max-height: 420px;
  object-fit: cover;
}
.jentry__tea {
  font-size: 24px;
  margin: 18px 0 2px;
}
.jentry__tea a {
  text-decoration: none;
}
.jentry__when {
  color: #8b7a63;
  font-size: 14px;
  margin: 0 0 16px;
}
.jentry__facts {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  color: #e4d9c6;
  margin: 0 0 16px;
}
.jentry__facts dt {
  color: #8b7a63;
}
.jentry__facts dd {
  margin: 0;
}
.jentry__moods {
  color: #a99781;
  font-style: italic;
}
.jentry__guests {
  color: #e4d9c6;
}
.jentry__notes {
  color: #efe7da;
  white-space: pre-wrap;
  line-height: 1.5;
}
.jentry__timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 18px 0;
}
.jentry__timeline li {
  background: #241e19;
  border-radius: 999px;
  color: #e4d9c6;
  font-variant-numeric: tabular-nums;
  padding: 4px 10px;
  font-size: 13px;
}
.jentry__timeline small {
  color: #6b5f52;
}
.jentry__actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}
.jentry__action {
  background: #241e19;
  border: 0;
  border-radius: 6px;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  padding: 10px 16px;
  cursor: pointer;
}
.jentry__action--quiet {
  background: transparent;
  color: #8b7a63;
}
</style>
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd frontend && npx vitest run src/apps/tea/pages/JournalEntryPage.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/pages/JournalEntryPage.vue frontend/src/apps/tea/pages/JournalEntryPage.spec.ts
git commit -m "feat(tea): open a sitting from the Journal, and delete one with its grams back

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: New journal-only entry and edit form

**Files:**
- Modify (replace placeholder): `frontend/src/apps/tea/pages/JournalFormPage.vue`
- Create: `frontend/src/apps/tea/pages/JournalFormPage.spec.ts`

**Interfaces:**
- Consumes: `useTeaJournalStore` (`byId`, `fetchJournal`, `create`, `edit`, `uploadPhoto`,
  `removePhoto`, `saving`, `error`); `useTeaCabinetStore` (`teas`, `fetchTeas`);
  `useTeawareStore` (`items`, `fetchItems`); `ChaXiFields`; `emptyChaXi`, `toDateInput`,
  `fromDateInput`; `newSessionId` from `../timer`; `isBrewingVessel` from `../ware`;
  `CLASS_ORDER`, `CLASS_TOKENS`; `imageSrc`.
- Routes: `tea-journal-new` (no `id`), `tea-journal-edit` (`id`). Test ids: `jform-source-cabinet`,
  `jform-source-away`, `jform-tea`, `jform-away-name`, `jform-away-class`, `jform-day`,
  `jform-vessel`, `jform-grams`, `jform-water`, `jform-star-{n}`, `jform-save`, `jform-error`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/pages/JournalFormPage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, uploadMock, replace, params } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  uploadMock: vi.fn(),
  replace: vi.fn(),
  params: {} as Record<string, string>,
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: vi.fn(), upload: uploadMock, post: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useRoute: () => ({ params, query: {} }),
}));

import JournalFormPage from "./JournalFormPage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import type { JournalEntry, Tea } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

const TEA = { id: "t-1", name: "Tieguanyin", class_id: "oolong", grams_remaining: 40 } as Tea;

const JOURNAL_ONLY: JournalEntry = {
  id: "s-7",
  tea_id: "t-1",
  away_tea_name: "",
  away_class_id: null,
  status: "finalised",
  started_at: "2026-09-20T10:00:00.000Z",
  leaf_grams: 5,
  water_temp_c: null,
  rating: 3,
  curve_source: "generic",
  curve_source_label: "",
  infusions: [],
  teaware_id: null,
  timed: false,
  cha_xi: { moods: ["cosy"], guests: "", notes: "" },
  brewed_by: "jakub",
  vessel_volume_ml: null,
  updated_at: "2026-09-20T10:00:00.000Z",
  finished_at: "2026-09-20T10:00:00.000Z",
  image_url: null,
  tea_name: "Tieguanyin",
  class_id: "oolong",
  tea_image_url: null,
};

async function render(entries: JournalEntry[] = []) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teas") return Promise.resolve([TEA]);
    if (path === "/tea/journal") return Promise.resolve(entries);
    return Promise.resolve([]);
  });
  const wrapper = mount(JournalFormPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().username = "jakub";
  getMock.mockReset();
  putMock.mockReset();
  uploadMock.mockReset();
  replace.mockReset();
  for (const key of Object.keys(params)) delete params[key];
});

describe("JournalFormPage — new entry", () => {
  it("saves a cabinet tea drunk elsewhere as one finished, untimed session", async () => {
    putMock.mockResolvedValue({});
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-tea]").setValue("t-1");
    await wrapper.get("[data-testid=jform-day]").setValue("2026-09-20");
    await wrapper.get("[data-testid=jform-grams]").setValue("5");
    await wrapper.get("[data-testid=jform-star-4]").trigger("click");
    await wrapper.get("[data-testid=chaxi-mood-social]").trigger("click");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();

    const [path, body] = putMock.mock.calls[0];
    expect(path).toMatch(/^\/tea\/sessions\/s-[0-9a-f]{32}$/);
    expect(body).toMatchObject({
      tea_id: "t-1",
      away_tea_name: "",
      status: "finalised",
      timed: false,
      infusions: [],
      leaf_grams: 5,
      rating: 4,
      cha_xi: { moods: ["social"], guests: "", notes: "" },
    });
    expect(new Date(body.started_at).getDate()).toBe(20);
    expect(replace).toHaveBeenCalledWith({
      name: "tea-journal-entry",
      params: { id: path.split("/").at(-1) },
    });
  });

  it("saves an away tea by name, with its class", async () => {
    putMock.mockResolvedValue({});
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-source-away]").trigger("click");
    await wrapper.get("[data-testid=jform-away-name]").setValue("Teahouse Dancong");
    await wrapper.get("[data-testid=jform-away-class]").setValue("oolong");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls[0][1]).toMatchObject({
      tea_id: null,
      away_tea_name: "Teahouse Dancong",
      away_class_id: "oolong",
    });
  });

  it("won't save without a tea", async () => {
    const wrapper = await render();
    expect(wrapper.get("[data-testid=jform-save]").attributes("disabled")).toBeDefined();
  });

  it("uploads a picked photo once the entry exists", async () => {
    putMock.mockResolvedValue({});
    uploadMock.mockResolvedValue({ image_url: "/api/tea/sessions/x/image" });
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-tea]").setValue("t-1");
    const input = wrapper.get("[data-testid=chaxi-photo-input]");
    Object.defineProperty(input.element, "files", {
      value: [new File(["x"], "t.jpg", { type: "image/jpeg" })],
    });
    await input.trigger("change");
    expect(uploadMock).not.toHaveBeenCalled();
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    const id = putMock.mock.calls[0][0].split("/").at(-1);
    expect(uploadMock.mock.calls[0][0]).toBe(`/tea/sessions/${id}/image`);
  });
});

describe("JournalFormPage — edit", () => {
  it("edits a journal-only entry, including its date and tea", async () => {
    params.id = "s-7";
    putMock.mockResolvedValue({ ...JOURNAL_ONLY, rating: 5 });
    const wrapper = await render([JOURNAL_ONLY]);
    expect((wrapper.get("[data-testid=jform-day]").element as HTMLInputElement).value).toBe(
      "2026-09-20",
    );
    await wrapper.get("[data-testid=jform-star-5]").trigger("click");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    const [path, body] = putMock.mock.calls[0];
    expect(path).toBe("/tea/sessions/s-7/journal");
    expect(body).toMatchObject({ rating: 5, leaf_grams: 5, tea_id: "t-1" });
    expect(body.started_at).toBeDefined();
    expect(replace).toHaveBeenCalledWith({ name: "tea-journal-entry", params: { id: "s-7" } });
  });

  it("sends no tea or date for a timed session", async () => {
    params.id = "s-7";
    const timed = { ...JOURNAL_ONLY, timed: true };
    putMock.mockResolvedValue(timed);
    const wrapper = await render([timed]);
    expect(wrapper.find("[data-testid=jform-day]").exists()).toBe(false);
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    const body = putMock.mock.calls[0][1];
    expect(body).not.toHaveProperty("started_at");
    expect(body).not.toHaveProperty("tea_id");
  });

  it("shows the server's refusal", async () => {
    params.id = "s-7";
    putMock.mockRejectedValue(Object.assign(new Error("x"), { detail: "That vessel is retired" }));
    const wrapper = await render([JOURNAL_ONLY]);
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=jform-error]").text()).toContain("That vessel is retired");
    expect(replace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/pages/JournalFormPage.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Write `JournalFormPage.vue`**

```vue
<template>
  <q-page class="tea-page jform">
    <div v-if="ready" class="tea-page__body">
      <template v-if="journalOnly">
        <div class="jform__sources" role="group" aria-label="Which tea">
          <button
            :class="['jform__source', { 'jform__source--on': source === 'cabinet' }]"
            data-testid="jform-source-cabinet"
            @click="source = 'cabinet'"
          >
            From the cabinet
          </button>
          <button
            :class="['jform__source', { 'jform__source--on': source === 'away' }]"
            data-testid="jform-source-away"
            @click="source = 'away'"
          >
            Away tea
          </button>
        </div>

        <label v-if="source === 'cabinet'" class="jform__label">
          Tea
          <select v-model="teaId" class="jform__field" data-testid="jform-tea">
            <option :value="null" disabled>Pick a tea</option>
            <option v-for="tea in teas" :key="tea.id" :value="tea.id">{{ tea.name }}</option>
          </select>
        </label>
        <template v-else>
          <label class="jform__label">
            Tea
            <input
              v-model="awayName"
              class="jform__field"
              data-testid="jform-away-name"
              placeholder="what you drank"
            />
          </label>
          <label class="jform__label">
            Class
            <select v-model="awayClass" class="jform__field" data-testid="jform-away-class">
              <option :value="null">—</option>
              <option v-for="c in CLASS_ORDER" :key="c" :value="c">
                {{ CLASS_TOKENS[c].label }}
              </option>
            </select>
          </label>
        </template>

        <label class="jform__label">
          Day
          <input v-model="day" type="date" class="jform__field" data-testid="jform-day" />
        </label>
      </template>

      <label class="jform__label">
        Vessel
        <select v-model="teawareId" class="jform__field" data-testid="jform-vessel">
          <option :value="null">No vessel</option>
          <option v-for="item in vessels" :key="item.id" :value="item.id">{{ item.name }}</option>
        </select>
      </label>

      <div class="jform__pair">
        <label class="jform__label">
          Leaf (g)
          <input v-model="grams" inputmode="decimal" class="jform__field" data-testid="jform-grams" />
        </label>
        <label class="jform__label">
          Water (°C)
          <input v-model="water" inputmode="numeric" class="jform__field" data-testid="jform-water" />
        </label>
      </div>

      <div class="jform__stars" role="group" aria-label="Rating">
        <button
          v-for="n in 5"
          :key="n"
          :class="['jform__star', { 'jform__star--on': rating !== null && n <= rating }]"
          :data-testid="`jform-star-${n}`"
          :aria-label="`${n} star${n === 1 ? '' : 's'}`"
          @click="rating = rating === n ? null : n"
        >
          ★
        </button>
      </div>

      <ChaXiFields
        v-model="chaXi"
        :photo-src="removed ? null : photoSrc"
        :photo-saving="journal.saving"
        :photo-error="photoError"
        @photo="onPhoto"
        @remove-photo="onRemovePhoto"
      />

      <p v-if="journal.error" class="tea-page__error" data-testid="jform-error">
        {{ journal.error }}
      </p>

      <button
        class="jform__save"
        data-testid="jform-save"
        :disabled="!canSave || journal.saving"
        @click="save"
      >
        {{ journal.saving ? "Saving…" : "Save" }}
      </button>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import ChaXiFields from "../components/ChaXiFields.vue";
import { useTeaJournalStore } from "../stores/useTeaJournalStore";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { CLASS_ORDER, CLASS_TOKENS } from "../tokens";
import { emptyChaXi, fromDateInput, toDateInput } from "../journal";
import { newSessionId } from "../timer";
import { imageSrc } from "../shelf";
import { isBrewingVessel } from "../ware";
import type { ChaXi, JournalEdit, TeaClass, TeaSessionWrite } from "../types";

type Source = "cabinet" | "away";

const route = useRoute();
const router = useRouter();
const journal = useTeaJournalStore();
const cabinet = useTeaCabinetStore();
const teaware = useTeawareStore();
const auth = useAuthStore();

// A new entry that saved but whose photo failed becomes an edit of that entry, so a retry
// can never create it twice.
const savedId = ref<string | null>(null);
const editId = computed(() =>
  typeof route.params.id === "string" ? route.params.id : savedId.value,
);
const existing = computed(() => (editId.value ? journal.byId(editId.value) : null));
const journalOnly = computed(() => existing.value === null || !existing.value.timed);
const ready = ref(false);

const source = ref<Source>("cabinet");
const teaId = ref<string | null>(null);
const awayName = ref("");
const awayClass = ref<TeaClass | null>(null);
const day = ref(toDateInput(new Date().toISOString()));
const teawareId = ref<string | null>(null);
const grams = ref("");
const water = ref("");
const rating = ref<number | null>(null);
const chaXi = ref<ChaXi>(emptyChaXi());
const pendingPhoto = ref<File | null>(null);
const removed = ref(false);
const photoError = ref<string | null>(null);

const teas = computed(() => [...cabinet.teas].sort((a, b) => a.name.localeCompare(b.name)));
// The vessel already on the entry stays pickable even if it has since retired.
const vessels = computed(() =>
  teaware.items.filter((w) => isBrewingVessel(w) || w.id === existing.value?.teaware_id),
);
const photoSrc = computed(() => imageSrc(existing.value?.image_url ?? null, auth.token));

const canSave = computed(() => {
  if (!journalOnly.value) return true;
  if (!day.value) return false;
  return source.value === "cabinet" ? teaId.value !== null : awayName.value.trim() !== "";
});

function positive(text: string): number | null {
  const value = Number(text.replace(",", "."));
  return text.trim() !== "" && Number.isFinite(value) && value > 0 ? value : null;
}

function celsius(text: string): number | null {
  const value = Number(text);
  return Number.isInteger(value) && value >= 1 && value <= 100 ? value : null;
}

function teaFields() {
  return source.value === "cabinet"
    ? { tea_id: teaId.value, away_tea_name: "", away_class_id: null }
    : { tea_id: null, away_tea_name: awayName.value.trim(), away_class_id: awayClass.value };
}

function newBody(): TeaSessionWrite {
  return {
    ...teaFields(),
    status: "finalised",
    started_at: fromDateInput(day.value),
    leaf_grams: positive(grams.value),
    water_temp_c: celsius(water.value),
    rating: rating.value,
    curve_source: "generic",
    curve_source_label: "",
    infusions: [],
    teaware_id: teawareId.value,
    timed: false,
    cha_xi: chaXi.value,
  };
}

function editBody(): JournalEdit {
  const body: JournalEdit = {
    cha_xi: chaXi.value,
    rating: rating.value,
    leaf_grams: positive(grams.value),
    water_temp_c: celsius(water.value),
    teaware_id: teawareId.value,
  };
  if (journalOnly.value) Object.assign(body, teaFields(), { started_at: fromDateInput(day.value) });
  return body;
}

function onPhoto(file: File): void {
  pendingPhoto.value = file;
  removed.value = false;
  photoError.value = null;
}

function onRemovePhoto(): void {
  pendingPhoto.value = null;
  removed.value = true;
}

async function save(): Promise<void> {
  const id = editId.value ?? newSessionId();
  const ok = editId.value
    ? await journal.edit(id, editBody())
    : await journal.create(id, newBody());
  if (!ok) return;
  savedId.value = id;

  if (removed.value && existing.value?.image_url) await journal.removePhoto(id);
  if (pendingPhoto.value) {
    if (!(await journal.uploadPhoto(id, pendingPhoto.value))) {
      photoError.value = journal.error;
      return;
    }
    pendingPhoto.value = null;
  }
  void cabinet.fetchTeas();
  void router.replace({ name: "tea-journal-entry", params: { id } });
}

function fill(): void {
  const e = existing.value;
  if (!e) return;
  source.value = e.tea_id === null ? "away" : "cabinet";
  teaId.value = e.tea_id;
  awayName.value = e.away_tea_name;
  awayClass.value = e.away_class_id;
  day.value = toDateInput(e.started_at);
  teawareId.value = e.teaware_id;
  grams.value = e.leaf_grams !== null ? String(e.leaf_grams) : "";
  water.value = e.water_temp_c !== null ? String(e.water_temp_c) : "";
  rating.value = e.rating;
  chaXi.value = e.cha_xi ?? emptyChaXi();
}

onMounted(async () => {
  const loads: Promise<void>[] = [];
  if (cabinet.teas.length === 0) loads.push(cabinet.fetchTeas());
  if (teaware.items.length === 0) loads.push(teaware.fetchItems());
  if (editId.value && !journal.byId(editId.value)) loads.push(journal.fetchJournal());
  await Promise.all(loads);
  fill();
  ready.value = true;
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.jform .tea-page__body {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-top: 16px;
}
.jform__sources {
  display: flex;
  gap: 8px;
}
.jform__source {
  flex: 1;
  background: transparent;
  border: 1px solid #2c241d;
  border-radius: 6px;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  padding: 10px;
  cursor: pointer;
}
.jform__source--on {
  background: #2c241d;
  color: #efe7da;
}
.jform__label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  color: #8b7a63;
  font-size: 13px;
  flex: 1;
}
.jform__field {
  background: #1e1712;
  border: 1px solid #2c241d;
  border-radius: 6px;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  padding: 10px 12px;
}
.jform__pair {
  display: flex;
  gap: 12px;
}
.jform__stars {
  display: flex;
  gap: 6px;
}
.jform__star {
  background: transparent;
  border: 0;
  color: #574d43;
  font-size: 28px;
  cursor: pointer;
}
.jform__star--on {
  color: #e4d9c6;
}
.jform__save {
  background: #e4d9c6;
  border: 0;
  border-radius: 6px;
  color: #17120e;
  font-family: inherit;
  font-size: 16px;
  padding: 14px;
  cursor: pointer;
}
.jform__save:disabled {
  background: #2c241d;
  color: #574d43;
  cursor: default;
}
</style>
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `cd frontend && npx vitest run src/apps/tea/pages/JournalFormPage.spec.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
cd frontend && npm run typecheck && npm run lint
git add frontend/src/apps/tea/pages/JournalFormPage.vue frontend/src/apps/tea/pages/JournalFormPage.spec.ts
git commit -m "feat(tea): record a tea drunk elsewhere, and edit any sitting you brewed

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: See it working in the real app

**Files:** none changed unless a bug turns up (then fix with a failing test first, in the task
that owns the code).

- [ ] **Step 1: Launch both dev servers**

Backend: `cd backend && source .venv/bin/activate && export DATA_DIR=./local-data && uvicorn app.main:app --reload --port 9000`
Frontend: `cd frontend && npm run dev` (serves on :9100, proxies `/api`).

- [ ] **Step 2: Walk the flows on a phone-sized viewport (390 × 844)**

1. Tea home shows five tiles: Cabinet, Teaware, Brew, Journal, Almanac; the Journal icon renders.
2. Brew → pick a tea → **Cha Xi** appears in the header → open it. Start a steep from the strip,
   type notes, pick two moods, add a photo. Let the steep pass its target: one chime, the strip
   pulses. Tap the strip → back on the timer, no second chime; **Cha Xi** shows its dot.
3. Finish → the tea's page → tap the newest session row → the Journal entry shows photo, moods,
   notes, timeline.
4. Journal → the sitting is under this month; **Cha xi only** hides plain sittings.
5. **+ Entry** → Away tea "Teahouse Dancong", class Oolong, yesterday → saves → card says "away".
6. Edit the timed sitting's notes only → the tea's grams are unchanged in the Cabinet.
7. Delete a sitting with grams → the confirm names the grams → the Cabinet shows them back.

- [ ] **Step 3: Record what you saw**

Note any deviation; fix it TDD-first in the owning task's files and commit with a `fix(tea):`
message.

---

### Task 15: Story, PRD pointer, full verification

**Files:**
- Create: `docs/stories/tea/for-review/cha-xi-journal.story.md`
- Modify: `docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md` (under `### 4.7 Cha Xi Journal`)

- [ ] **Step 1: Write the story**

Create `docs/stories/tea/for-review/cha-xi-journal.story.md`:

```markdown
# Story: Cha Xi Journal

## Status
Ready for Review

## Story
**As a** tea drinker at the table,
**I want** to write the cha xi of a sitting while I brew, and to look back through every sitting in a Journal,
**so that** the reflective half of the practice is kept beside the precise half, and a year of tea is a pleasure to revisit.

## Acceptance Criteria
1. With a tea on the timer, a **Cha Xi** header button opens `/tea/timer/cha-xi`; it carries a dot once the session has any cha xi.
2. The Cha Xi page edits one photo, moods (several, from calm · bright · contemplative · cosy · social · focused · tired · restless), guests and notes. Edits are kept on the phone at once and sync about 1.5 s after typing pauses, and on leaving the page.
3. A sticky brew strip shows the infusion, elapsed / target, and a start/stop button that behaves like the timer's tap; tapping the strip returns to the timer. A steep started on the timer chimes on the Cha Xi page, and never chimes twice for one target.
4. With nothing brewing, the Cha Xi page sends you to the timer. Discarding a session deletes its photo.
5. The tea home shows a **Journal** tile between Brew and Almanac. `/tea/journal` lists every finished sitting in the cabinet, newest first under month headings: photo cards for sittings with a photo, compact cards for the rest, with a "+ cha xi" hint on your own plain ones and the brewer's name on others'.
6. **Cha xi only** narrows the wall to sittings with a photo, mood, guests or notes, and is remembered for the browser session.
7. An entry page shows photo, tea (linked to the Cabinet), date, brewer, vessel, leaf, water, rating, moods, guests, notes and the infusion timeline.
8. The brewer can **Edit** (cha xi, rating, leaf, water, vessel; plus day and tea for journal-only entries) and **Delete** (confirming, and naming the grams returned). Changing the leaf moves the tea's grams by the difference; editing anything else never moves them.
9. **+ Entry** records a journal-only sitting for a Cabinet tea or an away tea (name, optional class). Grams are taken only for a Cabinet tea, and only if entered.
10. A tea's session rows open their Journal entry. Deleting a tea removes its sessions' photos.

## Dev Notes
- Spec: `docs/superpowers/specs/2026-09-28-tea-cha-xi-journal-design.md`; plan: `docs/superpowers/plans/2026-09-29-tea-cha-xi-journal.md`.
- Cha xi is `cha_xi` + server-owned `image_url` on `TeaSession` (tea doc schema v5). A journal-only entry is `timed: false`, finished in one PUT.
- Deleting a finished sitting is `DELETE /sessions/{id}/journal`. The timer's `DELETE /sessions/{id}` still refuses a finished session, so a Discard after a lost finish response can't delete it.
- The chime's `AudioContext` is module state, so one unlock serves every page.
- Out of scope: Journal search and filters (FR-20), flavour wheel, several photos, editing others' sittings.
```

- [ ] **Step 2: Point the PRD at the spec**

In `docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md`, directly under the
`### 4.7 Cha Xi Journal` heading's **Description** paragraph, add:

```markdown
Designed in `docs/superpowers/specs/2026-09-28-tea-cha-xi-journal-design.md`, which supersedes the
details below where they differ: mood is a fixed multi-select vocabulary; a journal-only entry may
name an away tea not in the Cabinet; FR-20's search and filters are deferred except a "Cha xi
only" toggle.
```

- [ ] **Step 3: Full verification**

Run:

```bash
cd backend && .venv/bin/pytest -q && black --check . && ruff check .
cd ../frontend && npx vitest run && npm run typecheck && npm run lint
```

Expected: every command exits 0.

- [ ] **Step 4: Commit**

```bash
git add docs/stories/tea/for-review/cha-xi-journal.story.md docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md
git commit -m "docs(tea): Cha Xi Journal story, ready for review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
