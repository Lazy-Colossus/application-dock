# Tea Cabinet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Tea Cabinet — a per-user inventory of teas, classified against a shared catalogue tree, on the dock at `/tea`.

**Architecture:** Strict three layers on the backend (router → service → repository), with one JSON document per user at `DATA_DIR/tea/users/{username}.json` holding both that user's teas and the catalogue nodes they added; a read-only seed catalogue ships in the repo. The frontend is a feature-grouped Vue module whose domain rules (tree walking, grouping, sort order, gauge maths) live in pure, unit-tested modules rather than in components.

**Tech Stack:** FastAPI + Pydantic v2 (Python 3.12), Vue 3 + Quasar v2 + Pinia + TypeScript (Node ≥22.22), pytest, vitest.

**Spec:** [`docs/superpowers/specs/2026-09-24-tea-cabinet-design.md`](../specs/2026-09-24-tea-cabinet-design.md)

**Design contracts:** [`DESIGN.md`](../../planning-artifacts/ux-designs/ux-tea-2026-09-24/DESIGN.md) (how it looks) and [`EXPERIENCE.md`](../../planning-artifacts/ux-designs/ux-tea-2026-09-24/EXPERIENCE.md) (how it works), with mockups in `mockups/`. **Both win over this plan for any visual or copy question.** Open `mockups/shelf.html` in a browser before starting Task 12.

## Global Constraints

