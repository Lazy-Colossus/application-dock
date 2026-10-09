# Tasting Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every tea session a typed tasting record in the user's notebook vocabulary, filled in
on the Cha Xi page, shown on Journal entries and cards, and averaged on the tea's page.

**Architecture:** A typed Pydantic `Tasting` hangs off `TeaSession` (cabinet doc schema v6) and
travels through the existing snapshot and Journal-edit paths. The frontend describes the sheet
once in `tasting.ts` (`TASTING_SECTIONS` plus pure helpers), and one `TastingFields` component
renders it on the Cha Xi page and the Journal form.

**Tech Stack:** FastAPI + Pydantic v2 (Python 3.12), pytest; Vue 3 `<script setup lang="ts">`,
Quasar v2, Pinia, vitest + @vue/test-utils.

**Spec:** `docs/superpowers/specs/2026-09-29-tea-tasting-design.md`

## Global Constraints

- Backend is strict 3-layer; services raise stdlib exceptions; every doc write goes through
  `repo.doc_transaction`. `black . && ruff check .` clean, line length 100.
- Frontend: all HTTP through `@/composables/useApi`; `defineProps<{}>()` / `defineEmits<{}>()`;
  no `any`; `interface` for shapes, `type` for unions. `npm run typecheck` and `npm run lint` clean.
- ★ = optional integer 1–5. Every tasting field is optional.
- Vocabulary values, exactly: liquor colour `pale_jade, yellow_green, golden, amber, orange_red,
  red, deep_red, dark_brown`; aroma structure `single, simple, coarse, short, high, layered,
  complex, delicate, long, deep`; body `watery, light, mild, mellow, thick`; saturation `low,
  medium, fairly_high, high`; body feeling `none, sweating, warmth, head_rush`.
- Picks are unique and kept in the listed order; body feeling `none` excludes the others.
- Pages have no title of their own (the shell bar names them).
- Commit straight to `main`. Commit messages end with:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Review Focus

1. **Clearing the last filled field** must return the tasting to `null`, not an all-empty object —
   otherwise "Cha xi only" and the tea's summary count an untasted sitting. Pinned in Task 3.
2. **A live session stored before this release** (no `tasting` key) must hydrate and send
   `tasting: null`. Pinned in Task 4.
3. **Editing a sitting through the Journal form** must resend the tasting recorded at the table,
   not wipe it (the edit body replaces `tasting`). Pinned in Task 4.
4. **Aroma words typed loosely** — `"Orchid, honey,"` and `" orchid"` — must count as the same
   word, and a word from only one sitting must not show. Pinned in Task 2.
5. **Body feeling "none noticeable"** picked after other feelings clears them, and picking a feeling
   clears "none" — never a contradictory pair on screen. Pinned in Task 3.

---

## File map

**Backend**
- Modify `backend/app/schemas/tea_session.py` — tasting models; `tasting` on `TeaSessionWrite` and
  `JournalEdit`.
- Modify `backend/app/schemas/tea.py` — `schema_version = 6`.
- Modify `backend/app/repositories/tea_repo.py` — `migrate()` v5 → v6.
- Modify `backend/app/services/tea_session_service.py` — `edit_journal` applies `tasting`.
- Create `backend/tests/test_tea_tasting.py`.
- Modify version pins: `backend/tests/test_tea_schemas.py`, `backend/tests/test_tea_repo.py`,
  `backend/tests/test_tea_journal.py`.

**Frontend** (`frontend/src/apps/tea/…`)
- Modify `types.ts` — tasting types; `tasting` on `TeaSessionWrite` and `JournalEdit`.
- Create `tasting.ts` (+ `tasting.spec.ts`) — vocabulary, `TASTING_SECTIONS`, helpers.
- Modify `journal.ts` (+ spec) — `hasChaXi` counts a tasting.
- Create `components/StarRating.vue` (+ spec), `components/TastingFields.vue` (+ spec).
- Modify `stores/useTeaTimerStore.ts` (+ spec), `pages/ChaXiPage.vue` (+ spec),
  `pages/TimerPage.vue`, `pages/JournalFormPage.vue` (+ spec), `pages/JournalEntryPage.vue`
  (+ spec), `components/JournalCard.vue` via `pages/JournalPage.spec.ts`, `pages/TeaDetailPage.vue`
  (+ spec).
- Every spec file with a `TeaSession`/`JournalEntry` literal gains `tasting: null`.

**Docs** — `docs/stories/tea/for-review/tasting-sheet.story.md`; PRD §4.6 pointer.

---

### Task 1: Backend — the tasting record, schema v6

**Files:**
- Modify: `backend/app/schemas/tea_session.py`, `backend/app/schemas/tea.py`,
  `backend/app/repositories/tea_repo.py`, `backend/app/services/tea_session_service.py`
- Modify: `backend/tests/test_tea_schemas.py`, `backend/tests/test_tea_repo.py`,
  `backend/tests/test_tea_journal.py`
- Create: `backend/tests/test_tea_tasting.py`

