# Cha Dao Almanac (Read Feature) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a read/search view of the Cha Dao Almanac — factual entries per named tea (origin,
brewing parameters, a summary) linked to the existing tea catalogue — seeded with 10 well-known
Chinese and Japanese teas.

**Architecture:** Follows the existing Tea app's 3-layer backend (schema → repository → service →
router) and feature-grouped frontend (store → pages → routes) exactly, adding new files alongside
the Cabinet's rather than touching its data model. Almanac entries are read-only seed data — one
JSON array per country under `backend/app/data/almanac/`, merged and cached on read like the
existing catalogue seed — and every entry resolves its display name/native script/origin through a
link to a `CatalogueNode`, never duplicating that data.

**Tech Stack:** FastAPI + Pydantic v2 (backend), Vue 3 `<script setup>` + Pinia + Vite (frontend),
pytest / vitest.

**Spec:** [`docs/superpowers/specs/2026-09-25-tea-almanac-design.md`](../specs/2026-09-25-tea-almanac-design.md)

## Global Constraints

- Python 3.12; format/lint with `black .` and `ruff check .` (line-length 100), both CI-enforced.
- Node ≥22.22; lint with `npm run lint`, format with `npm run format`.
- `app/repositories/` is the ONLY backend code that touches the filesystem — the Almanac's seed
  reads belong only in `almanac_repo.py`.
- API contract: snake_case JSON fields, direct serialization (no `{ data, status }` envelope),
  errors as `{ detail }`.
- All frontend HTTP goes through `src/composables/useApi.ts` — no raw `fetch`/`axios`.
- Pinia stores expose `loading` and `error` refs; every async action sets `loading` in a
  `try/finally` and routes errors into `error.value`, never a bare `console.error`.
- Backend tests live in `backend/tests/` as `test_*.py`, using `tmp_path` + `monkeypatch` on
  `settings.data_dir` where a test touches per-user storage. Frontend tests are `*.spec.ts`
  co-located next to the unit under test.
- Every `AlmanacEntry.catalogue_node_id` must reference a real catalogue leaf node — enforced by
  convention when authoring seed content, and pinned by a test that cross-checks every seeded
  entry against the real catalogue.
- No write/edit path this round (PRD FR-25 is explicitly out of scope) — every new surface is
  read-only.

## Review Focus

- An entry with partially or fully missing brewing data (e.g. Matcha, which is whisked rather than
  steeped and so has no `steep_seconds`) must render "Not recorded" rather than crashing or
  showing a bare `0`/empty string. (Task 7)
- Search text matching must be case-insensitive and match on partial substrings against the
  resolved name, native script, and summary — not just the raw entry fields. (Task 3)
- A country filter with no matching entries must return an empty list cleanly, and the frontend
  must show its "no teas match" empty state rather than a false error banner. (Tasks 3, 6)
- An Almanac entry whose linked catalogue node can no longer be resolved (a broken or retired
  link) must be dropped from the list rather than crashing the whole listing, and 404 on direct
  lookup — mirroring how `tea_catalogue_service.resolve_class` already treats an unresolvable
  node defensively rather than raising. (Task 3)
- Opening the Almanac entry detail page directly, with an empty store (e.g. a fresh page load
  rather than navigation from the list), must still load and render the entry. (Task 7)

---

## Task 1: Almanac schema

**Files:**
- Create: `backend/app/schemas/almanac.py`
- Test: `backend/tests/test_almanac_schemas.py`

**Interfaces:**
- Produces: `BrewingParameters` (`leaf_grams: float | None`, `water_temp_c: int | None`,
  `steep_seconds: list[int]`), `AlmanacEntry` (`catalogue_node_id: str`, `country: str`,
  `reading: str`, `summary: str`, `brewing: BrewingParameters`, `source: Literal["seed","user"]`),
  `AlmanacEntryView(AlmanacEntry)` (adds `name: str`, `name_zh: str`, `default_origin: str`) — all
  in `app.schemas.almanac`, used by every later task.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_almanac_schemas.py
"""Defaults and shape of the Almanac's pydantic models."""

from __future__ import annotations

from app.schemas.almanac import AlmanacEntry, AlmanacEntryView, BrewingParameters


def test_brewing_parameters_default_to_unknown() -> None:
    params = BrewingParameters()
    assert params.leaf_grams is None
    assert params.water_temp_c is None
    assert params.steep_seconds == []


def test_almanac_entry_defaults_to_seed_source() -> None:
    entry = AlmanacEntry(catalogue_node_id="green.longjing", country="China", summary="x")
    assert entry.source == "seed"
    assert entry.reading == ""
    assert entry.brewing.steep_seconds == []


def test_almanac_entry_view_carries_the_resolved_catalogue_fields() -> None:
    view = AlmanacEntryView(
        catalogue_node_id="green.longjing",
        country="China",
        summary="x",
        name="Longjing",
        name_zh="龍井",
        default_origin="Xihu, Zhejiang",
    )
    assert view.name == "Longjing"
    assert view.name_zh == "龍井"
    assert view.default_origin == "Xihu, Zhejiang"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_almanac_schemas.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.schemas.almanac'`

- [ ] **Step 3: Write the schema**

```python
# backend/app/schemas/almanac.py
"""Pydantic v2 schemas for the Cha Dao Almanac.

Read-only in this round: entries ship as seed JSON under
`app/data/almanac/{country}.json`, one array per file, merged on read (see
`app/repositories/almanac_repo.py`). An entry always links to a catalogue
leaf node rather than duplicating its name, native script, or default
origin — `AlmanacEntryView` resolves those through the link.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

EntrySource = Literal["seed", "user"]


class BrewingParameters(BaseModel):
    leaf_grams: float | None = None
    water_temp_c: int | None = None
    steep_seconds: list[int] = Field(default_factory=list)


class AlmanacEntry(BaseModel):
    catalogue_node_id: str
    country: str
    reading: str = ""
    summary: str
    brewing: BrewingParameters = Field(default_factory=BrewingParameters)
    source: EntrySource = "seed"


class AlmanacEntryView(AlmanacEntry):
    """An entry as the API returns it: with its catalogue identity resolved."""

    name: str
    name_zh: str = ""
    default_origin: str = ""
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_almanac_schemas.py -v`
Expected: PASS (3 tests)

