# AMP Instance Game Identification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each AMP instance's actual game by parsing the Steam App ID from `DisplayImageSource` and resolving it to a name via Steam's cached `appdetails` API.

**Architecture:** `amp_service` parses the App ID into `Instance.steam_app_id`. A new `steam_service` (only module that talks to Steam) resolves App ID → name with a disk cache in a new `steam_repo` (`data_dir/steam/games.json`). The `GET /api/amp/instances` router enriches each instance's `game`. The frontend shows `game ?? module` in the row caption.

**Tech Stack:** FastAPI + httpx + pydantic (backend), Vue 3 / Quasar / Pinia / vitest (frontend), pytest (backend). JSON-file persistence.

**Spec:** `docs/superpowers/specs/2026-10-25-amp-instance-games-design.md`

---

## File Structure

**Backend**
- Modify `backend/app/schemas/amp.py` — add `steam_app_id`, `game` to `Instance`.
- Modify `backend/app/services/amp_service.py` — `_parse_steam_app_id` + set it in `_map_instance`.
- Create `backend/app/repositories/steam_repo.py` — Steam name cache file.
- Create `backend/app/services/steam_service.py` — resolve + cache game names.
- Modify `backend/app/routers/amp.py` — enrich `game` in `list_instances`.
- Modify `backend/tests/test_amp_service.py`, `backend/tests/test_amp_router.py`.
- Create `backend/tests/test_steam_repo.py`, `backend/tests/test_steam_service.py`.

**Frontend**
- Modify `frontend/src/apps/amp/types.ts` — add `steam_app_id`, `game`.
- Modify `frontend/src/apps/amp/stores/useAmpStore.spec.ts` — factory defaults.
- Modify `frontend/src/apps/amp/pages/InstancesPage.vue` — caption `game ?? module`.
- Modify `frontend/src/apps/amp/pages/InstancesPage.spec.ts` — factory + game-display tests.

Backend venv python (Windows): `D:/Jake/Code/application-dock/.venv/Scripts/python`. Run backend commands from `backend/`, frontend from `frontend/`.

---

## Task 1: Schema fields

**Files:** Modify `backend/app/schemas/amp.py`

Scaffolding only (type additions) — no test. Later tasks depend on these fields.

- [ ] **Step 1: Add fields to `Instance`**

In `backend/app/schemas/amp.py`, the `Instance` model currently ends with:

```python
    active_users: int | None = None
    max_users: int | None = None
    # Connect port configured for this instance, or None if not set yet.
    port: int | None = None
```

Add two fields after `port`:

```python
    active_users: int | None = None
    max_users: int | None = None
    # Connect port configured for this instance, or None if not set yet.
    port: int | None = None
    # Steam App ID parsed from AMP's DisplayImageSource, and the game name
    # resolved from it. Both None for non-game instances (e.g. the controller).
    steam_app_id: int | None = None
    game: str | None = None
```

- [ ] **Step 2: Verify existing tests still pass**

Run from `backend/`: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_service.py tests/test_amp_router.py -q`
Expected: PASS (new optional fields default to None).

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/amp.py
git commit -m "feat(amp): add steam_app_id and game to Instance schema"
```

---

## Task 2: Parse the Steam App ID in amp_service

**Files:**
- Modify: `backend/app/services/amp_service.py`
- Test: `backend/tests/test_amp_service.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_amp_service.py`:

```python
def test_parse_steam_app_id_from_steam_scheme() -> None:
    assert amp_service._parse_steam_app_id("steam:1604030") == 1604030


def test_parse_steam_app_id_from_apps_url() -> None:
    url = "url:https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1623730/header.jpg"
    assert amp_service._parse_steam_app_id(url) == 1623730


def test_parse_steam_app_id_none_for_missing_or_garbage() -> None:
    assert amp_service._parse_steam_app_id(None) is None
    assert amp_service._parse_steam_app_id("") is None
    assert amp_service._parse_steam_app_id("not-a-steam-source") is None


def test_map_instance_sets_steam_app_id(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "s"}
        return [
            {
                "AvailableInstances": [
                    {
                        "InstanceID": "i1",
                        "FriendlyName": "Pal",
                        "Module": "GenericModule",
                        "Running": True,
                        "Suspended": False,
                        "AppState": 20,
                        "Metrics": {},
                        "DisplayImageSource": "steam:1623730",
                    }
                ]
            }
        ]

    monkeypatch.setattr(amp_service, "_post_api", fake_post)
    result = amp_service.list_instances()
    assert result[0].steam_app_id == 1623730
```

