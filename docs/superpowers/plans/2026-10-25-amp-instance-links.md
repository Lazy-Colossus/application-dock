# AMP Instance Copy-Link + Port Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-instance "copy link" button (copies `<public_ip>:<port>`) to the AMP Instances page, a `/amp/config` page to set each instance's port, automatic pruning of ports for instances that no longer exist, and a `AMP_PUBLIC_IP` env var surfaced to the SPA at runtime.

**Architecture:** Ports persist as one JSON map (`data_dir/amp/ports.json`) behind a new repo + a new `amp_ports_service` — keeping `amp_service` the only module that talks to AMP. The `GET /api/amp/instances` router joins each instance's stored port and reconciles (prunes) stale entries on every call. The public IP is handed to the SPA via `GET /api/amp/config`, mirroring Listies' `maps-config`.

**Tech Stack:** FastAPI + pydantic-settings (backend), Vue 3 / Quasar / Pinia / vitest (frontend), pytest (backend tests). JSON-file persistence, no DB.

**Spec:** `docs/superpowers/specs/2026-10-25-amp-instance-links-design.md`

---

## File Structure

**Backend**
- Create `backend/app/repositories/amp_repo.py` — only module that touches `ports.json`.
- Create `backend/app/services/amp_ports_service.py` — port validation, reconcile, public IP.
- Create `backend/tests/test_amp_ports_service.py`, `backend/tests/test_amp_repo.py`.
- Modify `backend/app/core/config.py` — add `amp_public_ip`.
- Modify `backend/app/schemas/amp.py` — `Instance.port`, `AmpConfig`, `PortsPayload`.
- Modify `backend/app/routers/amp.py` — join port + reconcile; `GET /config`; `PUT /ports`.
- Modify `backend/tests/test_amp_router.py` — new endpoint tests.

**Frontend**
- Modify `frontend/src/apps/amp/types.ts` — `AmpInstance.port`.
- Modify `frontend/src/apps/amp/stores/useAmpStore.ts` — `publicIp`, config fetch, `linkFor`, `savePorts`.
- Modify `frontend/src/apps/amp/stores/useAmpStore.spec.ts` — new tests + `put` mock.
- Modify `frontend/src/apps/amp/pages/InstancesPage.vue` — copy button, gear link.
- Create `frontend/src/apps/amp/pages/InstancesPage.spec.ts`.
- Create `frontend/src/apps/amp/pages/ConfigPage.vue`, `ConfigPage.spec.ts`.
- Modify `frontend/src/router/routes.ts` — add `/amp/config` route.

---

## Task 1: Backend config var + schema changes

**Files:**
- Modify: `backend/app/core/config.py:55-57`
- Modify: `backend/app/schemas/amp.py`

Type/config scaffolding only — no behavior, so no test. Later tasks depend on these types.

- [ ] **Step 1: Add the `amp_public_ip` setting**

In `backend/app/core/config.py`, the AMP block currently reads:

```python
    amp_base_url: str = "http://localhost:8080"
    amp_username: str = ""
    amp_password: str = ""
```

Change it to:

```python
    amp_base_url: str = "http://localhost:8080"
    amp_username: str = ""
    amp_password: str = ""
    # Public IP/host the AMP instances are reachable on, for the copy-link
    # button. With this unset the copy-link buttons stay disabled and nothing
    # else changes. Handed to the SPA at runtime, never built into the bundle.
    amp_public_ip: str = ""
```

- [ ] **Step 2: Add schema fields**

In `backend/app/schemas/amp.py`, add `port` to `Instance` and two new models. The file becomes:

```python
"""Response shape for the AMP Instances app.

This is the app's own contract to the frontend, not AMP's raw API shape —
`amp_service` maps AMP's fields onto this.
"""

from __future__ import annotations

from pydantic import BaseModel


class Instance(BaseModel):
    id: str
    name: str
    module: str
    running: bool
    state: str
    active_users: int | None = None
    max_users: int | None = None
    # Connect port configured for this instance, or None if not set yet.
    port: int | None = None


class AmpConfig(BaseModel):
    public_ip: str | None = None


class PortsPayload(BaseModel):
    ports: dict[str, int]
```

- [ ] **Step 3: Verify it imports and existing tests still pass**