- [ ] **Step 5: Format and lint**

Run: `cd backend && black app/schemas/almanac.py tests/test_almanac_schemas.py && ruff check app/schemas/almanac.py tests/test_almanac_schemas.py`
Expected: no changes needed / no errors

- [ ] **Step 6: Commit**

```bash
git add backend/app/schemas/almanac.py backend/tests/test_almanac_schemas.py
git commit -m "feat(tea): add Almanac entry schema"
```

---

## Task 2: Seed data + repository

**Files:**
- Create: `backend/app/data/almanac/china.json`
- Create: `backend/app/data/almanac/japan.json`
- Create: `backend/app/repositories/almanac_repo.py`
- Test: `backend/tests/test_almanac_repo.py`

**Interfaces:**
- Consumes: `AlmanacEntry` from `app.schemas.almanac` (Task 1); `tea_repo.read_seed_catalogue()`
  from `app.repositories.tea_repo` (existing) for the cross-check test.
- Produces: `read_seed_entries() -> tuple[AlmanacEntry, ...]` in `app.repositories.almanac_repo`,
  cached, used by Task 3.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_almanac_repo.py
"""Loading and merging the Almanac's seeded per-country JSON files."""

from __future__ import annotations

from app.repositories import almanac_repo as repo
from app.repositories import tea_repo


def test_read_seed_entries_merges_every_country_file() -> None:
    entries = repo.read_seed_entries()
    countries = {e.country for e in entries}
    assert "China" in countries
    assert "Japan" in countries


def test_read_seed_entries_includes_known_teas() -> None:
    ids = {e.catalogue_node_id for e in repo.read_seed_entries()}
    assert "green.longjing" in ids
    assert "green.japanese.matcha" in ids


def test_every_seed_entry_references_a_real_catalogue_node() -> None:
    """A typo'd catalogue_node_id in a seed file must fail fast, not ship."""
    catalogue_ids = {n.id for n in tea_repo.read_seed_catalogue()}
    for entry in repo.read_seed_entries():
        assert entry.catalogue_node_id in catalogue_ids, entry.catalogue_node_id


def test_read_seed_entries_is_cached() -> None:
    assert repo.read_seed_entries() is repo.read_seed_entries()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_almanac_repo.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.repositories.almanac_repo'`

- [ ] **Step 3: Write the seed data files**

```json
// backend/app/data/almanac/china.json
[
  {
    "catalogue_node_id": "green.longjing",
    "country": "China",
    "reading": "Lóngjǐng",
    "summary": "A flat, pan-fired green tea from the hills around West Lake in Hangzhou, Zhejiang. The leaves are wok-fired by hand into a smooth, sword-like flat shape, which gives Longjing its characteristic chestnut-like sweetness and lack of the grassy bitterness common in steamed greens. Widely regarded as China's most famous green tea.",
    "brewing": { "leaf_grams": 3, "water_temp_c": 80, "steep_seconds": [30, 45, 60] }
  },
  {
    "catalogue_node_id": "white.fuding.bai-hao-yinzhen",
    "country": "China",
    "reading": "Bái Háo Yínzhēn",
    "summary": "Silver Needle, the most minimally processed of China's white teas: only the unopened downy buds are picked, then simply withered and dried with no rolling or shaping. The dense white down gives the dry leaf a silvery sheen and the liquor a delicate, faintly sweet, honeyed character.",
    "brewing": { "leaf_grams": 5, "water_temp_c": 90, "steep_seconds": [45, 60, 90, 120] }
  },
  {
    "catalogue_node_id": "oolong.anxi.tieguanyin",
    "country": "China",
    "reading": "Tiěguānyīn",
    "summary": "Iron Goddess of Mercy, a lightly to moderately oxidized oolong from Anxi, Fujian, rolled into tight, hard pellets that slowly unfurl over several infusions. Modern Anxi Tieguanyin is typically processed toward a greener, floral style with an orchid-like aroma rather than the darker, more roasted style once traditional.",
    "brewing": { "leaf_grams": 6, "water_temp_c": 95, "steep_seconds": [20, 25, 30, 40] }
  },
  {
    "catalogue_node_id": "oolong.wuyi-yancha.da-hong-pao",
    "country": "China",
    "reading": "Dà Hóng Páo",
    "summary": "Big Red Robe, the best-known of the Wuyi \"rock teas\" (yancha) grown among the mineral-rich cliffs of Wuyi Shan, Fujian. A heavily oxidized, charcoal-roasted, twisted-leaf oolong prized for its \"yan yun\" (rock rhyme) — a mineral, roasted-fruit depth said to come from the cliff-face soil.",
    "brewing": { "leaf_grams": 8, "water_temp_c": 100, "steep_seconds": [20, 25, 30, 45] }
  },
  {
    "catalogue_node_id": "red.dianhong",
    "country": "China",
    "reading": "Diān Hóng",
    "summary": "A fully oxidized black (\"red\") tea from Yunnan, made from the region's large-leaf varietal. The best grades are golden-tipped, giving a bright coppery liquor with a naturally sweet, malty, sometimes honeyed character and little astringency.",
    "brewing": { "leaf_grams": 4, "water_temp_c": 95, "steep_seconds": [15, 20, 30, 45] }
  },
  {
    "catalogue_node_id": "dark.sheng-puerh",
    "country": "China",
    "reading": "Shēng Pǔ'ěr",
    "summary": "Raw pu-erh: sun-dried Yunnan large-leaf tea (maocha) that is steamed and compressed, most often into cakes, then aged. Young sheng is bright, bitter and astringent with floral or fruity notes; years of aging mellow and deepen it, driven by slow oxidation and microbial activity in storage.",
    "brewing": { "leaf_grams": 7, "water_temp_c": 100, "steep_seconds": [10, 15, 20, 30] }
  }
]
```