- [ ] **Step 2: Run to verify failure**

Run from `backend/`: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_service.py -q`
Expected: FAIL (`_parse_steam_app_id` does not exist / `steam_app_id` is None).

- [ ] **Step 3: Implement**

In `backend/app/services/amp_service.py`, add `import re` to the imports near the top (after `import logging`):

```python
import logging
import re
```

Add the parser function immediately above `_map_instance`:

```python
_STEAM_APPS_RE = re.compile(r"/apps/(\d+)/")


def _parse_steam_app_id(display_image_source: Any) -> int | None:
    """The Steam App ID embedded in AMP's DisplayImageSource, or None.

    Two forms are seen in the wild: `steam:<id>` and an image URL containing
    `/apps/<id>/`. Anything else (including null) yields None.
    """
    if not isinstance(display_image_source, str):
        return None
    if display_image_source.startswith("steam:"):
        rest = display_image_source.removeprefix("steam:")
        return int(rest) if rest.isdigit() else None
    match = _STEAM_APPS_RE.search(display_image_source)
    return int(match.group(1)) if match else None
```

Then set it in `_map_instance` — change the `return Instance(...)` to add the field:

```python
def _map_instance(raw: dict[str, Any]) -> Instance:
    metrics = raw.get("Metrics") or {}
    users = metrics.get("Active Users") or {}
    return Instance(
        id=raw["InstanceID"],
        name=raw.get("FriendlyName") or raw.get("InstanceName") or raw["InstanceID"],
        module=raw.get("Module") or "",
        running=bool(raw.get("Running")),
        state=_state_label(raw.get("AppState"), raw.get("Suspended")),
        active_users=users.get("RawValue"),
        max_users=users.get("MaxValue"),
        steam_app_id=_parse_steam_app_id(raw.get("DisplayImageSource")),
    )