Run: `cd backend && DATA_DIR=./local-data .venv/bin/pytest tests/test_amp_service.py tests/test_amp_router.py -q`
(On Windows: `"D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_service.py tests/test_amp_router.py -q` from `backend/`.)
Expected: PASS (existing tests unaffected; `Instance` gains an optional field).

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/config.py backend/app/schemas/amp.py
git commit -m "feat(amp): add amp_public_ip setting and port/config schemas"
```

---

## Task 2: Port persistence repo

**Files:**
- Create: `backend/app/repositories/amp_repo.py`
- Test: `backend/tests/test_amp_repo.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_amp_repo.py`:

```python
"""Unit tests for amp_repo. settings.data_dir is a tmp dir (see conftest)."""

from __future__ import annotations

from app.repositories import amp_repo


def test_read_ports_missing_file_returns_empty() -> None:
    assert amp_repo.read_ports() == {}


def test_write_then_read_round_trips() -> None:
    amp_repo.write_ports({"i1": 27015, "i2": 25565})
    assert amp_repo.read_ports() == {"i1": 27015, "i2": 25565}


def test_read_coerces_values_to_int() -> None:
    # A hand-edited file may carry string ports; reads normalise to int.
    path = amp_repo._ports_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text('{"i1": "27015"}', encoding="utf-8")
    assert amp_repo.read_ports() == {"i1": 27015}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_repo.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.repositories.amp_repo'`.

- [ ] **Step 3: Write the repo**

Create `backend/app/repositories/amp_repo.py`:

```python
"""Filesystem persistence for AMP per-instance ports.

The ONLY module that touches the ports file — one JSON file holding a flat map
of instance id -> port. All writes go through the shared atomic writer.

Layering: callers MUST be services. Routers do not call this directly.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.core.config import settings
from app.core.storage import atomic_write_json

_APP_DIR = "amp"
_PORTS_FILE = "ports.json"


def _ports_path() -> Path:
    return settings.data_dir / _APP_DIR / _PORTS_FILE


def read_ports() -> dict[str, int]:
    """The stored instance-id -> port map, or `{}` if nothing is saved yet."""
    try:
        raw = _ports_path().read_text(encoding="utf-8")
    except FileNotFoundError:
        return {}
    data = json.loads(raw)
    return {str(key): int(value) for key, value in data.items()}


def write_ports(ports: dict[str, int]) -> None:
    """Persist the id -> port map atomically, creating `amp/` on first write."""
    atomic_write_json(_ports_path(), ports)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_repo.py -q`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/amp_repo.py backend/tests/test_amp_repo.py
git commit -m "feat(amp): ports.json repository"
```

---

## Task 3: Port config service

**Files:**
- Create: `backend/app/services/amp_ports_service.py`
- Test: `backend/tests/test_amp_ports_service.py`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_amp_ports_service.py`:

```python
"""Unit tests for amp_ports_service. settings.data_dir is a tmp dir."""

from __future__ import annotations

import pytest

from app.repositories import amp_repo
from app.services import amp_ports_service


def test_public_ip_none_when_unset(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_ports_service.settings, "amp_public_ip", "")
    assert amp_ports_service.public_ip() is None


def test_public_ip_returned_when_set(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_ports_service.settings, "amp_public_ip", "203.0.113.5")
    assert amp_ports_service.public_ip() == "203.0.113.5"


def test_set_ports_persists_and_returns() -> None:
    assert amp_ports_service.set_ports({"i1": 27015}) == {"i1": 27015}
    assert amp_repo.read_ports() == {"i1": 27015}


@pytest.mark.parametrize("bad", [0, 65536, -1])
def test_set_ports_rejects_out_of_range(bad: int) -> None:
    with pytest.raises(ValueError):
        amp_ports_service.set_ports({"i1": bad})


def test_set_ports_rejects_non_int() -> None:
    with pytest.raises(ValueError):
        amp_ports_service.set_ports({"i1": True})  # bool is not a valid port


def test_reconcile_prunes_stale_ids() -> None:
    amp_repo.write_ports({"i1": 27015, "gone": 25565})
    result = amp_ports_service.reconcile(["i1"])
    assert result == {"i1": 27015}
    assert amp_repo.read_ports() == {"i1": 27015}


def test_reconcile_keeps_live_and_does_not_rewrite_when_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    amp_repo.write_ports({"i1": 27015})
    writes = {"n": 0}
    real_write = amp_repo.write_ports
    monkeypatch.setattr(
        amp_repo,
        "write_ports",
        lambda ports: (writes.__setitem__("n", writes["n"] + 1), real_write(ports))[1],
    )
    result = amp_ports_service.reconcile(["i1", "i2"])
    assert result == {"i1": 27015}
    assert writes["n"] == 0  # nothing stale → no write
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_ports_service.py -q`
Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.amp_ports_service'`.