```json
// backend/app/data/almanac/japan.json
[
  {
    "catalogue_node_id": "green.japanese.sencha",
    "country": "Japan",
    "reading": "sencha",
    "summary": "Japan's everyday green tea: leaves are steamed shortly after picking, which halts oxidation quickly and preserves a vivid green color, then rolled into fine needles and dried. Steaming (rather than the pan-firing used in China) gives sencha its characteristic vegetal, grassy-sweet flavor.",
    "brewing": { "leaf_grams": 4, "water_temp_c": 70, "steep_seconds": [60, 30, 45] }
  },
  {
    "catalogue_node_id": "green.japanese.gyokuro",
    "country": "Japan",
    "reading": "gyokuro",
    "summary": "A shaded green tea: the bushes are covered for roughly the last three weeks before harvest, which lowers catechin (bitterness) production and raises theanine, giving gyokuro an intensely savory, sweet, umami-rich character quite unlike sun-grown sencha. Traditionally brewed with a lot of leaf and very little, cool water.",
    "brewing": { "leaf_grams": 10, "water_temp_c": 55, "steep_seconds": [90, 30, 45] }
  },
  {
    "catalogue_node_id": "green.japanese.matcha",
    "country": "Japan",
    "reading": "matcha",
    "summary": "Shade-grown tea leaves (tencha) that are steamed, dried, and stone-ground into a fine powder, then whisked directly into water rather than steeped and strained. Central to Japanese tea ceremony (chanoyu). Flavor is intensely vegetal and umami, with body and bitterness varying widely by grade.",
    "brewing": { "leaf_grams": 2, "water_temp_c": 80, "steep_seconds": [] }
  },
  {
    "catalogue_node_id": "green.japanese.hojicha",
    "country": "Japan",
    "reading": "hōjicha",
    "summary": "Green tea, typically bancha or sencha leaf and stems, roasted at high heat after processing. Roasting turns the leaf reddish-brown and destroys most of the catechins responsible for bitterness, giving hojicha a toasty, nutty, low-caffeine cup that tolerates near-boiling water well.",
    "brewing": { "leaf_grams": 5, "water_temp_c": 95, "steep_seconds": [30, 30] }
  }
]
```

- [ ] **Step 4: Write the repository**