- Python 3.12; the venv lives at `backend/.venv`. Node ≥22.22 (`package.json` engines).
- `export DATA_DIR=./local-data` before running the backend outside Docker — the default `/data` is not writable.
- Formatting and lint are CI-enforced: `black . && ruff check .` in `backend/` (line-length 100), `npm run lint` in `frontend/`.
- **Layering is absolute.** Routers do HTTP and exception translation only. Services hold rules and raise stdlib exceptions. `repositories/tea_repo.py` is the only module in this app that touches the filesystem — including the seed catalogue read.
- **Exception mapping, in the router only:** `FileNotFoundError` → 404, `ValueError` → 422, `NodeInUseError` → 409. (422, not 400 — that is this codebase's convention; see `routers/context_switch.py`.)
- Every persisted write goes through `atomic_write_json`; every read-modify-write runs inside `repo.doc_transaction(username)`, which holds `key_lock` for the whole block.
- API contract: snake_case fields, direct serialization with no envelope, ISO 8601 date strings, errors as `{ "detail": "..." }`.
- **All frontend HTTP goes through `@/composables/useApi`.** No raw `fetch`/`axios` anywhere. Both stores expose `loading` and `error` refs; every async action sets `loading` in a `try/finally` and routes failures into `error.value`. Never `console.error`.
- Vue: `<script setup lang="ts">`, `defineProps<{}>()` / `defineEmits<{}>()` generic syntax, `interface` for object shapes, `type` for unions, no `any` without a justifying comment.
- Tests: backend in `backend/tests/` as `test_*.py`, each with an autouse fixture doing `monkeypatch.setattr(repo.settings, "data_dir", tmp_path)`; `conftest.py` already bypasses auth to the username `test_user`. Frontend `*.spec.ts` co-located beside the unit. Use `data-testid` attributes for test hooks, as the other apps do.
- **Copy rules (from EXPERIENCE.md):** sentence case everywhere; no all-caps labels; no exclamation marks; never "Oops". An action keeps its name from button to result. Errors state what happened and the next move. The classes are green, yellow, white, oolong, red, dark — never "black" for red.
- **Visual rule (from DESIGN.md):** liquor colour is the only hue in the app. Interactive elements are bone (`#E4D9C6`) fills with `#17120E` type, never coloured. The dock's gold `#C8960A` is forbidden here.

## Review Focus

These are input classes the spec implies but does not name. Each line's test is added to the task that owns the code, in that task's own step style.

1. **`grams_purchased` of `0`** — division by zero in both the gauge proportion and price-per-gram. Expected: treated exactly like "not recorded" (no proportion, no per-gram figure), never `Infinity` or `NaN` on screen. *(Tasks 5, 8)*
2. **A tea whose `catalogue_node_id` no longer resolves** — a node deleted out of band, or a seed id retired between releases. Expected: that tea falls into the `other` section and the rest of the shelf renders; one bad tea must never 500 the list endpoint. *(Tasks 4, 5, 8)*
3. **A user node whose `parent_id` points at nothing** — a hand-edited data file, or a seed node that vanished. Expected: the orphan is dropped from the picker tree rather than crashing the walk or looping forever. *(Tasks 4, 7)*
4. **A name far longer than the row** — a 120-character tea name, or a long Chinese string. Expected: the name truncates and the rim gauge stays on screen at its fixed 52px column; the layout never scrolls sideways. *(Task 11)*
5. **A user node whose name duplicates a sibling's** — two "Rou Gui" chips in one tier. Expected: both remain selectable and distinguishable by id, and selecting one classifies against that one; adding a duplicate is permitted, not silently merged. *(Tasks 4, 14)*

---

## File Structure

**Backend (`backend/`)**

| File | Responsibility |
|---|---|
| `app/schemas/tea.py` | Pydantic models: `CatalogueNode`, `Tea`, `TeaDoc`, `TeaView`, and the request bodies. |
| `app/data/tea_catalogue.json` | The seeded tree. Version-controlled data, not code. |
| `app/repositories/tea_repo.py` | The only filesystem access: per-user doc read/write/transaction, plus the cached seed read. |
| `app/services/tea_catalogue_service.py` | Merge seed with user nodes, tree resolution, prefill lookup, the deletion guard. |
| `app/services/tea_service.py` | Tea validation and CRUD, `class_id` resolution. |
| `app/routers/tea.py` | HTTP surface at `/api/tea`, exception translation. |
| `app/routers/shell.py` | *(modify)* add the `tea` descriptor to `_APPS`. |
| `app/main.py` | *(modify)* include the tea router. |

**Frontend (`frontend/src/`)**

| File | Responsibility |
|---|---|
| `apps/tea/types.ts` | `TeaClass`, `TeaForm`, `HarvestSeason`, `CatalogueNode`, `Tea`. |
| `apps/tea/tokens.ts` | DESIGN.md's liquor palette and class order, as code. |
| `apps/tea/catalogue.ts` | Pure tree functions: children, path, root class, prefill origin. |
| `apps/tea/shelf.ts` | Pure shelf functions: grouping, sorting, low test, gauge maths, nearest section. |
| `apps/tea/composables/useSectionInView.ts` | Wires scroll events to `nearestSectionIndex`. |
| `apps/tea/stores/useTeaCatalogueStore.ts` | Catalogue fetch/cache, add and remove nodes. |
| `apps/tea/stores/useTeaCabinetStore.ts` | Shelf CRUD and the optimistic grams write. |
| `apps/tea/components/RimGauge.vue` | The one instrument. Proportion, threshold tick, dashed-when-low, empty. |
| `apps/tea/components/ClassLeaves.vue` | The sinensis/assamica silhouettes behind a section. |
| `apps/tea/components/TeaRow.vue` | One tea: name, Chinese, path, its rim. |
| `apps/tea/components/ShelfSection.vue` | One class: heading, leaves, its rows. |
| `apps/tea/components/GramsSheet.vue` | The stepper, opened from any rim. |
| `apps/tea/components/CataloguePicker.vue` | The chip tiers. |
| `apps/tea/components/AddNodeDialog.vue` | Adding a missing tea to the catalogue. |
| `apps/tea/components/TeaForm.vue` | The field set, shared by both pages. |
| `apps/tea/pages/CabinetPage.vue` | `/tea` |
| `apps/tea/pages/NewTeaPage.vue` | `/tea/new` |
| `apps/tea/pages/TeaDetailPage.vue` | `/tea/:teaId` |
| `apps/registry.ts`, `router/routes.ts` | *(modify)* register the app and its routes. |

---

## Task 1: Register Tea on the dock

**Files:**
- Modify: `frontend/src/apps/registry.ts`
- Modify: `frontend/src/router/routes.ts`
- Create: `frontend/src/apps/tea/pages/CabinetPage.vue`
- Modify: `backend/app/routers/shell.py`
- Test: `backend/tests/test_app_registry_parity.py` *(exists — it will start failing and then pass)*

**Interfaces:**
- Consumes: nothing.
- Produces: the route name `tea-cabinet` at `/tea`, and the app id `tea` in both registries.

- [ ] **Step 1: Run the existing parity test to see it pass before the change**

Run: `cd backend && .venv/bin/pytest tests/test_app_registry_parity.py -v`
Expected: PASS (the registries currently agree).

- [ ] **Step 2: Add the descriptor to the backend registry only, and watch parity fail**

In `backend/app/routers/shell.py`, append to `_APPS`:

```python
    AppDescriptor(
        id="tea",
        label="Tea Cabinet",
        icon="emoji_food_beverage",
        route="/tea",
    ),
```

Run: `cd backend && .venv/bin/pytest tests/test_app_registry_parity.py -v`
Expected: FAIL — the frontend registry has no `tea` entry. This proves the test guards the thing we think it guards.

- [ ] **Step 3: Add the matching frontend entry**

In `frontend/src/apps/registry.ts`, append to `apps`:

```ts
  {
    id: "tea",
    // A teacup glyph; the Cabinet is the tea app's first screen.
    label: "Tea Cabinet",
    icon: "emoji_food_beverage",
    route: "/tea",
  },
```

- [ ] **Step 4: Run parity again**

Run: `cd backend && .venv/bin/pytest tests/test_app_registry_parity.py -v`
Expected: PASS.

- [ ] **Step 5: Create the page stub and its route**

`frontend/src/apps/tea/pages/CabinetPage.vue`:

```vue
<template>
  <q-page class="tea-cabinet" data-testid="cabinet-page">
    <div class="tea-cabinet__header">
      <span class="tea-cabinet__title">Cabinet</span>
    </div>
  </q-page>
</template>

<script setup lang="ts"></script>

<style scoped lang="scss">
.tea-cabinet {
  background: #17120e;
  min-height: 100%;
}
.tea-cabinet__header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 20px 18px 16px;
}
.tea-cabinet__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
}
</style>
```

In `frontend/src/router/routes.ts`, add inside the `MainLayout` children array (before the `:catchAll` route, which lives outside it):

```ts
      {
        path: "tea",
        name: "tea-cabinet",
        component: () => import("@/apps/tea/pages/CabinetPage.vue"),
        meta: { title: "Tea Cabinet", requiresAuth: true },
      },
```

- [ ] **Step 6: Verify the app builds and lints**

Run: `cd frontend && npm run lint && npx vitest run`
Expected: lint clean, existing suite passes.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/apps/registry.ts frontend/src/router/routes.ts \
        frontend/src/apps/tea/pages/CabinetPage.vue backend/app/routers/shell.py
git commit -m "feat(tea): register the Tea Cabinet on the dock"
```

---

## Task 2: Schemas and the seed catalogue

**Files:**
- Create: `backend/app/schemas/tea.py`
- Create: `backend/app/data/tea_catalogue.json`
- Test: `backend/tests/test_tea_schemas.py`

**Interfaces:**
- Produces: `TeaClass`, `TeaForm`, `HarvestSeason`, `CatalogueNode`, `Tea`, `TeaDoc`, `TeaView`, `CreateNodeRequest`, `TeaWriteRequest` — all imported by every later backend task.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_tea_schemas.py`:

```python
"""Schemas and the shape of the shipped seed catalogue."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.schemas.tea import CATALOGUE_CLASSES, CatalogueNode, Tea, TeaDoc

SEED_PATH = Path(__file__).resolve().parents[1] / "app" / "data" / "tea_catalogue.json"


def _seed_nodes() -> list[CatalogueNode]:
    raw = json.loads(SEED_PATH.read_text(encoding="utf-8"))
    return [CatalogueNode.model_validate(node) for node in raw]


def test_empty_doc_defaults_are_usable() -> None:
    doc = TeaDoc()
    assert doc.schema_version == 1
    assert doc.teas == []
    assert doc.catalogue_nodes == []


def test_tea_requires_only_name_and_node() -> None:
    tea = Tea(
        id="t-abc12345",
        name="Da Hong Pao",
        catalogue_node_id="oolong.wuyi-yancha.da-hong-pao",
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )
    assert tea.form is None
    assert tea.grams_remaining == 0
    assert tea.origin == ""


def test_seed_parses_and_every_root_is_a_class() -> None:
    nodes = _seed_nodes()
    roots = [n for n in nodes if n.parent_id is None]
    assert {n.id for n in roots} == set(CATALOGUE_CLASSES)


def test_seed_ids_are_unique() -> None:
    ids = [n.id for n in _seed_nodes()]
    assert len(ids) == len(set(ids))


def test_every_seed_parent_resolves() -> None:
    nodes = _seed_nodes()
    known = {n.id for n in nodes}
    orphans = [n.id for n in nodes if n.parent_id is not None and n.parent_id not in known]
    assert orphans == []


def test_every_seed_node_is_marked_seed() -> None:
    assert all(n.source == "seed" for n in _seed_nodes())


@pytest.mark.parametrize("class_id", CATALOGUE_CLASSES)
def test_class_order_is_the_chinese_classification(class_id: str) -> None:
    assert class_id in ("green", "yellow", "white", "oolong", "red", "dark", "other")
    assert CATALOGUE_CLASSES.index("green") < CATALOGUE_CLASSES.index("dark")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_tea_schemas.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.schemas.tea'`.

- [ ] **Step 3: Write the schemas**

`backend/app/schemas/tea.py`:

```python
"""Pydantic v2 schemas for the Tea Cabinet.

The persisted document is one JSON file per user
(`DATA_DIR/tea/users/{username}.json`) holding both that user's teas and the
catalogue nodes they added themselves. Seeded nodes are never written there —
they ship in `app/data/tea_catalogue.json` and are merged on read.

Only `name` and `catalogue_node_id` are required on a tea: adding a tea must
never feel like a form to fill in (FR-2).
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

TeaClass = Literal["green", "yellow", "white", "oolong", "red", "dark", "other"]
TeaForm = Literal[
    "loose", "cake", "brick", "tuo", "ball", "bag", "sample", "other"
]  # bag/sample come from prd-tea-2026-09-06 FR-1; see Ruling 11.
HarvestSeason = Literal["spring", "summer", "autumn", "winter"]
NodeSource = Literal["seed", "user"]

# The Chinese classification's own order, which is also the shelf's section
# order (FR-5). Categorical, never a ranking.
CATALOGUE_CLASSES: tuple[str, ...] = (
    "green",
    "yellow",
    "white",
    "oolong",
    "red",
    "dark",
    "other",
)

# A tea recorded before 1900 is a typo, not a collector's item.
_MIN_YEAR = 1900


class CatalogueNode(BaseModel):
    id: str
    parent_id: str | None = None
    name: str
    name_zh: str = ""
    source: NodeSource = "seed"
    default_origin: str = ""


class Tea(BaseModel):
    id: str
    name: str
    catalogue_node_id: str
    form: TeaForm | None = None
    origin: str = ""
    vendor: str = ""
    year: int | None = None
    harvest_season: HarvestSeason | None = None
    cultivar: str = ""
    grams_purchased: float | None = None
    grams_remaining: float = 0
    price_paid: float | None = None
    purchase_date: str | None = None
    storage_location: str = ""
    low_threshold_grams: float | None = None
    notes: str = ""
    created_at: str
    updated_at: str


class TeaView(Tea):
    """A tea as the API returns it: with its root class resolved server-side.

    The shelf groups on `class_id`, so classification and grouping cannot drift
    apart (AR-5).
    """

    class_id: str


class TeaDoc(BaseModel):
    schema_version: int = 1
    teas: list[Tea] = Field(default_factory=list)
    catalogue_nodes: list[CatalogueNode] = Field(default_factory=list)


class CreateNodeRequest(BaseModel):
    parent_id: str
    name: str
    name_zh: str = ""
    default_origin: str = ""


class TeaWriteRequest(BaseModel):
    """The body for both create and replace. Mirrors `Tea` minus server fields."""

    name: str
    catalogue_node_id: str
    form: TeaForm | None = None
    origin: str = ""
    vendor: str = ""
    year: int | None = Field(default=None, ge=_MIN_YEAR)
    harvest_season: HarvestSeason | None = None
    cultivar: str = ""
    grams_purchased: float | None = Field(default=None, gt=0)
    grams_remaining: float = Field(default=0, ge=0)
    price_paid: float | None = Field(default=None, ge=0)
    purchase_date: str | None = None
    storage_location: str = ""
    low_threshold_grams: float | None = Field(default=None, ge=0)
    notes: str = ""
```

- [ ] **Step 4: Write the seed catalogue**

`backend/app/data/tea_catalogue.json` — the seven classes, then the starter tree from the spec. Ids are dotted slug paths. Write it in full:

```json
[
  { "id": "green", "parent_id": null, "name": "Green", "name_zh": "綠茶", "source": "seed" },
  { "id": "green.longjing", "parent_id": "green", "name": "Longjing", "name_zh": "龍井", "source": "seed", "default_origin": "Xihu, Zhejiang" },
  { "id": "green.biluochun", "parent_id": "green", "name": "Biluochun", "name_zh": "碧螺春", "source": "seed", "default_origin": "Dongting, Jiangsu" },
  { "id": "green.huangshan-maofeng", "parent_id": "green", "name": "Huangshan Maofeng", "name_zh": "黃山毛峰", "source": "seed", "default_origin": "Huangshan, Anhui" },
  { "id": "green.taiping-houkui", "parent_id": "green", "name": "Taiping Houkui", "name_zh": "太平猴魁", "source": "seed", "default_origin": "Taiping, Anhui" },
  { "id": "green.anji-baicha", "parent_id": "green", "name": "Anji Baicha", "name_zh": "安吉白茶", "source": "seed", "default_origin": "Anji, Zhejiang" },
  { "id": "green.liu-an-gua-pian", "parent_id": "green", "name": "Liu An Gua Pian", "name_zh": "六安瓜片", "source": "seed", "default_origin": "Lu'an, Anhui" },
  { "id": "green.japanese", "parent_id": "green", "name": "Japanese green", "name_zh": "日本綠茶", "source": "seed", "default_origin": "Japan" },
  { "id": "green.japanese.sencha", "parent_id": "green.japanese", "name": "Sencha", "name_zh": "煎茶", "source": "seed" },
  { "id": "green.japanese.gyokuro", "parent_id": "green.japanese", "name": "Gyokuro", "name_zh": "玉露", "source": "seed" },
  { "id": "green.japanese.matcha", "parent_id": "green.japanese", "name": "Matcha", "name_zh": "抹茶", "source": "seed" },
  { "id": "green.japanese.hojicha", "parent_id": "green.japanese", "name": "Hojicha", "name_zh": "焙じ茶", "source": "seed" },
  { "id": "green.japanese.genmaicha", "parent_id": "green.japanese", "name": "Genmaicha", "name_zh": "玄米茶", "source": "seed" },

  { "id": "yellow", "parent_id": null, "name": "Yellow", "name_zh": "黃茶", "source": "seed" },
  { "id": "yellow.junshan-yinzhen", "parent_id": "yellow", "name": "Junshan Yinzhen", "name_zh": "君山銀針", "source": "seed", "default_origin": "Junshan Island, Hunan" },
  { "id": "yellow.huoshan-huangya", "parent_id": "yellow", "name": "Huoshan Huangya", "name_zh": "霍山黃芽", "source": "seed", "default_origin": "Huoshan, Anhui" },

  { "id": "white", "parent_id": null, "name": "White", "name_zh": "白茶", "source": "seed" },
  { "id": "white.fuding", "parent_id": "white", "name": "Fuding", "name_zh": "福鼎", "source": "seed", "default_origin": "Fuding, Fujian" },
  { "id": "white.fuding.bai-hao-yinzhen", "parent_id": "white.fuding", "name": "Bai Hao Yinzhen", "name_zh": "白毫銀針", "source": "seed" },
  { "id": "white.fuding.bai-mudan", "parent_id": "white.fuding", "name": "Bai Mudan", "name_zh": "白牡丹", "source": "seed" },
  { "id": "white.fuding.shou-mei", "parent_id": "white.fuding", "name": "Shou Mei", "name_zh": "壽眉", "source": "seed" },
  { "id": "white.fuding.gong-mei", "parent_id": "white.fuding", "name": "Gong Mei", "name_zh": "貢眉", "source": "seed" },

  { "id": "oolong", "parent_id": null, "name": "Oolong", "name_zh": "烏龍", "source": "seed" },
  { "id": "oolong.wuyi-yancha", "parent_id": "oolong", "name": "Wuyi yancha", "name_zh": "武夷岩茶", "source": "seed", "default_origin": "Wuyi Shan, Fujian" },
  { "id": "oolong.wuyi-yancha.da-hong-pao", "parent_id": "oolong.wuyi-yancha", "name": "Da Hong Pao", "name_zh": "大紅袍", "source": "seed" },
  { "id": "oolong.wuyi-yancha.rou-gui", "parent_id": "oolong.wuyi-yancha", "name": "Rou Gui", "name_zh": "肉桂", "source": "seed" },
  { "id": "oolong.wuyi-yancha.shui-xian", "parent_id": "oolong.wuyi-yancha", "name": "Shui Xian", "name_zh": "水仙", "source": "seed" },
  { "id": "oolong.wuyi-yancha.tie-luohan", "parent_id": "oolong.wuyi-yancha", "name": "Tie Luohan", "name_zh": "鐵羅漢", "source": "seed" },
  { "id": "oolong.wuyi-yancha.bai-ji-guan", "parent_id": "oolong.wuyi-yancha", "name": "Bai Ji Guan", "name_zh": "白雞冠", "source": "seed" },
  { "id": "oolong.wuyi-yancha.shui-jin-gui", "parent_id": "oolong.wuyi-yancha", "name": "Shui Jin Gui", "name_zh": "水金龜", "source": "seed" },
  { "id": "oolong.anxi", "parent_id": "oolong", "name": "Anxi", "name_zh": "安溪", "source": "seed", "default_origin": "Anxi, Fujian" },
  { "id": "oolong.anxi.tieguanyin", "parent_id": "oolong.anxi", "name": "Tieguanyin", "name_zh": "鐵觀音", "source": "seed" },
  { "id": "oolong.anxi.huang-jin-gui", "parent_id": "oolong.anxi", "name": "Huang Jin Gui", "name_zh": "黃金桂", "source": "seed" },
  { "id": "oolong.anxi.benshan", "parent_id": "oolong.anxi", "name": "Benshan", "name_zh": "本山", "source": "seed" },
  { "id": "oolong.dancong", "parent_id": "oolong", "name": "Phoenix Dancong", "name_zh": "鳳凰單叢", "source": "seed", "default_origin": "Phoenix Mountain, Guangdong" },
  { "id": "oolong.dancong.mi-lan-xiang", "parent_id": "oolong.dancong", "name": "Mi Lan Xiang", "name_zh": "蜜蘭香", "source": "seed" },
  { "id": "oolong.dancong.ya-shi-xiang", "parent_id": "oolong.dancong", "name": "Ya Shi Xiang", "name_zh": "鴨屎香", "source": "seed" },
  { "id": "oolong.dancong.zhi-lan-xiang", "parent_id": "oolong.dancong", "name": "Zhi Lan Xiang", "name_zh": "芝蘭香", "source": "seed" },
  { "id": "oolong.taiwanese", "parent_id": "oolong", "name": "Taiwanese", "name_zh": "台灣烏龍", "source": "seed", "default_origin": "Taiwan" },
  { "id": "oolong.taiwanese.dong-ding", "parent_id": "oolong.taiwanese", "name": "Dong Ding", "name_zh": "凍頂", "source": "seed", "default_origin": "Nantou, Taiwan" },
  { "id": "oolong.taiwanese.alishan", "parent_id": "oolong.taiwanese", "name": "Alishan", "name_zh": "阿里山", "source": "seed", "default_origin": "Chiayi, Taiwan" },
  { "id": "oolong.taiwanese.lishan", "parent_id": "oolong.taiwanese", "name": "Lishan", "name_zh": "梨山", "source": "seed", "default_origin": "Taichung, Taiwan" },
  { "id": "oolong.taiwanese.oriental-beauty", "parent_id": "oolong.taiwanese", "name": "Oriental Beauty", "name_zh": "東方美人", "source": "seed", "default_origin": "Hsinchu, Taiwan" },
  { "id": "oolong.taiwanese.baozhong", "parent_id": "oolong.taiwanese", "name": "Wenshan Baozhong", "name_zh": "文山包種", "source": "seed", "default_origin": "Pinglin, Taiwan" },

  { "id": "red", "parent_id": null, "name": "Red", "name_zh": "紅茶", "source": "seed" },
  { "id": "red.zhengshan-xiaozhong", "parent_id": "red", "name": "Zhengshan Xiaozhong", "name_zh": "正山小種", "source": "seed", "default_origin": "Tongmu, Fujian" },
  { "id": "red.jin-jun-mei", "parent_id": "red", "name": "Jin Jun Mei", "name_zh": "金駿眉", "source": "seed", "default_origin": "Tongmu, Fujian" },
  { "id": "red.dianhong", "parent_id": "red", "name": "Dianhong", "name_zh": "滇紅", "source": "seed", "default_origin": "Yunnan" },
  { "id": "red.qimen", "parent_id": "red", "name": "Qimen", "name_zh": "祁門", "source": "seed", "default_origin": "Qimen, Anhui" },

  { "id": "dark", "parent_id": null, "name": "Dark", "name_zh": "黑茶", "source": "seed" },
  { "id": "dark.sheng-puerh", "parent_id": "dark", "name": "Sheng pu-erh", "name_zh": "生普洱", "source": "seed", "default_origin": "Yunnan" },
  { "id": "dark.shu-puerh", "parent_id": "dark", "name": "Shu pu-erh", "name_zh": "熟普洱", "source": "seed", "default_origin": "Yunnan" },
  { "id": "dark.liu-bao", "parent_id": "dark", "name": "Liu Bao", "name_zh": "六堡", "source": "seed", "default_origin": "Wuzhou, Guangxi" },
  { "id": "dark.fu-zhuan", "parent_id": "dark", "name": "Fu Zhuan", "name_zh": "茯磚", "source": "seed", "default_origin": "Hunan" },
  { "id": "dark.liu-an", "parent_id": "dark", "name": "Liu An", "name_zh": "六安", "source": "seed", "default_origin": "Anhui" },

  { "id": "other", "parent_id": null, "name": "Other", "name_zh": "其他", "source": "seed" }
]
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/bin/pytest tests/test_tea_schemas.py -v`
Expected: PASS, all seven tests.

- [ ] **Step 6: Format, lint and commit**

```bash
cd backend && black . && ruff check .
git add backend/app/schemas/tea.py backend/app/data/tea_catalogue.json backend/tests/test_tea_schemas.py
git commit -m "feat(tea): schemas and the seeded catalogue tree"
```

---

## Task 3: The repository

**Files:**
- Create: `backend/app/repositories/tea_repo.py`
- Test: `backend/tests/test_tea_repo.py`

**Interfaces:**
- Consumes: `TeaDoc`, `CatalogueNode` from `app.schemas.tea`.
- Produces: `read_doc(username) -> TeaDoc`, `write_doc(username, doc) -> None`, `doc_transaction(username) -> Iterator[TeaDoc]` (context manager), `read_seed_catalogue() -> list[CatalogueNode]`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_tea_repo.py`:

```python
"""Per-user persistence for the Tea Cabinet."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, Tea, TeaDoc


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _users_dir(tmp_path: Path) -> Path:
    return tmp_path / "tea" / "users"


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


def test_read_doc_returns_empty_doc_when_file_absent() -> None:
    doc = repo.read_doc("alice")
    assert isinstance(doc, TeaDoc)
    assert doc.schema_version == 1
    assert doc.teas == []
    assert doc.catalogue_nodes == []


def test_read_doc_does_not_create_a_file(tmp_path: Path) -> None:
    repo.read_doc("alice")
    assert not (_users_dir(tmp_path) / "alice.json").exists()


def test_write_then_read_round_trips_teas_and_nodes(tmp_path: Path) -> None:
    doc = TeaDoc(
        teas=[_tea()],
        catalogue_nodes=[
            CatalogueNode(id="u-11112222", parent_id="oolong", name="Mystery", source="user")
        ],
    )
    repo.write_doc("alice", doc)

    again = repo.read_doc("alice")
    assert [t.id for t in again.teas] == ["t-abc12345"]
    assert [n.id for n in again.catalogue_nodes] == ["u-11112222"]
    assert (_users_dir(tmp_path) / "alice.json").exists()


def test_write_is_valid_json_on_disk(tmp_path: Path) -> None:
    repo.write_doc("alice", TeaDoc(teas=[_tea()]))
    raw = json.loads((_users_dir(tmp_path) / "alice.json").read_text(encoding="utf-8"))
    assert raw["teas"][0]["name"] == "Da Hong Pao"


def test_doc_transaction_persists_on_clean_exit() -> None:
    with repo.doc_transaction("alice") as doc:
        doc.teas.append(_tea())
    assert len(repo.read_doc("alice").teas) == 1


def test_doc_transaction_writes_nothing_when_the_block_raises() -> None:
    repo.write_doc("alice", TeaDoc(teas=[_tea()]))
    with pytest.raises(ValueError):
        with repo.doc_transaction("alice") as doc:
            doc.teas.append(_tea("t-99999999"))
            raise ValueError("rejected")
    assert [t.id for t in repo.read_doc("alice").teas] == ["t-abc12345"]


@pytest.mark.parametrize("bad", ["../escape", "a/b", "a\\b", "", "  ", " alice"])
def test_unsafe_usernames_are_refused(bad: str) -> None:
    with pytest.raises(ValueError):
        repo.read_doc(bad)


def test_seed_catalogue_loads_and_is_cached() -> None:
    first = repo.read_seed_catalogue()
    second = repo.read_seed_catalogue()
    assert first is second, "the seed is immutable and must be read once"
    assert any(n.id == "oolong.wuyi-yancha.da-hong-pao" for n in first)


def test_seed_catalogue_is_not_in_the_data_dir(tmp_path: Path) -> None:
    repo.read_seed_catalogue()
    assert not (tmp_path / "tea" / "catalogue.json").exists()
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_tea_repo.py -v`
Expected: FAIL — `No module named 'app.repositories.tea_repo'`.

- [ ] **Step 3: Write the repository**

`backend/app/repositories/tea_repo.py`:

```python
"""Filesystem persistence for the Tea Cabinet — one JSON document per user.

This module is the ONLY code in the app that touches the filesystem for tea,
including the read of the shipped seed catalogue. All writes go through the
atomic write-then-rename helper.

A user's teas and the catalogue nodes they added live in the same document
because they are edited together: adding "Bai Ji Guan" to the tree while
creating the tea that prompted it is one user action, and one atomic write
(AR-1).

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from functools import lru_cache
from pathlib import Path

from app.core.config import settings
from app.core.locks import key_lock
from app.core.storage import atomic_write_json
from app.schemas.tea import CatalogueNode, TeaDoc

_APP_DIR = "tea"
_CURRENT_SCHEMA_VERSION = 1
_SEED_PATH = Path(__file__).resolve().parents[1] / "data" / "tea_catalogue.json"


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


def _user_path(username: str) -> Path:
    _validate_username(username)
    return settings.data_dir / _APP_DIR / "users" / f"{username}.json"


def migrate(raw: dict[str, object]) -> dict[str, object]:
    """Upgrade a raw document to the current schema. v1 is a pass-through."""
    return raw


def read_doc(username: str) -> TeaDoc:
    """Read a user's cabinet, or an empty one if they have no file yet."""
    path = _user_path(username)
    try:
        raw = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return TeaDoc(schema_version=_CURRENT_SCHEMA_VERSION)

    return TeaDoc.model_validate(migrate(json.loads(raw)))


def write_doc(username: str, doc: TeaDoc) -> None:
    """Persist a user's cabinet atomically, creating `users/` on first write."""
    atomic_write_json(_user_path(username), doc.model_dump(mode="json"))


@contextmanager
def doc_transaction(username: str) -> Iterator[TeaDoc]:
    """Read-modify-write a user's cabinet under that file's lock.

    The lock spans the whole block, so a concurrent request cannot read the
    same stale document and overwrite the change made here (NFR-2). If the
    block raises, nothing is written — a rejected request leaves no partial
    mutation behind.
    """
    with key_lock(str(_user_path(username))):
        doc = read_doc(username)
        yield doc
        write_doc(username, doc)


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

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/pytest tests/test_tea_repo.py -v`
Expected: PASS. Note `test_seed_catalogue_loads_and_is_cached` asserts identity — `lru_cache` returning the same tuple is what makes that hold.

- [ ] **Step 5: Format, lint and commit**

```bash
cd backend && black . && ruff check .
git add backend/app/repositories/tea_repo.py backend/tests/test_tea_repo.py
git commit -m "feat(tea): per-user cabinet persistence and the seed read"
```

---
## Task 4: The catalogue service

**Files:**
- Create: `backend/app/services/tea_catalogue_service.py`
- Test: `backend/tests/test_tea_catalogue.py`

**Interfaces:**
- Consumes: `tea_repo.read_doc`, `tea_repo.doc_transaction`, `tea_repo.read_seed_catalogue`.
- Produces:
  - `NodeInUseError(Exception)` — raised with a message naming the count.
  - `merged_nodes(username: str) -> list[CatalogueNode]`
  - `node_index(nodes: list[CatalogueNode]) -> dict[str, CatalogueNode]`
  - `resolve_class(index: dict[str, CatalogueNode], node_id: str) -> str`
  - `create_node(username: str, req: CreateNodeRequest) -> CatalogueNode`
  - `delete_node(username: str, node_id: str) -> None`

**Note on prefill — a deliberate deviation from the spec's testing table.** The spec lists prefill
resolution under `test_tea_service.py`. It is not implemented on the backend. Prefill has to happen
live in the picker, at the moment a node is chosen and before anything is saved, so the walk lives
in `catalogue.ts` and is tested in Task 9. The backend stores whatever `origin` arrives. Putting the
same walk in both places would be two implementations of one rule, which is worse than the
inconsistency this note records.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_tea_catalogue.py`:

```python
"""Merging, walking and guarding the catalogue tree."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, CreateNodeRequest, Tea, TeaDoc
from app.services import tea_catalogue_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _tea(node_id: str, tea_id: str = "t-abc12345") -> Tea:
    return Tea(
        id=tea_id,
        name="A tea",
        catalogue_node_id=node_id,
        created_at="2026-09-25T10:00:00+00:00",
        updated_at="2026-09-25T10:00:00+00:00",
    )


def test_merged_nodes_include_the_seed_for_a_user_with_no_file() -> None:
    nodes = service.merged_nodes("alice")
    ids = {n.id for n in nodes}
    assert "oolong" in ids
    assert "oolong.wuyi-yancha.da-hong-pao" in ids


def test_user_nodes_are_merged_over_the_seed() -> None:
    node = service.create_node(
        "alice", CreateNodeRequest(parent_id="oolong.wuyi-yancha", name="Bai Ji Guan")
    )
    ids = {n.id for n in service.merged_nodes("alice")}
    assert node.id in ids
    assert node.source == "user"
    assert node.id.startswith("u-")


def test_one_users_nodes_are_invisible_to_another() -> None:
    service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Alice's own"))
    assert all(n.source == "seed" for n in service.merged_nodes("bob"))


def test_a_user_node_cannot_shadow_a_seed_node() -> None:
    """A user document naming a seed id must not replace the seed's node."""
    repo.write_doc(
        "alice",
        TeaDoc(
            catalogue_nodes=[
                CatalogueNode(id="oolong", parent_id=None, name="Hijacked", source="user")
            ]
        ),
    )
    index = service.node_index(service.merged_nodes("alice"))
    assert index["oolong"].name == "Oolong"
    assert index["oolong"].source == "seed"


def test_create_node_refuses_a_parent_that_does_not_exist() -> None:
    with pytest.raises(ValueError):
        service.create_node("alice", CreateNodeRequest(parent_id="nope", name="Orphan"))


def test_create_node_refuses_a_blank_name() -> None:
    with pytest.raises(ValueError):
        service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="   "))


@pytest.mark.parametrize(
    ("node_id", "expected"),
    [
        ("oolong", "oolong"),
        ("oolong.wuyi-yancha", "oolong"),
        ("oolong.wuyi-yancha.da-hong-pao", "oolong"),
        ("dark.sheng-puerh", "dark"),
        ("green.japanese.matcha", "green"),
    ],
)
def test_resolve_class_walks_to_the_root_at_every_depth(node_id: str, expected: str) -> None:
    index = service.node_index(service.merged_nodes("alice"))
    assert service.resolve_class(index, node_id) == expected


def test_resolve_class_of_an_unknown_node_is_other() -> None:
    """Review Focus 2: a retired or deleted node must not break the shelf."""
    index = service.node_index(service.merged_nodes("alice"))
    assert service.resolve_class(index, "gone.for.good") == "other"


def test_orphaned_user_nodes_are_dropped_from_the_tree() -> None:
    """Review Focus 3: a hand-edited file pointing at a parent that isn't there."""
    repo.write_doc(
        "alice",
        TeaDoc(
            catalogue_nodes=[
                CatalogueNode(id="u-orphan01", parent_id="does-not-exist", name="Lost", source="user")
            ]
        ),
    )
    assert all(n.id != "u-orphan01" for n in service.merged_nodes("alice"))


def test_a_cycle_among_user_nodes_does_not_hang() -> None:
    """Two nodes each claiming the other as parent reach no root, so both go."""
    repo.write_doc(
        "alice",
        TeaDoc(
            catalogue_nodes=[
                CatalogueNode(id="u-aaa", parent_id="u-bbb", name="A", source="user"),
                CatalogueNode(id="u-bbb", parent_id="u-aaa", name="B", source="user"),
            ]
        ),
    )
    ids = {n.id for n in service.merged_nodes("alice")}
    assert "u-aaa" not in ids and "u-bbb" not in ids


def test_two_siblings_may_share_a_name_and_stay_distinct() -> None:
    """Review Focus 5: duplicates are permitted, never silently merged."""
    first = service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Rou Gui"))
    second = service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Rou Gui"))
    assert first.id != second.id
    ids = {n.id for n in service.merged_nodes("alice")}
    assert {first.id, second.id} <= ids


def test_delete_node_removes_an_unused_user_node() -> None:
    node = service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Temp"))
    service.delete_node("alice", node.id)
    assert all(n.id != node.id for n in service.merged_nodes("alice"))


def test_delete_node_refuses_a_node_teas_point_at() -> None:
    node = service.create_node("alice", CreateNodeRequest(parent_id="oolong", name="Used"))
    with repo.doc_transaction("alice") as doc:
        doc.teas.append(_tea(node.id))

    with pytest.raises(service.NodeInUseError) as excinfo:
        service.delete_node("alice", node.id)
    assert "1" in str(excinfo.value)


def test_delete_node_refuses_a_seed_node() -> None:
    with pytest.raises(ValueError):
        service.delete_node("alice", "oolong")


def test_delete_node_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.delete_node("alice", "u-nosuchid")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_tea_catalogue.py -v`
Expected: FAIL — `No module named 'app.services.tea_catalogue_service'`.

- [ ] **Step 3: Write the service**

`backend/app/services/tea_catalogue_service.py`:

```python
"""The catalogue tree: the seeded spine plus whatever the user has added.

Seeded nodes ship in the repo and are read-only. A user's own nodes live in
their document and are merged over the seed on read — but never *replace* a
seeded node, so a seed update can never be silently hijacked by stale user data
and a user can never lose a node to a seed rename (FR-6).

Raises stdlib exceptions plus `NodeInUseError`; the router translates.
"""

from __future__ import annotations

import uuid

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, CreateNodeRequest

_OTHER = "other"


class NodeInUseError(Exception):
    """A catalogue node cannot be deleted while teas are classified under it."""


def _reaches_a_root(node: CatalogueNode, by_id: dict[str, CatalogueNode]) -> bool:
    """Whether walking up from `node` terminates at a root.

    Guards against both a missing parent and a cycle: a node that never reaches
    `parent_id is None` is unreachable in the picker and is dropped rather than
    allowed to break the walk (Review Focus 3).
    """
    seen: set[str] = set()
    current: CatalogueNode | None = node
    while current is not None:
        if current.id in seen:
            return False
        seen.add(current.id)
        if current.parent_id is None:
            return True
        current = by_id.get(current.parent_id)
    return False


def merged_nodes(username: str) -> list[CatalogueNode]:
    """The seed plus this user's own nodes, with unreachable nodes dropped."""
    seed = list(repo.read_seed_catalogue())
    seed_ids = {node.id for node in seed}

    # A user node claiming a seed id is ignored outright: the seed wins.
    mine = [node for node in repo.read_doc(username).catalogue_nodes if node.id not in seed_ids]

    combined = seed + mine
    by_id = {node.id: node for node in combined}
    return [node for node in combined if _reaches_a_root(node, by_id)]


def node_index(nodes: list[CatalogueNode]) -> dict[str, CatalogueNode]:
    return {node.id: node for node in nodes}


def resolve_class(index: dict[str, CatalogueNode], node_id: str) -> str:
    """The root class a node belongs to, or `other` if it cannot be resolved.

    A tea pointing at a node that has since been deleted or retired must still
    appear on the shelf; one unresolvable tea may never fail the whole list
    (Review Focus 2).
    """
    seen: set[str] = set()
    current = index.get(node_id)
    while current is not None:
        if current.id in seen:
            return _OTHER
        seen.add(current.id)
        if current.parent_id is None:
            return current.id
        current = index.get(current.parent_id)
    return _OTHER


def create_node(username: str, req: CreateNodeRequest) -> CatalogueNode:
    """Add one node under an existing parent and return it."""
    name = req.name.strip()
    if not name:
        raise ValueError("A catalogue entry needs a name")

    if req.parent_id not in node_index(merged_nodes(username)):
        raise ValueError(f"No catalogue entry with id {req.parent_id!r}")

    node = CatalogueNode(
        id=f"u-{uuid.uuid4().hex[:8]}",
        parent_id=req.parent_id,
        name=name,
        name_zh=req.name_zh.strip(),
        source="user",
        default_origin=req.default_origin.strip(),
    )
    with repo.doc_transaction(username) as doc:
        doc.catalogue_nodes.append(node)
    return node


def delete_node(username: str, node_id: str) -> None:
    """Remove one of the user's own nodes, if nothing is classified under it."""
    if any(node.id == node_id for node in repo.read_seed_catalogue()):
        raise ValueError("Teas that ship with the app cannot be removed")

    with repo.doc_transaction(username) as doc:
        if all(node.id != node_id for node in doc.catalogue_nodes):
            raise FileNotFoundError(f"No catalogue entry with id {node_id!r}")

        in_use = sum(1 for tea in doc.teas if tea.catalogue_node_id == node_id)
        if in_use:
            plural = "tea is" if in_use == 1 else "teas are"
            raise NodeInUseError(f"{in_use} {plural} classified here. Reclassify them first.")

        doc.catalogue_nodes = [node for node in doc.catalogue_nodes if node.id != node_id]
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/pytest tests/test_tea_catalogue.py -v`
Expected: PASS, all sixteen.

- [ ] **Step 5: Format, lint and commit**

```bash
cd backend && black . && ruff check .
git add backend/app/services/tea_catalogue_service.py backend/tests/test_tea_catalogue.py
git commit -m "feat(tea): merge, walk and guard the catalogue tree"
```

---

## Task 5: The tea service

**Files:**
- Create: `backend/app/services/tea_service.py`
- Test: `backend/tests/test_tea_service.py`
- Test: `backend/tests/test_tea_concurrency.py`

**Interfaces:**
- Consumes: `tea_repo`, `tea_catalogue_service.merged_nodes / node_index / resolve_class`.
- Produces: `list_teas(username) -> list[TeaView]`, `get_tea(username, tea_id) -> TeaView`, `create_tea(username, req) -> TeaView`, `replace_tea(username, tea_id, req) -> TeaView`, `delete_tea(username, tea_id) -> None`.

- [ ] **Step 1: Write the failing service test**

`backend/tests/test_tea_service.py`:

```python
"""Tea rules: validation, class resolution, CRUD."""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, Tea, TeaDoc, TeaWriteRequest
from app.services import tea_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def _req(**overrides: object) -> TeaWriteRequest:
    payload: dict[str, object] = {
        "name": "Da Hong Pao",
        "catalogue_node_id": "oolong.wuyi-yancha.da-hong-pao",
        "grams_purchased": 100,
        "grams_remaining": 38,
    }
    payload.update(overrides)
    return TeaWriteRequest.model_validate(payload)


def test_create_returns_a_tea_with_a_minted_id_and_timestamps() -> None:
    tea = service.create_tea("alice", _req())
    assert tea.id.startswith("t-")
    assert tea.created_at == tea.updated_at
    assert tea.class_id == "oolong"


def test_create_trims_the_name() -> None:
    assert service.create_tea("alice", _req(name="  Rou Gui  ")).name == "Rou Gui"


def test_create_refuses_a_blank_name() -> None:
    with pytest.raises(ValueError):
        service.create_tea("alice", _req(name="   "))


def test_create_refuses_an_unknown_catalogue_node() -> None:
    with pytest.raises(ValueError):
        service.create_tea("alice", _req(catalogue_node_id="not-a-node"))


def test_create_accepts_a_bare_class_as_the_classification() -> None:
    assert service.create_tea("alice", _req(catalogue_node_id="oolong")).class_id == "oolong"


def test_remaining_may_not_exceed_purchased() -> None:
    with pytest.raises(ValueError) as excinfo:
        service.create_tea("alice", _req(grams_purchased=100, grams_remaining=130))
    assert "100" in str(excinfo.value)


def test_remaining_may_equal_purchased() -> None:
    assert service.create_tea("alice", _req(grams_purchased=50, grams_remaining=50)).grams_remaining == 50


def test_remaining_is_unconstrained_when_purchased_is_unknown() -> None:
    tea = service.create_tea("alice", _req(grams_purchased=None, grams_remaining=900))
    assert tea.grams_remaining == 900


def test_remaining_defaults_to_purchased_when_not_given() -> None:
    req = TeaWriteRequest(name="New cake", catalogue_node_id="dark", grams_purchased=357)
    assert service.create_tea("alice", req).grams_remaining == 357


def test_year_may_not_be_in_the_far_future() -> None:
    with pytest.raises(ValueError):
        service.create_tea("alice", _req(year=datetime.now(UTC).year + 5))


def test_purchase_date_must_be_a_date() -> None:
    with pytest.raises(ValueError):
        service.create_tea("alice", _req(purchase_date="last tuesday"))


def test_purchase_date_accepts_iso() -> None:
    assert service.create_tea("alice", _req(purchase_date="2024-03-12")).purchase_date == "2024-03-12"


def test_list_returns_every_tea_with_its_class() -> None:
    service.create_tea("alice", _req())
    service.create_tea("alice", _req(name="Shou Mei", catalogue_node_id="white.fuding.shou-mei"))
    classes = sorted(t.class_id for t in service.list_teas("alice"))
    assert classes == ["oolong", "white"]


def test_list_survives_a_tea_whose_node_has_gone() -> None:
    """Review Focus 2: one unresolvable tea may not fail the whole shelf."""
    repo.write_doc(
        "alice",
        TeaDoc(
            teas=[
                Tea(
                    id="t-orphan01",
                    name="Mystery",
                    catalogue_node_id="retired.in.v2",
                    created_at="2026-09-25T10:00:00+00:00",
                    updated_at="2026-09-25T10:00:00+00:00",
                )
            ]
        ),
    )
    teas = service.list_teas("alice")
    assert [t.class_id for t in teas] == ["other"]


def test_get_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.get_tea("alice", "t-nosuchid")


def test_replace_overwrites_every_field_and_bumps_updated_at() -> None:
    tea = service.create_tea("alice", _req())
    replaced = service.replace_tea(
        "alice",
        tea.id,
        _req(name="Rou Gui", catalogue_node_id="oolong.wuyi-yancha.rou-gui", grams_remaining=12),
    )
    assert replaced.id == tea.id
    assert replaced.name == "Rou Gui"
    assert replaced.grams_remaining == 12
    assert replaced.created_at == tea.created_at
    assert replaced.updated_at >= tea.updated_at


def test_replace_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.replace_tea("alice", "t-nosuchid", _req())


def test_delete_removes_only_that_tea() -> None:
    first = service.create_tea("alice", _req())
    second = service.create_tea("alice", _req(name="Other"))
    service.delete_tea("alice", first.id)
    assert [t.id for t in service.list_teas("alice")] == [second.id]


def test_delete_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.delete_tea("alice", "t-nosuchid")


def test_a_tea_may_be_classified_against_a_node_the_user_added() -> None:
    from app.schemas.tea import CreateNodeRequest
    from app.services import tea_catalogue_service as catalogue

    node = catalogue.create_node(
        "alice", CreateNodeRequest(parent_id="oolong.wuyi-yancha", name="Bai Ji Guan")
    )
    assert service.create_tea("alice", _req(catalogue_node_id=node.id)).class_id == "oolong"


def test_grams_purchased_of_zero_is_refused_at_the_boundary() -> None:
    """Review Focus 1: zero is 'not recorded', never a denominator."""
    with pytest.raises(ValueError):
        TeaWriteRequest(name="X", catalogue_node_id="oolong", grams_purchased=0)


def test_a_users_teas_are_invisible_to_another_user() -> None:
    service.create_tea("alice", _req())
    assert service.list_teas("bob") == []


def test_seed_nodes_are_never_written_into_a_users_document() -> None:
    service.create_tea("alice", _req())
    assert repo.read_doc("alice").catalogue_nodes == []
    assert isinstance(repo.read_seed_catalogue()[0], CatalogueNode)
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_tea_service.py -v`
Expected: FAIL — `No module named 'app.services.tea_service'`.

- [ ] **Step 3: Write the service**

`backend/app/services/tea_service.py`:

```python
"""Business logic for the Tea Cabinet's teas.

Operates on a single user's document via `tea_repo`. Raises stdlib exceptions
only (`ValueError` for invalid input, `FileNotFoundError` for a missing tea) —
the router translates them. The `username` always comes from the JWT via the
router and is never taken from request input.
"""

from __future__ import annotations

import uuid
from datetime import UTC, date, datetime

from app.repositories import tea_repo as repo
from app.schemas.tea import CatalogueNode, Tea, TeaView, TeaWriteRequest
from app.services import tea_catalogue_service as catalogue


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _new_id() -> str:
    return f"t-{uuid.uuid4().hex[:8]}"


def _validate(req: TeaWriteRequest, index: dict[str, CatalogueNode]) -> str:
    """Check a write request and return the cleaned name.

    Bounds that Pydantic can express (non-negative, year floor, purchased > 0)
    live on `TeaWriteRequest`; the rules that need context live here.
    """
    name = req.name.strip()
    if not name:
        raise ValueError("A tea needs a name")

    if req.catalogue_node_id not in index:
        raise ValueError(f"No catalogue entry with id {req.catalogue_node_id!r}")

    if req.year is not None and req.year > datetime.now(UTC).year + 1:
        raise ValueError("That harvest year is in the future")

    if req.purchase_date is not None:
        try:
            date.fromisoformat(req.purchase_date)
        except ValueError as exc:
            raise ValueError("Purchase date must be a date like 2024-03-12") from exc

    if req.grams_purchased is not None and req.grams_remaining > req.grams_purchased:
        raise ValueError(
            f"You've only bought {req.grams_purchased:g}g of this. "
            "Change the amount bought first."
        )

    return name


def _resolved_remaining(req: TeaWriteRequest) -> float:
    """A new tea with an amount bought but no remaining starts full (FR-1)."""
    if req.grams_remaining == 0 and req.grams_purchased is not None:
        return req.grams_purchased
    return req.grams_remaining


def _view(tea: Tea, index: dict[str, CatalogueNode]) -> TeaView:
    return TeaView(**tea.model_dump(), class_id=catalogue.resolve_class(index, tea.catalogue_node_id))


def list_teas(username: str) -> list[TeaView]:
    """Every tea in the cabinet, each with its root class resolved."""
    index = catalogue.node_index(catalogue.merged_nodes(username))
    return [_view(tea, index) for tea in repo.read_doc(username).teas]


def get_tea(username: str, tea_id: str) -> TeaView:
    index = catalogue.node_index(catalogue.merged_nodes(username))
    for tea in repo.read_doc(username).teas:
        if tea.id == tea_id:
            return _view(tea, index)
    raise FileNotFoundError(f"No tea with id {tea_id!r}")


def create_tea(username: str, req: TeaWriteRequest) -> TeaView:
    index = catalogue.node_index(catalogue.merged_nodes(username))
    name = _validate(req, index)
    stamp = _now_iso()

    tea = Tea(
        **req.model_dump(exclude={"name", "grams_remaining"}),
        name=name,
        grams_remaining=_resolved_remaining(req),
        id=_new_id(),
        created_at=stamp,
        updated_at=stamp,
    )
    with repo.doc_transaction(username) as doc:
        doc.teas.append(tea)
    return _view(tea, index)


def replace_tea(username: str, tea_id: str, req: TeaWriteRequest) -> TeaView:
    """Full replace, as the notes app does. `id` and `created_at` survive."""
    index = catalogue.node_index(catalogue.merged_nodes(username))
    name = _validate(req, index)

    with repo.doc_transaction(username) as doc:
        for position, existing in enumerate(doc.teas):
            if existing.id == tea_id:
                updated = Tea(
                    **req.model_dump(exclude={"name"}),
                    name=name,
                    id=existing.id,
                    created_at=existing.created_at,
                    updated_at=_now_iso(),
                )
                doc.teas[position] = updated
                return _view(updated, index)
        raise FileNotFoundError(f"No tea with id {tea_id!r}")


def delete_tea(username: str, tea_id: str) -> None:
    with repo.doc_transaction(username) as doc:
        remaining = [tea for tea in doc.teas if tea.id != tea_id]
        if len(remaining) == len(doc.teas):
            raise FileNotFoundError(f"No tea with id {tea_id!r}")
        doc.teas = remaining
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && .venv/bin/pytest tests/test_tea_service.py -v`
Expected: PASS.

- [ ] **Step 5: Write the concurrency test**

This is the test that earns AR-1 — the whole document is rewritten on every save, so interleaved
writers must not lose each other's work.

`backend/tests/test_tea_concurrency.py`:

```python
"""Interleaved writes to one cabinet must not lose data (NFR-2)."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import pytest

from app.repositories import tea_repo as repo
from app.schemas.tea import CreateNodeRequest, TeaWriteRequest
from app.services import tea_catalogue_service as catalogue
from app.services import tea_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(repo.settings, "data_dir", tmp_path)


def test_concurrent_creates_all_survive() -> None:
    def add(n: int) -> None:
        service.create_tea(
            "alice",
            TeaWriteRequest(name=f"Tea {n}", catalogue_node_id="oolong", grams_purchased=50),
        )

    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(add, range(40)))

    assert len(service.list_teas("alice")) == 40


def test_a_tea_and_a_node_written_concurrently_both_survive() -> None:
    """They share one document, so this is the case the single file must handle."""

    def add_tea(n: int) -> None:
        service.create_tea(
            "alice", TeaWriteRequest(name=f"Tea {n}", catalogue_node_id="oolong")
        )

    def add_node(n: int) -> None:
        catalogue.create_node("alice", CreateNodeRequest(parent_id="oolong", name=f"Kind {n}"))

    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(add_tea, n) for n in range(20)]
        futures += [pool.submit(add_node, n) for n in range(20)]
        for future in futures:
            future.result()

    doc = repo.read_doc("alice")
    assert len(doc.teas) == 20
    assert len(doc.catalogue_nodes) == 20
```

- [ ] **Step 6: Run the concurrency test**

Run: `cd backend && .venv/bin/pytest tests/test_tea_concurrency.py -v`
Expected: PASS. If it fails intermittently, the bug is a read-modify-write outside
`doc_transaction` — fix the caller, never the test's thread count.

- [ ] **Step 7: Format, lint and commit**

```bash
cd backend && black . && ruff check .
git add backend/app/services/tea_service.py backend/tests/test_tea_service.py backend/tests/test_tea_concurrency.py
git commit -m "feat(tea): tea rules, validation and CRUD"
```

---

## Task 6: The HTTP surface

**Files:**
- Create: `backend/app/routers/tea.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_tea_api.py`

**Interfaces:**
- Consumes: both services, all schemas.
- Produces: the endpoints listed in the spec's API section, under `/api/tea`.

- [ ] **Step 1: Write the failing test**

`backend/tests/test_tea_api.py`:

```python
"""The /api/tea surface: status codes and exception translation."""

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
        "name": "Da Hong Pao",
        "catalogue_node_id": "oolong.wuyi-yancha.da-hong-pao",
        "grams_purchased": 100,
        "grams_remaining": 38,
    }
    body.update(overrides)
    return body


def test_catalogue_returns_the_flat_seed() -> None:
    response = client.get("/api/tea/catalogue")
    assert response.status_code == 200
    nodes = response.json()
    assert any(n["id"] == "oolong" and n["parent_id"] is None for n in nodes)
    assert any(n["id"] == "oolong.wuyi-yancha" and n["parent_id"] == "oolong" for n in nodes)


def test_empty_cabinet_lists_nothing() -> None:
    assert client.get("/api/tea/teas").json() == []


def test_create_returns_201_and_the_tea() -> None:
    response = client.post("/api/tea/teas", json=_payload())
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Da Hong Pao"
    assert body["class_id"] == "oolong"
    assert body["id"].startswith("t-")


def test_full_round_trip() -> None:
    created = client.post("/api/tea/teas", json=_payload()).json()

    fetched = client.get(f"/api/tea/teas/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == created["id"]

    replaced = client.put(
        f"/api/tea/teas/{created['id']}", json=_payload(name="Rou Gui", grams_remaining=12)
    )
    assert replaced.status_code == 200
    assert replaced.json()["name"] == "Rou Gui"

    assert client.delete(f"/api/tea/teas/{created['id']}").status_code == 204
    assert client.get(f"/api/tea/teas/{created['id']}").status_code == 404


def test_unknown_tea_is_404_with_a_detail() -> None:
    response = client.get("/api/tea/teas/t-nosuchid")
    assert response.status_code == 404
    assert response.json()["detail"] == "Tea not found"


def test_a_rejected_rule_is_422_and_says_what_to_do() -> None:
    response = client.post("/api/tea/teas", json=_payload(grams_remaining=500))
    assert response.status_code == 422
    assert "Change the amount bought first" in response.json()["detail"]


def test_an_unknown_node_is_422() -> None:
    assert client.post("/api/tea/teas", json=_payload(catalogue_node_id="nope")).status_code == 422


def test_create_node_returns_201_and_appears_in_the_catalogue() -> None:
    response = client.post(
        "/api/tea/catalogue", json={"parent_id": "oolong.wuyi-yancha", "name": "Bai Ji Guan"}
    )
    assert response.status_code == 201
    node = response.json()
    assert node["source"] == "user"
    assert any(n["id"] == node["id"] for n in client.get("/api/tea/catalogue").json())


def test_deleting_an_unused_node_is_204() -> None:
    node = client.post("/api/tea/catalogue", json={"parent_id": "oolong", "name": "Temp"}).json()
    assert client.delete(f"/api/tea/catalogue/{node['id']}").status_code == 204


def test_deleting_a_node_in_use_is_409_and_names_the_count() -> None:
    node = client.post("/api/tea/catalogue", json={"parent_id": "oolong", "name": "Used"}).json()
    client.post("/api/tea/teas", json=_payload(catalogue_node_id=node["id"]))

    response = client.delete(f"/api/tea/catalogue/{node['id']}")
    assert response.status_code == 409
    assert "1 tea is classified here" in response.json()["detail"]


def test_deleting_a_seed_node_is_422() -> None:
    assert client.delete("/api/tea/catalogue/oolong").status_code == 422


def test_deleting_an_unknown_node_is_404() -> None:
    assert client.delete("/api/tea/catalogue/u-nosuchid").status_code == 404
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_tea_api.py -v`
Expected: FAIL — every request 404s, because the router is not mounted yet.

- [ ] **Step 3: Write the router**

`backend/app/routers/tea.py`:

```python
"""Tea Cabinet API router.

A per-user cabinet of teas, classified against a shared catalogue tree. Every
route is scoped to the authenticated user via `get_current_user`; the username
selects the on-disk document and is never taken from request input.

This module is the only place tea exceptions become HTTP: `FileNotFoundError`
-> 404, `ValueError` -> 422, `NodeInUseError` -> 409.
"""

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.tea import CatalogueNode, CreateNodeRequest, TeaView, TeaWriteRequest
from app.services import tea_catalogue_service as catalogue
from app.services import tea_service as service

router = APIRouter(prefix="/api/tea", tags=["tea"])


@router.get("/catalogue", response_model=list[CatalogueNode])
def list_catalogue(current_user: str = Depends(get_current_user)) -> list[CatalogueNode]:
    # Flat, with parent_id — the client builds the tree once for the picker
    # and the response stays trivially cacheable (AR-4).
    return catalogue.merged_nodes(current_user)


@router.post("/catalogue", response_model=CatalogueNode, status_code=201)
def create_catalogue_node(
    req: CreateNodeRequest,
    current_user: str = Depends(get_current_user),
) -> CatalogueNode:
    try:
        return catalogue.create_node(current_user, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/catalogue/{node_id}", status_code=204)
def delete_catalogue_node(node_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        catalogue.delete_node(current_user, node_id)
    except catalogue.NodeInUseError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Catalogue entry not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/teas", response_model=list[TeaView])
def list_teas(current_user: str = Depends(get_current_user)) -> list[TeaView]:
    return service.list_teas(current_user)


@router.post("/teas", response_model=TeaView, status_code=201)
def create_tea(req: TeaWriteRequest, current_user: str = Depends(get_current_user)) -> TeaView:
    try:
        return service.create_tea(current_user, req)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/teas/{tea_id}", response_model=TeaView)
def get_tea(tea_id: str, current_user: str = Depends(get_current_user)) -> TeaView:
    try:
        return service.get_tea(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc


@router.put("/teas/{tea_id}", response_model=TeaView)
def replace_tea(
    tea_id: str,
    req: TeaWriteRequest,
    current_user: str = Depends(get_current_user),
) -> TeaView:
    try:
        return service.replace_tea(current_user, tea_id, req)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/teas/{tea_id}", status_code=204)
def delete_tea(tea_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        service.delete_tea(current_user, tea_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Tea not found") from exc
```

- [ ] **Step 4: Mount it**

In `backend/app/main.py`, add the import alongside the other routers and one include line after
`app.include_router(shared_notes.router)`:

```python
app.include_router(tea.router)
```

- [ ] **Step 5: Run the tests**

Run: `cd backend && .venv/bin/pytest tests/test_tea_api.py -v`
Expected: PASS, all twelve.

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && .venv/bin/pytest`
Expected: PASS — nothing existing broke.

- [ ] **Step 7: Format, lint and commit**

```bash
cd backend && black . && ruff check .
git add backend/app/routers/tea.py backend/app/main.py backend/tests/test_tea_api.py
git commit -m "feat(tea): the /api/tea surface"
```

---
## Task 7: Types, design tokens and the pure tree functions

**Files:**
- Create: `frontend/src/apps/tea/types.ts`
- Create: `frontend/src/apps/tea/tokens.ts`
- Create: `frontend/src/apps/tea/catalogue.ts`
- Test: `frontend/src/apps/tea/catalogue.spec.ts`
- Test: `frontend/src/apps/tea/tokens.spec.ts`

**Interfaces:**
- Produces: `TeaClass`, `TeaForm`, `HarvestSeason`, `CatalogueNode`, `Tea` (types); `CLASS_ORDER`, `CLASS_TOKENS` (tokens); `buildIndex`, `childrenOf`, `pathOf`, `rootClassOf`, `prefillOriginFor` (catalogue).

- [ ] **Step 1: Write the failing catalogue test**

`frontend/src/apps/tea/catalogue.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildIndex,
  childrenOf,
  pathOf,
  rootClassOf,
  prefillOriginFor,
} from "./catalogue";
import type { CatalogueNode } from "./types";