- [ ] **Step 3: Write the service**

Create `backend/app/services/amp_ports_service.py`:

```python
"""Per-instance port config for the AMP Instances app: persistence plus the
public-IP setting the copy-link button needs.

Separate from `amp_service`, which stays the only module that talks to AMP.
Raises stdlib `ValueError` on a bad port; the router translates it to HTTP.

Layering: business logic. No HTTPException here. The filesystem is reached only
through `amp_repo`.
"""

from __future__ import annotations

from collections.abc import Iterable

from app.core.config import settings
from app.core.locks import key_lock
from app.repositories import amp_repo

_MIN_PORT = 1
_MAX_PORT = 65535
# A single lock key shared by set_ports and reconcile so their read-modify-write
# cycles never interleave on the one ports file.
_LOCK_KEY = "amp:ports"


def public_ip() -> str | None:
    return settings.amp_public_ip or None


def get_ports() -> dict[str, int]:
    return amp_repo.read_ports()


def set_ports(ports: dict[str, int]) -> dict[str, int]:
    """Validate and persist the full id -> port map (replace, not merge)."""
    for instance_id, port in ports.items():
        # bool is an int subclass — reject it explicitly so True/False can't
        # masquerade as a port.
        if not isinstance(port, int) or isinstance(port, bool):
            raise ValueError(f"port for {instance_id!r} must be an integer")
        if not _MIN_PORT <= port <= _MAX_PORT:
            raise ValueError(
                f"port {port} for {instance_id!r} is out of range {_MIN_PORT}-{_MAX_PORT}"
            )
    with key_lock(_LOCK_KEY):
        amp_repo.write_ports(ports)
    return ports


def reconcile(live_ids: Iterable[str]) -> dict[str, int]:
    """Drop stored ports whose instance is gone; return the surviving map.

    Writes back only when something was actually pruned, so the common
    steady-state call (every instances poll) does no disk I/O.
    """
    live = set(live_ids)
    with key_lock(_LOCK_KEY):
        current = amp_repo.read_ports()
        pruned = {key: value for key, value in current.items() if key in live}
        if pruned != current:
            amp_repo.write_ports(pruned)
    return pruned
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_ports_service.py -q`
Expected: PASS (8 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/amp_ports_service.py backend/tests/test_amp_ports_service.py
git commit -m "feat(amp): port config service with validation and reconcile"
```

---

## Task 4: Router — join port, prune, config + ports endpoints

**Files:**
- Modify: `backend/app/routers/amp.py`
- Modify: `backend/tests/test_amp_router.py`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_amp_router.py` (keep the existing imports; add `amp_ports_service` to the service import line so it reads
`from app.services import amp_ports_service, amp_service`):

```python
def test_get_instances_joins_port_and_leaves_unconfigured_none(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        amp_service,
        "list_instances",
        lambda: [
            Instance(id="i1", name="MC", module="Minecraft", running=True, state="Running"),
            Instance(id="i2", name="V", module="Valheim", running=False, state="Stopped"),
        ],
    )
    monkeypatch.setattr(amp_ports_service, "reconcile", lambda ids: {"i1": 27015})

    resp = client.get("/api/amp/instances")

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["port"] == 27015
    assert body[1]["port"] is None


def test_get_config_returns_public_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_ports_service, "public_ip", lambda: "203.0.113.5")

    resp = client.get("/api/amp/config")

    assert resp.status_code == 200
    assert resp.json() == {"public_ip": "203.0.113.5"}


def test_put_ports_persists_and_returns(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}
    monkeypatch.setattr(
        amp_ports_service, "set_ports", lambda ports: seen.update(ports) or ports
    )

    resp = client.put("/api/amp/ports", json={"ports": {"i1": 27015}})

    assert resp.status_code == 200
    assert resp.json() == {"ports": {"i1": 27015}}
    assert seen == {"i1": 27015}


def test_put_ports_bad_port_returns_422(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(ports: dict) -> dict:
        raise ValueError("port 0 for 'i1' is out of range 1-65535")

    monkeypatch.setattr(amp_ports_service, "set_ports", boom)

    resp = client.put("/api/amp/ports", json={"ports": {"i1": 0}})

    assert resp.status_code == 422
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_router.py -q`
Expected: FAIL — new tests error (`amp_ports_service` import missing / `/config` + `/ports` return 404 or wrong shape).

- [ ] **Step 3: Rewrite the router**

Replace the whole body of `backend/app/routers/amp.py` with:

```python
"""AMP Instances HTTP layer.

Translates amp_service's stdlib-style exceptions to HTTP: not-configured -> 503,
AMP upstream failure (unreachable / login rejected / call refused) -> 502. Port
config is a separate concern handled by amp_ports_service.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user, require_app
from app.schemas.amp import AmpConfig, Instance, PortsPayload
from app.services import amp_ports_service, amp_service

router = APIRouter(prefix="/api/amp", tags=["amp"], dependencies=[Depends(require_app("amp"))])


@router.get("/instances", response_model=list[Instance])
def list_instances(_: str = Depends(get_current_user)) -> list[Instance]:
    try:
        instances = amp_service.list_instances()
    except amp_service.AmpNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except amp_service.AmpUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    # Prune ports for instances that no longer exist, then join the survivors.
    ports = amp_ports_service.reconcile([inst.id for inst in instances])
    for inst in instances:
        inst.port = ports.get(inst.id)
    return instances


@router.get("/config", response_model=AmpConfig)
def get_config(_: str = Depends(get_current_user)) -> AmpConfig:
    """Hand the SPA the public IP at runtime, so it is never built into the bundle."""
    return AmpConfig(public_ip=amp_ports_service.public_ip())


@router.put("/ports", response_model=PortsPayload)
def put_ports(payload: PortsPayload, _: str = Depends(get_current_user)) -> PortsPayload:
    try:
        stored = amp_ports_service.set_ports(payload.ports)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return PortsPayload(ports=stored)


@router.post("/instances/{instance_id}/start", status_code=202)
def start_instance(instance_id: str, _: str = Depends(get_current_user)) -> dict[str, str]:
    try:
        amp_service.start_instance(instance_id)
    except amp_service.AmpNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except amp_service.AmpUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"detail": "Instance start requested"}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest tests/test_amp_router.py -q`
Expected: PASS (all old + 4 new tests).

- [ ] **Step 5: Format, lint, full backend suite**

Run: `cd backend && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m black . && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m ruff check . && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest -q`
Expected: black/ruff clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/amp.py backend/tests/test_amp_router.py
git commit -m "feat(amp): join ports, prune stale, add /config and /ports endpoints"
```

---

## Task 5: Frontend types + store

**Files:**
- Modify: `frontend/src/apps/amp/types.ts`
- Modify: `frontend/src/apps/amp/stores/useAmpStore.ts`
- Modify: `frontend/src/apps/amp/stores/useAmpStore.spec.ts`

- [ ] **Step 1: Add the `port` field to the type**

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
}
```

- [ ] **Step 2: Update the store spec (failing tests first)**

Replace `frontend/src/apps/amp/stores/useAmpStore.spec.ts` with:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock },
}));