```python
# backend/app/repositories/almanac_repo.py
"""Filesystem read for the Cha Dao Almanac's seeded entries.

Read-only: entries ship in `app/data/almanac/*.json`, one file per country,
each a flat JSON array of `AlmanacEntry`. This module is the only code that
touches the filesystem for the Almanac — mirrors
`tea_repo.read_seed_catalogue`.
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path

from app.schemas.almanac import AlmanacEntry

_SEED_DIR = Path(__file__).resolve().parents[1] / "data" / "almanac"


@lru_cache(maxsize=1)
def read_seed_entries() -> tuple[AlmanacEntry, ...]:
    """Every seeded Almanac entry across all country files, read once."""
    entries: list[AlmanacEntry] = []
    for path in sorted(_SEED_DIR.glob("*.json")):
        raw = json.loads(path.read_text(encoding="utf-8"))
        entries.extend(AlmanacEntry.model_validate(item) for item in raw)
    return tuple(entries)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_almanac_repo.py -v`
Expected: PASS (4 tests)

- [ ] **Step 6: Format and lint**

Run: `cd backend && black app/repositories/almanac_repo.py tests/test_almanac_repo.py && ruff check app/repositories/almanac_repo.py tests/test_almanac_repo.py`
Expected: no changes needed / no errors

- [ ] **Step 7: Commit**

```bash
git add backend/app/data/almanac backend/app/repositories/almanac_repo.py backend/tests/test_almanac_repo.py
git commit -m "feat(tea): seed Almanac entries for 10 well-known China/Japan teas"
```

---

## Task 3: Service — filtering, search, catalogue resolution

**Files:**
- Create: `backend/app/services/almanac_service.py`
- Test: `backend/tests/test_almanac_service.py`

**Interfaces:**
- Consumes: `almanac_repo.read_seed_entries()` (Task 2); `tea_catalogue_service.merged_nodes(username)`
  and `tea_catalogue_service.node_index(nodes)` (existing, from `app.services.tea_catalogue_service`).
- Produces: `list_entries(username: str, country: str | None = None, q: str | None = None) ->
  list[AlmanacEntryView]` and `get_entry(username: str, catalogue_node_id: str) -> AlmanacEntryView`
  (raises `FileNotFoundError`) in `app.services.almanac_service`, used by Task 4.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_almanac_service.py
"""Filtering, searching, and catalogue resolution for Almanac entries."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.repositories import almanac_repo as repo
from app.repositories import tea_repo
from app.schemas.almanac import AlmanacEntry
from app.services import almanac_service as service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(tea_repo.settings, "data_dir", tmp_path)


def test_list_entries_returns_every_seeded_entry_resolved() -> None:
    views = service.list_entries("alice")
    longjing = next(v for v in views if v.catalogue_node_id == "green.longjing")
    assert longjing.name == "Longjing"
    assert longjing.name_zh == "龍井"


def test_list_entries_filters_by_country_case_insensitively() -> None:
    views = service.list_entries("alice", country="japan")
    assert views
    assert all(v.country == "Japan" for v in views)


def test_list_entries_filters_by_country_with_no_matches_returns_empty() -> None:
    assert service.list_entries("alice", country="Atlantis") == []


def test_list_entries_search_matches_summary_case_insensitively() -> None:
    views = service.list_entries("alice", q="SHADED GREEN")
    ids = {v.catalogue_node_id for v in views}
    assert "green.japanese.gyokuro" in ids


def test_list_entries_search_matches_native_script() -> None:
    views = service.list_entries("alice", q="龍井")
    ids = {v.catalogue_node_id for v in views}
    assert "green.longjing" in ids


def test_list_entries_drops_an_entry_whose_catalogue_node_no_longer_resolves(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Review Focus: a broken link must not break the whole listing."""
    broken = AlmanacEntry(catalogue_node_id="gone.for.good", country="Nowhere", summary="x")
    monkeypatch.setattr(repo, "read_seed_entries", lambda: (broken,))

    assert service.list_entries("alice") == []


def test_get_entry_returns_the_resolved_view() -> None:
    view = service.get_entry("alice", "green.japanese.matcha")
    assert view.name == "Matcha"
    assert view.brewing.steep_seconds == []


def test_get_entry_raises_not_found_for_an_unknown_id() -> None:
    with pytest.raises(FileNotFoundError):
        service.get_entry("alice", "does.not.exist")


def test_get_entry_raises_not_found_when_the_node_cannot_resolve(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    broken = AlmanacEntry(catalogue_node_id="gone.for.good", country="Nowhere", summary="x")
    monkeypatch.setattr(repo, "read_seed_entries", lambda: (broken,))

    with pytest.raises(FileNotFoundError):
        service.get_entry("alice", "gone.for.good")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_almanac_service.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.almanac_service'`

- [ ] **Step 3: Write the service**

```python
# backend/app/services/almanac_service.py
"""Business logic for the Cha Dao Almanac.

Read-only: filters and searches the seeded entries, resolving each one's
name, native script, and default origin from its linked catalogue node.
Raises stdlib exceptions only; the router translates them.
"""

from __future__ import annotations

from app.repositories import almanac_repo as repo
from app.schemas.almanac import AlmanacEntry, AlmanacEntryView
from app.schemas.tea import CatalogueNode
from app.services import tea_catalogue_service as catalogue


def _view(entry: AlmanacEntry, index: dict[str, CatalogueNode]) -> AlmanacEntryView | None:
    node = index.get(entry.catalogue_node_id)
    if node is None:
        return None
    return AlmanacEntryView(
        **entry.model_dump(),
        name=node.name,
        name_zh=node.name_zh,
        default_origin=node.default_origin,
    )


def list_entries(
    username: str, country: str | None = None, q: str | None = None
) -> list[AlmanacEntryView]:
    """Every entry whose catalogue node still resolves, optionally filtered.

    An entry pointing at a node that no longer exists is dropped rather than
    failing the whole list — the same defensive rule `resolve_class` applies
    to a tea's classification (Review Focus: a broken link must not break
    the page for everything else).
    """
    index = catalogue.node_index(catalogue.merged_nodes(username))
    views = [v for entry in repo.read_seed_entries() if (v := _view(entry, index)) is not None]

    if country:
        needle = country.strip().casefold()
        views = [v for v in views if v.country.casefold() == needle]

    if q:
        needle = q.strip().casefold()
        views = [
            v
            for v in views
            if needle in v.name.casefold()
            or needle in v.name_zh.casefold()
            or needle in v.summary.casefold()
        ]

    return views


def get_entry(username: str, catalogue_node_id: str) -> AlmanacEntryView:
    index = catalogue.node_index(catalogue.merged_nodes(username))
    for entry in repo.read_seed_entries():
        if entry.catalogue_node_id == catalogue_node_id:
            view = _view(entry, index)
            if view is not None:
                return view
            break
    raise FileNotFoundError(f"No almanac entry for catalogue node {catalogue_node_id!r}")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_almanac_service.py -v`
Expected: PASS (9 tests)

- [ ] **Step 5: Format and lint**

Run: `cd backend && black app/services/almanac_service.py tests/test_almanac_service.py && ruff check app/services/almanac_service.py tests/test_almanac_service.py`
Expected: no changes needed / no errors

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/almanac_service.py backend/tests/test_almanac_service.py
git commit -m "feat(tea): add Almanac filtering, search, and catalogue resolution"
```

---

## Task 4: Router — `/api/tea/almanac`

**Files:**
- Modify: `backend/app/routers/tea.py`
- Test: `backend/tests/test_almanac_api.py`

**Interfaces:**
- Consumes: `almanac_service.list_entries` / `almanac_service.get_entry` (Task 3);
  `AlmanacEntryView` (Task 1).
- Produces: `GET /api/tea/almanac?country=&q=` and `GET /api/tea/almanac/{catalogue_node_id}` HTTP
  routes, consumed by Task 5's store.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_almanac_api.py
"""The /api/tea/almanac surface: status codes, filters, and 404s."""

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


def test_list_almanac_returns_seeded_entries() -> None:
    response = client.get("/api/tea/almanac")
    assert response.status_code == 200
    body = response.json()
    assert any(e["catalogue_node_id"] == "green.longjing" for e in body)


def test_list_almanac_filters_by_country() -> None:
    response = client.get("/api/tea/almanac", params={"country": "Japan"})
    assert response.status_code == 200
    body = response.json()
    assert body
    assert all(e["country"] == "Japan" for e in body)


def test_list_almanac_filters_by_search_text() -> None:
    response = client.get("/api/tea/almanac", params={"q": "West Lake"})
    assert response.status_code == 200
    ids = {e["catalogue_node_id"] for e in response.json()}
    assert "green.longjing" in ids


def test_get_almanac_entry_returns_the_entry() -> None:
    response = client.get("/api/tea/almanac/oolong.anxi.tieguanyin")
    assert response.status_code == 200
    assert response.json()["name"] == "Tieguanyin"


def test_get_almanac_entry_404s_for_an_unknown_id() -> None:
    response = client.get("/api/tea/almanac/does.not.exist")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_almanac_api.py -v`
Expected: FAIL — `404` where `200` expected (no such route yet)

- [ ] **Step 3: Add the routes**

Modify `backend/app/routers/tea.py`: add two imports near the top —

```python
from app.schemas.almanac import AlmanacEntryView
from app.services import almanac_service
```

— and append these two routes at the end of the file:

```python
@router.get("/almanac", response_model=list[AlmanacEntryView])
def list_almanac(
    country: str | None = None,
    q: str | None = None,
    current_user: str = Depends(get_current_user),
) -> list[AlmanacEntryView]:
    return almanac_service.list_entries(current_user, country=country, q=q)


@router.get("/almanac/{catalogue_node_id}", response_model=AlmanacEntryView)
def get_almanac_entry(
    catalogue_node_id: str, current_user: str = Depends(get_current_user)
) -> AlmanacEntryView:
    try:
        return almanac_service.get_entry(current_user, catalogue_node_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Almanac entry not found") from exc
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && .venv/bin/pytest tests/test_almanac_api.py -v`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full backend test suite**

Run: `cd backend && .venv/bin/pytest`
Expected: PASS, no regressions in `test_tea_*.py`

- [ ] **Step 6: Format and lint**

Run: `cd backend && black app/routers/tea.py tests/test_almanac_api.py && ruff check app/routers/tea.py tests/test_almanac_api.py`
Expected: no changes needed / no errors

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/tea.py backend/tests/test_almanac_api.py
git commit -m "feat(tea): expose GET /api/tea/almanac list and detail routes"
```

---

## Task 5: Frontend types + `useTeaAlmanacStore`

**Files:**
- Modify: `frontend/src/apps/tea/types.ts`
- Create: `frontend/src/apps/tea/stores/useTeaAlmanacStore.ts`
- Test: `frontend/src/apps/tea/stores/useTeaAlmanacStore.spec.ts`

**Interfaces:**
- Consumes: `api.get` from `@/composables/useApi` (existing).
- Produces: `AlmanacEntryView`, `BrewingParameters` types in `@/apps/tea/types`; a
  `useTeaAlmanacStore` Pinia store exposing `entries: Ref<AlmanacEntryView[]>`,
  `loading: Ref<boolean>`, `error: Ref<string | null>`, and
  `fetchEntries(country?: string, q?: string): Promise<void>` — consumed by Tasks 6 and 7.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/apps/tea/stores/useTeaAlmanacStore.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {
    status = 0;
    detail = "";
  },
  api: { get: getMock },
}));

import { useTeaAlmanacStore } from "./useTeaAlmanacStore";
import type { AlmanacEntryView } from "@/apps/tea/types";

function entry(overrides: Partial<AlmanacEntryView> = {}): AlmanacEntryView {
  return {
    catalogue_node_id: "green.longjing",
    country: "China",
    reading: "Lóngjǐng",
    summary: "A flat, pan-fired green tea.",
    brewing: { leaf_grams: 3, water_temp_c: 80, steep_seconds: [30, 45, 60] },
    source: "seed",
    name: "Longjing",
    name_zh: "龍井",
    default_origin: "Xihu, Zhejiang",
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
});

describe("useTeaAlmanacStore", () => {
  it("fetchEntries with no filters requests the plain endpoint", async () => {
    getMock.mockResolvedValue([entry()]);
    const store = useTeaAlmanacStore();

    await store.fetchEntries();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac");
    expect(store.entries).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  it("fetchEntries builds a query string from country and search filters", async () => {
    getMock.mockResolvedValue([entry({ country: "Japan" })]);
    const store = useTeaAlmanacStore();

    await store.fetchEntries("Japan", "sencha");

    expect(getMock).toHaveBeenCalledWith("/tea/almanac?country=Japan&q=sencha");
  });

  it("omits an empty filter from the query string", async () => {
    getMock.mockResolvedValue([]);
    const store = useTeaAlmanacStore();

    await store.fetchEntries("China", "");

    expect(getMock).toHaveBeenCalledWith("/tea/almanac?country=China");
  });

  it("surfaces a rejected fetch and clears loading", async () => {
    getMock.mockRejectedValue(
      Object.assign(new Error("no"), { detail: "Couldn't load the almanac." }),
    );
    const store = useTeaAlmanacStore();

    await store.fetchEntries();

    expect(store.error).toContain("Couldn't load");
    expect(store.loading).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaAlmanacStore.spec.ts`
Expected: FAIL — cannot resolve `./useTeaAlmanacStore`

- [ ] **Step 3: Add the types**

Append to `frontend/src/apps/tea/types.ts`:

```typescript
export interface BrewingParameters {
  leaf_grams: number | null;
  water_temp_c: number | null;
  steep_seconds: number[];
}

export type AlmanacEntrySource = "seed" | "user";

export interface AlmanacEntryView {
  catalogue_node_id: string;
  country: string;
  reading: string;
  summary: string;
  brewing: BrewingParameters;
  source: AlmanacEntrySource;
  name: string;
  name_zh: string;
  default_origin: string;
}
```

- [ ] **Step 4: Write the store**

```typescript
// frontend/src/apps/tea/stores/useTeaAlmanacStore.ts
import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { AlmanacEntryView } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

function path(country: string, q: string): string {
  const params = new URLSearchParams();
  if (country) params.set("country", country);
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/tea/almanac?${qs}` : "/tea/almanac";
}

export const useTeaAlmanacStore = defineStore("tea-almanac", () => {
  const entries = ref<AlmanacEntryView[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchEntries(country = "", q = ""): Promise<void> {
    loading.value = true;
    try {
      entries.value = await api.get<AlmanacEntryView[]>(path(country, q));
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  return { entries, loading, error, fetchEntries };
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/apps/tea/stores/useTeaAlmanacStore.spec.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Lint and format**

Run: `cd frontend && npm run lint:fix && npm run format`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/apps/tea/types.ts frontend/src/apps/tea/stores/useTeaAlmanacStore.ts frontend/src/apps/tea/stores/useTeaAlmanacStore.spec.ts
git commit -m "feat(tea): add Almanac types and useTeaAlmanacStore"
```

---

## Task 6: `AlmanacPage` (browse + search) and routes

**Files:**
- Create: `frontend/src/apps/tea/pages/AlmanacPage.vue`
- Test: `frontend/src/apps/tea/pages/AlmanacPage.spec.ts`
- Modify: `frontend/src/router/routes.ts`

**Interfaces:**
- Consumes: `useTeaAlmanacStore` (Task 5).
- Produces: routes named `tea-almanac` (`/tea/almanac`) and `tea-almanac-entry`
  (`/tea/almanac/:catalogueNodeId`) — the latter's page comes from Task 7, but both route entries
  are added here since they share one file edit. `AlmanacPage`'s row click navigates to
  `tea-almanac-entry` with `params: { catalogueNodeId }`.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/apps/tea/pages/AlmanacPage.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push } = vi.hoisted(() => ({ getMock: vi.fn(), push: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import AlmanacPage from "./AlmanacPage.vue";
import type { AlmanacEntryView } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function entry(overrides: Partial<AlmanacEntryView> = {}): AlmanacEntryView {
  return {
    catalogue_node_id: "green.longjing",
    country: "China",
    reading: "Lóngjǐng",
    summary: "A flat, pan-fired green tea from West Lake.",
    brewing: { leaf_grams: 3, water_temp_c: 80, steep_seconds: [30, 45, 60] },
    source: "seed",
    name: "Longjing",
    name_zh: "龍井",
    default_origin: "Xihu, Zhejiang",
    ...overrides,
  };
}

function render() {
  return mount(AlmanacPage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("AlmanacPage", () => {
  it("lists every entry the initial load returns", async () => {
    getMock.mockResolvedValue([
      entry(),
      entry({ catalogue_node_id: "green.japanese.sencha", country: "Japan", name: "Sencha" }),
    ]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.findAll('[data-testid="almanac-row"]')).toHaveLength(2);
    expect(wrapper.get('[data-testid="almanac-count"]').text()).toBe("2 teas");
  });

  it("shows the empty state when nothing matches", async () => {
    getMock.mockResolvedValue([]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-empty"]').text()).toContain("No teas match");
  });

  it("offers every country seen in the initial load as a filter option", async () => {
    getMock.mockResolvedValue([entry(), entry({ catalogue_node_id: "x", country: "Japan" })]);
    const wrapper = render();
    await flushPromises();

    const options = wrapper
      .findAll('[data-testid="almanac-country"] option')
      .map((o) => o.text());
    expect(options).toEqual(["All countries", "China", "Japan"]);
  });

  it("refetches with the country filter when it changes", async () => {
    getMock.mockResolvedValue([entry()]);
    const wrapper = render();
    await flushPromises();
    getMock.mockClear();
    getMock.mockResolvedValue([entry()]);

    await wrapper.get('[data-testid="almanac-country"]').setValue("China");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac?country=China");
  });

  it("refetches with the search text when it changes", async () => {
    getMock.mockResolvedValue([entry()]);
    const wrapper = render();
    await flushPromises();
    getMock.mockClear();
    getMock.mockResolvedValue([entry()]);

    await wrapper.get('[data-testid="almanac-search"]').setValue("longjing");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac?q=longjing");
  });

  it("opens the entry's detail page when a row is tapped", async () => {
    getMock.mockResolvedValue([entry()]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="almanac-row"]').trigger("click");

    expect(push).toHaveBeenCalledWith({
      name: "tea-almanac-entry",
      params: { catalogueNodeId: "green.longjing" },
    });
  });

  it("surfaces an error and hides the empty state", async () => {
    getMock.mockRejectedValue(Object.assign(new Error("no"), { detail: "Couldn't load." }));
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-error"]').text()).toContain("Couldn't load");
    expect(wrapper.find('[data-testid="almanac-empty"]').exists()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/pages/AlmanacPage.spec.ts`
Expected: FAIL — cannot resolve `./AlmanacPage.vue`

- [ ] **Step 3: Write the page**

```vue
<!-- frontend/src/apps/tea/pages/AlmanacPage.vue -->
<template>
  <q-page class="almanac">
    <div class="almanac__scroll">
      <header class="almanac__header">
        <span class="almanac__title">Almanac</span>
        <span class="almanac__count" data-testid="almanac-count">{{ countLabel }}</span>
      </header>

      <div class="almanac__filters">
        <select
          class="almanac__country"
          data-testid="almanac-country"
          aria-label="Filter by country"
          v-model="country"
        >
          <option value="">All countries</option>
          <option v-for="c in availableCountries" :key="c" :value="c">{{ c }}</option>
        </select>
        <input
          class="almanac__search"
          data-testid="almanac-search"
          type="search"
          placeholder="Search teas"
          v-model="q"
        />
      </div>

      <div v-if="almanac.error" class="almanac__error" data-testid="almanac-error">
        {{ almanac.error }}
      </div>

      <p
        v-else-if="!almanac.loading && almanac.entries.length === 0"
        class="almanac__empty"
        data-testid="almanac-empty"
      >
        No teas match. Try a different search or country.
      </p>

      <ul v-else class="almanac__list">
        <li
          v-for="entry in almanac.entries"
          :key="entry.catalogue_node_id"
          class="almanac__row"
          data-testid="almanac-row"
          @click="open(entry.catalogue_node_id)"
        >
          <span class="almanac__row-name">
            {{ entry.name }}
            <span v-if="entry.name_zh" class="almanac__row-zh" lang="zh">{{ entry.name_zh }}</span>
          </span>
          <span class="almanac__row-country">{{ entry.country }}</span>
          <p class="almanac__row-summary">{{ entry.summary }}</p>
        </li>
      </ul>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useTeaAlmanacStore } from "../stores/useTeaAlmanacStore";

const router = useRouter();
const almanac = useTeaAlmanacStore();

const country = ref("");
const q = ref("");
const availableCountries = ref<string[]>([]);

const countLabel = computed(() =>
  almanac.entries.length === 1 ? "1 tea" : `${almanac.entries.length} teas`,
);

function open(catalogueNodeId: string): void {
  void router.push({ name: "tea-almanac-entry", params: { catalogueNodeId } });
}

watch([country, q], ([c, query]) => {
  void almanac.fetchEntries(c, query);
});

onMounted(async () => {
  await almanac.fetchEntries();
  availableCountries.value = Array.from(new Set(almanac.entries.map((e) => e.country))).sort();
});
</script>

<style scoped lang="scss">
.almanac {
  background: #17120e;
  position: relative;
  min-height: 100%;
}
.almanac__scroll {
  height: 100%;
  overflow-y: auto;
}
.almanac__header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: linear-gradient(#17120e 76%, rgba(23, 18, 14, 0));
  padding: 20px 18px 12px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.almanac__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
}
.almanac__count {
  color: #6b5f52;
  font-size: 13px;
}
.almanac__filters {
  display: flex;
  gap: 10px;
  padding: 0 18px 16px;
}
.almanac__country,
.almanac__search {
  background: #1e1712;
  border: 1px solid #241e19;
  color: #efe7da;
  font-size: 13.5px;
  font-family: inherit;
  padding: 8px 10px;
  border-radius: 3px;
}
.almanac__country {
  flex: none;
}
.almanac__search {
  flex: 1;
  min-width: 0;
}
.almanac__empty,
.almanac__error {
  color: #8b7a63;
  font-size: 14.5px;
  padding: 0 18px;
}
.almanac__error {
  background: #1e1712;
  border-left: 2px solid #e4d9c6;
  color: #efe7da;
  margin: 0 18px;
  padding: 12px 14px;
}
.almanac__list {
  list-style: none;
  margin: 0;
  padding: 0 18px 24px;
}
.almanac__row {
  padding: 14px 0;
  border-bottom: 1px solid #241e19;
  cursor: pointer;
}
.almanac__row-name {
  color: #efe7da;
  font-size: 15px;
  font-weight: 500;
}
.almanac__row-zh {
  color: #a99781;
  font-weight: 300;
  margin-left: 8px;
}
.almanac__row-country {
  display: block;
  color: #7a6244;
  font-size: 12px;
  margin-top: 2px;
}
.almanac__row-summary {
  color: #a99781;
  font-size: 13px;
  line-height: 1.4;
  margin: 6px 0 0;
}
</style>
```

- [ ] **Step 4: Register the routes**

Modify `frontend/src/router/routes.ts`: insert these two entries between the `tea/new` and
`tea/:teaId` entries (so the static `tea/almanac` path is declared before the dynamic
`tea/:teaId` one, matching how `tea/new` is already ordered):

```typescript
      {
        path: "tea/almanac",
        name: "tea-almanac",
        component: () => import("@/apps/tea/pages/AlmanacPage.vue"),
        meta: { title: "Almanac", requiresAuth: true },
      },
      {
        path: "tea/almanac/:catalogueNodeId",
        name: "tea-almanac-entry",
        component: () => import("@/apps/tea/pages/AlmanacEntryDetailPage.vue"),
        meta: { title: "Almanac", requiresAuth: true },
      },
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/apps/tea/pages/AlmanacPage.spec.ts`
Expected: PASS (7 tests)

Note: this step will fail to *build* until Task 7 creates `AlmanacEntryDetailPage.vue`, but the
`routes.ts` import is a lazy dynamic `import()` that Vite/vitest does not resolve eagerly, so the
unit test above passes without that file existing yet.

- [ ] **Step 6: Lint and format**

Run: `cd frontend && npm run lint:fix && npm run format`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/apps/tea/pages/AlmanacPage.vue frontend/src/apps/tea/pages/AlmanacPage.spec.ts frontend/src/router/routes.ts
git commit -m "feat(tea): add the Almanac browse/search page and its routes"
```

---

## Task 7: `AlmanacEntryDetailPage`

**Files:**
- Create: `frontend/src/apps/tea/pages/AlmanacEntryDetailPage.vue`
- Test: `frontend/src/apps/tea/pages/AlmanacEntryDetailPage.spec.ts`

**Interfaces:**
- Consumes: `useTeaAlmanacStore` (Task 5); route param `catalogueNodeId` from the `tea-almanac-entry`
  route (Task 6); shared styles from `./tea-page.scss` (existing).

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/apps/tea/pages/AlmanacEntryDetailPage.spec.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock },
}));
const back = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ back }),
  useRoute: () => ({ params: { catalogueNodeId: "green.longjing" } }),
}));

import AlmanacEntryDetailPage from "./AlmanacEntryDetailPage.vue";
import type { AlmanacEntryView } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function entry(overrides: Partial<AlmanacEntryView> = {}): AlmanacEntryView {
  return {
    catalogue_node_id: "green.longjing",
    country: "China",
    reading: "Lóngjǐng",
    summary: "A flat, pan-fired green tea from West Lake.",
    brewing: { leaf_grams: 3, water_temp_c: 80, steep_seconds: [30, 45, 60] },
    source: "seed",
    name: "Longjing",
    name_zh: "龍井",
    default_origin: "Xihu, Zhejiang",
    ...overrides,
  };
}

function render() {
  return mount(AlmanacEntryDetailPage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("AlmanacEntryDetailPage", () => {
  it("fetches and renders the entry when the store starts empty", async () => {
    getMock.mockResolvedValue([entry()]);
    const wrapper = render();
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac");
    expect(wrapper.get('[data-testid="almanac-entry-title"]').text()).toContain("Longjing");
    expect(wrapper.get('[data-testid="almanac-entry-country"]').text()).toBe("China");
    expect(wrapper.get('[data-testid="almanac-entry-grams"]').text()).toBe("3g");
    expect(wrapper.get('[data-testid="almanac-entry-temp"]').text()).toBe("80°C");
    expect(wrapper.get('[data-testid="almanac-entry-steeps"]').text()).toBe("30s, 45s, 60s");
  });

  it("shows 'Not recorded' for brewing fields the entry does not have", async () => {
    getMock.mockResolvedValue([
      entry({ brewing: { leaf_grams: null, water_temp_c: null, steep_seconds: [] } }),
    ]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-entry-grams"]').text()).toBe("Not recorded");
    expect(wrapper.get('[data-testid="almanac-entry-temp"]').text()).toBe("Not recorded");
    expect(wrapper.get('[data-testid="almanac-entry-steeps"]').text()).toBe("Not recorded");
  });

  it("shows a missing message when no entry matches the route id", async () => {
    getMock.mockResolvedValue([entry({ catalogue_node_id: "green.japanese.sencha" })]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-entry-missing"]').text()).toContain(
      "No almanac entry",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/pages/AlmanacEntryDetailPage.spec.ts`
Expected: FAIL — cannot resolve `./AlmanacEntryDetailPage.vue`

- [ ] **Step 3: Write the page**

```vue
<!-- frontend/src/apps/tea/pages/AlmanacEntryDetailPage.vue -->
<template>
  <q-page class="tea-page">
    <header class="tea-page__bar">
      <button class="tea-page__back" @click="router.back()">← Almanac</button>
    </header>

    <p
      v-if="!entry && !almanac.loading"
      class="tea-page__missing"
      data-testid="almanac-entry-missing"
    >
      No almanac entry found for that tea.
    </p>

    <template v-if="entry">
      <p class="almanac-detail__country" data-testid="almanac-entry-country">
        {{ entry.country }}
      </p>
      <h1 class="tea-page__title" data-testid="almanac-entry-title">
        {{ entry.name }}
        <span v-if="entry.name_zh" class="tea-page__zh" lang="zh">{{ entry.name_zh }}</span>
      </h1>
      <p v-if="entry.reading" class="almanac-detail__reading" data-testid="almanac-entry-reading">
        {{ entry.reading }}
      </p>

      <p class="almanac-detail__summary" data-testid="almanac-entry-summary">
        {{ entry.summary }}
      </p>

      <section class="almanac-detail__brewing">
        <h2 class="almanac-detail__heading">Suggested brewing</h2>
        <dl class="almanac-detail__params">
          <dt>Leaf</dt>
          <dd data-testid="almanac-entry-grams">{{ gramsLabel }}</dd>
          <dt>Water</dt>
          <dd data-testid="almanac-entry-temp">{{ tempLabel }}</dd>
          <dt>Infusions</dt>
          <dd data-testid="almanac-entry-steeps">{{ steepsLabel }}</dd>
        </dl>
      </section>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTeaAlmanacStore } from "../stores/useTeaAlmanacStore";

const route = useRoute();
const router = useRouter();
const almanac = useTeaAlmanacStore();

const catalogueNodeId = computed(() => String(route.params.catalogueNodeId));
const entry = computed(
  () => almanac.entries.find((e) => e.catalogue_node_id === catalogueNodeId.value) ?? null,
);

const gramsLabel = computed(() => {
  const grams = entry.value?.brewing.leaf_grams ?? null;
  return grams !== null ? `${grams}g` : "Not recorded";
});
const tempLabel = computed(() => {
  const temp = entry.value?.brewing.water_temp_c ?? null;
  return temp !== null ? `${temp}°C` : "Not recorded";
});
const steepsLabel = computed(() => {
  const seconds = entry.value?.brewing.steep_seconds ?? [];
  return seconds.length === 0 ? "Not recorded" : seconds.map((s) => `${s}s`).join(", ");
});

onMounted(() => {
  if (almanac.entries.length === 0) void almanac.fetchEntries();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.almanac-detail__country {
  color: #7a6244;
  font-size: 12px;
  padding: 0 18px;
  margin: 16px 0 0;
}
.almanac-detail__reading {
  color: #a99781;
  font-size: 14px;
  padding: 0 18px;
  margin: 4px 0 0;
  font-style: italic;
}
.almanac-detail__summary {
  color: #e4d9c6;
  font-size: 14.5px;
  line-height: 1.5;
  padding: 16px 18px 0;
  margin: 0;
}
.almanac-detail__brewing {
  padding: 22px 18px 0;
}
.almanac-detail__heading {
  color: #efe7da;
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 10px;
}
.almanac-detail__params {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
  margin: 0;
}
.almanac-detail__params dt {
  color: #8b7a63;
  font-size: 13px;
}
.almanac-detail__params dd {
  color: #efe7da;
  font-size: 13px;
  margin: 0;
}
</style>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/apps/tea/pages/AlmanacEntryDetailPage.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS, no regressions

- [ ] **Step 6: Lint and format**

Run: `cd frontend && npm run lint:fix && npm run format`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/apps/tea/pages/AlmanacEntryDetailPage.vue frontend/src/apps/tea/pages/AlmanacEntryDetailPage.spec.ts
git commit -m "feat(tea): add the Almanac entry detail page"
```

---

## Task 8: Reach the Almanac from the Cabinet

**Files:**
- Modify: `frontend/src/apps/tea/pages/CabinetPage.vue`
- Modify: `frontend/src/apps/tea/pages/CabinetPage.spec.ts`

**Interfaces:**
- Consumes: `tea-almanac` route name (Task 6).

- [ ] **Step 1: Write the failing test**

Append this test inside the existing `describe("CabinetPage", ...)` block in
`frontend/src/apps/tea/pages/CabinetPage.spec.ts` (the file already has `getMock`/`push` mocks and
a `mockApi` helper — no new imports needed):

```typescript
  it("opens the almanac from the header link", async () => {
    mockApi([]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="cabinet-almanac-link"]').trigger("click");

    expect(push).toHaveBeenCalledWith({ name: "tea-almanac" });
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/tea/pages/CabinetPage.spec.ts`
Expected: FAIL — `cabinet-almanac-link` not found

- [ ] **Step 3: Add the header link**

In `frontend/src/apps/tea/pages/CabinetPage.vue`, replace the header block:

```html
      <header class="cabinet__header">
        <span class="cabinet__title">Cabinet</span>
        <span class="cabinet__count" data-testid="cabinet-count">{{ countLabel }}</span>
      </header>
```

with:

```html
      <header class="cabinet__header">
        <span class="cabinet__title">Cabinet</span>
        <div class="cabinet__header-right">
          <button
            class="cabinet__almanac"
            data-testid="cabinet-almanac-link"
            aria-label="Open the Almanac"
            @click="openAlmanac"
          >
            Almanac
          </button>
          <span class="cabinet__count" data-testid="cabinet-count">{{ countLabel }}</span>
        </div>
      </header>
```

Add this function in the `<script setup>` block, next to `addTea`:

```typescript
function openAlmanac(): void {
  void router.push({ name: "tea-almanac" });
}
```

Add these rules to the `<style scoped lang="scss">` block, next to `.cabinet__count`:

```scss
.cabinet__header-right {
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.cabinet__almanac {
  background: transparent;
  border: 0;
  color: v-bind("GROUND.inkMuted");
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npx vitest run src/apps/tea/pages/CabinetPage.spec.ts`
Expected: PASS (all CabinetPage tests, including the new one)

- [ ] **Step 5: Lint and format**

Run: `cd frontend && npm run lint:fix && npm run format`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/tea/pages/CabinetPage.vue frontend/src/apps/tea/pages/CabinetPage.spec.ts
git commit -m "feat(tea): link to the Almanac from the Cabinet header"
```

---

## Task 9: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full backend suite**

Run: `cd backend && .venv/bin/pytest`
Expected: PASS, zero failures

- [ ] **Step 2: Run backend format/lint**

Run: `cd backend && black . && ruff check .`
Expected: no changes needed / no errors

- [ ] **Step 3: Run the full frontend suite**

Run: `cd frontend && npm test`
Expected: PASS, zero failures

- [ ] **Step 4: Run frontend lint/format**

Run: `cd frontend && npm run lint && npm run format`
Expected: no errors

- [ ] **Step 5: Manual smoke test**

Start both dev servers (`.vscode/tasks.json`'s "Launch App" task, or `uvicorn app.main:app --reload
--port 9000` with `DATA_DIR=./local-data` in `backend/`, and `npm run dev` in `frontend/`). In the
browser: open the Tea app's Cabinet, tap "Almanac" in the header, confirm all 10 seeded teas list
with name/native script/country/summary, filter by country and by a search term (e.g. "shaded"),
open one entry's detail page and confirm brewing parameters render, and open Matcha's detail page
specifically to confirm its infusions field reads "Not recorded" rather than breaking.

- [ ] **Step 6: Final commit (only if the smoke test surfaced a fix)**

```bash
git add -A
git commit -m "fix(tea): address findings from Almanac smoke test"
```

If the smoke test found nothing to fix, skip this step — Task 8's commit is the last one.