function node(
  id: string,
  parent_id: string | null,
  overrides: Partial<CatalogueNode> = {},
): CatalogueNode {
  return {
    id,
    parent_id,
    name: id,
    name_zh: "",
    source: "seed",
    default_origin: "",
    ...overrides,
  };
}

const tree: CatalogueNode[] = [
  node("oolong", null, { name: "Oolong", name_zh: "烏龍" }),
  node("oolong.wuyi", "oolong", {
    name: "Wuyi yancha",
    default_origin: "Wuyi Shan, Fujian",
  }),
  node("oolong.wuyi.dhp", "oolong.wuyi", { name: "Da Hong Pao" }),
  node("oolong.anxi", "oolong", { name: "Anxi", default_origin: "Anxi, Fujian" }),
  node("green", null, { name: "Green" }),
  node("green.longjing", "green", { name: "Longjing", default_origin: "Xihu, Zhejiang" }),
];

describe("childrenOf", () => {
  it("returns the roots for a null parent", () => {
    expect(childrenOf(tree, null).map((n) => n.id)).toEqual(["oolong", "green"]);
  });

  it("returns a node's direct children only", () => {
    expect(childrenOf(tree, "oolong").map((n) => n.id)).toEqual([
      "oolong.wuyi",
      "oolong.anxi",
    ]);
  });

  it("returns nothing for a leaf", () => {
    expect(childrenOf(tree, "oolong.wuyi.dhp")).toEqual([]);
  });
});