import { useAmpStore } from "./useAmpStore";
import type { AmpInstance } from "@/apps/amp/types";

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
    ...over,
  };
}

// fetch() calls GET /amp/instances then GET /amp/config. This helper wires both.
function mockFetch(instances: AmpInstance[], publicIp: string | null) {
  getMock.mockImplementation((path: string) => {
    if (path === "/amp/instances") return Promise.resolve(instances);
    if (path === "/amp/config") return Promise.resolve({ public_ip: publicIp });
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
});

describe("useAmpStore", () => {
  it("fetch loads instances plus public IP and clears loading", async () => {
    mockFetch([inst("i1", { port: 27015 })], "203.0.113.5");
    const store = useAmpStore();

    await store.fetch();

    expect(getMock).toHaveBeenCalledWith("/amp/instances");
    expect(getMock).toHaveBeenCalledWith("/amp/config");
    expect(store.instances).toHaveLength(1);
    expect(store.publicIp).toBe("203.0.113.5");
    expect(store.loading).toBe(false);
  });

  it("fetch tolerates a failed config call and leaves publicIp null", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/amp/instances") return Promise.resolve([inst("i1")]);
      return Promise.reject(new Error("no config"));
    });
    const store = useAmpStore();

    await store.fetch();

    expect(store.instances).toHaveLength(1);
    expect(store.publicIp).toBeNull();
    expect(store.error).toBeNull();
  });

  it("fetch keeps the last known list and sets error on failure", async () => {
    mockFetch([inst("i1")], null);
    const store = useAmpStore();
    await store.fetch();

    getMock.mockImplementation((path: string) => {
      if (path === "/amp/instances") return Promise.reject(new Error("AMP down"));
      return Promise.resolve({ public_ip: null });
    });
    await store.fetch();

    expect(store.instances).toHaveLength(1);
    expect(store.error).toBe("AMP down");
  });

  it("linkFor builds ip:port and is null when ip or port is missing", async () => {
    mockFetch([inst("i1", { port: 27015 }), inst("i2")], "203.0.113.5");
    const store = useAmpStore();
    await store.fetch();

    expect(store.linkFor(store.instances[0]!)).toBe("203.0.113.5:27015");
    expect(store.linkFor(store.instances[1]!)).toBeNull(); // no port

    mockFetch([inst("i1", { port: 27015 })], null);
    await store.fetch();
    expect(store.linkFor(store.instances[0]!)).toBeNull(); // no public IP
  });

  it("savePorts PUTs the map and refetches", async () => {
    putMock.mockResolvedValue({ ports: { i1: 27015 } });
    mockFetch([inst("i1", { port: 27015 })], "203.0.113.5");
    const store = useAmpStore();

    await store.savePorts({ i1: 27015 });

    expect(putMock).toHaveBeenCalledWith("/amp/ports", { ports: { i1: 27015 } });
    expect(getMock).toHaveBeenCalledWith("/amp/instances");
    expect(store.error).toBeNull();
  });

  it("savePorts sets error and does not refetch on failure", async () => {
    putMock.mockRejectedValue(new Error("422: bad port"));
    const store = useAmpStore();

    await store.savePorts({ i1: 0 });

    expect(store.error).toBe("422: bad port");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("start posts, refetches, and clears the starting flag", async () => {
    postMock.mockResolvedValue(undefined);
    mockFetch([inst("i1", { running: true, state: "Running" })], null);
    const store = useAmpStore();

    await store.start("i1");

    expect(postMock).toHaveBeenCalledWith("/amp/instances/i1/start");
    expect(getMock).toHaveBeenCalledWith("/amp/instances");
    expect(store.isStarting("i1")).toBe(false);
  });

  it("start sets error and clears the starting flag on failure", async () => {
    postMock.mockRejectedValue(new Error("nope"));
    const store = useAmpStore();

    await store.start("i1");

    expect(store.error).toBe("nope");
    expect(store.isStarting("i1")).toBe(false);
  });
});
```

- [ ] **Step 3: Run the spec to verify it fails**

Run: `cd frontend && npx vitest run src/apps/amp/stores/useAmpStore.spec.ts`
Expected: FAIL — `publicIp`, `linkFor`, `savePorts` not defined; config GET not made.

- [ ] **Step 4: Implement the store**

Replace `frontend/src/apps/amp/stores/useAmpStore.ts` with:

```ts
import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { AmpInstance } from "@/apps/amp/types";