```

- [ ] **Step 4: Run to verify pass**

Run from `backend/`: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_service.py -q`
Expected: PASS (all old + 4 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/amp_service.py backend/tests/test_amp_service.py
git commit -m "feat(amp): parse Steam app id from DisplayImageSource"
```

---

## Task 3: Steam name cache repo

**Files:**
- Create: `backend/app/repositories/steam_repo.py`
- Test: `backend/tests/test_steam_repo.py`

Context: Repositories are the only fs code; use the shared `atomic_write_json`.
IMPORTANT: the whole pytest session shares one `DATA_DIR` (root `conftest.py`) and
only wipes `hotaru/` between tests, so the test MUST isolate `data_dir` per test
with an autouse fixture (as `test_shared_notes_repo.py` does), or it will pollute
and be polluted by other tests.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_steam_repo.py`:

```python
"""Unit tests for steam_repo. Each test gets its own empty data_dir."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.repositories import steam_repo


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


def test_read_names_missing_file_returns_empty() -> None:
    assert steam_repo.read_names() == {}


def test_write_then_read_round_trips() -> None:
    steam_repo.write_names({"1623730": "Palworld", "1604030": "V Rising"})
    assert steam_repo.read_names() == {"1623730": "Palworld", "1604030": "V Rising"}
```

- [ ] **Step 2: Run to verify failure**

Run from `backend/`: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_steam_repo.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.repositories.steam_repo'`.

- [ ] **Step 3: Implement**

Create `backend/app/repositories/steam_repo.py`:

```python
"""Filesystem cache for Steam game names, keyed by app id (as string).

The ONLY module that touches the Steam name cache file. Writes go through the
shared atomic writer.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import settings
from app.core.storage import atomic_write_json

_DIR = "steam"
_FILE = "games.json"


def _names_path() -> Path:
    return settings.data_dir / _DIR / _FILE


def read_names() -> dict[str, str]:
    """The cached app-id -> game-name map, or `{}` if nothing is cached yet."""
    try:
        raw = _names_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    data = json.loads(raw)
    return {str(key): str(value) for key, value in data.items()}


def write_names(names: dict[str, str]) -> None:
    """Persist the app-id -> name map atomically, creating `steam/` on first write."""
    atomic_write_json(_names_path(), names)
```

- [ ] **Step 4: Run to verify pass**

Run from `backend/`: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_steam_repo.py -q`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/steam_repo.py backend/tests/test_steam_repo.py
git commit -m "feat(steam): game-name cache repository"
```

---

## Task 4: Steam name resolution service

**Files:**
- Create: `backend/app/services/steam_service.py`
- Test: `backend/tests/test_steam_service.py`

Same `data_dir` isolation requirement as Task 3.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_steam_service.py`:

```python
"""Unit tests for steam_service. The HTTP seam (_fetch_app_name) is stubbed."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.core.config import settings
from app.repositories import steam_repo
from app.services import steam_service


@pytest.fixture(autouse=True)
def patch_data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "data_dir", tmp_path)


def test_game_name_returns_cached_without_fetching(monkeypatch: pytest.MonkeyPatch) -> None:
    steam_repo.write_names({"1623730": "Palworld"})

    def boom(app_id: int) -> str | None:
        raise AssertionError("should not fetch when cached")

    monkeypatch.setattr(steam_service, "_fetch_app_name", boom)
    assert steam_service.game_name(1623730) == "Palworld"


def test_game_name_fetches_and_caches_on_miss(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    def fake_fetch(app_id: int) -> str | None:
        calls["n"] += 1
        return "V Rising"

    monkeypatch.setattr(steam_service, "_fetch_app_name", fake_fetch)

    assert steam_service.game_name(1604030) == "V Rising"
    assert steam_repo.read_names() == {"1604030": "V Rising"}
    # Second call is served from cache — no second fetch.
    assert steam_service.game_name(1604030) == "V Rising"
    assert calls["n"] == 1


def test_game_name_returns_none_and_does_not_cache_on_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(steam_service, "_fetch_app_name", lambda app_id: None)
    assert steam_service.game_name(999999) is None
    assert steam_repo.read_names() == {}
```

- [ ] **Step 2: Run to verify failure**

Run from `backend/`: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_steam_service.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.steam_service'`.

- [ ] **Step 3: Implement**

Create `backend/app/services/steam_service.py`:

```python
"""Steam store lookups for game names, with a disk cache.

The ONLY module that talks to Steam. Resolves a Steam app id to its game name via
the public appdetails API and caches the result, so steady-state callers make no
external calls.

Layering: business logic. No HTTPException. Never raises on a lookup failure —
returns None so callers degrade gracefully.
"""

from __future__ import annotations

import httpx

from app.repositories import steam_repo

_TIMEOUT_SECONDS = 5.0
_APPDETAILS_URL = "https://store.steampowered.com/api/appdetails"


def _fetch_app_name(app_id: int) -> str | None:
    """The single HTTP seam; tests stub this. None on any failure."""
    try:
        response = httpx.get(
            _APPDETAILS_URL,
            params={"appids": app_id, "filters": "basic"},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    entry = data.get(str(app_id)) if isinstance(data, dict) else None
    if not isinstance(entry, dict) or not entry.get("success"):
        return None
    name = (entry.get("data") or {}).get("name")
    return name or None


def game_name(app_id: int) -> str | None:
    """The game's name for `app_id`, cached. None if it can't be resolved.

    A failed lookup is not cached, so a transient Steam outage is retried on the
    next call rather than permanently marking the game unknown.
    """
    cache = steam_repo.read_names()
    key = str(app_id)
    if key in cache:
        return cache[key] or None
    name = _fetch_app_name(app_id)
    if name:
        cache[key] = name
        steam_repo.write_names(cache)
    return name
```

- [ ] **Step 4: Run to verify pass**

Run from `backend/`: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_steam_service.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/steam_service.py backend/tests/test_steam_service.py
git commit -m "feat(steam): resolve game names via appdetails with disk cache"
```

---

## Task 5: Enrich game in the router

**Files:**
- Modify: `backend/app/routers/amp.py`
- Test: `backend/tests/test_amp_router.py`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_amp_router.py`. The service import line is currently
`from app.services import amp_ports_service, amp_service` — change it to
`from app.services import amp_ports_service, amp_service, steam_service`.

```python
def test_get_instances_enriches_game_from_steam(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        amp_service,
        "list_instances",
        lambda: [
            Instance(
                id="i1",
                name="Pal",
                module="GenericModule",
                running=True,
                state="Running",
                steam_app_id=1623730,
            ),
            Instance(id="ads", name="ADS01", module="ADS", running=True, state="Running"),
        ],
    )
    monkeypatch.setattr(amp_ports_service, "reconcile", lambda ids: {})
    monkeypatch.setattr(
        steam_service, "game_name", lambda app_id: "Palworld" if app_id == 1623730 else None
    )

    resp = client.get("/api/amp/instances")

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["game"] == "Palworld"
    assert body[1]["game"] is None  # no steam_app_id → not resolved
```

- [ ] **Step 2: Run to verify failure**

Run from `backend/`: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_router.py -q`
Expected: FAIL (`game` is None for i1 / `steam_service` import missing).

- [ ] **Step 3: Implement**

In `backend/app/routers/amp.py`, change the service import line:

```python
from app.services import amp_ports_service, amp_service, steam_service
```

Then in `list_instances`, extend the enrichment loop. It currently reads:

```python
    # Prune ports for instances that no longer exist, then join the survivors.
    ports = amp_ports_service.reconcile([inst.id for inst in instances])
    for inst in instances:
        inst.port = ports.get(inst.id)
    return instances
```

Change it to:

```python
    # Prune ports for instances that no longer exist, then join the survivors
    # and resolve each instance's game from its Steam app id (cached).
    ports = amp_ports_service.reconcile([inst.id for inst in instances])
    for inst in instances:
        inst.port = ports.get(inst.id)
        if inst.steam_app_id is not None:
            inst.game = steam_service.game_name(inst.steam_app_id)
    return instances
```

- [ ] **Step 4: Run to verify pass**

Run from `backend/`: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_router.py -q`
Expected: PASS (all old + 1 new).

- [ ] **Step 5: Format, lint, amp+steam tests**

Run from `backend/`:
`"D:/Jake/Code/application-dock/.venv/Scripts/python" -m black . && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m ruff check . && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_service.py tests/test_amp_router.py tests/test_steam_repo.py tests/test_steam_service.py -q`
Expected: black/ruff clean; all these tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/amp.py backend/tests/test_amp_router.py
git commit -m "feat(amp): resolve each instance's game name in the instances endpoint"
```

---

## Task 6: Frontend types + store spec

**Files:**
- Modify: `frontend/src/apps/amp/types.ts`
- Modify: `frontend/src/apps/amp/stores/useAmpStore.spec.ts`

Scaffolding (type change + keeping the spec's factory compiling). No store logic
changes — `game` flows through `api.get` untouched.

- [ ] **Step 1: Add fields to the type**

Replace `frontend/src/apps/amp/types.ts` with:

```ts
export interface AmpInstance {
  id: string;
  name: string;
  module: string;
  running: boolean;
  state: string;
  active_users: number | null;
  max_users: number | null;
  port: number | null;
  steam_app_id: number | null;
  game: string | null;
}
```

- [ ] **Step 2: Update the store spec's factory and add a passthrough assertion**

In `frontend/src/apps/amp/stores/useAmpStore.spec.ts`, the `inst` factory currently returns an object ending with `port: null,` before `...over`. Update the factory to include the new fields so it satisfies `AmpInstance`:

```ts
function inst(id: string, over: Partial<AmpInstance> = {}): AmpInstance {
  return {
    id,
    name: id,
    module: "Generic",
    running: false,
    state: "Stopped",
    active_users: null,
    max_users: null,
    port: null,
    steam_app_id: null,
    game: null,
    ...over,
  };
}
```

Then add this test inside the `describe("useAmpStore", ...)` block:

```ts
  it("fetch carries the resolved game name through", async () => {
    mockFetch([inst("i1", { game: "Palworld", steam_app_id: 1623730 })], "203.0.113.5");
    const store = useAmpStore();

    await store.fetch();

    expect(store.instances[0]!.game).toBe("Palworld");
  });
```

- [ ] **Step 3: Run the store spec**

Run from `frontend/`: `npx vitest run src/apps/amp/stores/useAmpStore.spec.ts`
Expected: PASS (all existing + the new test). (This is a type/passthrough change, so no strict red step.)

- [ ] **Step 4: Commit**

```bash
git add frontend/src/apps/amp/types.ts frontend/src/apps/amp/stores/useAmpStore.spec.ts
git commit -m "feat(amp): carry steam_app_id and game on AmpInstance"
```

---

## Task 7: Show the game on the Instances page

**Files:**
- Modify: `frontend/src/apps/amp/pages/InstancesPage.vue`
- Modify: `frontend/src/apps/amp/pages/InstancesPage.spec.ts`

- [ ] **Step 1: Write the failing tests**

In `frontend/src/apps/amp/pages/InstancesPage.spec.ts`, first update its `inst` factory (it has its own) to include the new fields — it currently ends with `port: null,` before `...over`:

```ts
function inst(id: string, over: Partial<AmpInstance> = {}): AmpInstance {
  return {
    id,
    name: id,
    module: "Generic",
    running: false,
    state: "Stopped",
    active_users: null,
    max_users: null,
    port: null,
    steam_app_id: null,
    game: null,
    ...over,
  };
}
```

Then add a new `describe` block (keep the existing `describe("InstancesPage copy link", ...)`):

```ts
describe("InstancesPage game display", () => {
  it("shows the resolved game name when present", () => {
    const { wrapper } = mountPage([inst("i1", { module: "GenericModule", game: "Palworld" })], null);
    expect(wrapper.text()).toContain("Palworld");
    expect(wrapper.text()).not.toContain("GenericModule");
  });

  it("falls back to the module when there is no game", () => {
    const { wrapper } = mountPage([inst("ads", { module: "ADS", game: null })], null);
    expect(wrapper.text()).toContain("ADS");
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run from `frontend/`: `npx vitest run src/apps/amp/pages/InstancesPage.spec.ts`
Expected: FAIL — the "shows Palworld / not GenericModule" test fails because the caption still renders `inst.module`.

- [ ] **Step 3: Implement**

In `frontend/src/apps/amp/pages/InstancesPage.vue`, the caption currently reads:

```vue
          <q-item-label caption>
            {{ inst.module }}
            <span v-if="inst.active_users !== null">
```

Change the first interpolation to prefer the game:

```vue
          <q-item-label caption>
            {{ inst.game ?? inst.module }}
            <span v-if="inst.active_users !== null">
```

- [ ] **Step 4: Run to verify pass**

Run from `frontend/`: `npx vitest run src/apps/amp/pages/InstancesPage.spec.ts`
Expected: PASS (copy-link tests + 2 new game-display tests).

- [ ] **Step 5: Full AMP frontend checks**

Run from `frontend/`: `npx vitest run src/apps/amp && npm run lint`
Expected: all AMP specs pass; eslint clean (ignore any pre-existing errors in files outside `src/apps/amp/`).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/amp/pages/InstancesPage.vue frontend/src/apps/amp/pages/InstancesPage.spec.ts
git commit -m "feat(amp): show instance game name, falling back to module"
```

---

## Final verification

- [ ] **Backend:** from `backend/`, `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m black . && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m ruff check . && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_service.py tests/test_amp_router.py tests/test_steam_repo.py tests/test_steam_service.py -q` → all green. (A full `pytest` run has two KNOWN pre-existing, unrelated failures on Windows — `test_core_storage.py` os.replace race — ignore those.)
- [ ] **Frontend:** from `frontend/`, `npx vitest run src/apps/amp && npm run lint` → AMP specs green, lint clean. (The full `npm test` has 15 pre-existing `kitchencraft.tokens.spec.ts` failures unrelated to this work — ignore.)
- [ ] **Manual smoke:** with AMP configured, open `/amp`; confirm game instances show their game name (e.g. "Palworld", "V Rising") instead of "GenericModule", and the ADS controller still shows "ADS".

---

## Self-review notes

- **Spec coverage:** parse App ID both formats + null (Task 2); cache repo (Task 3); resolve + cache-on-success-only service (Task 4); router enrichment skipping instances without an App ID (Task 5); schema fields (Task 1); frontend `game ?? module` display (Tasks 6/7). All covered.
- **Type consistency:** `steam_app_id` (int|None / number|null), `game` (str|None / string|null), `_parse_steam_app_id`, `_fetch_app_name`, `game_name`, `read_names`/`write_names` used identically across tasks.
- **No placeholders:** every code/test step has full content; test `data_dir` isolation included in Tasks 3 & 4 to avoid the shared-session-dir pollution that bit the previous feature.