describe("pathOf", () => {
  it("returns root-first ancestry including the node", () => {
    expect(pathOf(tree, "oolong.wuyi.dhp").map((n) => n.id)).toEqual([
      "oolong",
      "oolong.wuyi",
      "oolong.wuyi.dhp",
    ]);
  });

  it("returns just the node for a root", () => {
    expect(pathOf(tree, "oolong").map((n) => n.id)).toEqual(["oolong"]);
  });

  it("returns nothing for an unknown id", () => {
    expect(pathOf(tree, "ghost")).toEqual([]);
  });

  it("does not loop forever on a cycle", () => {
    const cyclic = [node("a", "b"), node("b", "a")];
    expect(pathOf(cyclic, "a")).toEqual([]);
  });
});

describe("rootClassOf", () => {
  it.each([
    ["oolong", "oolong"],
    ["oolong.wuyi", "oolong"],
    ["oolong.wuyi.dhp", "oolong"],
    ["green.longjing", "green"],
  ])("resolves %s to %s", (id, expected) => {
    expect(rootClassOf(tree, id)).toBe(expected);
  });

  it("falls back to other for an unknown id", () => {
    expect(rootClassOf(tree, "retired.in.v2")).toBe("other");
  });
});

describe("prefillOriginFor", () => {
  it("uses the node's own origin when it has one", () => {
    expect(prefillOriginFor(tree, "oolong.anxi")).toBe("Anxi, Fujian");
  });

  it("walks up to the nearest ancestor that has one", () => {
    expect(prefillOriginFor(tree, "oolong.wuyi.dhp")).toBe("Wuyi Shan, Fujian");
  });

  it("returns empty when no ancestor has one", () => {
    expect(prefillOriginFor(tree, "oolong")).toBe("");
  });

  it("returns empty for an unknown id", () => {
    expect(prefillOriginFor(tree, "ghost")).toBe("");
  });
});

describe("buildIndex", () => {
  it("keys every node by id", () => {
    expect(buildIndex(tree).get("green.longjing")?.name).toBe("Longjing");
  });
});
```

- [ ] **Step 2: Write the failing tokens test**

`frontend/src/apps/tea/tokens.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { CLASS_ORDER, CLASS_TOKENS } from "./tokens";