export const useAmpStore = defineStore("amp", () => {
  const instances = ref<AmpInstance[]>([]);
  const publicIp = ref<string | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  // Ids with a start request in flight — drives per-row button spinner/disable.
  const starting = ref<string[]>([]);

  function isStarting(id: string): boolean {
    return starting.value.includes(id);
  }

  // The connect address for the copy-link button, or null when it can't be
  // formed (no public IP configured, or no port set for this instance).
  function linkFor(inst: AmpInstance): string | null {
    return publicIp.value && inst.port ? `${publicIp.value}:${inst.port}` : null;
  }

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      // The public IP is optional: a failed config call just leaves links off,
      // so it must not fail the whole load.
      const [list, config] = await Promise.all([
        api.get<AmpInstance[]>("/amp/instances"),
        api
          .get<{ public_ip: string | null }>("/amp/config")
          .catch(() => ({ public_ip: null })),
      ]);
      instances.value = list;
      publicIp.value = config.public_ip ?? null;
    } catch (e) {
      // A failed poll keeps the last known list rather than blanking the page.
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function savePorts(ports: Record<string, number>): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.put("/amp/ports", { ports });
      await fetch();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function start(id: string): Promise<void> {
    if (starting.value.includes(id)) return;
    starting.value.push(id);
    error.value = null;
    try {
      await api.post(`/amp/instances/${id}/start`);
      await fetch();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      starting.value = starting.value.filter((x) => x !== id);
    }
  }

  return {
    instances,
    publicIp,
    loading,
    error,
    starting,
    isStarting,
    linkFor,
    fetch,
    savePorts,
    start,
  };
});
```

- [ ] **Step 5: Run the spec to verify it passes**

Run: `cd frontend && npx vitest run src/apps/amp/stores/useAmpStore.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/amp/types.ts frontend/src/apps/amp/stores/useAmpStore.ts frontend/src/apps/amp/stores/useAmpStore.spec.ts
git commit -m "feat(amp): store publicIp, linkFor, and savePorts"
```

---

## Task 6: Instances page — copy-link button + gear link

**Files:**
- Modify: `frontend/src/apps/amp/pages/InstancesPage.vue`
- Create: `frontend/src/apps/amp/pages/InstancesPage.spec.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/apps/amp/pages/InstancesPage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import InstancesPage from "./InstancesPage.vue";
import { useAmpStore } from "@/apps/amp/stores/useAmpStore";
import type { AmpInstance } from "@/apps/amp/types";