**Interfaces:**
- Produces: `Tasting`, `Leaf`, `Liquor`, `Aroma`, `Mouthfeel`, `Intensity`, `Sensation` in
  `app.schemas.tea_session`; `TeaSessionWrite.tasting: Tasting | None`;
  `JournalEdit.tasting: Tasting | None`; `TeaDoc.schema_version == 6`. JSON shape as in the spec's
  table (e.g. `{"sensation": {"hui_gan": {"strength": 4}}}`).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_tea_tasting.py`:

```python
"""Tasting sheet: the typed tasting record on a session, its rules, and its round trips."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.repositories import tea_repo as repo
from app.schemas.tea import TeaWriteRequest
from app.schemas.tea_session import JournalEdit, Tasting, TeaSessionWrite
from app.services import tea_service
from app.services import tea_session_service as sessions

FULL: dict[str, object] = {
    "leaf": {"dry": "tight, dark twists", "wet": "roasted", "spent": "supple", "quality": 4},
    "liquor": {"colour": "amber", "clarity": 5},
    "aroma": {
        "aroma": "orchid, honey",
        "aroma_type": "orchid",
        "richness": 4,
        "top_note": "orchid",
        "middle_note": "honey",
        "base_note": "stone",
        "tail_note": "faint orchid",
        "cup_aroma": "caramel",
        "structure": ["long", "delicate"],
    },
    "sensation": {
        "body": "mellow",
        "smoothness": 4,
        "saturation": "fairly_high",
        "throat": 3,
        "mouthfeel": {"thick": 4, "slick": 5, "astringent": 1},
        "hui_gan": {"strength": 4, "duration": 3},
        "sheng_jin": {"strength": 3, "duration": 2},
        "body_feel": ["warmth"],
        "body_feel_other": "",
    },
}


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea() -> str:
    req = TeaWriteRequest.model_validate(
        {"name": "Dan Cong", "catalogue_node_id": "oolong.anxi.tieguanyin", "grams_remaining": 40}
    )
    return tea_service.create_tea("alice", req).id


def _write(tea_id: str, **overrides: object) -> TeaSessionWrite:
    payload: dict[str, object] = {
        "tea_id": tea_id,
        "status": "in_progress",
        "started_at": "2026-09-29T18:00:00+00:00",
        "curve_source": "generic",
        "infusions": [{"number": 1, "target_seconds": 20, "actual_seconds": 21}],
    }
    payload.update(overrides)
    return TeaSessionWrite.model_validate(payload)


def test_a_partial_tasting_is_valid_and_fills_in_the_rest_empty() -> None:
    tasting = Tasting.model_validate({"sensation": {"hui_gan": {"strength": 4}}})
    assert tasting.sensation.hui_gan.strength == 4
    assert tasting.sensation.hui_gan.duration is None
    assert tasting.aroma.structure == []
    assert tasting.leaf.dry == ""


def test_picks_are_kept_once_each_in_listed_order() -> None:
    tasting = Tasting.model_validate(
        {"aroma": {"structure": ["long", "single"]}, "sensation": {"body_feel": ["warmth", "sweating"]}}
    )
    assert tasting.aroma.structure == ["single", "long"]
    assert tasting.sensation.body_feel == ["sweating", "warmth"]


@pytest.mark.parametrize(
    "raw",
    [
        {"aroma": {"richness": 0}},
        {"aroma": {"richness": 6}},
        {"sensation": {"mouthfeel": {"thin": 7}}},
        {"aroma": {"structure": ["floral"]}},
        {"aroma": {"structure": ["long", "long"]}},
        {"sensation": {"body": "gloopy"}},
        {"liquor": {"colour": "blue"}},
        {"sensation": {"body_feel": ["none", "warmth"]}},
    ],
)
def test_a_tasting_that_breaks_a_rule_is_refused(raw: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        Tasting.model_validate(raw)


def test_a_tasting_rides_the_snapshot_through_finish_and_a_journal_edit() -> None:
    tea_id = _tea()
    sessions.upsert("alice", "s-1", _write(tea_id, tasting=FULL))
    finished = sessions.upsert("alice", "s-1", _write(tea_id, status="finalised", tasting=FULL))
    assert finished.tasting is not None
    assert finished.tasting.sensation.mouthfeel.slick == 5

    edited = sessions.edit_journal(
        "alice",
        "s-1",
        JournalEdit.model_validate(
            {"tasting": {**FULL, "liquor": {"colour": "golden", "clarity": 4}}}
        ),
    )
    assert edited.tasting is not None
    assert edited.tasting.liquor.colour == "golden"
    [entry] = sessions.list_journal("alice")
    assert entry.tasting is not None and entry.tasting.aroma.top_note == "orchid"


def test_a_session_without_a_tasting_has_none() -> None:
    tea_id = _tea()
    assert sessions.upsert("alice", "s-1", _write(tea_id)).tasting is None


def test_a_v5_cabinet_upgrades_to_v6() -> None:
    raw: dict[str, object] = {
        "schema_version": 5,
        "id": "c-1",
        "owner": "alice",
        "teas": [],
        "catalogue_nodes": [],
        "sessions": [],
        "teaware": [],
    }
    assert repo.migrate(raw)["schema_version"] == 6
```

- [ ] **Step 2: Run to see it fail**

Run: `cd backend && .venv/bin/pytest tests/test_tea_tasting.py -q`
Expected: FAIL — `ImportError: cannot import name 'Tasting'`.

- [ ] **Step 3: Add the models**

In `backend/app/schemas/tea_session.py`, change the typing import to
`from typing import Annotated, Literal, get_args` and add, after `class ChaXi`:

```python
Stars = Annotated[int, Field(ge=1, le=5)]
LiquorColour = Literal[
    "pale_jade", "yellow_green", "golden", "amber", "orange_red", "red", "deep_red", "dark_brown"
]
AromaStructure = Literal[
    "single", "simple", "coarse", "short", "high", "layered", "complex", "delicate", "long", "deep"
]
AROMA_STRUCTURES: tuple[str, ...] = get_args(AromaStructure)
LiquorBody = Literal["watery", "light", "mild", "mellow", "thick"]
Saturation = Literal["low", "medium", "fairly_high", "high"]
BodyFeel = Literal["none", "sweating", "warmth", "head_rush"]
BODY_FEELS: tuple[str, ...] = get_args(BodyFeel)


def _once_in_order(values: list[str], vocabulary: tuple[str, ...], what: str) -> list[str]:
    if len(set(values)) != len(values):
        raise ValueError(f"Pick each {what} once")
    return sorted(values, key=vocabulary.index)


class Leaf(BaseModel):
    dry: str = ""
    wet: str = ""
    spent: str = ""
    quality: Stars | None = None


class Liquor(BaseModel):
    colour: LiquorColour | None = None
    clarity: Stars | None = None


class Aroma(BaseModel):
    """香&气 — what the tea smells like, stage by stage."""

    aroma: str = ""
    aroma_type: str = ""
    richness: Stars | None = None
    top_note: str = ""
    middle_note: str = ""
    base_note: str = ""
    tail_note: str = ""
    cup_aroma: str = ""
    structure: list[AromaStructure] = Field(default_factory=list)

    @field_validator("structure")
    @classmethod
    def _structure_once_in_order(cls, values: list[AromaStructure]) -> list[AromaStructure]:
        return _once_in_order(values, AROMA_STRUCTURES, "aroma structure")


class Mouthfeel(BaseModel):
    thin: Stars | None = None
    dry: Stars | None = None
    astringent: Stars | None = None
    rough: Stars | None = None
    thick: Stars | None = None
    moist: Stars | None = None
    slick: Stars | None = None
    cooling: Stars | None = None


class Intensity(BaseModel):
    strength: Stars | None = None
    duration: Stars | None = None


class Sensation(BaseModel):
    """感&觉 — how the tea feels in the mouth, the throat and the body."""

    body: LiquorBody | None = None
    smoothness: Stars | None = None
    saturation: Saturation | None = None
    throat: Stars | None = None
    mouthfeel: Mouthfeel = Field(default_factory=Mouthfeel)
    hui_gan: Intensity = Field(default_factory=Intensity)
    sheng_jin: Intensity = Field(default_factory=Intensity)
    body_feel: list[BodyFeel] = Field(default_factory=list)
    body_feel_other: str = ""

    @field_validator("body_feel")
    @classmethod
    def _body_feel_consistent(cls, values: list[BodyFeel]) -> list[BodyFeel]:
        if "none" in values and len(values) > 1:
            raise ValueError("'None noticeable' can't go with another body feeling")
        return _once_in_order(values, BODY_FEELS, "body feeling")


class Tasting(BaseModel):
    """One sitting's tasting, in the user's notebook vocabulary. Every field is optional."""

    leaf: Leaf = Field(default_factory=Leaf)
    liquor: Liquor = Field(default_factory=Liquor)
    aroma: Aroma = Field(default_factory=Aroma)
    sensation: Sensation = Field(default_factory=Sensation)
```

In `TeaSessionWrite`, after `cha_xi`, add `tasting: Tasting | None = None`. In `JournalEdit`,
after `cha_xi`, add `tasting: Tasting | None = None`.

In `backend/app/services/tea_session_service.py` `edit_journal`, add to the `update` dict:
`"tasting": req.tasting,`.

- [ ] **Step 4: Bump the schema to v6**

`backend/app/schemas/tea.py`: `schema_version: int = 6`.

`backend/app/repositories/tea_repo.py` `migrate()`, after the v4 → v5 block:

```python
    if raw["schema_version"] == 5:
        # v6 added the tasting sheet; it defaults to None.
        raw = {**raw, "schema_version": 6}
```

and append ` v6 added the tasting sheet.` to the docstring's history sentence.

Update the version pins: in `tests/test_tea_schemas.py` and `tests/test_tea_repo.py` change every
`== 5` / `(5, cabinet_id, "alice")` that asserts the current schema version to 6 (run
`grep -n "schema_version" tests/test_tea_schemas.py tests/test_tea_repo.py` to find them). In
`tests/test_tea_journal.py`, rename `test_a_v4_cabinet_upgrades_to_v5` to
`test_a_v4_cabinet_upgrades_to_the_current_version` and assert `== 6`.

- [ ] **Step 5: Run the backend suite**

Run: `cd backend && .venv/bin/pytest -q && black . && ruff check .`
Expected: all pass, clean.

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat(tea): sessions carry a typed tasting sheet

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Frontend types, the sheet description and its helpers

**Files:**
- Modify: `frontend/src/apps/tea/types.ts`
- Create: `frontend/src/apps/tea/tasting.ts`, `frontend/src/apps/tea/tasting.spec.ts`
- Modify: `frontend/src/apps/tea/journal.ts`, `frontend/src/apps/tea/journal.spec.ts`
- Modify: `frontend/src/apps/tea/stores/useTeaTimerStore.ts` (`snapshot` only)
- Modify: every spec with a `TeaSession` / `JournalEntry` literal (add `tasting: null`).

**Interfaces:**
- Produces in `types.ts`: `Stars`, `LiquorColour`, `AromaStructure`, `LiquorBody`, `Saturation`,
  `BodyFeel`, `Leaf`, `Liquor`, `Aroma`, `Mouthfeel`, `Intensity`, `Sensation`, `Tasting`;
  `TeaSessionWrite.tasting: Tasting | null`; `JournalEdit.tasting: Tasting | null`.
- Produces in `tasting.ts`: `TastingKind`, `TastingOption { value; label; zh?; exclusive? }`,
  `TastingField { path; label; zh?; hint?; kind; options? }`, `TastingSection { key; title; zh?;
  fields }`, `TASTING_SECTIONS`, `emptyTasting(): Tasting`, `getAt(t, path): TastingValue`,
  `setAt(t, path, value): Tasting`, `isFilled(value): boolean`, `filledCount(t, section): number`,
  `isEmptyTasting(t): boolean`, `optionLabel(field, value): string`, `tastingLine(t): string`,
  `describeTasting(t): TastingBlock[]` (`{ key; title; zh?; rows: { path; label; zh?; value }[] }`),
  `tastingSummary(sessions): TastingSummary | null` with
  `TastingSummary { count; stars: { path; label; average; count }[]; body: LiquorBody | null;
  saturation: Saturation | null; structure: { value; label; count }[]; aromaWords: string[] }`.
  `TastingValue = string | number | string[] | null`.
- `hasChaXi(session: { cha_xi; image_url; tasting?: Tasting | null })`.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/tasting.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  TASTING_SECTIONS,
  describeTasting,
  emptyTasting,
  filledCount,
  getAt,
  isEmptyTasting,
  setAt,
  tastingLine,
  tastingSummary,
} from "./tasting";
import type { Tasting } from "./types";

function leafPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) =>
    leafPaths(v, prefix ? `${prefix}.${k}` : k),
  );
}

function tasting(edit: (t: Tasting) => void): Tasting {
  const t = emptyTasting();
  edit(t);
  return t;
}

describe("the sheet description", () => {
  it("covers every field of the tasting, and only those", () => {
    const listed = TASTING_SECTIONS.flatMap((s) => s.fields.map((f) => f.path)).sort();
    expect(listed).toEqual(leafPaths(emptyTasting()).sort());
  });

  it("reads and writes by path without touching the original", () => {
    const t = emptyTasting();
    const next = setAt(t, "sensation.hui_gan.strength", 4);
    expect(getAt(next, "sensation.hui_gan.strength")).toBe(4);
    expect(getAt(t, "sensation.hui_gan.strength")).toBeNull();
  });

  it("knows an untouched or cleared tasting is empty", () => {
    expect(isEmptyTasting(emptyTasting())).toBe(true);
    expect(isEmptyTasting(tasting((t) => (t.aroma.top_note = "   ")))).toBe(true);
    expect(isEmptyTasting(tasting((t) => (t.aroma.structure = ["long"])))).toBe(false);
    expect(isEmptyTasting(tasting((t) => (t.liquor.clarity = 3)))).toBe(false);
  });

  it("counts what a section has noted", () => {
    const t = tasting((x) => {
      x.aroma.aroma = "orchid";
      x.aroma.richness = 4;
      x.sensation.throat = 3;
    });
    const aroma = TASTING_SECTIONS.find((s) => s.key === "aroma")!;
    expect(filledCount(t, aroma)).toBe(2);
  });
});

describe("tastingLine", () => {
  it("names the aroma type, the body and the strongest of hui gan, throat and smoothness", () => {
    const t = tasting((x) => {
      x.aroma.aroma = "orchid, honey";
      x.aroma.aroma_type = "orchid";
      x.sensation.body = "mellow";
      x.sensation.smoothness = 3;
      x.sensation.hui_gan.strength = 4;
      x.sensation.throat = 4;
    });
    expect(tastingLine(t)).toBe("orchid · mellow · hui gan ★★★★");
  });

  it("falls back to the aroma and leaves out what isn't there", () => {
    expect(tastingLine(tasting((x) => (x.aroma.aroma = "roasted")))).toBe("roasted");
    expect(tastingLine(emptyTasting())).toBe("");
  });
});

describe("describeTasting", () => {
  it("lists only the filled fields, in words", () => {
    const blocks = describeTasting(
      tasting((x) => {
        x.aroma.top_note = "orchid";
        x.aroma.structure = ["delicate", "long"];
        x.sensation.body = "mellow";
        x.sensation.saturation = "fairly_high";
        x.sensation.hui_gan.strength = 4;
      }),
    );
    expect(blocks.map((b) => b.key)).toEqual(["aroma", "sensation"]);
    const rows = blocks.flatMap((b) => b.rows.map((r) => `${r.label}: ${r.value}`));
    expect(rows).toContain("Top note: orchid");
    expect(rows).toContain("Aroma structure: delicate · long");
    expect(rows).toContain("Saturation: fairly high");
    expect(rows).toContain("Hui gan — strength: ★★★★☆");
  });
});

describe("tastingSummary", () => {
  it("is null until some sitting is tasted", () => {
    expect(tastingSummary([{ tasting: null }, { tasting: emptyTasting() }])).toBeNull();
  });

  it("averages every rated star field, skipping sittings that left it unrated", () => {
    const summary = tastingSummary([
      { tasting: tasting((x) => (x.sensation.hui_gan.strength = 4)) },
      { tasting: tasting((x) => (x.sensation.hui_gan.strength = 3)) },
      { tasting: tasting((x) => (x.aroma.aroma = "orchid")) },
      { tasting: null },
    ])!;
    expect(summary.count).toBe(3);
    expect(summary.stars).toEqual([
      { path: "sensation.hui_gan.strength", label: "Hui gan — strength", average: 3.5, count: 2 },
    ]);
  });

  it("finds the usual body, earlier on the scale winning a tie", () => {
    const summary = tastingSummary([
      { tasting: tasting((x) => (x.sensation.body = "thick")) },
      { tasting: tasting((x) => (x.sensation.body = "mellow")) },
    ])!;
    expect(summary.body).toBe("mellow");
    expect(summary.saturation).toBeNull();
  });

  it("keeps aroma words that come back in two or more sittings, however they were typed", () => {
    const summary = tastingSummary([
      { tasting: tasting((x) => (x.aroma.aroma = "Orchid, honey,")) },
      { tasting: tasting((x) => (x.aroma.aroma_type = " orchid")) },
      { tasting: tasting((x) => (x.aroma.aroma = "stone")) },
    ])!;
    expect(summary.aromaWords).toEqual(["orchid"]);
  });

  it("counts structure words most-picked first", () => {
    const summary = tastingSummary([
      { tasting: tasting((x) => (x.aroma.structure = ["delicate", "long"])) },
      { tasting: tasting((x) => (x.aroma.structure = ["long"])) },
    ])!;
    expect(summary.structure.map((s) => [s.value, s.count])).toEqual([
      ["long", 2],
      ["delicate", 1],
    ]);
  });
});
```

In `frontend/src/apps/tea/journal.spec.ts`, inside the `hasChaXi` test add:

```ts
    const tasted = emptyTasting();
    tasted.sensation.throat = 3;
    expect(hasChaXi({ cha_xi: null, image_url: null, tasting: tasted })).toBe(true);
    expect(hasChaXi({ cha_xi: null, image_url: null, tasting: emptyTasting() })).toBe(false);
```

with `import { emptyTasting } from "./tasting";` at the top.

- [ ] **Step 2: Run to see it fail**

Run: `cd frontend && npx vitest run src/apps/tea/tasting.spec.ts src/apps/tea/journal.spec.ts`
Expected: FAIL — `Failed to resolve import "./tasting"`.

- [ ] **Step 3: Add the types**

In `frontend/src/apps/tea/types.ts`, before `export interface TeaSessionWrite`:

```ts
/** 1–5, or null for "not rated". */
export type Stars = number | null;
export type LiquorColour =
  | "pale_jade"
  | "yellow_green"
  | "golden"
  | "amber"
  | "orange_red"
  | "red"
  | "deep_red"
  | "dark_brown";
export type AromaStructure =
  | "single"
  | "simple"
  | "coarse"
  | "short"
  | "high"
  | "layered"
  | "complex"
  | "delicate"
  | "long"
  | "deep";
export type LiquorBody = "watery" | "light" | "mild" | "mellow" | "thick";
export type Saturation = "low" | "medium" | "fairly_high" | "high";
export type BodyFeel = "none" | "sweating" | "warmth" | "head_rush";

export interface Leaf {
  dry: string;
  wet: string;
  spent: string;
  quality: Stars;
}

export interface Liquor {
  colour: LiquorColour | null;
  clarity: Stars;
}

export interface Aroma {
  aroma: string;
  aroma_type: string;
  richness: Stars;
  top_note: string;
  middle_note: string;
  base_note: string;
  tail_note: string;
  cup_aroma: string;
  structure: AromaStructure[];
}

export interface Mouthfeel {
  thin: Stars;
  dry: Stars;
  astringent: Stars;
  rough: Stars;
  thick: Stars;
  moist: Stars;
  slick: Stars;
  cooling: Stars;
}

export interface Intensity {
  strength: Stars;
  duration: Stars;
}

export interface Sensation {
  body: LiquorBody | null;
  smoothness: Stars;
  saturation: Saturation | null;
  throat: Stars;
  mouthfeel: Mouthfeel;
  hui_gan: Intensity;
  sheng_jin: Intensity;
  body_feel: BodyFeel[];
  body_feel_other: string;
}

/** Mirrors backend `Tasting`. */
export interface Tasting {
  leaf: Leaf;
  liquor: Liquor;
  aroma: Aroma;
  sensation: Sensation;
}
```

Add `tasting: Tasting | null;` to `TeaSessionWrite` (after `cha_xi`) and to `JournalEdit`
(after `cha_xi`).

- [ ] **Step 4: Write `tasting.ts`**

Create `frontend/src/apps/tea/tasting.ts`:

```ts
// The tasting sheet, described once: every page renders and reads it from here.

import type { LiquorBody, Saturation, Tasting, TeaSession } from "./types";

export type TastingKind = "text" | "stars" | "scale" | "picks";
export type TastingValue = string | number | string[] | null;

export interface TastingOption {
  value: string;
  label: string;
  zh?: string;
  /** Picking it clears the others, and picking another clears it. */
  exclusive?: boolean;
}

export interface TastingField {
  path: string;
  label: string;
  zh?: string;
  hint?: string;
  kind: TastingKind;
  options?: TastingOption[];
}

export interface TastingSection {
  key: "leaf" | "liquor" | "aroma" | "sensation";
  title: string;
  zh?: string;
  fields: TastingField[];
}

const LIQUOR_COLOURS: TastingOption[] = [
  { value: "pale_jade", label: "pale jade" },
  { value: "yellow_green", label: "yellow-green" },
  { value: "golden", label: "golden" },
  { value: "amber", label: "amber" },
  { value: "orange_red", label: "orange-red" },
  { value: "red", label: "red" },
  { value: "deep_red", label: "deep red" },
  { value: "dark_brown", label: "dark brown" },
];

const STRUCTURES: TastingOption[] = [
  { value: "single", label: "single-note", zh: "单一" },
  { value: "simple", label: "simple", zh: "简单" },
  { value: "coarse", label: "coarse", zh: "粗狂" },
  { value: "short", label: "short", zh: "短促" },
  { value: "high", label: "high", zh: "高扬" },
  { value: "layered", label: "layered", zh: "多元" },
  { value: "complex", label: "complex", zh: "复杂" },
  { value: "delicate", label: "delicate", zh: "细腻" },
  { value: "long", label: "long", zh: "悠长" },
  { value: "deep", label: "deep", zh: "沉稳" },
];

const BODIES: TastingOption[] = [
  { value: "watery", label: "watery", zh: "水味" },
  { value: "light", label: "light", zh: "淡" },
  { value: "mild", label: "mild", zh: "和" },
  { value: "mellow", label: "mellow", zh: "醇" },
  { value: "thick", label: "thick", zh: "浓" },
];

const SATURATIONS: TastingOption[] = [
  { value: "low", label: "low", zh: "低" },
  { value: "medium", label: "medium", zh: "中" },
  { value: "fairly_high", label: "fairly high", zh: "稍高" },
  { value: "high", label: "high", zh: "高" },
];

const BODY_FEELS: TastingOption[] = [
  { value: "none", label: "none noticeable", zh: "体感不明显", exclusive: true },
  { value: "sweating", label: "sweat on hands or back", zh: "手/背出汗" },
  { value: "warmth", label: "gentle, lasting warmth", zh: "温和且持续的发热" },
  { value: "head_rush", label: "dizzy, head rush, cold sweat", zh: "头晕上头且冒冷汗" },
];

const MOUTHFEEL: [string, string, string][] = [
  ["thin", "thin", "薄"],
  ["dry", "dry", "干"],
  ["astringent", "astringent", "涩"],
  ["rough", "rough", "粗"],
  ["thick", "thick", "厚"],
  ["moist", "moist", "润"],
  ["slick", "slick", "滑"],
  ["cooling", "cooling", "清凉"],
];

export const TASTING_SECTIONS: TastingSection[] = [
  {
    key: "leaf",
    title: "Leaf",
    fields: [
      { path: "leaf.dry", label: "Dry leaf", hint: "look and fragrance", kind: "text" },
      { path: "leaf.wet", label: "Wet leaf", hint: "fragrance of the warmed leaf", kind: "text" },
      { path: "leaf.spent", label: "Spent leaves", zh: "叶底", kind: "text" },
      { path: "leaf.quality", label: "Leaf quality", kind: "stars" },
    ],
  },
  {
    key: "liquor",
    title: "Liquor",
    fields: [
      { path: "liquor.colour", label: "Colour", kind: "scale", options: LIQUOR_COLOURS },
      { path: "liquor.clarity", label: "Clarity", kind: "stars" },
    ],
  },
  {
    key: "aroma",
    title: "Aroma & Qi",
    zh: "香&气",
    fields: [
      { path: "aroma.aroma", label: "Aroma", zh: "香气", kind: "text" },
      { path: "aroma.aroma_type", label: "Aroma type", zh: "香型", kind: "text" },
      { path: "aroma.richness", label: "Richness", zh: "丰富程度", kind: "stars" },
      { path: "aroma.top_note", label: "Top note", zh: "前调", hint: "at the nose", kind: "text" },
      {
        path: "aroma.middle_note",
        label: "Middle note",
        zh: "中调",
        hint: "liquor in the mouth",
        kind: "text",
      },
      {
        path: "aroma.base_note",
        label: "Base note",
        zh: "后调",
        hint: "after swallowing",
        kind: "text",
      },
      {
        path: "aroma.tail_note",
        label: "Tail note",
        zh: "尾调",
        hint: "a minute or two after",
        kind: "text",
      },
      { path: "aroma.cup_aroma", label: "Cup & lid", hint: "the empty cup's fragrance", kind: "text" },
      {
        path: "aroma.structure",
        label: "Aroma structure",
        zh: "香气结构",
        kind: "picks",
        options: STRUCTURES,
      },
    ],
  },
  {
    key: "sensation",
    title: "Sensation",
    zh: "感&觉",
    fields: [
      { path: "sensation.body", label: "Body", zh: "汤感浓度", kind: "scale", options: BODIES },
      { path: "sensation.smoothness", label: "Smoothness", zh: "顺滑", kind: "stars" },
      {
        path: "sensation.saturation",
        label: "Saturation",
        zh: "饱和度",
        kind: "scale",
        options: SATURATIONS,
      },
      { path: "sensation.throat", label: "Throat", zh: "喉韵", hint: "hou yun", kind: "stars" },
      ...MOUTHFEEL.map(
        ([key, label, zh]): TastingField => ({
          path: `sensation.mouthfeel.${key}`,
          label: `Mouthfeel — ${label}`,
          zh,
          kind: "stars",
        }),
      ),
      { path: "sensation.hui_gan.strength", label: "Hui gan — strength", zh: "回甘", kind: "stars" },
      { path: "sensation.hui_gan.duration", label: "Hui gan — duration", kind: "stars" },
      {
        path: "sensation.sheng_jin.strength",
        label: "Sheng jin — strength",
        zh: "生津",
        kind: "stars",
      },
      { path: "sensation.sheng_jin.duration", label: "Sheng jin — duration", kind: "stars" },
      {
        path: "sensation.body_feel",
        label: "Body feeling",
        zh: "体感",
        kind: "picks",
        options: BODY_FEELS,
      },
      { path: "sensation.body_feel_other", label: "Other body feeling", kind: "text" },
    ],
  },
];

const FIELDS = TASTING_SECTIONS.flatMap((s) => s.fields);

function unrated() {
  return { strength: null, duration: null };
}

export function emptyTasting(): Tasting {
  return {
    leaf: { dry: "", wet: "", spent: "", quality: null },
    liquor: { colour: null, clarity: null },
    aroma: {
      aroma: "",
      aroma_type: "",
      richness: null,
      top_note: "",
      middle_note: "",
      base_note: "",
      tail_note: "",
      cup_aroma: "",
      structure: [],
    },
    sensation: {
      body: null,
      smoothness: null,
      saturation: null,
      throat: null,
      mouthfeel: {
        thin: null,
        dry: null,
        astringent: null,
        rough: null,
        thick: null,
        moist: null,
        slick: null,
        cooling: null,
      },
      hui_gan: unrated(),
      sheng_jin: unrated(),
      body_feel: [],
      body_feel_other: "",
    },
  };
}

export function getAt(tasting: Tasting, path: string): TastingValue {
  let node: unknown = tasting;
  for (const key of path.split(".")) node = (node as Record<string, unknown> | undefined)?.[key];
  return (node ?? null) as TastingValue;
}

/** A copy of `tasting` with `path` set. Plain JSON copy: it may be a reactive proxy. */
export function setAt(tasting: Tasting, path: string, value: TastingValue): Tasting {
  const next = JSON.parse(JSON.stringify(tasting)) as Tasting;
  const keys = path.split(".");
  const last = keys.pop()!;
  let node = next as unknown as Record<string, unknown>;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  node[last] = value;
  return next;
}

export function isFilled(value: TastingValue): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return value !== null;
}

export function filledCount(tasting: Tasting, section: TastingSection): number {
  return section.fields.filter((f) => isFilled(getAt(tasting, f.path))).length;
}

export function isEmptyTasting(tasting: Tasting): boolean {
  return FIELDS.every((f) => !isFilled(getAt(tasting, f.path)));
}

export function optionLabel(field: TastingField, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

function fieldAt(path: string): TastingField {
  return FIELDS.find((f) => f.path === path)!;
}

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export function tastingLine(tasting: Tasting): string {
  const parts: string[] = [];
  const aroma = tasting.aroma.aroma_type.trim() || tasting.aroma.aroma.trim();
  if (aroma) parts.push(aroma);
  const body = tasting.sensation.body;
  if (body) parts.push(optionLabel(fieldAt("sensation.body"), body));
  // Ties go to the earlier of these, so hui gan wins when it's as strong as the others.
  const candidates: [string, number | null][] = [
    ["hui gan", tasting.sensation.hui_gan.strength],
    ["throat", tasting.sensation.throat],
    ["smoothness", tasting.sensation.smoothness],
  ];
  let best: [string, number] | null = null;
  for (const [name, value] of candidates) {
    if (value !== null && (best === null || value > best[1])) best = [name, value];
  }
  if (best) parts.push(`${best[0]} ${"★".repeat(best[1])}`);
  return parts.join(" · ");
}

export interface TastingRow {
  path: string;
  label: string;
  zh?: string;
  value: string;
}

export interface TastingBlock {
  key: TastingSection["key"];
  title: string;
  zh?: string;
  rows: TastingRow[];
}

function describe(field: TastingField, value: TastingValue): string {
  if (field.kind === "stars") return stars(value as number);
  if (field.kind === "scale") return optionLabel(field, value as string);
  if (field.kind === "picks") return (value as string[]).map((v) => optionLabel(field, v)).join(" · ");
  return (value as string).trim();
}

/** The filled fields only, in words, section by section. */
export function describeTasting(tasting: Tasting): TastingBlock[] {
  return TASTING_SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    zh: section.zh,
    rows: section.fields
      .filter((f) => isFilled(getAt(tasting, f.path)))
      .map((f) => ({ path: f.path, label: f.label, zh: f.zh, value: describe(f, getAt(tasting, f.path)) })),
  })).filter((block) => block.rows.length > 0);
}

export interface StarAverage {
  path: string;
  label: string;
  average: number;
  count: number;
}

export interface TastingSummary {
  count: number;
  stars: StarAverage[];
  body: LiquorBody | null;
  saturation: Saturation | null;
  structure: { value: string; label: string; count: number }[];
  aromaWords: string[];
}

/** The most frequent value; a tie goes to the one earlier in `order`. */
function usual(values: string[], order: string[]): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const candidate of order) {
    const count = values.filter((v) => v === candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function words(text: string): string[] {
  return text
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w !== "");
}

export function tastingSummary(
  sessions: Pick<TeaSession, "tasting">[],
): TastingSummary | null {
  const tasted = sessions
    .map((s) => s.tasting)
    .filter((t): t is Tasting => t !== null && !isEmptyTasting(t));
  if (tasted.length === 0) return null;

  const starAverages: StarAverage[] = [];
  for (const field of FIELDS.filter((f) => f.kind === "stars")) {
    const values = tasted.map((t) => getAt(t, field.path)).filter((v): v is number => typeof v === "number");
    if (values.length === 0) continue;
    const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    starAverages.push({ path: field.path, label: field.label, average, count: values.length });
  }

  const optionsOf = (path: string) => (fieldAt(path).options ?? []).map((o) => o.value);
  const structureField = fieldAt("aroma.structure");
  const picked = tasted.flatMap((t) => t.aroma.structure);
  const structure = optionsOf("aroma.structure")
    .map((value) => ({
      value,
      label: optionLabel(structureField, value),
      count: picked.filter((p) => p === value).length,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const sittingsWith = new Map<string, number>();
  for (const t of tasted) {
    for (const word of new Set([...words(t.aroma.aroma), ...words(t.aroma.aroma_type)])) {
      sittingsWith.set(word, (sittingsWith.get(word) ?? 0) + 1);
    }
  }
  const aromaWords = [...sittingsWith.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);

  return {
    count: tasted.length,
    stars: starAverages,
    body: usual(
      tasted.map((t) => t.sensation.body).filter((v): v is LiquorBody => v !== null),
      optionsOf("sensation.body"),
    ) as LiquorBody | null,
    saturation: usual(
      tasted.map((t) => t.sensation.saturation).filter((v): v is Saturation => v !== null),
      optionsOf("sensation.saturation"),
    ) as Saturation | null,
    structure,
    aromaWords,
  };
}
```

(`Array.prototype.sort` is stable, so equal structure counts stay in vocabulary order.)

- [ ] **Step 5: Count a tasting in `hasChaXi`**

In `frontend/src/apps/tea/journal.ts`, import `import { isEmptyTasting } from "./tasting";` and
`Tasting` from `./types`, and change `hasChaXi` to:

```ts
/** Whether anything of a sitting's cha xi or tasting is recorded — the "Cha xi only" test. */
export function hasChaXi(session: {
  cha_xi: ChaXi | null;
  image_url: string | null;
  tasting?: Tasting | null;
}): boolean {
  if (session.image_url !== null) return true;
  if (session.tasting && !isEmptyTasting(session.tasting)) return true;
  const chaXi = session.cha_xi;
  if (chaXi === null) return false;
  return chaXi.moods.length > 0 || chaXi.guests.trim() !== "" || chaXi.notes.trim() !== "";
}
```

- [ ] **Step 6: Carry `tasting: null` through the snapshot and every fixture**

In `stores/useTeaTimerStore.ts` `snapshot()`, add `tasting: null,` after `cha_xi: …,` (Task 4
replaces it with the live value).

In every spec under `frontend/src/apps/tea/` that builds a `TeaSession` or `JournalEntry`
literal, add `tasting: null,` on the line after its `cha_xi: …,` line. A script does it safely
(the `cha_xi` values in fixtures are one-liners):

```bash
cd frontend/src/apps/tea
grep -rl "cha_xi:" --include=*.spec.ts . | while read f; do
  python3 - "$f" <<'EOF'
import re, sys, pathlib
p = pathlib.Path(sys.argv[1]); out = []
for line in p.read_text().split("\n"):
    out.append(line)
    m = re.match(r"^(\s*)cha_xi: .*,$", line)
    if m:
        out.append(f"{m.group(1)}tasting: null,")
p.write_text("\n".join(out))
EOF
done
```

Then `cd frontend && npm run typecheck` and fix anything left (a `TeaSession` literal without a
`cha_xi` line gets `tasting: null` by hand).

- [ ] **Step 7: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): the tasting sheet, described once, with its summaries

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `StarRating` and `TastingFields`

**Files:**
- Create: `frontend/src/apps/tea/components/StarRating.vue`, `StarRating.spec.ts`
- Create: `frontend/src/apps/tea/components/TastingFields.vue`, `TastingFields.spec.ts`

**Interfaces:**
- `StarRating` props `modelValue: number | null`, `label: string`, `testid: string`; emits
  `update:modelValue [number | null]`; star buttons have test ids `{testid}-{n}` and aria-label
  `"{n} of 5"`.
- `TastingFields` props `modelValue: Tasting | null`; emits `update:modelValue [Tasting | null]`.
  Test ids: `tasting-section-{key}`, `tasting-count-{key}`, `tasting-{path}` (text input, or the
  StarRating testid prefix), `tasting-{path}-{value}` (chips).

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/apps/tea/components/StarRating.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StarRating from "./StarRating.vue";

describe("StarRating", () => {
  it("sets a rating, and clears it when the same star is tapped again", async () => {
    const wrapper = mount(StarRating, {
      props: { modelValue: 3, label: "Smoothness", testid: "s" },
    });
    expect(wrapper.findAll(".stars__star--on")).toHaveLength(3);
    await wrapper.get("[data-testid=s-4]").trigger("click");
    expect(wrapper.emitted("update:modelValue")![0]).toEqual([4]);
    await wrapper.get("[data-testid=s-3]").trigger("click");
    expect(wrapper.emitted("update:modelValue")![1]).toEqual([null]);
  });

  it("names each star for a screen reader", () => {
    const wrapper = mount(StarRating, { props: { modelValue: null, label: "Throat", testid: "t" } });
    expect(wrapper.get("[data-testid=t-2]").attributes("aria-label")).toBe("2 of 5");
    expect(wrapper.get("[role=group]").attributes("aria-label")).toBe("Throat");
  });
});
```

Create `frontend/src/apps/tea/components/TastingFields.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TastingFields from "./TastingFields.vue";
import { emptyTasting } from "../tasting";
import type { Tasting } from "../types";

function render(modelValue: Tasting | null = null) {
  return mount(TastingFields, { props: { modelValue } });
}

function last(wrapper: ReturnType<typeof render>): Tasting | null {
  return wrapper.emitted("update:modelValue")!.at(-1)![0] as Tasting | null;
}

describe("TastingFields", () => {
  it("starts a fresh sheet with every section closed", () => {
    const wrapper = render();
    for (const key of ["leaf", "liquor", "aroma", "sensation"]) {
      expect(wrapper.get(`[data-testid=tasting-section-${key}]`).attributes("open")).toBeUndefined();
    }
  });

  it("opens the sections that already hold something, and counts them", () => {
    const t = emptyTasting();
    t.aroma.top_note = "orchid";
    t.aroma.richness = 4;
    const wrapper = render(t);
    expect(wrapper.get("[data-testid=tasting-section-aroma]").attributes("open")).toBeDefined();
    expect(wrapper.get("[data-testid=tasting-count-aroma]").text()).toContain("2 noted");
    expect(wrapper.get("[data-testid=tasting-section-leaf]").attributes("open")).toBeUndefined();
  });

  it("writes text, stars, a scale and picks", async () => {
    const wrapper = render();
    await wrapper.get('[data-testid="tasting-aroma.top_note"]').setValue("orchid");
    expect(last(wrapper)!.aroma.top_note).toBe("orchid");

    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-sensation.hui_gan.strength-4"]').trigger("click");
    expect(last(wrapper)!.sensation.hui_gan.strength).toBe(4);

    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-sensation.body-mellow"]').trigger("click");
    expect(last(wrapper)!.sensation.body).toBe("mellow");

    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-aroma.structure-long"]').trigger("click");
    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-aroma.structure-single"]').trigger("click");
    expect(last(wrapper)!.aroma.structure).toEqual(["single", "long"]);
  });

  it("goes back to no tasting when the last field is cleared", async () => {
    const t = emptyTasting();
    t.sensation.throat = 3;
    const wrapper = render(t);
    await wrapper.get('[data-testid="tasting-sensation.throat-3"]').trigger("click");
    expect(last(wrapper)).toBeNull();
  });

  it("never lets 'none noticeable' sit beside another body feeling", async () => {
    const t = emptyTasting();
    t.sensation.body_feel = ["sweating", "warmth"];
    const wrapper = render(t);
    await wrapper.get('[data-testid="tasting-sensation.body_feel-none"]').trigger("click");
    expect(last(wrapper)!.sensation.body_feel).toEqual(["none"]);

    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-sensation.body_feel-warmth"]').trigger("click");
    expect(last(wrapper)!.sensation.body_feel).toEqual(["warmth"]);
  });

  it("unpicks a scale value when it is tapped again", async () => {
    const t = emptyTasting();
    t.sensation.body = "mellow";
    t.aroma.aroma = "orchid";
    const wrapper = render(t);
    await wrapper.get('[data-testid="tasting-sensation.body-mellow"]').trigger("click");
    expect(last(wrapper)!.sensation.body).toBeNull();
  });
});
```

- [ ] **Step 2: Run to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/components/StarRating.spec.ts src/apps/tea/components/TastingFields.spec.ts`
Expected: FAIL — components don't exist.

- [ ] **Step 3: Write `StarRating.vue`**

```vue
<template>
  <div class="stars" role="group" :aria-label="label">
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      :class="['stars__star', { 'stars__star--on': modelValue !== null && n <= modelValue }]"
      :aria-label="`${n} of 5`"
      :aria-pressed="modelValue === n ? 'true' : 'false'"
      :data-testid="`${testid}-${n}`"
      @click="emit('update:modelValue', modelValue === n ? null : n)"
    >
      ★
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: number | null; label: string; testid: string }>();
const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();
</script>

<style scoped lang="scss">
.stars {
  display: flex;
  gap: 2px;
}
.stars__star {
  background: transparent;
  border: 0;
  color: #574d43;
  font-size: 24px;
  line-height: 1;
  padding: 4px;
  cursor: pointer;
}
.stars__star--on {
  color: #e4d9c6;
}
</style>
```

- [ ] **Step 4: Write `TastingFields.vue`**

```vue
<template>
  <div class="tasting">
    <details
      v-for="section in TASTING_SECTIONS"
      :key="section.key"
      class="tasting__section"
      :open="openAtStart[section.key]"
      :data-testid="`tasting-section-${section.key}`"
    >
      <summary class="tasting__head">
        {{ section.title }}<span v-if="section.zh" class="tasting__zh">{{ section.zh }}</span>
        <span
          v-if="counts[section.key]"
          class="tasting__count"
          :data-testid="`tasting-count-${section.key}`"
          >· {{ counts[section.key] }} noted</span
        >
      </summary>

      <div v-for="field in section.fields" :key="field.path" class="tasting__field">
        <span class="tasting__label">
          {{ field.label }}<span v-if="field.zh" class="tasting__zh">{{ field.zh }}</span>
          <small v-if="field.hint" class="tasting__hint">{{ field.hint }}</small>
        </span>

        <input
          v-if="field.kind === 'text'"
          class="tasting__input"
          :data-testid="`tasting-${field.path}`"
          :value="getAt(current, field.path) ?? ''"
          @input="set(field.path, ($event.target as HTMLInputElement).value)"
        />
        <StarRating
          v-else-if="field.kind === 'stars'"
          :model-value="getAt(current, field.path) as number | null"
          :label="field.label"
          :testid="`tasting-${field.path}`"
          @update:model-value="set(field.path, $event)"
        />
        <div v-else class="tasting__chips" role="group" :aria-label="field.label">
          <button
            v-for="option in field.options"
            :key="option.value"
            type="button"
            :class="['tasting__chip', { 'tasting__chip--on': isOn(field, option.value) }]"
            :aria-pressed="isOn(field, option.value) ? 'true' : 'false'"
            :data-testid="`tasting-${field.path}-${option.value}`"
            @click="pick(field, option)"
          >
            {{ option.label }}<span v-if="option.zh" class="tasting__zh">{{ option.zh }}</span>
          </button>
        </div>
      </div>
    </details>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import StarRating from "./StarRating.vue";
import {
  TASTING_SECTIONS,
  emptyTasting,
  filledCount,
  getAt,
  isEmptyTasting,
  setAt,
  type TastingField,
  type TastingOption,
  type TastingValue,
} from "../tasting";
import type { Tasting } from "../types";

const props = defineProps<{ modelValue: Tasting | null }>();
const emit = defineEmits<{ "update:modelValue": [value: Tasting | null] }>();

const current = computed(() => props.modelValue ?? emptyTasting());
// Decided once: a section you're filling in must not snap shut or open as values change.
const openAtStart = Object.fromEntries(
  TASTING_SECTIONS.map((s) => [s.key, filledCount(current.value, s) > 0]),
);
const counts = computed(() =>
  Object.fromEntries(TASTING_SECTIONS.map((s) => [s.key, filledCount(current.value, s)])),
);

function set(path: string, value: TastingValue): void {
  const next = setAt(current.value, path, value);
  // An all-empty sheet is no tasting at all, so it never counts as "tasted".
  emit("update:modelValue", isEmptyTasting(next) ? null : next);
}

function isOn(field: TastingField, value: string): boolean {
  const held = getAt(current.value, field.path);
  return Array.isArray(held) ? held.includes(value) : held === value;
}

function pick(field: TastingField, option: TastingOption): void {
  const held = getAt(current.value, field.path);
  if (field.kind === "scale") {
    set(field.path, held === option.value ? null : option.value);
    return;
  }
  const list = (held as string[]) ?? [];
  const exclusive = new Set(field.options?.filter((o) => o.exclusive).map((o) => o.value));
  let next: string[];
  if (list.includes(option.value)) next = list.filter((v) => v !== option.value);
  else if (option.exclusive) next = [option.value];
  else next = [...list.filter((v) => !exclusive.has(v)), option.value];
  const order = (field.options ?? []).map((o) => o.value);
  set(
    field.path,
    order.filter((v) => next.includes(v)),
  );
}
</script>

<style scoped lang="scss">
.tasting {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 22px;
}
.tasting__section {
  background: #1e1712;
  border-radius: 6px;
  padding: 0 14px;
}
.tasting__head {
  color: #efe7da;
  font-size: 15px;
  padding: 14px 0;
  cursor: pointer;
}
.tasting__count {
  color: #8b7a63;
  font-size: 13px;
  margin-left: 6px;
}
.tasting__zh {
  color: #a99781;
  font-size: 12px;
  margin-left: 6px;
}
.tasting__field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 0 14px;
}
.tasting__label {
  color: #8b7a63;
  font-size: 13px;
}
.tasting__hint {
  color: #6b5f52;
  margin-left: 6px;
}
.tasting__input {
  background: #17120e;
  border: 1px solid #2c241d;
  border-radius: 6px;
  color: #efe7da;
  font-family: inherit;
  font-size: 16px;
  padding: 9px 12px;
}
.tasting__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tasting__chip {
  background: transparent;
  border: 1px solid #2c241d;
  border-radius: 999px;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  padding: 5px 11px;
  cursor: pointer;
}
.tasting__chip--on {
  background: #2c241d;
  border-color: #6b5f52;
  color: #efe7da;
}
</style>
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea/components/StarRating.spec.ts src/apps/tea/components/TastingFields.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/tea/components/StarRating.* frontend/src/apps/tea/components/TastingFields.*
git commit -m "feat(tea): a tasting sheet you can fill in, section by section

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Fill it in — live on the Cha Xi page, later in the Journal form

**Files:**
- Modify: `frontend/src/apps/tea/stores/useTeaTimerStore.ts` (+ spec)
- Modify: `frontend/src/apps/tea/pages/ChaXiPage.vue` (+ spec)
- Modify: `frontend/src/apps/tea/pages/TimerPage.vue` (`hasLiveChaXi`)
- Modify: `frontend/src/apps/tea/pages/JournalFormPage.vue` (+ spec)

**Interfaces:**
- Consumes: `TastingFields` (Task 3); `Tasting` (Task 2).
- Produces: `LiveSession.tasting?: Tasting | null`; `useTeaTimerStore().setTasting(value: Tasting |
  null): void`; `snapshot()` sends `tasting: live.tasting ?? null`; `resume()` restores it.

- [ ] **Step 1: Write the failing tests**

In `stores/useTeaTimerStore.spec.ts`, inside `describe("cha xi", …)` add:

```ts
  it("sends the live tasting with the next snapshot, and none for an old stored session", async () => {
    const store = await brewing();
    await store.push();
    expect((putMock.mock.calls.at(-1)![1] as { tasting: unknown }).tasting).toBeNull();

    const tasted = emptyTasting();
    tasted.sensation.throat = 4;
    store.setTasting(tasted);
    await store.push();
    const [, body] = putMock.mock.calls.at(-1)!;
    expect((body as { tasting: Tasting }).tasting.sensation.throat).toBe(4);
  });
```

(Import `emptyTasting` from `../tasting` and `Tasting` from `../types`. The existing "hydrates a
session stored before cha xi existed" test covers an old stored session; this one proves its
snapshot sends `tasting: null`.)

In `pages/ChaXiPage.spec.ts` add:

```ts
  it("writes tasting edits into the live session and syncs them the same way", async () => {
    liveWithTea();
    const timer = useTeaTimerStore();
    const wrapper = mount(ChaXiPage, { global: { stubs: STUBS } });
    await wrapper.get('[data-testid="tasting-sensation.throat-4"]').trigger("click");
    expect(timer.live?.tasting?.sensation.throat).toBe(4);
    vi.advanceTimersByTime(1500);
    await flushPromises();
    expect(putMock).toHaveBeenCalledTimes(1);
  });
```

In `pages/JournalFormPage.spec.ts`, inside `describe("JournalFormPage — edit", …)` add:

```ts
  it("keeps the tasting recorded at the table when the notes are edited", async () => {
    params.id = "s-7";
    const tasted = emptyTasting();
    tasted.aroma.top_note = "orchid";
    const entry = { ...JOURNAL_ONLY, tasting: tasted };
    putMock.mockResolvedValue(entry);
    const wrapper = await render([entry]);
    await wrapper.get("[data-testid=chaxi-notes]").setValue("third steep best");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls[0][1].tasting.aroma.top_note).toBe("orchid");
  });
```

and inside `describe("JournalFormPage — new entry", …)` add:

```ts
  it("sends the tasting with a new entry", async () => {
    putMock.mockResolvedValue({});
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-tea]").setValue("t-1");
    await wrapper.get('[data-testid="tasting-sensation.body-thick"]').trigger("click");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls[0][1].tasting.sensation.body).toBe("thick");
  });
```

(Import `emptyTasting` from `../tasting` in that spec.)

- [ ] **Step 2: Run to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaTimerStore.spec.ts src/apps/tea/pages/ChaXiPage.spec.ts src/apps/tea/pages/JournalFormPage.spec.ts`
Expected: FAIL — `store.setTasting is not a function`; no tasting test ids on the pages.

- [ ] **Step 3: Timer store**

In `stores/useTeaTimerStore.ts`: add `Tasting` to the type import; in `LiveSession` after
`imageUrl?` add `tasting?: Tasting | null;`; in `snapshot()` change `tasting: null,` to
`tasting: session.tasting ?? null,`; add after `setChaXi`:

```ts
  function setTasting(value: Tasting | null): void {
    if (live.value) live.value.tasting = value;
  }
```

in `resume()`'s `live.value = { … }` add `tasting: session.tasting,`; and return `setTasting`.

- [ ] **Step 4: Cha Xi page**

In `pages/ChaXiPage.vue`, import `TastingFields` and `Tasting`; below `<ChaXiFields … />` add:

```vue
      <TastingFields :model-value="timer.live.tasting ?? null" @update:model-value="onTasting" />
```

and replace `onEdit` with a shared scheduler:

```ts
function schedule(): void {
  if (pending !== null) clearTimeout(pending);
  pending = setTimeout(flush, PUSH_DELAY_MS);
}

function onEdit(value: ChaXi): void {
  timer.setChaXi(value);
  schedule();
}

function onTasting(value: Tasting | null): void {
  timer.setTasting(value);
  schedule();
}
```

In `pages/TimerPage.vue`, `hasLiveChaXi` passes the tasting too:

```ts
    ? hasChaXi({
        cha_xi: timer.live.chaXi ?? null,
        image_url: timer.live.imageUrl ?? null,
        tasting: timer.live.tasting ?? null,
      })
```

- [ ] **Step 5: Journal form**

In `pages/JournalFormPage.vue`: import `TastingFields` and `Tasting`; add
`const tasting = ref<Tasting | null>(null);` next to `chaXi`; below `<ChaXiFields … />` add
`<TastingFields v-model="tasting" />`; add `tasting: tasting.value,` to both `newBody()` and the
`body` in `editBody()`; in `fill()` add `tasting.value = e.tasting;`.

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): taste the tea on the Cha Xi page, or later from the Journal

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Show it — the entry page and the Journal card

**Files:**
- Modify: `frontend/src/apps/tea/pages/JournalEntryPage.vue` (+ spec)
- Modify: `frontend/src/apps/tea/components/JournalCard.vue`, test in `pages/JournalPage.spec.ts`

**Interfaces:**
- Consumes: `describeTasting`, `tastingLine` (Task 2).
- Test ids: `journal-tasting`, `journal-tasting-{key}` (one per block), `journal-card-tasting`.

- [ ] **Step 1: Write the failing tests**

In `pages/JournalEntryPage.spec.ts` add (import `emptyTasting` from `../tasting`):

```ts
  it("shows the tasting's filled fields only, by section", async () => {
    const tasted = emptyTasting();
    tasted.aroma.top_note = "orchid";
    tasted.sensation.hui_gan.strength = 4;
    const wrapper = await render({ ...ENTRY, tasting: tasted });
    expect(wrapper.find("[data-testid=journal-tasting-leaf]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=journal-tasting-aroma]").text()).toContain("Top note");
    expect(wrapper.get("[data-testid=journal-tasting-aroma]").text()).toContain("orchid");
    expect(wrapper.get("[data-testid=journal-tasting-sensation]").text()).toContain("★★★★☆");
  });

  it("shows no tasting block for an untasted sitting", async () => {
    const wrapper = await render();
    expect(wrapper.find("[data-testid=journal-tasting]").exists()).toBe(false);
  });
```

In `pages/JournalPage.spec.ts` add (import `emptyTasting`):

```ts
  it("puts a tasting line on a tasted sitting's card", async () => {
    const tasted = emptyTasting();
    tasted.aroma.aroma_type = "orchid";
    tasted.sensation.body = "mellow";
    const wrapper = await render([entry("s-1", { tasting: tasted }), entry("s-2")]);
    expect(wrapper.get("[data-testid=journal-card-s-1] [data-testid=journal-card-tasting]").text()).toBe(
      "orchid · mellow",
    );
    expect(wrapper.find("[data-testid=journal-card-s-2] [data-testid=journal-card-tasting]").exists()).toBe(
      false,
    );
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `cd frontend && npx vitest run src/apps/tea/pages/JournalEntryPage.spec.ts src/apps/tea/pages/JournalPage.spec.ts`
Expected: FAIL — no tasting block or line.

- [ ] **Step 3: Entry page**

In `pages/JournalEntryPage.vue`, after the `journal-timeline` `<ol>`, add:

```vue
        <div v-if="tastingBlocks.length" class="jentry__tasting" data-testid="journal-tasting">
          <section
            v-for="block in tastingBlocks"
            :key="block.key"
            class="jentry__tblock"
            :data-testid="`journal-tasting-${block.key}`"
          >
            <h2 class="jentry__theading">
              {{ block.title }}<span v-if="block.zh" class="jentry__zh">{{ block.zh }}</span>
            </h2>
            <dl class="jentry__facts">
              <template v-for="row in block.rows" :key="row.path">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value }}</dd>
              </template>
            </dl>
          </section>
        </div>
```

In the script: `import { describeTasting } from "../tasting";` and

```ts
const tastingBlocks = computed(() =>
  entry.value?.tasting ? describeTasting(entry.value.tasting) : [],
);
```

Styles:

```scss
.jentry__tasting {
  margin-top: 8px;
}
.jentry__theading {
  color: #a99781;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 18px 0 8px;
}
.jentry__zh {
  margin-left: 6px;
  letter-spacing: 0;
}
```

- [ ] **Step 4: Card line**

In `components/JournalCard.vue`, after the moods `<span>`, add:

```vue
      <span v-if="tasting" class="jcard__tasting" data-testid="journal-card-tasting">{{
        tasting
      }}</span>
```

In the script: `import { tastingLine } from "../tasting";` and
`const tasting = computed(() => (props.entry.tasting ? tastingLine(props.entry.tasting) : ""));`.
Style: `.jcard__tasting { color: #a99781; font-size: 13px; }`.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea/pages/JournalEntryPage.spec.ts src/apps/tea/pages/JournalPage.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/tea
git commit -m "feat(tea): a sitting's tasting on its Journal entry and card

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: The tea's tasting summary

**Files:**
- Modify: `frontend/src/apps/tea/pages/TeaDetailPage.vue` (+ spec)

**Interfaces:**
- Consumes: `tastingSummary`, `TASTING_SECTIONS`/`optionLabel` (Task 2).
- Test ids: `tea-tasting`, `tea-tasting-count`, `tea-tasting-usual`, `tea-tasting-structure`,
  `tea-tasting-aroma`.

- [ ] **Step 1: Write the failing tests**

In `pages/TeaDetailPage.spec.ts`, next to `it("lists the tea's finished sessions", …)`, add
(import `emptyTasting` from `../tasting`):

```ts
  it("sums up how the tea usually tastes, across its tasted sittings", async () => {
    const sitting = (id: string, edit: (t: ReturnType<typeof emptyTasting>) => void) => {
      const t = emptyTasting();
      edit(t);
      return {
        id,
        brewed_by: "jakub",
        teaware_id: null,
        vessel_volume_ml: null,
        tea_id: "t-1",
        status: "finalised",
        started_at: "2026-09-25T19:40:00Z",
        updated_at: "2026-09-25T20:10:00Z",
        finished_at: "2026-09-25T20:10:00Z",
        leaf_grams: 6,
        water_temp_c: 95,
        rating: 5,
        curve_source: "almanac",
        curve_source_label: "",
        infusions: [],
        away_tea_name: "",
        away_class_id: null,
        timed: true,
        cha_xi: null,
        image_url: null,
        tasting: t,
      };
    };
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/teas") return Promise.resolve([tea()]);
      if (path === "/tea/catalogue") return Promise.resolve([OOLONG, WUYI]);
      if (path === "/tea/cabinet") return Promise.resolve(SOLO);
      if (path === "/tea/teas/t-1/sessions")
        return Promise.resolve([
          sitting("s-1", (t) => {
            t.sensation.hui_gan.strength = 4;
            t.sensation.body = "mellow";
            t.aroma.aroma = "orchid, honey";
          }),
          sitting("s-2", (t) => {
            t.sensation.hui_gan.strength = 3;
            t.aroma.aroma_type = "orchid";
            t.aroma.structure = ["long"];
          }),
        ]);
      return Promise.resolve([]);
    });
    const wrapper = mount(TeaDetailPage, { global: { stubs: STUBS } });
    await flushPromises();
    const section = wrapper.get("[data-testid=tea-tasting]");
    expect(section.get("[data-testid=tea-tasting-count]").text()).toBe("across 2 tasted sittings");
    expect(section.text()).toContain("Hui gan — strength");
    expect(section.text()).toContain("★ 3.5");
    expect(section.get("[data-testid=tea-tasting-usual]").text()).toBe("Usually mellow body");
    expect(section.get("[data-testid=tea-tasting-structure]").text()).toBe("Structure: long");
    expect(section.get("[data-testid=tea-tasting-aroma]").text()).toBe("Aroma: orchid");
  });

  it("has no tasting summary until a sitting is tasted", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/teas") return Promise.resolve([tea()]);
      if (path === "/tea/catalogue") return Promise.resolve([OOLONG, WUYI]);
      if (path === "/tea/cabinet") return Promise.resolve(SOLO);
      return Promise.resolve([]);
    });
    const wrapper = mount(TeaDetailPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find("[data-testid=tea-tasting]").exists()).toBe(false);
  });
```

- [ ] **Step 2: Run to see it fail**

Run: `cd frontend && npx vitest run src/apps/tea/pages/TeaDetailPage.spec.ts`
Expected: FAIL — no `tea-tasting` section.

- [ ] **Step 3: Implement**

In `pages/TeaDetailPage.vue`, directly before the Sessions `<section … data-testid="tea-sessions">`,
add:

```vue
        <section v-if="tasting" class="tea-view__section" data-testid="tea-tasting">
          <h2 class="tea-view__heading">Tasting</h2>
          <p class="tea-tasting__count" data-testid="tea-tasting-count">
            across {{ tasting.count }} tasted {{ tasting.count === 1 ? "sitting" : "sittings" }}
          </p>
          <dl v-if="tasting.stars.length" class="tea-tasting__stars">
            <template v-for="star in tasting.stars" :key="star.path">
              <dt>{{ star.label }}</dt>
              <dd>★ {{ star.average.toFixed(1) }}</dd>
            </template>
          </dl>
          <p v-if="usual" class="tea-tasting__line" data-testid="tea-tasting-usual">{{ usual }}</p>
          <p v-if="tasting.structure.length" class="tea-tasting__line" data-testid="tea-tasting-structure">
            Structure: {{ tasting.structure.map((s) => s.label).join(" · ") }}
          </p>
          <p v-if="tasting.aromaWords.length" class="tea-tasting__line" data-testid="tea-tasting-aroma">
            Aroma: {{ tasting.aromaWords.join(" · ") }}
          </p>
        </section>
```

In the script, import `import { TASTING_SECTIONS, optionLabel, tastingSummary } from "../tasting";`
and add after `teaSessions`:

```ts
const tasting = computed(() => tastingSummary(teaSessions.value));
const usual = computed(() => {
  const summary = tasting.value;
  if (!summary) return "";
  const fields = TASTING_SECTIONS.flatMap((s) => s.fields);
  const label = (path: string, value: string) =>
    optionLabel(fields.find((f) => f.path === path)!, value);
  const parts = [
    summary.body ? `${label("sensation.body", summary.body)} body` : "",
    summary.saturation ? `${label("sensation.saturation", summary.saturation)} saturation` : "",
  ].filter((p) => p !== "");
  return parts.length ? `Usually ${parts.join(", ")}` : "";
});
```

Styles:

```scss
.tea-tasting__count,
.tea-tasting__line {
  color: #a99781;
  font-size: 14px;
  margin: 6px 0 0;
}
.tea-tasting__stars {
  display: grid;
  grid-template-columns: 1fr max-content;
  gap: 4px 16px;
  color: #e4d9c6;
  font-size: 14px;
  margin: 10px 0 0;
}
.tea-tasting__stars dt {
  color: #8b7a63;
}
.tea-tasting__stars dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea && npm run typecheck && npm run lint`
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/tea/pages/TeaDetailPage.*
git commit -m "feat(tea): a tea's page sums up how it usually tastes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: See it in the real app, story, full verification

**Files:**
- Create: `docs/stories/tea/for-review/tasting-sheet.story.md`
- Modify: `docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md` (under `### 4.6`)

- [ ] **Step 1: Walk it in the real app**

Run both dev servers against a throwaway `DATA_DIR` (never `backend/local-data`), on a 390 × 844
viewport. Brew a tea → Cha Xi → open **Aroma & Qi** and **Sensation**, fill a text field, a ★,
a scale and picks, pick "none noticeable" after "warmth" (warmth clears); leave the page and come
back (sections holding values open); finish; open the entry (Tasting block shows only filled
fields); the Journal card shows the tasting line; brew and taste the same tea a second time and
check the tea page's Tasting summary. Fix anything found TDD-first in its task's files.

- [ ] **Step 2: Story**

Create `docs/stories/tea/for-review/tasting-sheet.story.md`:

```markdown
# Story: Tasting sheet

## Status
Ready for Review

## Story
**As a** tea drinker at the table,
**I want** to fill in my tasting notebook's sheet for a sitting — aroma at each stage, body, mouthfeel, hui gan, sheng jin, body feeling, plus leaf, liquor and cup aroma — in English,
**so that** each sitting's tasting is kept in a form I can read at a glance, and a tea's page tells me what it's usually like.

## Acceptance Criteria
1. Every session can carry one tasting (never per infusion). Every field is optional; ★ fields are 1–5.
2. The Cha Xi page shows the tasting under the table's fields as four collapsible sections — Leaf, Liquor, Aroma & Qi (香&气), Sensation (感&觉) — with English labels and the notebook's Chinese beside them. A fresh sheet starts closed; a section holding values opens and says how many it holds.
3. Tasting edits sync like the cha xi (≈1.5 s after the last change, and on leaving). The Journal form carries the same sections, and editing a sitting keeps its tasting.
4. Aroma structure and body feeling take several picks, kept in the notebook's order; body, saturation and liquor colour take one; tapping a picked value or the current ★ again clears it. "None noticeable" never sits beside another body feeling.
5. Clearing every field leaves the sitting with no tasting.
6. The Journal entry shows the filled fields only, section by section; the Journal card shows a line such as "orchid · mellow · hui gan ★★★★"; a tasted sitting counts for "Cha xi only".
7. A tea's page shows a Tasting summary once any sitting is tasted: the count, the average of every rated ★ field, the usual body and saturation, the most-picked structure words, and aroma words that recur in two or more sittings.

## Dev Notes
- Spec: `docs/superpowers/specs/2026-09-29-tea-tasting-design.md`; plan: `docs/superpowers/plans/2026-09-29-tea-tasting.md`.
- `tasting` on `TeaSession` (tea doc schema v6); the sheet is described once in `tasting.ts` (`TASTING_SECTIONS`) and rendered by `TastingFields`.
- Out of scope: the flavour wheel and custom fields (FR-15, FR-16), comparing two sittings side by side, per-infusion tasting, a taste section.
```

- [ ] **Step 3: PRD pointer**

In `docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md`, directly after the §4.6
**Description** paragraph, add:

```markdown
The user's own tasting vocabulary is designed in `docs/superpowers/specs/2026-09-29-tea-tasting-design.md`: a typed, per-session tasting sheet (leaf, liquor, aroma & qi, sensation) with a per-tea summary that delivers FR-17's aggregate. The tap-through wheel and custom notes (FR-15, FR-16) and side-by-side comparison remain open.
```

- [ ] **Step 4: Full verification**

```bash
cd backend && .venv/bin/pytest -q && black --check . && ruff check .
cd ../frontend && npx vitest run && npm run typecheck && npm run lint
```

Expected: every command exits 0.

- [ ] **Step 5: Commit**

```bash
git add docs/stories/tea/for-review/tasting-sheet.story.md docs/planning-artifacts/prds/prd-tea-2026-09-06/prd.md
git commit -m "docs(tea): tasting sheet story, ready for review

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