describe("class tokens", () => {
  it("orders the classes as the Chinese classification does", () => {
    expect(CLASS_ORDER).toEqual([
      "green",
      "yellow",
      "white",
      "oolong",
      "red",
      "dark",
      "other",
    ]);
  });

  it("has tokens for every class", () => {
    for (const id of CLASS_ORDER) {
      const tokens = CLASS_TOKENS[id];
      expect(tokens.liquor).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(tokens.head).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(tokens.zh).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(tokens.label.length).toBeGreaterThan(0);
      expect(tokens.labelZh.length).toBeGreaterThan(0);
    }
  });

  it("gives the dark class the broad assamica leaf and everything else sinensis", () => {
    expect(CLASS_TOKENS.dark.leaf).toBe("assamica");
    for (const id of CLASS_ORDER.filter((c) => c !== "dark")) {
      expect(CLASS_TOKENS[id].leaf).toBe("sinensis");
    }
  });

  it("never uses the dock's gold, which means interactive elsewhere", () => {
    for (const id of CLASS_ORDER) {
      expect(CLASS_TOKENS[id].liquor.toLowerCase()).not.toBe("#c8960a");
    }
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea`
Expected: FAIL — cannot resolve `./catalogue` or `./tokens`.

- [ ] **Step 4: Write the types**

`frontend/src/apps/tea/types.ts`:

```ts
// Mirrors backend/app/schemas/tea.py. snake_case because the API serializes
// directly, with no envelope.

export type TeaClass =
  | "green"
  | "yellow"
  | "white"
  | "oolong"
  | "red"
  | "dark"
  | "other";

// Eight values, matching backend TeaForm: the union of this spec's formats
// with the PRD's bag/sample (Ruling 11).
export type TeaForm =
  | "loose"
  | "cake"
  | "brick"
  | "tuo"
  | "ball"
  | "bag"
  | "sample"
  | "other";

export type HarvestSeason = "spring" | "summer" | "autumn" | "winter";

export type NodeSource = "seed" | "user";

export interface CatalogueNode {
  id: string;
  parent_id: string | null;
  name: string;
  name_zh: string;
  source: NodeSource;
  default_origin: string;
}

export interface Tea {
  id: string;
  name: string;
  catalogue_node_id: string;
  class_id: TeaClass;
  form: TeaForm | null;
  origin: string;
  vendor: string;
  year: number | null;
  harvest_season: HarvestSeason | null;
  cultivar: string;
  grams_purchased: number | null;
  grams_remaining: number;
  price_paid: number | null;
  purchase_date: string | null;
  storage_location: string;
  low_threshold_grams: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

/** The body for both create and replace — every field except the server's. */
export type TeaWrite = Omit<
  Tea,
  "id" | "class_id" | "created_at" | "updated_at"
>;
```

- [ ] **Step 5: Write the tokens**

`frontend/src/apps/tea/tokens.ts`:

```ts
// The Yancha palette, from
// docs/planning-artifacts/ux-designs/ux-tea-2026-09-24/DESIGN.md — which wins
// over this file if they ever disagree.
//
// Liquor is the only colour system in the app: a hue appears because a tea
// makes that colour in the cup. `liquor` draws the gauge, the leaves and a
// selected chip; `head` is a lift of it for the 13px class name, which is
// unreadable at the liquor value itself.

import type { TeaClass } from "./types";

export const GROUND = {
  field: "#17120E",
  raised: "#1E1712",
  hairline: "#241E19",
  track: "#2C241D",
  trackOut: "#241E19",
  inkHi: "#EFE7DA",
  ink: "#E4D9C6",
  inkLo: "#6B5F52",
  inkZh: "#A99781",
  inkOut: "#574D43",
  inkOnFill: "#17120E",
} as const;

export interface ClassTokens {
  label: string;
  labelZh: string;
  liquor: string;
  head: string;
  zh: string;
  leaf: "sinensis" | "assamica";
}

/** The Chinese classification's own order, which is the shelf's order (FR-5). */
export const CLASS_ORDER: TeaClass[] = [
  "green",
  "yellow",
  "white",
  "oolong",
  "red",
  "dark",
  "other",
];

export const CLASS_TOKENS: Record<TeaClass, ClassTokens> = {
  green: {
    label: "Green",
    labelZh: "綠茶",
    liquor: "#6B8A63",
    head: "#96AF8D",
    zh: "#5D6E58",
    leaf: "sinensis",
  },
  yellow: {
    label: "Yellow",
    labelZh: "黃茶",
    liquor: "#A8944F",
    head: "#B5A472",
    zh: "#6B6144",
    leaf: "sinensis",
  },
  white: {
    label: "White",
    labelZh: "白茶",
    liquor: "#B9B2A0",
    head: "#C3BCAA",
    zh: "#6E695C",
    leaf: "sinensis",
  },
  oolong: {
    label: "Oolong",
    labelZh: "烏龍",
    liquor: "#B8832F",
    head: "#C7A271",
    zh: "#7A6244",
    leaf: "sinensis",
  },
  red: {
    label: "Red",
    labelZh: "紅茶",
    liquor: "#96543A",
    head: "#B8846E",
    zh: "#71544A",
    leaf: "sinensis",
  },
  // Pu-erh and the other dark teas are made from the broad-leaf assamica
  // varietal, so their silhouette is genuinely a different plant.
  dark: {
    label: "Dark",
    labelZh: "黑茶",
    liquor: "#8C4A3C",
    head: "#BC8578",
    zh: "#75504A",
    leaf: "assamica",
  },
  other: {
    label: "Other",
    labelZh: "其他",
    liquor: "#6E6255",
    head: "#9A8B78",
    zh: "#5C5248",
    leaf: "sinensis",
  },
};
```

- [ ] **Step 6: Write the tree functions**

`frontend/src/apps/tea/catalogue.ts`:

```ts
// Pure functions over the flat catalogue list the API returns. No Vue, no
// stores — the rules that are easy to get subtly wrong are unit-tested without
// mounting anything.

import type { CatalogueNode, TeaClass } from "./types";
import { CLASS_ORDER } from "./tokens";

export function buildIndex(nodes: CatalogueNode[]): Map<string, CatalogueNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function childrenOf(
  nodes: CatalogueNode[],
  parentId: string | null,
): CatalogueNode[] {
  return nodes.filter((node) => node.parent_id === parentId);
}

/**
 * Root-first ancestry, including the node itself.
 *
 * Returns [] for an unknown id, and for any chain that revisits a node — a
 * cycle can only arrive from a hand-edited file, and hanging the picker is a
 * worse answer than showing nothing.
 */
export function pathOf(nodes: CatalogueNode[], id: string): CatalogueNode[] {
  const index = buildIndex(nodes);
  const chain: CatalogueNode[] = [];
  const seen = new Set<string>();

  let current = index.get(id);
  while (current) {
    if (seen.has(current.id)) return [];
    seen.add(current.id);
    chain.unshift(current);
    if (current.parent_id === null) return chain;
    current = index.get(current.parent_id);
  }
  return [];
}

/** The class a node belongs to, or `other` when it cannot be resolved. */
export function rootClassOf(nodes: CatalogueNode[], id: string): TeaClass {
  const root = pathOf(nodes, id)[0];
  if (!root) return "other";
  return CLASS_ORDER.includes(root.id as TeaClass)
    ? (root.id as TeaClass)
    : "other";
}

/**
 * The origin to offer when this node is picked: the nearest one going up,
 * starting with the node itself. Empty string means "offer nothing" (FR-9).
 */
export function prefillOriginFor(nodes: CatalogueNode[], id: string): string {
  const chain = pathOf(nodes, id);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    if (chain[i].default_origin) return chain[i].default_origin;
  }
  return "";
}
```

- [ ] **Step 7: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea`
Expected: PASS.

- [ ] **Step 8: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/apps/tea/types.ts frontend/src/apps/tea/tokens.ts \
        frontend/src/apps/tea/catalogue.ts frontend/src/apps/tea/catalogue.spec.ts \
        frontend/src/apps/tea/tokens.spec.ts
git commit -m "feat(tea): types, the Yancha palette and the pure tree functions"
```

---

## Task 8: The shelf's rules

**Files:**
- Create: `frontend/src/apps/tea/shelf.ts`
- Test: `frontend/src/apps/tea/shelf.spec.ts`

**Interfaces:**
- Consumes: `Tea`, `TeaClass`, `CLASS_ORDER`.
- Produces: `proportionOf(tea) -> number | null`, `thresholdFractionOf(tea) -> number | null`, `isLow(tea) -> boolean`, `pricePerGram(tea) -> number | null`, `sortSection(teas) -> Tea[]`, `groupByClass(teas) -> ShelfSectionData[]`, `nearestSectionIndex(centers, mid) -> number`, and the `ShelfSectionData` interface.

- [ ] **Step 1: Write the failing test**

`frontend/src/apps/tea/shelf.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  proportionOf,
  thresholdFractionOf,
  isLow,
  pricePerGram,
  sortSection,
  groupByClass,
  nearestSectionIndex,
} from "./shelf";
import type { Tea, TeaClass } from "./types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "A tea",
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

describe("proportionOf", () => {
  it("is remaining over purchased", () => {
    expect(proportionOf(tea({ grams_purchased: 100, grams_remaining: 38 }))).toBeCloseTo(0.38);
  });

  it("is null when the amount bought is unknown", () => {
    expect(proportionOf(tea({ grams_purchased: null }))).toBeNull();
  });

  it("is null when the amount bought is zero, never Infinity", () => {
    expect(proportionOf(tea({ grams_purchased: 0, grams_remaining: 5 }))).toBeNull();
  });

  it("clamps above one, so a corrected top-up cannot overdraw the rim", () => {
    expect(proportionOf(tea({ grams_purchased: 50, grams_remaining: 80 }))).toBe(1);
  });

  it("is zero for an empty tea", () => {
    expect(proportionOf(tea({ grams_remaining: 0 }))).toBe(0);
  });
});

describe("thresholdFractionOf", () => {
  it("places the tick at threshold over purchased", () => {
    expect(
      thresholdFractionOf(tea({ grams_purchased: 50, low_threshold_grams: 15 })),
    ).toBeCloseTo(0.3);
  });

  it("is null with no threshold set", () => {
    expect(thresholdFractionOf(tea({ low_threshold_grams: null }))).toBeNull();
  });

  it("is null when the amount bought is unknown", () => {
    expect(
      thresholdFractionOf(tea({ grams_purchased: null, low_threshold_grams: 15 })),
    ).toBeNull();
  });
});

describe("isLow", () => {
  it("is true below the threshold", () => {
    expect(isLow(tea({ grams_remaining: 12, low_threshold_grams: 15 }))).toBe(true);
  });

  it("is true exactly at the threshold", () => {
    expect(isLow(tea({ grams_remaining: 15, low_threshold_grams: 15 }))).toBe(true);
  });

  it("is false above the threshold", () => {
    expect(isLow(tea({ grams_remaining: 16, low_threshold_grams: 15 }))).toBe(false);
  });

  it("is false with no threshold set", () => {
    expect(isLow(tea({ grams_remaining: 1, low_threshold_grams: null }))).toBe(false);
  });

  it("does not call an empty tea low — empty has its own state", () => {
    expect(isLow(tea({ grams_remaining: 0, low_threshold_grams: 15 }))).toBe(false);
  });
});

describe("pricePerGram", () => {
  it("divides what you paid by what you bought", () => {
    expect(pricePerGram(tea({ price_paid: 68, grams_purchased: 100 }))).toBeCloseTo(0.68);
  });

  it("is null without a price", () => {
    expect(pricePerGram(tea({ price_paid: null }))).toBeNull();
  });

  it("is null when the amount bought is zero, never Infinity", () => {
    expect(pricePerGram(tea({ price_paid: 68, grams_purchased: 0 }))).toBeNull();
  });
});

describe("sortSection", () => {
  it("sorts by name A to Z", () => {
    const sorted = sortSection([tea({ id: "b", name: "Rou Gui" }), tea({ id: "a", name: "Da Hong Pao" })]);
    expect(sorted.map((t) => t.name)).toEqual(["Da Hong Pao", "Rou Gui"]);
  });

  it("sinks empty teas to the end of the section", () => {
    const sorted = sortSection([
      tea({ id: "a", name: "Aaa", grams_remaining: 0 }),
      tea({ id: "z", name: "Zzz", grams_remaining: 10 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["z", "a"]);
  });

  it("sorts empties among themselves by name", () => {
    const sorted = sortSection([
      tea({ id: "z", name: "Zzz", grams_remaining: 0 }),
      tea({ id: "a", name: "Aaa", grams_remaining: 0 }),
    ]);
    expect(sorted.map((t) => t.id)).toEqual(["a", "z"]);
  });

  it("does not mutate its input", () => {
    const input = [tea({ id: "b", name: "B" }), tea({ id: "a", name: "A" })];
    sortSection(input);
    expect(input.map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("groupByClass", () => {
  it("returns sections in the classification's order", () => {
    const sections = groupByClass([
      tea({ id: "1", class_id: "dark" }),
      tea({ id: "2", class_id: "green" }),
      tea({ id: "3", class_id: "oolong" }),
    ]);
    expect(sections.map((s) => s.classId)).toEqual(["green", "oolong", "dark"]);
  });

  it("omits classes with no teas", () => {
    const sections = groupByClass([tea({ class_id: "white" })]);
    expect(sections.map((s) => s.classId)).toEqual(["white"]);
  });

  it("returns nothing for an empty cabinet", () => {
    expect(groupByClass([])).toEqual([]);
  });

  it("sorts within each section", () => {
    const sections = groupByClass([
      tea({ id: "b", name: "Zzz", class_id: "green" }),
      tea({ id: "a", name: "Aaa", class_id: "green" }),
    ]);
    expect(sections[0].teas.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("buckets an unrecognised class into other rather than dropping the tea", () => {
    const sections = groupByClass([
      tea({ id: "x", class_id: "chrysanthemum" as unknown as TeaClass }),
    ]);
    expect(sections.map((s) => s.classId)).toEqual(["other"]);
    expect(sections[0].teas.map((t) => t.id)).toEqual(["x"]);
  });
});

describe("nearestSectionIndex", () => {
  it("picks the section whose centre is closest to the midline", () => {
    expect(nearestSectionIndex([100, 400, 900], 380)).toBe(1);
  });

  it("picks the first when the midline is above everything", () => {
    expect(nearestSectionIndex([100, 400, 900], 0)).toBe(0);
  });

  it("picks the last when the midline is below everything", () => {
    expect(nearestSectionIndex([100, 400, 900], 5000)).toBe(2);
  });

  it("returns -1 with no sections", () => {
    expect(nearestSectionIndex([], 100)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/shelf.spec.ts`
Expected: FAIL — cannot resolve `./shelf`.

- [ ] **Step 3: Write the module**

`frontend/src/apps/tea/shelf.ts`:

```ts
// The shelf's rules as pure functions: grouping, ordering, the low test and the
// gauge's maths. Components render these; they never re-derive them.

import type { Tea, TeaClass } from "./types";
import { CLASS_ORDER } from "./tokens";

export interface ShelfSectionData {
  classId: TeaClass;
  teas: Tea[];
}

/**
 * How much of the rim to draw, 0..1, or null when it cannot be known.
 *
 * A `grams_purchased` of 0 or null both mean "not recorded" — never a
 * denominator. The rim then draws as an unbroken track rather than implying a
 * full vessel.
 */
export function proportionOf(tea: Tea): number | null {
  const bought = tea.grams_purchased;
  if (bought === null || bought <= 0) return null;
  return Math.min(1, Math.max(0, tea.grams_remaining / bought));
}

/** Where the threshold tick sits on the rim, 0..1, or null if it cannot. */
export function thresholdFractionOf(tea: Tea): number | null {
  const bought = tea.grams_purchased;
  const threshold = tea.low_threshold_grams;
  if (threshold === null || bought === null || bought <= 0) return null;
  return Math.min(1, Math.max(0, threshold / bought));
}

/**
 * At or below the threshold, with leaf still left.
 *
 * An empty tea is not "low": empty has its own, quieter treatment, and a tea
 * that is gone no longer needs restocking urgency.
 */
export function isLow(tea: Tea): boolean {
  if (tea.low_threshold_grams === null) return false;
  if (tea.grams_remaining <= 0) return false;
  return tea.grams_remaining <= tea.low_threshold_grams;
}

/** Derived for display only, never stored (FR-17). */
export function pricePerGram(tea: Tea): number | null {
  const bought = tea.grams_purchased;
  if (tea.price_paid === null || bought === null || bought <= 0) return null;
  return tea.price_paid / bought;
}

/** Name A–Z, with empties sunk to the end of their own section (FR-11). */
export function sortSection(teas: Tea[]): Tea[] {
  return [...teas].sort((a, b) => {
    const aEmpty = a.grams_remaining <= 0;
    const bEmpty = b.grams_remaining <= 0;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/** Sections in the classification's order, empty classes omitted (FR-10). */
export function groupByClass(teas: Tea[]): ShelfSectionData[] {
  const buckets = new Map<TeaClass, Tea[]>();

  for (const tea of teas) {
    // A class_id the client doesn't recognise means the server is ahead of
    // this build. Bucket the tea rather than dropping it off the shelf.
    const classId: TeaClass = CLASS_ORDER.includes(tea.class_id)
      ? tea.class_id
      : "other";
    const bucket = buckets.get(classId);
    if (bucket) bucket.push(tea);
    else buckets.set(classId, [tea]);
  }

  return CLASS_ORDER.filter((classId) => buckets.has(classId)).map((classId) => ({
    classId,
    teas: sortSection(buckets.get(classId) ?? []),
  }));
}

/** Which section owns its leaves: the one whose centre is nearest `mid`. */
export function nearestSectionIndex(centers: number[], mid: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  centers.forEach((center, index) => {
    const distance = Math.abs(center - mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}
```

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea/shelf.spec.ts`
Expected: PASS.

- [ ] **Step 5: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/apps/tea/shelf.ts frontend/src/apps/tea/shelf.spec.ts
git commit -m "feat(tea): the shelf's ordering, low test and gauge maths"
```

---

## Task 9: The two stores

**Files:**
- Create: `frontend/src/apps/tea/stores/useTeaCatalogueStore.ts`
- Create: `frontend/src/apps/tea/stores/useTeaCabinetStore.ts`
- Test: `frontend/src/apps/tea/stores/useTeaCatalogueStore.spec.ts`
- Test: `frontend/src/apps/tea/stores/useTeaCabinetStore.spec.ts`

**Interfaces:**
- Consumes: `api` from `@/composables/useApi`, the types from Task 7.
- Produces:
  - `useTeaCatalogueStore()` → `{ nodes, loading, error, fetchNodes(), addNode(req), removeNode(id) }`
  - `useTeaCabinetStore()` → `{ teas, loading, saving, error, fetchTeas(), createTea(body), replaceTea(id, body), deleteTea(id), setGrams(id, grams) }`

- [ ] **Step 1: Write the failing cabinet store test**

`frontend/src/apps/tea/stores/useTeaCabinetStore.spec.ts`:

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
  ApiError: class extends Error {
    status = 0;
    detail = "";
  },
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

import { useTeaCabinetStore } from "./useTeaCabinetStore";
import type { Tea } from "@/apps/tea/types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Da Hong Pao",
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  delMock.mockReset();
});

describe("useTeaCabinetStore", () => {
  it("fetchTeas loads the shelf and clears loading", async () => {
    getMock.mockResolvedValue([tea()]);
    const store = useTeaCabinetStore();

    await store.fetchTeas();

    expect(getMock).toHaveBeenCalledWith("/tea/teas");
    expect(store.teas).toHaveLength(1);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("fetchTeas routes a failure into error and still clears loading", async () => {
    getMock.mockRejectedValue(Object.assign(new Error("boom"), { detail: "Server exploded" }));
    const store = useTeaCabinetStore();

    await store.fetchTeas();

    expect(store.loading).toBe(false);
    expect(store.error).not.toBeNull();
    expect(store.teas).toEqual([]);
  });

  it("clears a previous error when a later fetch succeeds", async () => {
    const store = useTeaCabinetStore();
    getMock.mockRejectedValueOnce(new Error("boom"));
    await store.fetchTeas();
    getMock.mockResolvedValueOnce([tea()]);

    await store.fetchTeas();

    expect(store.error).toBeNull();
  });

  it("createTea appends the created tea", async () => {
    const store = useTeaCabinetStore();
    postMock.mockResolvedValue(tea({ id: "t-new" }));

    await store.createTea({ name: "New", catalogue_node_id: "oolong" } as never);

    expect(postMock).toHaveBeenCalledWith("/tea/teas", expect.anything());
    expect(store.teas.map((t) => t.id)).toEqual(["t-new"]);
  });

  it("replaceTea swaps the tea in place", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1", name: "Old" })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    putMock.mockResolvedValue(tea({ id: "t-1", name: "New" }));

    await store.replaceTea("t-1", { name: "New" } as never);

    expect(store.teas[0].name).toBe("New");
  });

  it("deleteTea removes it from the shelf", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1" }), tea({ id: "t-2" })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    delMock.mockResolvedValue(undefined);

    await store.deleteTea("t-1");

    expect(store.teas.map((t) => t.id)).toEqual(["t-2"]);
  });

  it("setGrams updates the rim before the server answers", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1", grams_remaining: 38 })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();

    let resolve: (value: Tea) => void = () => {};
    putMock.mockReturnValue(new Promise<Tea>((r) => (resolve = r)));

    const pending = store.setGrams("t-1", 31);
    expect(store.teas[0].grams_remaining).toBe(31);

    resolve(tea({ id: "t-1", grams_remaining: 31 }));
    await pending;
    expect(store.teas[0].grams_remaining).toBe(31);
  });

  it("setGrams rolls the rim back when the write is rejected", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1", grams_remaining: 38 })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    putMock.mockRejectedValue(
      Object.assign(new Error("nope"), { detail: "You've only bought 100g of this." }),
    );

    await store.setGrams("t-1", 500);

    expect(store.teas[0].grams_remaining).toBe(38);
    expect(store.error).toContain("only bought");
  });

  it("setGrams on an unknown id does nothing and sets no error", async () => {
    const store = useTeaCabinetStore();
    await store.setGrams("t-nope", 10);
    expect(putMock).not.toHaveBeenCalled();
    expect(store.error).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing catalogue store test**

`frontend/src/apps/tea/stores/useTeaCatalogueStore.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {
    status = 0;
    detail = "";
  },
  api: { get: getMock, post: postMock, del: delMock },
}));

import { useTeaCatalogueStore } from "./useTeaCatalogueStore";
import type { CatalogueNode } from "@/apps/tea/types";

function node(id: string, parent_id: string | null = null): CatalogueNode {
  return {
    id,
    parent_id,
    name: id,
    name_zh: "",
    source: "seed",
    default_origin: "",
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  delMock.mockReset();
});

describe("useTeaCatalogueStore", () => {
  it("fetchNodes loads the tree", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();

    await store.fetchNodes();

    expect(getMock).toHaveBeenCalledWith("/tea/catalogue");
    expect(store.nodes).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  it("fetches once and serves the cache afterwards", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();

    await store.fetchNodes();
    await store.fetchNodes();

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when asked to force", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();

    await store.fetchNodes();
    await store.fetchNodes(true);

    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("makes a newly added node immediately pickable without a refetch", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();
    await store.fetchNodes();
    postMock.mockResolvedValue({ ...node("u-1", "oolong"), source: "user" });

    const added = await store.addNode({ parent_id: "oolong", name: "Mine" });

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(store.nodes.map((n) => n.id)).toContain("u-1");
    expect(added?.id).toBe("u-1");
  });

  it("surfaces a rejected add and leaves the tree untouched", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();
    await store.fetchNodes();
    postMock.mockRejectedValue(
      Object.assign(new Error("no"), { detail: "A catalogue entry needs a name" }),
    );

    const added = await store.addNode({ parent_id: "oolong", name: "  " });

    expect(added).toBeNull();
    expect(store.nodes).toHaveLength(1);
    expect(store.error).toContain("needs a name");
  });

  it("removeNode drops it from the tree", async () => {
    getMock.mockResolvedValue([node("oolong"), { ...node("u-1", "oolong"), source: "user" }]);
    const store = useTeaCatalogueStore();
    await store.fetchNodes();
    delMock.mockResolvedValue(undefined);

    await store.removeNode("u-1");

    expect(store.nodes.map((n) => n.id)).toEqual(["oolong"]);
  });

  it("keeps the node when removal is refused, and says why", async () => {
    getMock.mockResolvedValue([{ ...node("u-1", "oolong"), source: "user" }]);
    const store = useTeaCatalogueStore();
    await store.fetchNodes();
    delMock.mockRejectedValue(
      Object.assign(new Error("in use"), { detail: "3 teas are classified here." }),
    );

    await store.removeNode("u-1");

    expect(store.nodes).toHaveLength(1);
    expect(store.error).toContain("3 teas");
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/stores`
Expected: FAIL — neither store module exists.

- [ ] **Step 4: Write the catalogue store**

`frontend/src/apps/tea/stores/useTeaCatalogueStore.ts`:

```ts
import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { CatalogueNode } from "@/apps/tea/types";

export interface CreateNodeBody {
  parent_id: string;
  name: string;
  name_zh?: string;
  default_origin?: string;
}

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

export const useTeaCatalogueStore = defineStore("tea-catalogue", () => {
  const nodes = ref<CatalogueNode[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  // The tree changes only when this user adds or removes a node, and those
  // paths patch `nodes` themselves — so one fetch per session is enough.
  const loaded = ref(false);

  async function fetchNodes(force = false): Promise<void> {
    if (loaded.value && !force) return;
    loading.value = true;
    try {
      nodes.value = await api.get<CatalogueNode[]>("/tea/catalogue");
      loaded.value = true;
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function addNode(body: CreateNodeBody): Promise<CatalogueNode | null> {
    loading.value = true;
    try {
      const created = await api.post<CatalogueNode>("/tea/catalogue", { ...body });
      nodes.value = [...nodes.value, created];
      error.value = null;
      return created;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function removeNode(nodeId: string): Promise<void> {
    loading.value = true;
    try {
      await api.del(`/tea/catalogue/${nodeId}`);
      nodes.value = nodes.value.filter((node) => node.id !== nodeId);
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  return { nodes, loading, error, fetchNodes, addNode, removeNode };
});
```

- [ ] **Step 5: Write the cabinet store**

`frontend/src/apps/tea/stores/useTeaCabinetStore.ts`:

```ts
import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Tea, TeaWrite } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

export const useTeaCabinetStore = defineStore("tea-cabinet", () => {
  const teas = ref<Tea[]>([]);
  const loading = ref(false);
  // Saving is tracked apart from `loading` so an in-place write never blanks
  // the shelf the person is looking at.
  const saving = ref(false);
  const error = ref<string | null>(null);

  async function fetchTeas(): Promise<void> {
    loading.value = true;
    try {
      teas.value = await api.get<Tea[]>("/tea/teas");
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function createTea(body: TeaWrite): Promise<Tea | null> {
    saving.value = true;
    try {
      const created = await api.post<Tea>("/tea/teas", { ...body });
      teas.value = [...teas.value, created];
      error.value = null;
      return created;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function replaceTea(teaId: string, body: TeaWrite): Promise<Tea | null> {
    saving.value = true;
    try {
      const updated = await api.put<Tea>(`/tea/teas/${teaId}`, { ...body });
      teas.value = teas.value.map((tea) => (tea.id === teaId ? updated : tea));
      error.value = null;
      return updated;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function deleteTea(teaId: string): Promise<void> {
    saving.value = true;
    try {
      await api.del(`/tea/teas/${teaId}`);
      teas.value = teas.value.filter((tea) => tea.id !== teaId);
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      saving.value = false;
    }
  }

  /**
   * The everyday write: knock off what was just brewed.
   *
   * Optimistic, because the rim should answer the tap immediately at the tea
   * table. The whole record goes up because the API is a full replace, and the
   * store already holds it from the list response. On rejection the previous
   * value is put back, so the rim never shows a number that isn't on disk.
   */
  async function setGrams(teaId: string, grams: number): Promise<void> {
    const current = teas.value.find((tea) => tea.id === teaId);
    if (!current) return;

    const previous = current.grams_remaining;
    const optimistic = { ...current, grams_remaining: grams };
    teas.value = teas.value.map((tea) => (tea.id === teaId ? optimistic : tea));

    saving.value = true;
    try {
      const { id, class_id, created_at, updated_at, ...body } = optimistic;
      void id;
      void class_id;
      void created_at;
      void updated_at;
      const updated = await api.put<Tea>(`/tea/teas/${teaId}`, { ...body });
      teas.value = teas.value.map((tea) => (tea.id === teaId ? updated : tea));
      error.value = null;
    } catch (e) {
      teas.value = teas.value.map((tea) =>
        tea.id === teaId ? { ...tea, grams_remaining: previous } : tea,
      );
      error.value = message(e);
    } finally {
      saving.value = false;
    }
  }

  return {
    teas,
    loading,
    saving,
    error,
    fetchTeas,
    createTea,
    replaceTea,
    deleteTea,
    setGrams,
  };
});
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea/stores`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/apps/tea/stores
git commit -m "feat(tea): catalogue and cabinet stores"
```

---
## Task 10: The rim gauge

**Files:**
- Create: `frontend/src/apps/tea/gauge.ts`
- Create: `frontend/src/apps/tea/gauge.spec.ts`
- Create: `frontend/src/apps/tea/components/RimGauge.vue`
- Test: `frontend/src/apps/tea/components/RimGauge.spec.ts`

**Interfaces:**
- Produces: `circumferenceOf(radius)`, `dashPattern(arc, circumference, dashed)`, `RIM` (the two sizes); and the `RimGauge` component with props `{ proportion, thresholdFraction, low, empty, color, value, caption, size }`.

**Read first:** `docs/planning-artifacts/ux-designs/ux-tea-2026-09-24/DESIGN.md`, section "The rim gauge". Open `mockups/shelf.html` next to your browser while building this.

- [ ] **Step 1: Write the failing maths test**

`frontend/src/apps/tea/gauge.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { circumferenceOf, dashPattern, RIM } from "./gauge";

describe("circumferenceOf", () => {
  it("is 2πr", () => {
    expect(circumferenceOf(17)).toBeCloseTo(106.81, 2);
  });
});

describe("dashPattern", () => {
  const C = circumferenceOf(17);

  it("draws a solid arc as dash-then-gap", () => {
    expect(dashPattern(C * 0.38, C, false)).toBe(`${C * 0.38} ${C - C * 0.38}`);
  });

  it("draws nothing for a zero arc", () => {
    expect(dashPattern(0, C, false)).toBe(`0 ${C}`);
  });

  it("breaks a low arc into 4-on 4.4-off segments", () => {
    const pattern = dashPattern(20, C, true).split(" ").map(Number);
    expect(pattern[0]).toBe(4);
    expect(pattern[1]).toBe(4.4);
  });

  it("sums a dashed pattern to exactly the circumference, so the cycle aligns", () => {
    const total = dashPattern(20, C, true).split(" ").map(Number).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(C, 6);
  });

  it("keeps an even segment count, so dashes and gaps stay in phase", () => {
    expect(dashPattern(20, C, true).split(" ").length % 2).toBe(0);
  });

  it("handles an arc shorter than one dash", () => {
    const pattern = dashPattern(2, C, true).split(" ").map(Number);
    expect(pattern[0]).toBe(2);
    expect(pattern.reduce((a, b) => a + b, 0)).toBeCloseTo(C, 6);
  });
});

describe("RIM", () => {
  it("makes the shelf gauge a 44px touch target", () => {
    expect(RIM.shelf.box).toBe(44);
  });

  it("gives the tea's page a larger rim", () => {
    expect(RIM.page.radius).toBeGreaterThan(RIM.shelf.radius);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/gauge.spec.ts`
Expected: FAIL — cannot resolve `./gauge`.

- [ ] **Step 3: Write the maths**

`frontend/src/apps/tea/gauge.ts`:

```ts
// The rim gauge's geometry, kept out of the component so it can be tested
// without a DOM. See DESIGN.md, "The rim gauge".

export interface RimSize {
  box: number;
  radius: number;
  stroke: number;
}

export const RIM: Record<"shelf" | "page", RimSize> = {
  // 44px is also the touch minimum: on the shelf the gauge IS the tap target.
  shelf: { box: 44, radius: 17, stroke: 2.5 },
  page: { box: 86, radius: 35, stroke: 4 },
};

export function circumferenceOf(radius: number): number {
  return 2 * Math.PI * radius;
}

const DASH = 4;
const GAP = 4.4;

/**
 * The `stroke-dasharray` that draws `arc` of `circumference`.
 *
 * Solid is one dash and one gap. Dashed — a tea under its low threshold —
 * repeats 4-on 4.4-off across the arc, then swallows the remainder into the
 * final gap so the pattern sums to exactly the circumference. That matters:
 * SVG cycles the pattern around the whole circle, so a pattern that doesn't
 * sum to the circumference would wrap and draw dashes into the empty part.
 */
export function dashPattern(
  arc: number,
  circumference: number,
  dashed: boolean,
): string {
  if (arc <= 0) return `0 ${circumference}`;
  if (!dashed) return `${arc} ${circumference - arc}`;

  const segments: number[] = [];
  let remaining = arc;
  while (remaining > 0.01) {
    const dash = Math.min(DASH, remaining);
    segments.push(dash, GAP);
    remaining -= dash + GAP;
  }

  const sum = segments.reduce((total, value) => total + value, 0);
  segments[segments.length - 1] += circumference - sum;
  return segments.join(" ");
}
```

- [ ] **Step 4: Write the failing component test**

`frontend/src/apps/tea/components/RimGauge.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RimGauge from "./RimGauge.vue";
import { circumferenceOf, RIM } from "../gauge";

function rim(props: Partial<InstanceType<typeof RimGauge>["$props"]> = {}) {
  return mount(RimGauge, {
    props: {
      proportion: 0.38,
      thresholdFraction: null,
      low: false,
      empty: false,
      color: "#B8832F",
      value: 38,
      caption: "of 100g",
      ...props,
    },
  });
}

describe("RimGauge", () => {
  it("shows the remaining grams", () => {
    expect(rim().get('[data-testid="rim-value"]').text()).toBe("38");
  });

  it("shows the caption", () => {
    expect(rim().get('[data-testid="rim-caption"]').text()).toBe("of 100g");
  });

  it("draws the fill to the proportion", () => {
    const C = circumferenceOf(RIM.shelf.radius);
    const fill = rim({ proportion: 0.5 }).get('[data-testid="rim-fill"]');
    expect(fill.attributes("stroke-dasharray")).toBe(`${C * 0.5} ${C - C * 0.5}`);
  });

  it("paints the fill in the class's liquor", () => {
    expect(rim({ color: "#6B8A63" }).get('[data-testid="rim-fill"]').attributes("stroke")).toBe(
      "#6B8A63",
    );
  });

  it("draws no fill at all when the amount bought is unknown", () => {
    const wrapper = rim({ proportion: null });
    expect(wrapper.find('[data-testid="rim-fill"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="rim-track"]').exists()).toBe(true);
  });

  it("omits the caption when there is nothing to compare against", () => {
    expect(rim({ proportion: null, caption: null }).find('[data-testid="rim-caption"]').exists()).toBe(
      false,
    );
  });

  it("dashes the fill when the tea is low", () => {
    const solid = rim({ low: false }).get('[data-testid="rim-fill"]').attributes("stroke-dasharray");
    const dashed = rim({ low: true }).get('[data-testid="rim-fill"]').attributes("stroke-dasharray");
    expect(dashed).not.toBe(solid);
    expect(dashed?.split(" ").length).toBeGreaterThan(2);
  });

  it("draws the threshold tick at its angle", () => {
    const tick = rim({ thresholdFraction: 0.25 }).get('[data-testid="rim-tick"]');
    expect(tick.attributes("transform")).toContain("rotate(90");
  });

  it("draws no tick when no threshold is set", () => {
    expect(rim({ thresholdFraction: null }).find('[data-testid="rim-tick"]').exists()).toBe(false);
  });

  it("marks an empty tea and draws nothing on its rim", () => {
    const wrapper = rim({ empty: true, proportion: 0, value: 0 });
    expect(wrapper.get('[data-testid="rim"]').classes()).toContain("rim--empty");
    expect(wrapper.find('[data-testid="rim-fill"]').exists()).toBe(false);
  });

  it("uses the larger geometry on a tea's page", () => {
    const wrapper = rim({ size: "page" });
    expect(wrapper.get("svg").attributes("width")).toBe(String(RIM.page.box));
  });
});
```

- [ ] **Step 5: Write the component**

`frontend/src/apps/tea/components/RimGauge.vue`:

```vue
<template>
  <div :class="['rim', { 'rim--empty': empty }]" data-testid="rim">
    <svg :width="rim.box" :height="rim.box" :viewBox="`0 0 ${rim.box} ${rim.box}`">
      <circle
        data-testid="rim-track"
        :cx="centre"
        :cy="centre"
        :r="rim.radius"
        fill="none"
        :stroke="empty ? GROUND.trackOut : GROUND.track"
        :stroke-width="rim.stroke"
      />
      <circle
        v-if="proportion !== null && proportion > 0 && !empty"
        data-testid="rim-fill"
        :cx="centre"
        :cy="centre"
        :r="rim.radius"
        fill="none"
        :stroke="color"
        :stroke-width="rim.stroke"
        stroke-linecap="round"
        :stroke-dasharray="dash"
        :transform="`rotate(-90 ${centre} ${centre})`"
      />
      <line
        v-if="thresholdFraction !== null"
        data-testid="rim-tick"
        :x1="centre"
        :y1="centre - rim.radius - rim.stroke"
        :x2="centre"
        :y2="centre - rim.radius - rim.stroke - 5"
        :stroke="GROUND.inkLo"
        stroke-width="1.2"
        :transform="`rotate(${thresholdFraction * 360} ${centre} ${centre})`"
      />
      <text
        data-testid="rim-value"
        :x="centre"
        :y="centre + valueOffset"
        text-anchor="middle"
        class="rim__value"
      >
        {{ value }}
      </text>
    </svg>
    <span v-if="caption" class="rim__caption" data-testid="rim-caption">{{ caption }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { RIM, circumferenceOf, dashPattern } from "../gauge";
import { GROUND } from "../tokens";

const props = withDefaults(
  defineProps<{
    /** 0..1, or null when the amount bought is unknown. */
    proportion: number | null;
    thresholdFraction: number | null;
    low: boolean;
    empty: boolean;
    color: string;
    value: number;
    caption: string | null;
    size?: "shelf" | "page";
  }>(),
  { size: "shelf" },
);

const rim = computed(() => RIM[props.size]);
const centre = computed(() => rim.value.box / 2);
const circumference = computed(() => circumferenceOf(rim.value.radius));
const dash = computed(() =>
  dashPattern((props.proportion ?? 0) * circumference.value, circumference.value, props.low),
);
const valueOffset = computed(() => (props.size === "page" ? 4 : 5));
</script>

<style scoped lang="scss">
.rim {
  width: 52px;
  text-align: center;
}
.rim__value {
  fill: #e4d9c6;
  font-family: "Newsreader", serif;
  font-size: 15px;
  font-weight: 500;
}
.rim__caption {
  display: block;
  color: #6b5f52;
  font-size: 10.5px;
  margin-top: 2px;
}
.rim--empty .rim__value {
  fill: #574d43;
}
</style>
```

- [ ] **Step 6: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea`
Expected: PASS.

- [ ] **Step 7: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/apps/tea/gauge.ts frontend/src/apps/tea/gauge.spec.ts \
        frontend/src/apps/tea/components/RimGauge.vue frontend/src/apps/tea/components/RimGauge.spec.ts
git commit -m "feat(tea): the rim gauge"
```

---

## Task 11: Leaves, rows and sections

**Files:**
- Create: `frontend/src/apps/tea/components/ClassLeaves.vue`
- Create: `frontend/src/apps/tea/components/TeaRow.vue`
- Create: `frontend/src/apps/tea/components/ShelfSection.vue`
- Create: `frontend/src/apps/tea/composables/useSectionInView.ts`
- Test: `frontend/src/apps/tea/components/TeaRow.spec.ts`
- Test: `frontend/src/apps/tea/components/ShelfSection.spec.ts`

**Interfaces:**
- Consumes: `RimGauge`, `CLASS_TOKENS`, `proportionOf`, `thresholdFractionOf`, `isLow`, `nearestSectionIndex`.
- Produces: `ClassLeaves` (props `{ classId, index }`), `TeaRow` (props `{ tea }`, emits `open`, `edit-grams`), `ShelfSection` (props `{ section, index, active }`, re-emits both), `useSectionInView(scrollEl, sectionEls)` → `{ activeIndex }`.

**Read first:** DESIGN.md sections "Leaves" and "Layout & Spacing". The two leaf paths are in `mockups/shelf.html` — copy them verbatim rather than redrawing them.

- [ ] **Step 1: Write the failing row test**

`frontend/src/apps/tea/components/TeaRow.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TeaRow from "./TeaRow.vue";
import type { Tea } from "../types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Da Hong Pao",
    catalogue_node_id: "oolong.wuyi",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

function row(t: Tea, path = "Wuyi yancha", nameZh = "大紅袍") {
  return mount(TeaRow, { props: { tea: t, path, nameZh } });
}

describe("TeaRow", () => {
  it("shows the name", () => {
    expect(row(tea()).get('[data-testid="row-name"]').text()).toContain("Da Hong Pao");
  });

  it("shows the Chinese name marked as Chinese for screen readers", () => {
    const zh = row(tea()).get('[data-testid="row-zh"]');
    expect(zh.text()).toBe("大紅袍");
    expect(zh.attributes("lang")).toBe("zh");
  });

  it("omits the Chinese element when the node has none", () => {
    expect(row(tea(), "Wuyi yancha", "").find('[data-testid="row-zh"]').exists()).toBe(false);
  });

  it("shows the catalogue path", () => {
    expect(row(tea()).get('[data-testid="row-path"]').text()).toBe("Wuyi yancha");
  });

  it("emits open when the row is tapped", async () => {
    const wrapper = row(tea());
    await wrapper.get('[data-testid="row-body"]').trigger("click");
    expect(wrapper.emitted("open")?.[0]).toEqual(["t-1"]);
  });

  it("emits edit-grams when the rim is tapped, and does not also open the tea", async () => {
    const wrapper = row(tea());
    await wrapper.get('[data-testid="row-rim"]').trigger("click");
    expect(wrapper.emitted("edit-grams")?.[0]).toEqual(["t-1"]);
    expect(wrapper.emitted("open")).toBeUndefined();
  });

  it("marks an empty tea", () => {
    expect(row(tea({ grams_remaining: 0 })).get('[data-testid="row"]').classes()).toContain(
      "row--empty",
    );
  });

  it("keeps a very long name from pushing the rim off screen", () => {
    // Review Focus 4: the name truncates; the rim keeps its fixed column.
    const wrapper = row(tea({ name: "A".repeat(120) }));
    expect(wrapper.get('[data-testid="row-name"]').classes()).toContain("row__name--truncate");
    expect(wrapper.find('[data-testid="row-rim"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 2: Write the failing section test**

`frontend/src/apps/tea/components/ShelfSection.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ShelfSection from "./ShelfSection.vue";
import type { Tea } from "../types";

function tea(id: string, overrides: Partial<Tea> = {}): Tea {
  return {
    id,
    name: id,
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

function section(active = false) {
  return mount(ShelfSection, {
    props: {
      section: { classId: "oolong" as const, teas: [tea("t-1"), tea("t-2")] },
      index: 0,
      active,
      pathFor: () => "Wuyi yancha",
      nameZhFor: () => "大紅袍",
    },
  });
}

describe("ShelfSection", () => {
  it("names the class in English and Chinese", () => {
    const wrapper = section();
    expect(wrapper.get('[data-testid="section-name"]').text()).toBe("Oolong");
    expect(wrapper.get('[data-testid="section-zh"]').text()).toBe("烏龍");
  });

  it("renders a row per tea", () => {
    expect(section().findAll('[data-testid="row"]')).toHaveLength(2);
  });

  it("draws its leaves at full strength only when it is the section in view", () => {
    expect(section(true).get('[data-testid="section-leaves"]').classes()).toContain(
      "leaves--active",
    );
    expect(section(false).get('[data-testid="section-leaves"]').classes()).not.toContain(
      "leaves--active",
    );
  });

  it("passes a row's open event up", async () => {
    const wrapper = section();
    await wrapper.get('[data-testid="row-body"]').trigger("click");
    expect(wrapper.emitted("open")?.[0]).toEqual(["t-1"]);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea/components`
Expected: FAIL — neither component exists.

- [ ] **Step 4: Write ClassLeaves**

`frontend/src/apps/tea/components/ClassLeaves.vue`. Copy the two `path` d-attributes from
`mockups/shelf.html` exactly — they are the drawing, and redrawing them by eye will not match.

```vue
<template>
  <div :class="['leaves', { 'leaves--active': active }]" data-testid="section-leaves" aria-hidden="true">
    <svg
      v-for="(leaf, i) in layout"
      :key="i"
      class="leaves__leaf"
      :width="leaf.width"
      :height="leaf.height"
      :viewBox="viewBox"
      :style="leaf.style"
    >
      <path :d="path" :fill="tokens.liquor" :opacity="leaf.opacity" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CLASS_TOKENS } from "../tokens";
import type { TeaClass } from "../types";

const props = defineProps<{ classId: TeaClass; index: number; active: boolean }>();

const SINENSIS =
  "M6 47 C54 9 148 1 254 43 C210 62 150 78 96 76 C56 74 24 62 6 47 Z";
const ASSAMICA =
  "M12 62 C44 14 128 2 208 44 C198 96 128 128 66 116 C36 110 18 88 12 62 Z";

const tokens = computed(() => CLASS_TOKENS[props.classId]);
const isBroad = computed(() => tokens.value.leaf === "assamica");
const path = computed(() => (isBroad.value ? ASSAMICA : SINENSIS));
const viewBox = computed(() => (isBroad.value ? "0 0 220 130" : "0 0 260 90"));

// Descending sizes at DESIGN.md's opacities. Sections alternate which edge
// they hang off so no two in a row repeat.
const layout = computed(() => {
  const fromLeft = props.index % 2 === 0;
  const edge = fromLeft ? "left" : "right";
  const flip = fromLeft ? "" : " scaleX(-1)";
  const base = isBroad.value ? { w: 250, h: 148 } : { w: 300, h: 104 };

  return [
    { scale: 1, opacity: 0.17, top: 2, offset: -60, rotate: fromLeft ? -15 : 15 },
    { scale: 0.83, opacity: 0.1, top: 60, offset: 28, rotate: fromLeft ? 10 : -10 },
    { scale: 0.66, opacity: 0.06, top: 120, offset: -16, rotate: fromLeft ? -3 : 3 },
  ].map((leaf) => ({
    width: Math.round(base.w * leaf.scale),
    height: Math.round(base.h * leaf.scale),
    opacity: leaf.opacity,
    style: {
      [edge]: `${leaf.offset}px`,
      top: `${leaf.top}px`,
      transform: `rotate(${leaf.rotate}deg)${flip}`,
    },
  }));
});
</script>

<style scoped lang="scss">
.leaves {
  position: absolute;
  inset: -30px -10px;
  pointer-events: none;
  z-index: 0;
  opacity: 0.14;
  transition: opacity 0.85s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.leaves--active {
  opacity: 1;
}
.leaves__leaf {
  position: absolute;
}
@media (prefers-reduced-motion: reduce) {
  .leaves {
    transition: none;
  }
}
</style>
```

- [ ] **Step 5: Write TeaRow**

`frontend/src/apps/tea/components/TeaRow.vue`:

```vue
<template>
  <div :class="['row', { 'row--empty': empty }]" data-testid="row">
    <div class="row__body" data-testid="row-body" @click="emit('open', tea.id)">
      <div class="row__name row__name--truncate" data-testid="row-name">
        {{ tea.name }}
        <span v-if="nameZh" class="row__zh" lang="zh" data-testid="row-zh">{{ nameZh }}</span>
      </div>
      <div class="row__path" data-testid="row-path">{{ path }}</div>
    </div>
    <div class="row__rim" data-testid="row-rim" @click.stop="emit('edit-grams', tea.id)">
      <RimGauge
        :proportion="proportion"
        :threshold-fraction="thresholdFraction"
        :low="low"
        :empty="empty"
        :color="color"
        :value="tea.grams_remaining"
        :caption="caption"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RimGauge from "./RimGauge.vue";
import { CLASS_TOKENS } from "../tokens";
import { proportionOf, thresholdFractionOf, isLow } from "../shelf";
import type { Tea } from "../types";

const props = defineProps<{ tea: Tea; path: string; nameZh: string }>();
const emit = defineEmits<{ open: [teaId: string]; "edit-grams": [teaId: string] }>();

const proportion = computed(() => proportionOf(props.tea));
const thresholdFraction = computed(() => thresholdFractionOf(props.tea));
const low = computed(() => isLow(props.tea));
const empty = computed(() => props.tea.grams_remaining <= 0);
const color = computed(() => CLASS_TOKENS[props.tea.class_id]?.liquor ?? CLASS_TOKENS.other.liquor);
const caption = computed(() =>
  props.tea.grams_purchased ? `of ${props.tea.grams_purchased}g` : null,
);
</script>

<style scoped lang="scss">
.row {
  display: flex;
  gap: 14px;
  align-items: center;
  padding: 8px 0;
  position: relative;
  z-index: 2;
}
.row__body {
  flex: 1;
  // Without this a long name widens the flex item and pushes the rim off
  // screen instead of truncating (Review Focus 4).
  min-width: 0;
  cursor: pointer;
}
.row__name {
  color: #efe7da;
  font-size: 16.5px;
  line-height: 1.28;
}
.row__name--truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__zh {
  color: #a99781;
  font-size: 13.5px;
  font-weight: 300;
  margin-left: 7px;
}
.row__path {
  color: #6b5f52;
  font-size: 12.5px;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row__rim {
  flex: none;
  cursor: pointer;
}
.row--empty .row__name,
.row--empty .row__path {
  color: #574d43;
}
.row--empty .row__zh {
  color: #4a4239;
}
</style>
```

- [ ] **Step 6: Write ShelfSection**

`frontend/src/apps/tea/components/ShelfSection.vue`:

```vue
<template>
  <section class="section" data-testid="section">
    <ClassLeaves :class-id="section.classId" :index="index" :active="active" />
    <div class="section__pad">
      <header class="section__head">
        <span class="section__name" :style="{ color: tokens.head }" data-testid="section-name">
          {{ tokens.label }}
        </span>
        <span class="section__zh" :style="{ color: tokens.zh }" lang="zh" data-testid="section-zh">
          {{ tokens.labelZh }}
        </span>
      </header>
      <TeaRow
        v-for="tea in section.teas"
        :key="tea.id"
        :tea="tea"
        :path="pathFor(tea)"
        :name-zh="nameZhFor(tea)"
        @open="emit('open', $event)"
        @edit-grams="emit('edit-grams', $event)"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ClassLeaves from "./ClassLeaves.vue";
import TeaRow from "./TeaRow.vue";
import { CLASS_TOKENS } from "../tokens";
import type { ShelfSectionData } from "../shelf";
import type { Tea } from "../types";

const props = defineProps<{
  section: ShelfSectionData;
  index: number;
  active: boolean;
  pathFor: (tea: Tea) => string;
  nameZhFor: (tea: Tea) => string;
}>();
const emit = defineEmits<{ open: [teaId: string]; "edit-grams": [teaId: string] }>();

const tokens = computed(() => CLASS_TOKENS[props.section.classId]);
</script>

<style scoped lang="scss">
.section {
  position: relative;
  padding: 10px 0 22px;
}
.section__pad {
  position: relative;
  z-index: 2;
  padding: 0 18px;
}
.section__head {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 9px;
}
.section__name {
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.04em;
}
.section__zh {
  font-size: 12.5px;
  font-weight: 300;
}
</style>
```

- [ ] **Step 7: Write the composable**

`frontend/src/apps/tea/composables/useSectionInView.ts`:

```ts
import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { nearestSectionIndex } from "../shelf";

/**
 * Which section owns its leaves: the one whose centre is nearest 42% down the
 * viewport. Driven by scroll position, never by a timer — nothing on this page
 * moves unless the person moved first.
 */
export function useSectionInView(
  scrollEl: Ref<HTMLElement | null>,
  sectionEls: Ref<HTMLElement[]>,
) {
  const activeIndex = ref(0);
  let queued = false;

  function measure(): void {
    queued = false;
    const container = scrollEl.value;
    if (!container) return;
    const mid = container.scrollTop + container.clientHeight * 0.42;
    const centers = sectionEls.value.map((el) => el.offsetTop + el.offsetHeight / 2);
    const nearest = nearestSectionIndex(centers, mid);
    if (nearest >= 0) activeIndex.value = nearest;
  }

  function onScroll(): void {
    if (queued) return;
    queued = true;
    requestAnimationFrame(measure);
  }

  onMounted(() => {
    scrollEl.value?.addEventListener("scroll", onScroll, { passive: true });
    measure();
  });
  onBeforeUnmount(() => scrollEl.value?.removeEventListener("scroll", onScroll));

  return { activeIndex, measure };
}
```

- [ ] **Step 8: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea`
Expected: PASS.

- [ ] **Step 9: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/apps/tea/components frontend/src/apps/tea/composables
git commit -m "feat(tea): leaves, rows and class sections"
```

---
## Task 12: The shelf page

**Files:**
- Modify: `frontend/src/apps/tea/pages/CabinetPage.vue` *(replacing the Task 1 stub)*
- Test: `frontend/src/apps/tea/pages/CabinetPage.spec.ts`

**Interfaces:**
- Consumes: both stores, `groupByClass`, `ShelfSection`, `useSectionInView`, `pathOf`.
- Produces: the route target for `/tea`. Emits nothing; navigates with `useRouter`.

**Mounting boilerplate:** copy it from an existing page spec — `src/apps/archery/pages/ResultsPage.spec.ts` — rather than inventing one. Pages use Quasar components and need its plugin installed in the test.

- [ ] **Step 1: Write the failing test**

`frontend/src/apps/tea/pages/CabinetPage.spec.ts` — the states, not the pixels:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import CabinetPage from "./CabinetPage.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import type { Tea } from "../types";

vi.mock("vue-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));

function tea(id: string, overrides: Partial<Tea> = {}): Tea {
  return {
    id,
    name: id,
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

async function page(state: { teas?: Tea[]; loading?: boolean; error?: string | null }) {
  const wrapper = mount(CabinetPage, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })],
      stubs: { QPage: { template: "<div><slot /></div>" } },
    },
  });
  const cabinet = useTeaCabinetStore();
  const catalogue = useTeaCatalogueStore();
  cabinet.teas = state.teas ?? [];
  cabinet.loading = state.loading ?? false;
  cabinet.error = state.error ?? null;
  catalogue.nodes = [
    {
      id: "oolong",
      parent_id: null,
      name: "Oolong",
      name_zh: "烏龍",
      source: "seed",
      default_origin: "",
    },
  ];
  await flushPromises();
  return wrapper;
}

beforeEach(() => vi.clearAllMocks());

describe("CabinetPage", () => {
  it("invites you to add the first tea when the cabinet is empty", async () => {
    const wrapper = await page({ teas: [] });
    expect(wrapper.get('[data-testid="cabinet-empty"]').text()).toContain("Nothing on the shelf yet");
  });

  it("shows no empty state while still loading", async () => {
    const wrapper = await page({ teas: [], loading: true });
    expect(wrapper.find('[data-testid="cabinet-empty"]').exists()).toBe(false);
  });

  it("renders a section per class that has teas", async () => {
    const wrapper = await page({
      teas: [tea("a"), tea("b", { class_id: "green" })],
    });
    const names = wrapper.findAll('[data-testid="section-name"]').map((n) => n.text());
    expect(names).toEqual(["Green", "Oolong"]);
  });

  it("counts the teas in the header", async () => {
    const wrapper = await page({ teas: [tea("a"), tea("b")] });
    expect(wrapper.get('[data-testid="cabinet-count"]').text()).toBe("2 teas");
  });

  it("says one tea in the singular", async () => {
    const wrapper = await page({ teas: [tea("a")] });
    expect(wrapper.get('[data-testid="cabinet-count"]').text()).toBe("1 tea");
  });

  it("surfaces an error with what to do next, and hides the empty state", async () => {
    const wrapper = await page({ teas: [], error: "Couldn't load your cabinet." });
    expect(wrapper.get('[data-testid="cabinet-error"]').text()).toContain("Couldn't load");
    expect(wrapper.find('[data-testid="cabinet-empty"]').exists()).toBe(false);
  });

  it("loads the shelf and the catalogue on mount", async () => {
    await page({ teas: [] });
    expect(useTeaCabinetStore().fetchTeas).toHaveBeenCalled();
    expect(useTeaCatalogueStore().fetchNodes).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/pages/CabinetPage.spec.ts`
Expected: FAIL — the stub page has no sections, count or empty state.

- [ ] **Step 3: Write the page**

`frontend/src/apps/tea/pages/CabinetPage.vue`:

```vue
<template>
  <q-page class="cabinet">
    <div ref="scrollEl" class="cabinet__scroll">
      <header class="cabinet__header">
        <span class="cabinet__title">Cabinet</span>
        <span class="cabinet__count" data-testid="cabinet-count">{{ countLabel }}</span>
      </header>

      <div v-if="cabinet.error" class="cabinet__error" data-testid="cabinet-error">
        {{ cabinet.error }}
      </div>

      <p
        v-else-if="!cabinet.loading && sections.length === 0"
        class="cabinet__empty"
        data-testid="cabinet-empty"
      >
        Nothing on the shelf yet. Add the first tea.
      </p>

      <div
        v-for="(section, index) in sections"
        :key="section.classId"
        :ref="(el) => setSectionEl(el as HTMLElement | null, index)"
      >
        <ShelfSection
          :section="section"
          :index="index"
          :active="index === activeIndex"
          :path-for="pathFor"
          :name-zh-for="nameZhFor"
          @open="openTea"
          @edit-grams="editGrams"
        />
      </div>
    </div>

    <button class="cabinet__add" data-testid="cabinet-add" aria-label="Add a tea" @click="addTea">
      +
    </button>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import ShelfSection from "../components/ShelfSection.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { useSectionInView } from "../composables/useSectionInView";
import { groupByClass } from "../shelf";
import { pathOf } from "../catalogue";
import type { Tea } from "../types";

const router = useRouter();
const cabinet = useTeaCabinetStore();
const catalogue = useTeaCatalogueStore();

const scrollEl = ref<HTMLElement | null>(null);
const sectionEls = ref<HTMLElement[]>([]);
const { activeIndex } = useSectionInView(scrollEl, sectionEls);

const sections = computed(() => groupByClass(cabinet.teas));
const countLabel = computed(() =>
  cabinet.teas.length === 1 ? "1 tea" : `${cabinet.teas.length} teas`,
);

function setSectionEl(el: HTMLElement | null, index: number): void {
  if (el) sectionEls.value[index] = el;
}

/** The deepest-but-one label: "Wuyi yancha" under the name "Da Hong Pao". */
function pathFor(tea: Tea): string {
  const chain = pathOf(catalogue.nodes, tea.catalogue_node_id);
  if (chain.length <= 1) return tea.origin;
  return chain[chain.length - 2].name;
}

function nameZhFor(tea: Tea): string {
  const chain = pathOf(catalogue.nodes, tea.catalogue_node_id);
  return chain.length ? chain[chain.length - 1].name_zh : "";
}

function openTea(teaId: string): void {
  void router.push({ name: "tea-detail", params: { teaId } });
}

function addTea(): void {
  void router.push({ name: "tea-new" });
}

const editingTeaId = ref<string | null>(null);
function editGrams(teaId: string): void {
  editingTeaId.value = teaId;
}
defineExpose({ editingTeaId });

onMounted(() => {
  void cabinet.fetchTeas();
  void catalogue.fetchNodes();
});
</script>

<style scoped lang="scss">
.cabinet {
  background: #17120e;
  position: relative;
  min-height: 100%;
}
.cabinet__scroll {
  height: 100%;
  overflow-y: auto;
}
.cabinet__header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: linear-gradient(#17120e 76%, rgba(23, 18, 14, 0));
  padding: 20px 18px 16px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.cabinet__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
}
.cabinet__count {
  color: #6b5f52;
  font-size: 13px;
}
.cabinet__empty,
.cabinet__error {
  color: #8b7a63;
  font-size: 14.5px;
  padding: 0 18px;
}
.cabinet__error {
  background: #1e1712;
  border-left: 2px solid #e4d9c6;
  color: #efe7da;
  margin: 0 18px;
  padding: 12px 14px;
}
.cabinet__add {
  position: fixed;
  right: 18px;
  bottom: 18px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 0;
  // Bone, never a hue: colour in this app means a tea's liquor (DESIGN.md).
  background: #e4d9c6;
  color: #17120e;
  font-size: 28px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 4: Add the two remaining routes**

In `frontend/src/router/routes.ts`, beside the `tea` route from Task 1. Order matters only for
readability — `t-{hex8}` ids cannot collide with `new`:

```ts
      {
        path: "tea/new",
        name: "tea-new",
        component: () => import("@/apps/tea/pages/NewTeaPage.vue"),
        meta: { title: "New tea", requiresAuth: true },
      },
      {
        path: "tea/:teaId",
        name: "tea-detail",
        component: () => import("@/apps/tea/pages/TeaDetailPage.vue"),
        meta: { title: "Tea", requiresAuth: true },
      },
```

Create both page files as one-line stubs for now so the routes resolve; Task 15 fills them:

```vue
<template><q-page /></template>
<script setup lang="ts"></script>
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea`
Expected: PASS.

- [ ] **Step 6: See it for real**

```bash
cd backend && source .venv/bin/activate && export DATA_DIR=./local-data && uvicorn app.main:app --reload --port 9000 &
cd frontend && npm run dev
```

Open `http://localhost:9100/tea`, add two or three teas through the API (`curl -X POST
localhost:9000/api/tea/teas ...` with a bearer token), and check the shelf against
`mockups/shelf.html`. Scroll: the leaves should hand over between classes.

- [ ] **Step 7: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/apps/tea/pages frontend/src/router/routes.ts
git commit -m "feat(tea): the shelf"
```

---

## Task 13: The grams sheet

**Files:**
- Create: `frontend/src/apps/tea/components/GramsSheet.vue`
- Test: `frontend/src/apps/tea/components/GramsSheet.spec.ts`
- Modify: `frontend/src/apps/tea/pages/CabinetPage.vue` *(open it from a rim)*

**Interfaces:**
- Consumes: `useTeaCabinetStore().setGrams`.
- Produces: `GramsSheet` with props `{ tea }`, emits `save: [grams: number]` and `cancel`.

- [ ] **Step 1: Write the failing test**

`frontend/src/apps/tea/components/GramsSheet.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import GramsSheet from "./GramsSheet.vue";
import type { Tea } from "../types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Da Hong Pao",
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

const sheet = (t: Tea = tea()) => mount(GramsSheet, { props: { tea: t } });

describe("GramsSheet", () => {
  it("opens at the tea's current amount", () => {
    expect(sheet().get('[data-testid="grams-value"]').text()).toContain("38");
  });

  it("steps down by one gram", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="grams-minus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("37");
  });

  it("steps up by one gram", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("39");
  });

  it("never goes below zero", async () => {
    const wrapper = sheet(tea({ grams_remaining: 0 }));
    await wrapper.get('[data-testid="grams-minus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("0");
  });

  it("will not step past what was bought", async () => {
    const wrapper = sheet(tea({ grams_purchased: 39, grams_remaining: 38 }));
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("39");
  });

  it("steps freely when the amount bought is unknown", async () => {
    const wrapper = sheet(tea({ grams_purchased: null, grams_remaining: 900 }));
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("901");
  });

  it("says where you started, so a mis-tap is obvious", () => {
    expect(sheet().get('[data-testid="grams-hint"]').text()).toContain("was 38g");
  });

  it("emits the new amount on save", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="grams-minus"]').trigger("click");
    await wrapper.get('[data-testid="grams-save"]').trigger("click");
    expect(wrapper.emitted("save")?.[0]).toEqual([37]);
  });

  it("emits cancel and no save when dismissed", async () => {
    const wrapper = sheet();
    await wrapper.get('[data-testid="grams-cancel"]').trigger("click");
    expect(wrapper.emitted("cancel")).toBeTruthy();
    expect(wrapper.emitted("save")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/components/GramsSheet.spec.ts`
Expected: FAIL — cannot resolve `./GramsSheet.vue`.

- [ ] **Step 3: Write the component**

`frontend/src/apps/tea/components/GramsSheet.vue`:

```vue
<template>
  <div class="sheet" data-testid="grams-sheet">
    <div class="sheet__grab"></div>
    <p class="sheet__title">How much is left?</p>

    <div class="sheet__stepper">
      <button class="sheet__step" data-testid="grams-minus" aria-label="One gram less" @click="step(-1)">
        −
      </button>
      <span class="sheet__value" data-testid="grams-value">{{ grams }}<i>g</i></span>
      <button class="sheet__step" data-testid="grams-plus" aria-label="One gram more" @click="step(1)">
        +
      </button>
    </div>

    <p class="sheet__hint" data-testid="grams-hint">was {{ tea.grams_remaining }}g</p>

    <button class="sheet__save" data-testid="grams-save" @click="emit('save', grams)">Save</button>
    <button class="sheet__cancel" data-testid="grams-cancel" @click="emit('cancel')">Cancel</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import type { Tea } from "../types";

const props = defineProps<{ tea: Tea }>();
const emit = defineEmits<{ save: [grams: number]; cancel: [] }>();

const grams = ref(props.tea.grams_remaining);

/** Clamped here as well as on the server, so the ceiling is felt, not explained. */
function step(by: number): void {
  const next = grams.value + by;
  const ceiling = props.tea.grams_purchased;
  if (next < 0) return;
  if (ceiling !== null && ceiling > 0 && next > ceiling) return;
  grams.value = next;
}
</script>

<style scoped lang="scss">
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 8;
  background: #1e1712;
  border-top: 1px solid #33291f;
  border-radius: 14px 14px 0 0;
  padding: 16px 18px 24px;
  box-shadow: 0 -20px 40px rgba(0, 0, 0, 0.5);
}
.sheet__grab {
  width: 34px;
  height: 3px;
  background: #3b3026;
  border-radius: 2px;
  margin: 0 auto 16px;
}
.sheet__title {
  color: #9a8b78;
  font-size: 13px;
  margin: 0 0 14px;
}
.sheet__stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
.sheet__step {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid #3b3026;
  background: transparent;
  color: #efe7da;
  font-size: 22px;
  cursor: pointer;
}
.sheet__value {
  color: #efe7da;
  font-size: 40px;
  font-weight: 500;
  min-width: 96px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.sheet__value i {
  color: #7a6d5e;
  font-size: 16px;
  font-style: normal;
}
.sheet__hint {
  text-align: center;
  color: #6b5f52;
  font-size: 12.5px;
  margin: 8px 0 0;
}
.sheet__save {
  display: block;
  width: 100%;
  margin-top: 18px;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.sheet__cancel {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 0;
  color: #6b5f52;
  font-size: 13.5px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 4: Open it from a rim**

In `CabinetPage.vue`, render the sheet for `editingTeaId` and wire it to the store:

```vue
    <GramsSheet
      v-if="editingTea"
      :tea="editingTea"
      @save="commitGrams"
      @cancel="editingTeaId = null"
    />
```

```ts
const editingTea = computed(
  () => cabinet.teas.find((tea) => tea.id === editingTeaId.value) ?? null,
);

async function commitGrams(grams: number): Promise<void> {
  const teaId = editingTeaId.value;
  editingTeaId.value = null;
  if (teaId) await cabinet.setGrams(teaId, grams);
}
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/apps/tea/components/GramsSheet.vue \
        frontend/src/apps/tea/components/GramsSheet.spec.ts \
        frontend/src/apps/tea/pages/CabinetPage.vue
git commit -m "feat(tea): edit grams from any rim"
```

---

## Task 14: The catalogue picker

**Files:**
- Create: `frontend/src/apps/tea/components/CataloguePicker.vue`
- Create: `frontend/src/apps/tea/components/AddNodeDialog.vue`
- Test: `frontend/src/apps/tea/components/CataloguePicker.spec.ts`

**Interfaces:**
- Consumes: `childrenOf`, `pathOf`, `prefillOriginFor`, `CLASS_TOKENS`, `useTeaCatalogueStore`.
- Produces: `CataloguePicker` with props `{ nodes, modelValue }`, emits `update:modelValue: [nodeId]`, `prefill: [origin]`, `add-node: [parentId]`. `AddNodeDialog` with props `{ parentLabel }`, emits `create: [{ name, name_zh, default_origin }]`, `cancel`.

**Read first:** `mockups/picker.html`, and EXPERIENCE.md's "Classifying it" and "Prefill, announced before it happens".

- [ ] **Step 1: Write the failing test**

`frontend/src/apps/tea/components/CataloguePicker.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import CataloguePicker from "./CataloguePicker.vue";
import type { CatalogueNode } from "../types";

function node(
  id: string,
  parent_id: string | null,
  overrides: Partial<CatalogueNode> = {},
): CatalogueNode {
  return {
    id,
    parent_id,
    name: id,
    name_zh: "",
    source: "seed",
    default_origin: "",
    ...overrides,
  };
}

const nodes: CatalogueNode[] = [
  node("oolong", null, { name: "Oolong", name_zh: "烏龍" }),
  node("oolong.wuyi", "oolong", { name: "Wuyi yancha", default_origin: "Wuyi Shan, Fujian" }),
  node("oolong.wuyi.dhp", "oolong.wuyi", { name: "Da Hong Pao", name_zh: "大紅袍" }),
  node("oolong.wuyi.rg", "oolong.wuyi", { name: "Rou Gui" }),
  node("green", null, { name: "Green", name_zh: "綠茶" }),
];

const picker = (modelValue: string | null = null) =>
  mount(CataloguePicker, { props: { nodes, modelValue } });

describe("CataloguePicker", () => {
  it("shows one chip per class and nothing deeper until you choose", () => {
    const wrapper = picker();
    expect(wrapper.findAll('[data-testid="tier"]')).toHaveLength(1);
    expect(wrapper.findAll('[data-testid^="chip-"]').length).toBe(2);
  });

  it("reveals the next tier once a class with children is chosen", async () => {
    const wrapper = picker();
    await wrapper.get('[data-testid="chip-oolong"]').trigger("click");
    expect(wrapper.findAll('[data-testid="tier"]')).toHaveLength(2);
  });

  it("stops when the chosen node has no children", async () => {
    const wrapper = picker("oolong.wuyi.dhp");
    // class, kind, which — and no fourth tier below a leaf.
    expect(wrapper.findAll('[data-testid="tier"]')).toHaveLength(3);
  });

  it("emits the chosen node id", async () => {
    const wrapper = picker();
    await wrapper.get('[data-testid="chip-green"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["green"]);
  });

  it("marks the chosen chip at every tier", () => {
    const wrapper = picker("oolong.wuyi");
    expect(wrapper.get('[data-testid="chip-oolong"]').classes()).toContain("chip--on");
    expect(wrapper.get('[data-testid="chip-oolong.wuyi"]').classes()).toContain("chip--on");
  });

  it("offers to add one at every tier below the first", async () => {
    const wrapper = picker("oolong");
    const adds = wrapper.findAll('[data-testid^="add-"]');
    expect(adds.length).toBeGreaterThan(0);
    await adds[0].trigger("click");
    expect(wrapper.emitted("add-node")?.[0]).toEqual(["oolong"]);
  });

  it("does not offer to add a class", () => {
    expect(picker().find('[data-testid="add-null"]').exists()).toBe(false);
  });

  it("announces the prefill before it happens", async () => {
    const wrapper = picker();
    await wrapper.get('[data-testid="chip-oolong"]').trigger("click");
    await wrapper.setProps({ modelValue: "oolong.wuyi.dhp" });
    expect(wrapper.get('[data-testid="picker-prefill"]').text()).toContain("Wuyi Shan, Fujian");
    expect(wrapper.get('[data-testid="picker-prefill"]').text()).toContain("you can change it");
  });

  it("says nothing about prefill when no ancestor offers an origin", async () => {
    const wrapper = picker("green");
    expect(wrapper.find('[data-testid="picker-prefill"]').exists()).toBe(false);
  });

  it("emits the prefill origin when a node is chosen", async () => {
    const wrapper = picker("oolong.wuyi");
    await wrapper.get('[data-testid="chip-oolong.wuyi.dhp"]').trigger("click");
    expect(wrapper.emitted("prefill")?.[0]).toEqual(["Wuyi Shan, Fujian"]);
  });

  it("keeps two same-named siblings separately selectable", async () => {
    // Review Focus 5: duplicates are permitted and must stay distinguishable.
    const dupes = [
      ...nodes,
      node("u-1", "oolong.wuyi", { name: "Rou Gui", source: "user" }),
    ];
    const wrapper = mount(CataloguePicker, {
      props: { nodes: dupes, modelValue: "oolong.wuyi" },
    });
    expect(wrapper.find('[data-testid="chip-oolong.wuyi.rg"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="chip-u-1"]').exists()).toBe(true);

    await wrapper.get('[data-testid="chip-u-1"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[0]).toEqual(["u-1"]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/components/CataloguePicker.spec.ts`
Expected: FAIL — cannot resolve `./CataloguePicker.vue`.

- [ ] **Step 3: Write the picker**

`frontend/src/apps/tea/components/CataloguePicker.vue`:

```vue
<template>
  <div class="picker" data-testid="picker">
    <div v-for="tier in tiers" :key="tier.parentId ?? 'root'" data-testid="tier">
      <p class="picker__tier">{{ tier.label }}</p>
      <div class="picker__chips">
        <button
          v-for="node in tier.nodes"
          :key="node.id"
          :class="['chip', { 'chip--on': chosenIds.includes(node.id) }]"
          :style="chipStyle(node.id)"
          :data-testid="`chip-${node.id}`"
          @click="choose(node.id)"
        >
          {{ node.name }}
          <span v-if="node.name_zh" lang="zh">{{ node.name_zh }}</span>
        </button>

        <button
          v-if="tier.parentId"
          class="chip chip--add"
          :data-testid="`add-${tier.parentId}`"
          @click="emit('add-node', tier.parentId)"
        >
          + Add one
        </button>
      </div>
    </div>

    <p v-if="prefill" class="picker__prefill" data-testid="picker-prefill">
      Origin will fill in as <em>{{ prefill }}</em> — you can change it.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { childrenOf, pathOf, prefillOriginFor } from "../catalogue";
import { CLASS_TOKENS } from "../tokens";
import type { CatalogueNode, TeaClass } from "../types";

const props = defineProps<{ nodes: CatalogueNode[]; modelValue: string | null }>();
const emit = defineEmits<{
  "update:modelValue": [nodeId: string];
  prefill: [origin: string];
  "add-node": [parentId: string];
}>();

interface Tier {
  parentId: string | null;
  label: string;
  nodes: CatalogueNode[];
}

/** Root-first ancestry of the current choice — which is also which tiers are open. */
const chosen = computed(() =>
  props.modelValue ? pathOf(props.nodes, props.modelValue) : [],
);
const chosenIds = computed(() => chosen.value.map((node) => node.id));

const tiers = computed<Tier[]>(() => {
  const result: Tier[] = [
    { parentId: null, label: "Class", nodes: childrenOf(props.nodes, null) },
  ];
  // A tier appears only when the node above it actually has children, so the
  // picker stops where the taxonomy stops rather than showing empty rows.
  for (const node of chosen.value) {
    const children = childrenOf(props.nodes, node.id);
    if (children.length === 0) break;
    result.push({ parentId: node.id, label: `Kind of ${node.name.toLowerCase()}`, nodes: children });
  }
  return result;
});

const prefill = computed(() =>
  props.modelValue ? prefillOriginFor(props.nodes, props.modelValue) : "",
);

const classTokens = computed(() => {
  const root = chosen.value[0];
  const id = (root?.id ?? "other") as TeaClass;
  return CLASS_TOKENS[id] ?? CLASS_TOKENS.other;
});

function chipStyle(nodeId: string): Record<string, string> {
  const isClassTier = props.nodes.find((n) => n.id === nodeId)?.parent_id === null;
  const tokens = isClassTier
    ? (CLASS_TOKENS[nodeId as TeaClass] ?? CLASS_TOKENS.other)
    : classTokens.value;
  return chosenIds.value.includes(nodeId)
    ? { background: tokens.liquor, borderColor: tokens.liquor, color: "#17120E" }
    : { color: tokens.head };
}

function choose(nodeId: string): void {
  emit("update:modelValue", nodeId);
  emit("prefill", prefillOriginFor(props.nodes, nodeId));
}
</script>

<style scoped lang="scss">
.picker__tier {
  color: #6b5f52;
  font-size: 11.5px;
  margin: 0 0 4px;
}
.picker__chips {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
  padding: 6px 0 14px;
}
.chip {
  border: 1px solid #2e271f;
  background: transparent;
  font-size: 13px;
  padding: 5px 11px;
  border-radius: 14px;
  cursor: pointer;
  font-family: inherit;
}
.chip--on {
  font-weight: 600;
}
.chip--add {
  border-style: dashed;
  border-color: #4a3d2e;
  color: #8b7a63;
}
.picker__prefill {
  border-top: 1px solid #2a231c;
  padding-top: 14px;
  color: #7a6d5e;
  font-size: 12.5px;
}
.picker__prefill em {
  color: #c7a271;
  font-style: normal;
}
</style>
```

- [ ] **Step 4: Write AddNodeDialog**

`frontend/src/apps/tea/components/AddNodeDialog.vue` — three fields, two optional, parent stated
rather than asked for:

```vue
<template>
  <div class="add" data-testid="add-node">
    <div class="add__grab"></div>
    <p class="add__title">Add to {{ parentLabel }}</p>

    <label class="add__label" for="node-name">Name</label>
    <input id="node-name" v-model="name" class="add__field" data-testid="node-name" />

    <label class="add__label" for="node-zh">Chinese <span>optional</span></label>
    <input id="node-zh" v-model="nameZh" class="add__field" lang="zh" data-testid="node-zh" />

    <label class="add__label" for="node-origin">Usually from <span>optional</span></label>
    <input id="node-origin" v-model="origin" class="add__field" data-testid="node-origin" />

    <p class="add__note">
      Everyone's catalogue starts the same; what you add is yours alone, and the teas that ship with
      the app are never changed by it.
    </p>

    <button class="add__save" data-testid="node-save" :disabled="!name.trim()" @click="create">
      Add to catalogue
    </button>
    <button class="add__cancel" data-testid="node-cancel" @click="emit('cancel')">Cancel</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{ parentLabel: string }>();
const emit = defineEmits<{
  create: [payload: { name: string; name_zh: string; default_origin: string }];
  cancel: [];
}>();

const name = ref("");
const nameZh = ref("");
const origin = ref("");

function create(): void {
  if (!name.value.trim()) return;
  emit("create", {
    name: name.value.trim(),
    name_zh: nameZh.value.trim(),
    default_origin: origin.value.trim(),
  });
}
</script>

<style scoped lang="scss">
.add {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9;
  background: #1e1712;
  border-top: 1px solid #33291f;
  border-radius: 14px 14px 0 0;
  padding: 16px 18px 24px;
}
.add__grab {
  width: 34px;
  height: 3px;
  background: #3b3026;
  border-radius: 2px;
  margin: 0 auto 14px;
}
.add__title {
  color: #9a8b78;
  font-size: 13px;
  margin: 0 0 14px;
}
.add__label {
  display: block;
  color: #6b5f52;
  font-size: 11.5px;
  padding-top: 14px;
  padding-bottom: 5px;
}
.add__label span {
  color: #5e5445;
}
.add__field {
  width: 100%;
  background: #241c16;
  border: 1px solid #3b3026;
  border-radius: 3px;
  padding: 11px 12px;
  color: #efe7da;
  font-size: 15px;
  font-family: inherit;
}
.add__note {
  color: #7a6d5e;
  font-size: 12.5px;
  border-top: 1px solid #2a231c;
  margin-top: 20px;
  padding-top: 14px;
}
.add__save {
  display: block;
  width: 100%;
  margin-top: 18px;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.add__save:disabled {
  opacity: 0.4;
  cursor: default;
}
.add__cancel {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 0;
  color: #6b5f52;
  font-size: 13.5px;
  cursor: pointer;
}
</style>
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/apps/tea`
Expected: PASS.

- [ ] **Step 6: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/apps/tea/components/CataloguePicker.vue \
        frontend/src/apps/tea/components/CataloguePicker.spec.ts \
        frontend/src/apps/tea/components/AddNodeDialog.vue
git commit -m "feat(tea): the catalogue picker"
```

---

## Task 15: Adding and editing a tea

**Files:**
- Create: `frontend/src/apps/tea/components/TeaForm.vue`
- Modify: `frontend/src/apps/tea/pages/NewTeaPage.vue` *(replacing the Task 12 stub)*
- Modify: `frontend/src/apps/tea/pages/TeaDetailPage.vue` *(replacing the Task 12 stub)*
- Test: `frontend/src/apps/tea/components/TeaForm.spec.ts`
- Test: `frontend/src/apps/tea/pages/TeaDetailPage.spec.ts`

**Interfaces:**
- Consumes: `CataloguePicker`, `AddNodeDialog`, `RimGauge`, `GramsSheet`, both stores, `pricePerGram`, `pathOf`.
- Produces: `TeaForm` with props `{ modelValue: TeaWrite, nodes }`, emits `update:modelValue`, `add-node`. Both pages as route targets.

**Read first:** `mockups/tea-detail.html` — the Wrapper layout, with the three field groups *Where
it's from*, *What it cost*, *On the shelf*, then Notes.

- [ ] **Step 1: Write the failing form test**

`frontend/src/apps/tea/components/TeaForm.spec.ts`:

```ts
import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TeaForm from "./TeaForm.vue";
import type { CatalogueNode, TeaWrite } from "../types";

const nodes: CatalogueNode[] = [
  {
    id: "oolong",
    parent_id: null,
    name: "Oolong",
    name_zh: "烏龍",
    source: "seed",
    default_origin: "",
  },
  {
    id: "oolong.wuyi",
    parent_id: "oolong",
    name: "Wuyi yancha",
    name_zh: "",
    source: "seed",
    default_origin: "Wuyi Shan, Fujian",
  },
];

function blank(): TeaWrite {
  return {
    name: "",
    catalogue_node_id: "",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 0,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
  };
}

const form = (value: TeaWrite = blank()) =>
  mount(TeaForm, { props: { modelValue: value, nodes } });

describe("TeaForm", () => {
  it("groups the fields under the three headings", () => {
    const headings = form()
      .findAll('[data-testid="group"]')
      .map((h) => h.text());
    expect(headings).toEqual(["Where it's from", "What it cost", "On the shelf"]);
  });

  it("emits the typed name", async () => {
    const wrapper = form();
    await wrapper.get('[data-testid="field-name"]').setValue("Rou Gui");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.name).toBe("Rou Gui");
  });

  it("fills an untouched origin from the picked node", async () => {
    const wrapper = form();
    await wrapper.getComponent({ name: "CataloguePicker" }).vm.$emit("prefill", "Wuyi Shan, Fujian");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.origin).toBe("Wuyi Shan, Fujian");
  });

  it("refuses to overwrite an origin the person typed", async () => {
    const wrapper = form({ ...blank(), origin: "A shop in Prague" });
    await wrapper.get('[data-testid="field-origin"]').setValue("A shop in Prague");
    await wrapper.getComponent({ name: "CataloguePicker" }).vm.$emit("prefill", "Wuyi Shan, Fujian");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.origin).toBe("A shop in Prague");
  });

  it("shows price per gram when both numbers are known", () => {
    const wrapper = form({ ...blank(), price_paid: 68, grams_purchased: 100 });
    expect(wrapper.get('[data-testid="price-per-gram"]').text()).toContain("0.68");
  });

  it("shows no price per gram when the amount bought is zero", () => {
    const wrapper = form({ ...blank(), price_paid: 68, grams_purchased: 0 });
    expect(wrapper.find('[data-testid="price-per-gram"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Write the failing detail-page test**

`frontend/src/apps/tea/pages/TeaDetailPage.spec.ts` — reuse the mounting boilerplate from
`CabinetPage.spec.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { createTestingPinia } from "@pinia/testing";
import TeaDetailPage from "./TeaDetailPage.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import type { Tea } from "../types";

const push = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, back: vi.fn() }),
  useRoute: () => ({ params: { teaId: "t-1" } }),
}));

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Da Hong Pao",
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: "loose",
    origin: "Wuyi Shan, Fujian",
    vendor: "Yunnan Sourcing",
    year: 2021,
    harvest_season: "spring",
    cultivar: "Qi Dan",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: 68,
    purchase_date: "2024-03-12",
    storage_location: "Cupboard, top shelf",
    low_threshold_grams: 15,
    notes: "Heavy roast.",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

async function page(teas: Tea[] = [tea()]) {
  const wrapper = mount(TeaDetailPage, {
    global: {
      plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })],
      stubs: { QPage: { template: "<div><slot /></div>" } },
    },
  });
  useTeaCabinetStore().teas = teas;
  await flushPromises();
  return wrapper;
}

describe("TeaDetailPage", () => {
  it("shows the tea's name", async () => {
    expect((await page()).get('[data-testid="tea-title"]').text()).toContain("Da Hong Pao");
  });

  it("shows the large rim", async () => {
    expect((await page()).find('[data-testid="rim"]').exists()).toBe(true);
  });

  it("says the tea is not here when the id matches nothing", async () => {
    expect((await page([])).get('[data-testid="tea-missing"]').text()).toContain("not in your cabinet");
  });

  it("names the removal action as what it does", async () => {
    expect((await page()).get('[data-testid="tea-remove"]').text()).toBe("Remove from cabinet");
  });

  it("asks before removing, and only removes after the confirm", async () => {
    const wrapper = await page();
    await wrapper.get('[data-testid="tea-remove"]').trigger("click");
    expect(useTeaCabinetStore().deleteTea).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="remove-confirm"]').text()).toContain("Da Hong Pao");

    await wrapper.get('[data-testid="remove-yes"]').trigger("click");
    expect(useTeaCabinetStore().deleteTea).toHaveBeenCalledWith("t-1");
  });

  it("opens the grams sheet from the rim", async () => {
    const wrapper = await page();
    await wrapper.get('[data-testid="tea-rim-button"]').trigger("click");
    expect(wrapper.find('[data-testid="grams-sheet"]').exists()).toBe(true);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `cd frontend && npx vitest run src/apps/tea`
Expected: FAIL — `TeaForm.vue` does not exist and the detail page is still a stub.

> **PLAN DEFECT, found by the final whole-branch review (2026-09-25).** The `TeaForm.vue` code
> below omits inputs for `form` and `harvest_season`, and includes a "Grams left" input that FR-14
> forbids — grams change only through the grams sheet. Both were carried faithfully into the
> implementation, because every per-task review compared the diff against this brief and the brief
> was the defect. Fixed in a follow-up commit. If you are reading this plan as a template: the
> field list here is not the contract; `EXPERIENCE.md`, the mockups and the spec's FRs are.

- [ ] **Step 4: Write TeaForm**

`frontend/src/apps/tea/components/TeaForm.vue`. Built from `mockups/tea-detail.html`: the picker
first, then the three named groups, then notes.

```vue
<template>
  <div class="form">
    <CataloguePicker
      :nodes="nodes"
      :model-value="modelValue.catalogue_node_id || null"
      @update:model-value="patch({ catalogue_node_id: $event })"
      @prefill="onPrefill"
      @add-node="emit('add-node', $event)"
    />

    <label class="form__label" for="tea-name">Name</label>
    <input
      id="tea-name"
      class="form__field"
      data-testid="field-name"
      :value="modelValue.name"
      @input="patch({ name: asText($event) })"
    />

    <p class="form__group" data-testid="group">Where it's from</p>
    <input
      class="form__field"
      data-testid="field-origin"
      placeholder="Origin"
      :value="modelValue.origin"
      @input="touchedOrigin = true; patch({ origin: asText($event) })"
    />
    <input
      class="form__field"
      data-testid="field-cultivar"
      placeholder="Cultivar"
      :value="modelValue.cultivar"
      @input="patch({ cultivar: asText($event) })"
    />
    <input
      class="form__field"
      data-testid="field-year"
      placeholder="Harvest year"
      inputmode="numeric"
      :value="modelValue.year ?? ''"
      @input="patch({ year: asNumber($event) })"
    />
    <input
      class="form__field"
      data-testid="field-vendor"
      placeholder="Vendor"
      :value="modelValue.vendor"
      @input="patch({ vendor: asText($event) })"
    />

    <p class="form__group" data-testid="group">What it cost</p>
    <input
      class="form__field"
      data-testid="field-purchased"
      placeholder="Grams bought"
      inputmode="decimal"
      :value="modelValue.grams_purchased ?? ''"
      @input="patch({ grams_purchased: asNumber($event) })"
    />
    <input
      class="form__field"
      data-testid="field-price"
      placeholder="Price paid"
      inputmode="decimal"
      :value="modelValue.price_paid ?? ''"
      @input="patch({ price_paid: asNumber($event) })"
    />
    <span v-if="perGram !== null" class="form__sub" data-testid="price-per-gram">
      {{ perGram.toFixed(2) }} per gram
    </span>
    <input
      class="form__field"
      data-testid="field-purchase-date"
      placeholder="Bought on (2024-03-12)"
      :value="modelValue.purchase_date ?? ''"
      @input="patch({ purchase_date: asText($event) || null })"
    />

    <p class="form__group" data-testid="group">On the shelf</p>
    <input
      class="form__field"
      data-testid="field-remaining"
      placeholder="Grams left"
      inputmode="decimal"
      :value="modelValue.grams_remaining"
      @input="patch({ grams_remaining: asNumber($event) ?? 0 })"
    />
    <input
      class="form__field"
      data-testid="field-storage"
      placeholder="Kept in"
      :value="modelValue.storage_location"
      @input="patch({ storage_location: asText($event) })"
    />
    <input
      class="form__field"
      data-testid="field-low"
      placeholder="Low at (grams)"
      inputmode="decimal"
      :value="modelValue.low_threshold_grams ?? ''"
      @input="patch({ low_threshold_grams: asNumber($event) })"
    />

    <p class="form__group form__group--notes">Notes</p>
    <textarea
      class="form__field form__field--notes"
      data-testid="field-notes"
      rows="4"
      :value="modelValue.notes"
      @input="patch({ notes: asText($event) })"
    ></textarea>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import CataloguePicker from "./CataloguePicker.vue";
import { pricePerGram } from "../shelf";
import type { CatalogueNode, Tea, TeaWrite } from "../types";

const props = defineProps<{ modelValue: TeaWrite; nodes: CatalogueNode[] }>();
const emit = defineEmits<{
  "update:modelValue": [value: TeaWrite];
  "add-node": [parentId: string];
}>();

// Flips on the first keystroke in origin and never flips back, so prefill can
// tell "still untouched" from "typed and then cleared".
const touchedOrigin = ref(false);

function asText(event: Event): string {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value;
}

function asNumber(event: Event): number | null {
  const raw = (event.target as HTMLInputElement).value.trim();
  if (raw === "") return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function patch(change: Partial<TeaWrite>): void {
  emit("update:modelValue", { ...props.modelValue, ...change });
}

/**
 * Prefill writes into `origin` only when the person has not typed there and
 * the field is still empty, and never twice for the same field (FR-9).
 */
function onPrefill(origin: string): void {
  if (!origin || touchedOrigin.value || props.modelValue.origin) return;
  patch({ origin });
}

const perGram = computed(() => pricePerGram({ ...props.modelValue } as Tea));
</script>

<style scoped lang="scss">
.form__label,
.form__group {
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
.form__field--notes {
  line-height: 1.62;
}
.form__sub {
  display: block;
  color: #7a6d5e;
  font-size: 12.5px;
  margin: -4px 0 8px;
}
</style>
```

- [ ] **Step 5: Write NewTeaPage**

`frontend/src/apps/tea/pages/NewTeaPage.vue`:

```vue
<template>
  <q-page class="tea-page">
    <header class="tea-page__bar">
      <button class="tea-page__back" @click="router.back()">← Cabinet</button>
      <button
        class="tea-page__save"
        data-testid="new-save"
        :disabled="!canSave || cabinet.saving"
        @click="save"
      >
        Save
      </button>
    </header>

    <h1 class="tea-page__title">New tea</h1>

    <p v-if="cabinet.error" class="tea-page__error" data-testid="new-error">{{ cabinet.error }}</p>

    <div class="tea-page__body">
      <TeaForm v-model="draft" :nodes="catalogue.nodes" @add-node="openAddNode" />
    </div>

    <AddNodeDialog
      v-if="addingParentId"
      :parent-label="addingParentLabel"
      @create="createNode"
      @cancel="addingParentId = null"
    />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter, onBeforeRouteLeave } from "vue-router";
import TeaForm from "../components/TeaForm.vue";
import AddNodeDialog from "../components/AddNodeDialog.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { pathOf } from "../catalogue";
import type { TeaWrite } from "../types";

const router = useRouter();
const cabinet = useTeaCabinetStore();
const catalogue = useTeaCatalogueStore();

function blank(): TeaWrite {
  return {
    name: "",
    catalogue_node_id: "",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 0,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
  };
}

const draft = ref<TeaWrite>(blank());
const addingParentId = ref<string | null>(null);
const saved = ref(false);

// FR-2's two required fields, enforced here so the server's 422 is never the
// first thing the person sees.
const canSave = computed(
  () => draft.value.name.trim().length > 0 && draft.value.catalogue_node_id.length > 0,
);

const dirty = computed(
  () => !saved.value && JSON.stringify(draft.value) !== JSON.stringify(blank()),
);

const addingParentLabel = computed(() => {
  if (!addingParentId.value) return "";
  return pathOf(catalogue.nodes, addingParentId.value)
    .map((node) => node.name)
    .join(" › ");
});

function openAddNode(parentId: string): void {
  addingParentId.value = parentId;
}

async function createNode(payload: {
  name: string;
  name_zh: string;
  default_origin: string;
}): Promise<void> {
  const parentId = addingParentId.value;
  if (!parentId) return;
  const created = await catalogue.addNode({ parent_id: parentId, ...payload });
  addingParentId.value = null;
  if (created) draft.value = { ...draft.value, catalogue_node_id: created.id };
}

async function save(): Promise<void> {
  const created = await cabinet.createTea(draft.value);
  if (!created) return; // The error is on screen; the typing is not thrown away.
  saved.value = true;
  void router.push({ name: "tea-detail", params: { teaId: created.id } });
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("Leave without saving? Your changes to this tea will be lost.");
});

onMounted(() => {
  void catalogue.fetchNodes();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";
</style>
```

Create `frontend/src/apps/tea/pages/tea-page.scss` with the shared page chrome, so both pages use
one copy:

```scss
.tea-page {
  background: #17120e;
  min-height: 100%;
  position: relative;
  padding-bottom: 40px;
}
.tea-page__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px 6px;
}
.tea-page__back,
.tea-page__save {
  background: transparent;
  border: 0;
  font-family: inherit;
  cursor: pointer;
  font-size: 15px;
}
.tea-page__back {
  color: #8b7a63;
}
.tea-page__save {
  color: #efe7da;
}
.tea-page__save:disabled {
  color: #574d43;
  cursor: default;
}
.tea-page__title {
  color: #efe7da;
  font-size: 26px;
  font-weight: 500;
  line-height: 1.15;
  padding: 5px 18px 0;
  margin: 0;
}
.tea-page__body {
  padding: 0 18px;
}
.tea-page__error {
  background: #1e1712;
  border-left: 2px solid #e4d9c6;
  color: #efe7da;
  margin: 12px 18px 0;
  padding: 12px 14px;
  font-size: 14px;
}
```

- [ ] **Step 6: Write TeaDetailPage**

`frontend/src/apps/tea/pages/TeaDetailPage.vue` — the Wrapper layout from the mockup.

```vue
<template>
  <q-page class="tea-page">
    <header class="tea-page__bar">
      <button class="tea-page__back" @click="router.back()">← Cabinet</button>
    </header>

    <p v-if="!tea && !cabinet.loading" class="tea-page__missing" data-testid="tea-missing">
      That tea is not in your cabinet. It may have been removed.
    </p>

    <template v-if="tea">
      <div class="tea-page__wrapper">
        <div class="tea-page__ident">
          <p class="tea-page__crumb" data-testid="tea-crumb">{{ crumb }}</p>
          <h1 class="tea-page__title" data-testid="tea-title">
            {{ tea.name }}
            <span v-if="nameZh" class="tea-page__zh" lang="zh">{{ nameZh }}</span>
          </h1>
        </div>
        <button class="tea-page__rim" data-testid="tea-rim-button" @click="editing = true">
          <RimGauge
            size="page"
            :proportion="proportion"
            :threshold-fraction="thresholdFraction"
            :low="low"
            :empty="tea.grams_remaining <= 0"
            :color="color"
            :value="tea.grams_remaining"
            :caption="tea.grams_purchased ? `of ${tea.grams_purchased}g` : null"
          />
          <span class="tea-page__rim-hint">tap to adjust</span>
        </button>
      </div>

      <p v-if="cabinet.error" class="tea-page__error" data-testid="tea-error">{{ cabinet.error }}</p>

      <div class="tea-page__body">
        <TeaForm v-model="draft" :nodes="catalogue.nodes" @add-node="openAddNode" />
        <button class="tea-page__apply" data-testid="tea-save" :disabled="!dirty" @click="save">
          Save changes
        </button>
      </div>

      <button class="tea-page__remove" data-testid="tea-remove" @click="confirming = true">
        Remove from cabinet
      </button>

      <div v-if="confirming" class="sheet" data-testid="remove-confirm">
        <p class="sheet__title">
          Remove {{ tea.name }} from the cabinet? Its notes go with it.
        </p>
        <button class="sheet__save" data-testid="remove-yes" @click="remove">Remove</button>
        <button class="sheet__cancel" data-testid="remove-no" @click="confirming = false">
          Keep it
        </button>
      </div>

      <GramsSheet v-if="editing" :tea="tea" @save="commitGrams" @cancel="editing = false" />
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import RimGauge from "../components/RimGauge.vue";
import GramsSheet from "../components/GramsSheet.vue";
import TeaForm from "../components/TeaForm.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { proportionOf, thresholdFractionOf, isLow } from "../shelf";
import { pathOf } from "../catalogue";
import { CLASS_TOKENS } from "../tokens";
import type { Tea, TeaWrite } from "../types";

const route = useRoute();
const router = useRouter();
const cabinet = useTeaCabinetStore();
const catalogue = useTeaCatalogueStore();

const teaId = computed(() => String(route.params.teaId));
const tea = computed(() => cabinet.teas.find((t) => t.id === teaId.value) ?? null);

const editing = ref(false);
const confirming = ref(false);

function toWrite(source: Tea): TeaWrite {
  const { id, class_id, created_at, updated_at, ...rest } = source;
  void id;
  void class_id;
  void created_at;
  void updated_at;
  return rest;
}

const draft = ref<TeaWrite | null>(null);
watch(tea, (value) => {
  if (value && draft.value === null) draft.value = toWrite(value);
}, { immediate: true });

const dirty = computed(
  () => tea.value !== null && draft.value !== null
    && JSON.stringify(draft.value) !== JSON.stringify(toWrite(tea.value)),
);

const chain = computed(() =>
  tea.value ? pathOf(catalogue.nodes, tea.value.catalogue_node_id) : [],
);
const crumb = computed(() => chain.value.map((node) => node.name).join(" › "));
const nameZh = computed(() => chain.value.at(-1)?.name_zh ?? "");
const color = computed(() =>
  tea.value ? (CLASS_TOKENS[tea.value.class_id]?.liquor ?? CLASS_TOKENS.other.liquor) : "",
);
const proportion = computed(() => (tea.value ? proportionOf(tea.value) : null));
const thresholdFraction = computed(() => (tea.value ? thresholdFractionOf(tea.value) : null));
const low = computed(() => (tea.value ? isLow(tea.value) : false));

const addingParentId = ref<string | null>(null);
function openAddNode(parentId: string): void {
  addingParentId.value = parentId;
}

async function commitGrams(grams: number): Promise<void> {
  editing.value = false;
  await cabinet.setGrams(teaId.value, grams);
  if (tea.value) draft.value = toWrite(tea.value);
}

async function save(): Promise<void> {
  if (!draft.value) return;
  const updated = await cabinet.replaceTea(teaId.value, draft.value);
  if (updated) draft.value = toWrite(updated);
}

async function remove(): Promise<void> {
  confirming.value = false;
  await cabinet.deleteTea(teaId.value);
  void router.push({ name: "tea-cabinet" });
}

onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("Leave without saving? Your changes to this tea will be lost.");
});

onMounted(() => {
  if (cabinet.teas.length === 0) void cabinet.fetchTeas();
  void catalogue.fetchNodes();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.tea-page__wrapper {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding-right: 18px;
}
.tea-page__ident {
  flex: 1;
  min-width: 0;
}
.tea-page__crumb {
  color: #7a6244;
  font-size: 12px;
  padding: 0 18px;
  margin: 0;
}
.tea-page__zh {
  display: block;
  color: #a99781;
  font-size: 19px;
  font-weight: 300;
  margin-top: 3px;
}
.tea-page__rim {
  flex: none;
  background: transparent;
  border: 0;
  padding-top: 14px;
  cursor: pointer;
}
.tea-page__rim-hint {
  display: block;
  color: #8b7a63;
  font-size: 11.5px;
  margin-top: 3px;
}
.tea-page__apply {
  width: 100%;
  margin-top: 20px;
  background: #e4d9c6;
  color: #17120e;
  border: 0;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.tea-page__apply:disabled {
  opacity: 0.4;
  cursor: default;
}
.tea-page__remove,
.tea-page__missing {
  display: block;
  background: transparent;
  border: 0;
  color: #8b6a5e;
  font-size: 13.5px;
  padding: 22px 18px 26px;
  font-family: inherit;
  cursor: pointer;
}
.tea-page__missing {
  color: #8b7a63;
  cursor: default;
}
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 9;
  background: #1e1712;
  border-top: 1px solid #33291f;
  border-radius: 14px 14px 0 0;
  padding: 20px 18px 24px;
}
.sheet__title {
  color: #efe7da;
  font-size: 15px;
  margin: 0 0 18px;
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
}
.sheet__cancel {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 0;
  color: #6b5f52;
  font-size: 13.5px;
  cursor: pointer;
}
</style>
```

Note `AddNodeDialog` is wired on `NewTeaPage` only in this step; add the same three lines to
`TeaDetailPage` (the `<AddNodeDialog>` block, `addingParentLabel`, `createNode`) so reclassifying
an existing tea can also add a node. The test for it belongs with the other detail-page tests.

- [ ] **Step 7: Add the dirty-state guard**

Both pages use `onBeforeRouteLeave`, and only ask when something actually changed:

```ts
onBeforeRouteLeave(() => {
  if (!dirty.value) return true;
  return window.confirm("Leave without saving? Your changes to this tea will be lost.");
});
```

- [ ] **Step 8: Run the whole frontend suite**

Run: `cd frontend && npx vitest run`
Expected: PASS, including every existing app's specs.

- [ ] **Step 9: Lint and commit**

```bash
cd frontend && npm run lint
git add frontend/src/apps/tea
git commit -m "feat(tea): add and edit a tea"
```

---

## Task 16: Whole-app verification

**Files:** none — this task changes nothing. It is the gate before the branch is called done.

- [ ] **Step 1: Run every backend test**

Run: `cd backend && .venv/bin/pytest`
Expected: PASS, with no warnings you introduced.

- [ ] **Step 2: Run every frontend test**

Run: `cd frontend && npx vitest run`
Expected: PASS.

- [ ] **Step 3: Format and lint both sides**

Run: `cd backend && black . && ruff check . && cd ../frontend && npm run lint`
Expected: clean. CI enforces both.

- [ ] **Step 4: Drive the real app**

```bash
cd backend && source .venv/bin/activate && export DATA_DIR=./local-data && uvicorn app.main:app --reload --port 9000 &
cd frontend && npm run dev
```

Walk the whole loop at a phone width (360px), against `mockups/`:

1. The dock landing page shows **Tea Cabinet**; open it. The empty state invites you to add a tea.
2. Add Da Hong Pao: pick Oolong → Wuyi yancha → Da Hong Pao, watch the prefill line appear *before*
   it fills the origin, and save. It lands in an Oolong section.
3. Add a tea in a second class, then a third. Scroll: the leaves hand over between classes and the
   others settle back to a whisper.
4. Tap a rim, knock 7g off, save. The rim redraws immediately.
5. Set a low threshold on one tea and take it under: the fill goes dashed and the tick appears above
   it.
6. Take one to 0g: it drops to the end of its section and goes quiet.
7. Add a tea that is not in the catalogue via **+ Add one**, and classify against it.
8. Try to delete that node while the tea uses it: the refusal names the count.
9. Edit a tea, navigate away without saving: it asks.
10. Stop the backend and reload: the error banner says what happened, and the shelf does not show
    stale teas.

- [ ] **Step 5: Check the contracts, not just the tests**

Re-read `DESIGN.md`'s Do's and Don'ts against the running app. In particular: nothing coloured that
is not a tea's liquor, no badges on the shelf, no boxes around teas, no sans-serif, and no motion
you did not cause.

- [ ] **Step 6: Commit anything the walkthrough fixed**

```bash
git add -A
git commit -m "fix(tea): corrections from the verification walkthrough"
```

---

## Notes for the executor

- **The contracts outrank this plan.** Where a step and `DESIGN.md`/`EXPERIENCE.md` disagree about
  a colour, a size or a sentence of copy, the contracts win and the plan is wrong.
- **Do not add an eighth colour.** Errors are bone-on-raised, not red. If that feels wrong while
  building, raise it rather than quietly introducing a hue — the rule exists because this app's
  amber *is* oolong.
- **Tasks 1–6 are backend and land in order.** Tasks 7–9 are pure frontend and depend only on the
  API's shape, so they can be written before or alongside the backend. Tasks 10–15 depend on 7–9.
- The seed catalogue is data. Adding teas to it later is a one-line JSON change and needs no code.