const notifyMock = vi.fn();
vi.mock("quasar", () => ({ useQuasar: () => ({ notify: notifyMock }) }));

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
    ...over,
  };
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/amp", component: InstancesPage },
    { path: "/amp/config", component: { template: "<div />" } },
  ],
});

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-banner": { template: "<div><slot /></div>" },
  "q-space": { template: "<div />" },
  "q-chip": { template: "<div><slot /></div>" },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": { template: "<div><slot /></div>" },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": { template: "<div><slot /></div>" },
  "q-tooltip": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      '<button :disabled="disable || loading" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')">{{ label }}<slot /></button>',
    props: ["disable", "loading", "label", "icon"],
    emits: ["click"],
  },
};

function mountPage(instances: AmpInstance[], publicIp: string | null) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAmpStore();
  store.instances = instances;
  store.publicIp = publicIp;
  vi.spyOn(store, "fetch").mockResolvedValue();
  return {
    store,
    wrapper: mount(InstancesPage, { global: { plugins: [pinia, router], stubs: STUBS } }),
  };
}

beforeEach(() => {
  notifyMock.mockReset();
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("InstancesPage copy link", () => {
  it("disables the copy button when no port is configured", () => {
    const { wrapper } = mountPage([inst("i1")], "203.0.113.5");
    const btn = wrapper.get('[data-testid="copy-link"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables every copy button when no public IP is set", () => {
    const { wrapper } = mountPage([inst("i1", { port: 27015 })], null);
    const btn = wrapper.get('[data-testid="copy-link"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("copies ip:port and notifies when enabled", async () => {
    const { wrapper } = mountPage([inst("i1", { port: 27015 })], "203.0.113.5");
    await wrapper.get('[data-testid="copy-link"]').trigger("click");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("203.0.113.5:27015");
    expect(notifyMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/amp/pages/InstancesPage.spec.ts`
Expected: FAIL — no `[data-testid="copy-link"]` button exists yet.

- [ ] **Step 3: Update the page**

Replace `frontend/src/apps/amp/pages/InstancesPage.vue` with:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { useAmpStore } from "@/apps/amp/stores/useAmpStore";
import type { AmpInstance } from "@/apps/amp/types";

const store = useAmpStore();
const { instances, loading, error, publicIp } = storeToRefs(store);
const router = useRouter();
const $q = useQuasar();

const POLL_MS = 60_000;
let timer: ReturnType<typeof setInterval> | undefined;

function statusColor(state: string): string {
  switch (state) {
    case "Running":
      return "positive";
    case "Starting":
    case "Restarting":
    case "Configuring":
    case "Pre-start":
      return "info";
    case "Sleeping":
    case "Preparing for sleep":
    case "Waiting":
      return "warning";
    case "Failed":
      return "negative";
    default:
      return "grey";
  }
}

async function copyLink(inst: AmpInstance): Promise<void> {
  const link = store.linkFor(inst);
  if (!link) return;
  await navigator.clipboard.writeText(link);
  $q.notify({ message: "Copied", color: "positive", timeout: 1500 });
}

onMounted(() => {
  void store.fetch();
  timer = setInterval(() => void store.fetch(), POLL_MS);
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>

<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <div class="text-h5">AMP Instances</div>
      <q-space />
      <q-btn
        flat
        round
        icon="settings"
        aria-label="Configure ports"
        @click="router.push('/amp/config')"
      />
      <q-btn
        flat
        round
        icon="refresh"
        :loading="loading"
        aria-label="Refresh"
        @click="store.fetch()"
      />
    </div>

    <q-banner v-if="error" class="bg-negative text-white q-mb-md" rounded>
      {{ error }}
    </q-banner>

    <q-list v-if="instances.length" bordered separator>
      <q-item v-for="inst in instances" :key="inst.id">
        <q-item-section>
          <q-item-label>{{ inst.name }}</q-item-label>
          <q-item-label caption>
            {{ inst.module }}
            <span v-if="inst.active_users !== null">
              · {{ inst.active_users
              }}<span v-if="inst.max_users">/{{ inst.max_users }}</span> players
            </span>
          </q-item-label>
        </q-item-section>

        <q-item-section side>
          <q-chip :color="statusColor(inst.state)" text-color="white" dense>
            {{ inst.state }}
          </q-chip>
        </q-item-section>

        <q-item-section side>
          <q-btn
            flat
            round
            dense
            icon="content_copy"
            aria-label="Copy connect link"
            data-testid="copy-link"
            :disable="!store.linkFor(inst)"
            @click="copyLink(inst)"
          >
            <q-tooltip v-if="!store.linkFor(inst)">
              {{
                publicIp
                  ? "Set a port for this instance in config"
                  : "Set AMP_PUBLIC_IP to enable links"
              }}
            </q-tooltip>
          </q-btn>
        </q-item-section>

        <q-item-section side>
          <q-btn
            color="primary"
            label="Start"
            dense
            :disable="inst.running || store.isStarting(inst.id)"
            :loading="store.isStarting(inst.id)"
            @click="store.start(inst.id)"
          />
        </q-item-section>
      </q-item>
    </q-list>

    <div v-else-if="!loading && !error" class="text-grey text-center q-pa-xl">
      No AMP instances found.
    </div>
  </q-page>
</template>
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/apps/amp/pages/InstancesPage.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/apps/amp/pages/InstancesPage.vue frontend/src/apps/amp/pages/InstancesPage.spec.ts
git commit -m "feat(amp): copy-link button and config gear on instances page"
```

---

## Task 7: Config page + route

**Files:**
- Create: `frontend/src/apps/amp/pages/ConfigPage.vue`
- Create: `frontend/src/apps/amp/pages/ConfigPage.spec.ts`
- Modify: `frontend/src/router/routes.ts:241-246`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/apps/amp/pages/ConfigPage.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import ConfigPage from "./ConfigPage.vue";
import { useAmpStore } from "@/apps/amp/stores/useAmpStore";
import type { AmpInstance } from "@/apps/amp/types";

const notifyMock = vi.fn();
vi.mock("quasar", () => ({ useQuasar: () => ({ notify: notifyMock }) }));

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
    ...over,
  };
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/amp", component: { template: "<div />" } },
    { path: "/amp/config", component: ConfigPage },
  ],
});

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-banner": { template: "<div><slot /></div>" },
  "q-space": { template: "<div />" },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": { template: "<div><slot /></div>" },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "label", "type"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')">{{ label }}<slot /></button>',
    props: ["disable", "loading", "label", "icon"],
    emits: ["click"],
  },
};

function mountPage(instances: AmpInstance[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAmpStore();
  store.instances = instances;
  vi.spyOn(store, "fetch").mockResolvedValue();
  const savePorts = vi.spyOn(store, "savePorts").mockResolvedValue();
  return {
    store,
    savePorts,
    wrapper: mount(ConfigPage, { global: { plugins: [pinia, router], stubs: STUBS } }),
  };
}

beforeEach(() => {
  notifyMock.mockReset();
});

describe("ConfigPage", () => {
  it("prefills a port input per instance", () => {
    const { wrapper } = mountPage([inst("i1", { port: 27015 }), inst("i2")]);
    const inputs = wrapper.findAll('[data-testid^="port-"]');
    expect(inputs).toHaveLength(2);
    expect((wrapper.get('[data-testid="port-i1"]').element as HTMLInputElement).value).toBe(
      "27015",
    );
    expect((wrapper.get('[data-testid="port-i2"]').element as HTMLInputElement).value).toBe("");
  });

  it("saves the entered ports as integers, omitting blanks", async () => {
    const { wrapper, savePorts } = mountPage([inst("i1"), inst("i2")]);
    await wrapper.get('[data-testid="port-i1"]').setValue("27015");
    await wrapper.get('[data-testid="save-ports"]').trigger("click");
    expect(savePorts).toHaveBeenCalledWith({ i1: 27015 });
    expect(notifyMock).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/apps/amp/pages/ConfigPage.spec.ts`
Expected: FAIL — `ConfigPage.vue` does not exist.

- [ ] **Step 3: Create the page**

Create `frontend/src/apps/amp/pages/ConfigPage.vue`:

```vue
<script setup lang="ts">
import { ref, watch, onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { useAmpStore } from "@/apps/amp/stores/useAmpStore";

const store = useAmpStore();
const { instances, loading, error } = storeToRefs(store);
const router = useRouter();
const $q = useQuasar();

// Per-instance port input text, keyed by instance id. Strings because a q-input
// is text; parsed to ints on save.
const draft = ref<Record<string, string>>({});

watch(
  instances,
  () => {
    const next: Record<string, string> = {};
    for (const inst of instances.value) {
      next[inst.id] = inst.port != null ? String(inst.port) : "";
    }
    draft.value = next;
  },
  { immediate: true },
);

onMounted(() => void store.fetch());

async function save(): Promise<void> {
  const ports: Record<string, number> = {};
  for (const [id, text] of Object.entries(draft.value)) {
    const trimmed = text.trim();
    if (!trimmed) continue;
    const value = Number(trimmed);
    // Non-integers are dropped client-side; out-of-range integers are sent so
    // the backend's 1-65535 check can surface a precise error.
    if (Number.isInteger(value)) ports[id] = value;
  }
  await store.savePorts(ports);
  if (store.error) {
    $q.notify({ message: store.error, color: "negative" });
  } else {
    $q.notify({ message: "Ports saved", color: "positive", timeout: 1500 });
  }
}
</script>

<template>
  <q-page padding>
    <div class="row items-center q-mb-md">
      <q-btn flat round icon="arrow_back" aria-label="Back" @click="router.push('/amp')" />
      <div class="text-h5 q-ml-sm">AMP Port Config</div>
      <q-space />
      <q-btn
        color="primary"
        label="Save"
        data-testid="save-ports"
        :loading="loading"
        @click="save()"
      />
    </div>

    <q-banner v-if="error" class="bg-negative text-white q-mb-md" rounded>
      {{ error }}
    </q-banner>

    <q-list v-if="instances.length" bordered separator>
      <q-item v-for="inst in instances" :key="inst.id">
        <q-item-section>
          <q-item-label>{{ inst.name }}</q-item-label>
          <q-item-label caption>{{ inst.module }}</q-item-label>
        </q-item-section>
        <q-item-section side>
          <q-input
            v-model="draft[inst.id]"
            type="number"
            label="Port"
            dense
            :data-testid="`port-${inst.id}`"
          />
        </q-item-section>
      </q-item>
    </q-list>

    <div v-else-if="!loading && !error" class="text-grey text-center q-pa-xl">
      No AMP instances found.
    </div>
  </q-page>
</template>
```

- [ ] **Step 4: Add the route**

In `frontend/src/router/routes.ts`, the AMP route currently reads:

```ts
      {
        path: "amp",
        name: "amp-instances",
        component: () => import("@/apps/amp/pages/InstancesPage.vue"),
        meta: { title: "AMP Instances", requiresAuth: true },
      },
```

Add the config route immediately after that closing `},`:

```ts
      {
        path: "amp/config",
        name: "amp-config",
        component: () => import("@/apps/amp/pages/ConfigPage.vue"),
        meta: { title: "AMP Config", requiresAuth: true },
      },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/apps/amp/pages/ConfigPage.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Full frontend checks**

Run: `cd frontend && npx vitest run src/apps/amp && npm run lint`
Expected: all AMP specs pass, eslint clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/apps/amp/pages/ConfigPage.vue frontend/src/apps/amp/pages/ConfigPage.spec.ts frontend/src/router/routes.ts
git commit -m "feat(amp): port config page and route"
```

---

## Final verification

- [ ] **Backend:** `cd backend && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m black . && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m ruff check . && "D:/Jake/Code/application-dock/.venv/Scripts/python" -m pytest -q` → all green.
- [ ] **Frontend:** `cd frontend && npm test && npm run lint` → all green.
- [ ] **Manual smoke:** with `AMP_PUBLIC_IP` set in `backend/.env`, start both dev servers, open `/amp`, confirm copy buttons are disabled until ports are set on `/amp/config`, set a port, confirm copy writes `ip:port`, delete an instance in AMP and confirm its stored port disappears after a refresh.

---

## Self-review notes

- **Spec coverage:** copy-link `ip:port` (Task 6), `/amp/config` sub-route + gear (Tasks 6/7), port JSON persistence (Task 2), reconcile/prune on list (Tasks 3/4), grey-out for new/unconfigured instances (Task 6), `AMP_PUBLIC_IP` env + runtime `/config` (Tasks 1/4/5), port validation 422 (Tasks 3/4), config page clears blanks (Task 7). All covered.
- **Type consistency:** `linkFor`, `savePorts`, `publicIp`, `reconcile`, `set_ports`, `PortsPayload.ports`, `AmpConfig.public_ip`, `Instance.port`, `AmpInstance.port` used identically across backend/frontend tasks.
- **No placeholders:** every code and test step contains full content.
