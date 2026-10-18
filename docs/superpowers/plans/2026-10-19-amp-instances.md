# AMP Instances Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "AMP Instances" app that lists CubeCoders AMP instances on the same server and lets the user boot a stopped/asleep instance, with the list auto-refreshing every 60 seconds.

**Architecture:** A live proxy to AMP's ADS controller HTTP API — no persistence, no `repositories/` layer. A backend service (`amp_service`) owns login/session/list/start against AMP; a thin router exposes `GET /api/amp/instances` and `POST /api/amp/instances/{id}/start`. The frontend is a single polling page backed by a Pinia store that goes through `useApi`.

**Tech Stack:** FastAPI + httpx (already a backend dependency) on the backend; Vue 3 / Quasar / Pinia / TypeScript on the frontend. Credentials come from environment variables.

---

## Deviation from the spec (error codes)

The spec sketched `503` (unconfigured) and `404` (unknown instance). AMP does not give a reliable, distinguishable "unknown instance" signal (a bad start returns a generic `{"Status": false, "Reason": ...}`), and the codebase already has an established convention for external-API apps (tea label scan): **not-configured → `503`, upstream failure → `502`**. This plan follows that convention: two exception types, `AmpNotConfiguredError → 503` and `AmpUpstreamError → 502` (a refused start surfaces AMP's reason text as a 502). This is simpler and honest.

## File structure

**Backend**
- Modify `backend/app/core/config.py` — add `amp_base_url`, `amp_username`, `amp_password`.
- Create `backend/app/schemas/amp.py` — the `Instance` response model.
- Create `backend/app/services/amp_service.py` — AMP client (login/session/list/start/mapping).
- Create `backend/app/routers/amp.py` — the two endpoints + exception translation.
- Modify `backend/app/main.py` — import and `include_router(amp.router)`.
- Modify `backend/app/routers/shell.py` — add the app to `_APPS`.
- Create `backend/tests/test_amp_service.py` and `backend/tests/test_amp_router.py`.

**Frontend**
- Create `frontend/src/apps/amp/types.ts` — `AmpInstance` interface.
- Create `frontend/src/apps/amp/stores/useAmpStore.ts` + `useAmpStore.spec.ts`.
- Create `frontend/src/apps/amp/pages/InstancesPage.vue`.
- Modify `frontend/src/apps/registry.ts` — append the app entry.
- Modify `frontend/src/router/routes.ts` — add the lazy route.

---

## Task 1: Backend config + response schema

**Files:**
- Modify: `backend/app/core/config.py` (inside `class Settings`, near the other optional-service keys)
- Create: `backend/app/schemas/amp.py`
- Test: `backend/tests/test_amp_service.py` (created here, filled in Task 2)

- [ ] **Step 1: Add AMP settings fields**

In `backend/app/core/config.py`, add these fields to `class Settings` (place them after the `google_maps_*` block, before `kalendariq_guests`):

```python
    # CubeCoders AMP (ADS controller) — the AMP Instances app. Server-side only.
    # With username/password unset, the endpoints report themselves
    # unconfigured (503) and nothing else is affected. Base URL defaults to a
    # same-host ADS controller.
    amp_base_url: str = "http://localhost:8080"
    amp_username: str = ""
    amp_password: str = ""
```

- [ ] **Step 2: Create the response schema**

Create `backend/app/schemas/amp.py`:

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
```

- [ ] **Step 3: Verify it imports**

Run: `cd backend && .venv/bin/python -c "from app.schemas.amp import Instance; from app.core.config import settings; print(settings.amp_base_url)"`
Expected: prints `http://localhost:8080`

(On Windows the venv python is `backend/.venv/Scripts/python.exe` — use whichever exists.)

- [ ] **Step 4: Commit**

```bash
git add backend/app/core/config.py backend/app/schemas/amp.py
git commit -m "feat(amp): config fields and Instance response schema"
```

---

## Task 2: Backend service — AMP client

AMP's API: every call is `POST {base}/API/<Module>/<Method>` with a JSON body; the session id is passed as `SESSIONID` in that body; the response body is the method's raw JSON (a dict or a list). An expired session makes a gated call return a dict `{"Title": "Unauthorized Access", ...}`.

**Files:**
- Create: `backend/app/services/amp_service.py`
- Test: `backend/tests/test_amp_service.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_amp_service.py`:

```python
"""Unit tests for amp_service. The external HTTP seam (`_post_api`) is stubbed,
so no real AMP or network is touched."""

from __future__ import annotations

import pytest

from app.services import amp_service


@pytest.fixture(autouse=True)
def configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_service.settings, "amp_username", "admin")
    monkeypatch.setattr(amp_service.settings, "amp_password", "pw")
    # Each test starts with no cached session.
    monkeypatch.setattr(amp_service, "_session", None)


def _instances_payload() -> list[dict]:
    return [
        {
            "AvailableInstances": [
                {
                    "InstanceID": "i1",
                    "FriendlyName": "MC",
                    "InstanceName": "mc01",
                    "Module": "Minecraft",
                    "Running": True,
                    "Suspended": False,
                    "AppState": 20,
                    "Metrics": {"Active Users": {"RawValue": 3, "MaxValue": 20}},
                }
            ]
        },
        {
            "AvailableInstances": [
                {
                    "InstanceID": "i2",
                    "FriendlyName": "Valheim",
                    "Module": "Valheim",
                    "Running": False,
                    "Suspended": False,
                    "AppState": 0,
                    "Metrics": {},
                }
            ]
        },
    ]


def test_list_instances_flattens_and_maps(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "sess-1"}
        if method_path == "ADSModule/GetInstances":
            return _instances_payload()
        raise AssertionError(method_path)

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    result = amp_service.list_instances()

    assert [i.id for i in result] == ["i1", "i2"]
    assert result[0].name == "MC"
    assert result[0].state == "Running"
    assert result[0].running is True
    assert result[0].active_users == 3
    assert result[0].max_users == 20
    assert result[1].state == "Stopped"
    assert result[1].active_users is None


def test_suspended_overrides_state(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "s"}
        return [
            {
                "AvailableInstances": [
                    {
                        "InstanceID": "i1",
                        "FriendlyName": "X",
                        "Module": "Generic",
                        "Running": False,
                        "Suspended": True,
                        "AppState": 0,
                        "Metrics": {},
                    }
                ]
            }
        ]

    monkeypatch.setattr(amp_service, "_post_api", fake_post)
    assert amp_service.list_instances()[0].state == "Suspended"


def test_relogin_on_expired_session(monkeypatch: pytest.MonkeyPatch) -> None:
    state = {"logins": 0, "served_expired": False}

    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            state["logins"] += 1
            return {"success": True, "sessionID": f"s{state['logins']}"}
        if method_path == "ADSModule/GetInstances":
            if not state["served_expired"]:
                state["served_expired"] = True
                return {"Title": "Unauthorized Access"}
            return []
        raise AssertionError(method_path)

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    amp_service.list_instances()

    assert state["logins"] == 2  # initial login + one re-login after expiry


def test_start_instance_success(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = []

    def fake_post(method_path: str, payload: dict):
        seen.append((method_path, payload))
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "s"}
        if method_path == "ADSModule/StartInstance":
            return {"Status": True}
        raise AssertionError(method_path)

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    amp_service.start_instance("i1")

    start = [c for c in seen if c[0] == "ADSModule/StartInstance"][0]
    assert start[1]["InstanceID"] == "i1"


def test_start_instance_refusal_raises_upstream(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        if method_path == "Core/Login":
            return {"success": True, "sessionID": "s"}
        return {"Status": False, "Reason": "no such instance"}

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    with pytest.raises(amp_service.AmpUpstreamError, match="no such instance"):
        amp_service.start_instance("nope")


def test_login_failure_raises_upstream(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake_post(method_path: str, payload: dict):
        return {"success": False, "sessionID": ""}

    monkeypatch.setattr(amp_service, "_post_api", fake_post)

    with pytest.raises(amp_service.AmpUpstreamError):
        amp_service.list_instances()


def test_not_configured_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(amp_service.settings, "amp_username", "")
    with pytest.raises(amp_service.AmpNotConfiguredError):
        amp_service.list_instances()
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_amp_service.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'app.services.amp_service'`

- [ ] **Step 3: Implement the service**

Create `backend/app/services/amp_service.py`:

```python
"""CubeCoders AMP (ADS controller) client for the AMP Instances app.

The only module that talks to AMP. Every AMP call is POST
`{base}/API/<Module>/<Method>` with a JSON body; the session id travels as
`SESSIONID` in that body; the response is the method's raw JSON. An expired
session makes a gated call return `{"Title": "Unauthorized Access", ...}`, which
we recover from by logging in again once.

Raises `AmpNotConfiguredError` when credentials are missing and
`AmpUpstreamError` when AMP is unreachable, rejects the login, or refuses a
call; the router translates both.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from app.core.config import settings
from app.schemas.amp import Instance

logger = logging.getLogger(__name__)

_TIMEOUT_SECONDS = 10.0

# AMP ApplicationState enum -> human label. Values AMP does not send fall back
# to "Unknown".
_APP_STATES: dict[int, str] = {
    -1: "Unknown",
    0: "Stopped",
    5: "Pre-start",
    7: "Configuring",
    10: "Starting",
    20: "Running",
    30: "Restarting",
    40: "Stopping",
    45: "Preparing for sleep",
    50: "Sleeping",
    60: "Waiting",
    70: "Installing",
    75: "Updating",
    80: "Awaiting input",
    100: "Failed",
    110: "Suspended",
    200: "Maintenance",
    250: "Indeterminate",
}

# Cached AMP session id, refreshed lazily and on expiry.
_session: str | None = None


class AmpNotConfiguredError(RuntimeError):
    """No AMP credentials are configured, so the app cannot talk to AMP."""


class AmpUpstreamError(RuntimeError):
    """AMP was unreachable, rejected the login, or refused a call."""


def _configured() -> bool:
    return bool(settings.amp_username and settings.amp_password)


def _post_api(method_path: str, payload: dict[str, Any]) -> Any:
    """POST one AMP API method and return its parsed JSON. The single HTTP seam;
    tests stub this."""
    url = f"{settings.amp_base_url.rstrip('/')}/API/{method_path}"
    try:
        response = httpx.post(
            url,
            json=payload,
            headers={"Accept": "application/json", "Content-Type": "application/json"},
            timeout=_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        return response.json()
    except httpx.HTTPError as exc:
        raise AmpUpstreamError(f"AMP request failed: {exc}") from exc


def _login() -> str:
    data = _post_api(
        "Core/Login",
        {
            "username": settings.amp_username,
            "password": settings.amp_password,
            "token": "",
            "rememberMe": False,
        },
    )
    session_id = data.get("sessionID") if isinstance(data, dict) else None
    if not data or not isinstance(data, dict) or not data.get("success") or not session_id:
        raise AmpUpstreamError("AMP login failed")
    return session_id


def _ensure_session() -> str:
    global _session
    if _session is None:
        _session = _login()
    return _session


def _is_session_expired(data: Any) -> bool:
    return isinstance(data, dict) and data.get("Title") == "Unauthorized Access"


def _call(method_path: str, payload: dict[str, Any]) -> Any:
    """Call a gated AMP method, re-logging in once if the session has expired."""
    global _session
    session_id = _ensure_session()
    data = _post_api(method_path, {**payload, "SESSIONID": session_id})
    if _is_session_expired(data):
        _session = _login()
        data = _post_api(method_path, {**payload, "SESSIONID": _session})
    return data


def _state_label(app_state: Any, suspended: Any) -> str:
    if suspended:
        return "Suspended"
    if isinstance(app_state, int):
        return _APP_STATES.get(app_state, "Unknown")
    return "Unknown"


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
    )


def list_instances() -> list[Instance]:
    if not _configured():
        raise AmpNotConfiguredError("AMP is not configured")
    targets = _call("ADSModule/GetInstances", {})
    if not isinstance(targets, list):
        raise AmpUpstreamError("Unexpected response from AMP")
    instances: list[Instance] = []
    for target in targets:
        for raw in target.get("AvailableInstances") or []:
            instances.append(_map_instance(raw))
    return instances


def start_instance(instance_id: str) -> None:
    if not _configured():
        raise AmpNotConfiguredError("AMP is not configured")
    data = _call("ADSModule/StartInstance", {"InstanceID": instance_id})
    if isinstance(data, dict) and data.get("Status") is False:
        raise AmpUpstreamError(data.get("Reason") or "AMP refused to start the instance")
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && .venv/bin/pytest tests/test_amp_service.py -q`
Expected: PASS (7 passed)

- [ ] **Step 5: Format, lint, commit**

```bash
cd backend && black app/services/amp_service.py tests/test_amp_service.py && ruff check app/services/amp_service.py tests/test_amp_service.py
git add backend/app/services/amp_service.py backend/tests/test_amp_service.py
git commit -m "feat(amp): AMP client service with session handling and state mapping"
```

---

## Task 3: Backend router + registration

**Files:**
- Create: `backend/app/routers/amp.py`
- Modify: `backend/app/main.py` (import list lines 7-22, and `include_router` block)
- Modify: `backend/app/routers/shell.py` (`_APPS` list)
- Test: `backend/tests/test_amp_router.py`

- [ ] **Step 1: Write the failing router tests**

Create `backend/tests/test_amp_router.py`:

```python
"""Integration tests for the AMP endpoints. amp_service is stubbed."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.amp import Instance
from app.services import amp_service

client = TestClient(app)


def test_get_instances_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        amp_service,
        "list_instances",
        lambda: [
            Instance(
                id="i1",
                name="MC",
                module="Minecraft",
                running=True,
                state="Running",
                active_users=3,
                max_users=20,
            )
        ],
    )

    resp = client.get("/api/amp/instances")

    assert resp.status_code == 200
    body = resp.json()
    assert body[0]["id"] == "i1"
    assert body[0]["state"] == "Running"


def test_get_instances_not_configured_returns_503(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> list[Instance]:
        raise amp_service.AmpNotConfiguredError("AMP is not configured")

    monkeypatch.setattr(amp_service, "list_instances", boom)

    resp = client.get("/api/amp/instances")
    assert resp.status_code == 503


def test_get_instances_upstream_returns_502(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> list[Instance]:
        raise amp_service.AmpUpstreamError("AMP unreachable")

    monkeypatch.setattr(amp_service, "list_instances", boom)

    resp = client.get("/api/amp/instances")
    assert resp.status_code == 502


def test_start_instance_ok(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = {}
    monkeypatch.setattr(
        amp_service, "start_instance", lambda instance_id: seen.update(id=instance_id)
    )

    resp = client.post("/api/amp/instances/i1/start")

    assert resp.status_code == 202
    assert seen["id"] == "i1"


def test_start_instance_upstream_returns_502(monkeypatch: pytest.MonkeyPatch) -> None:
    def boom(instance_id: str) -> None:
        raise amp_service.AmpUpstreamError("refused")

    monkeypatch.setattr(amp_service, "start_instance", boom)

    resp = client.post("/api/amp/instances/i1/start")
    assert resp.status_code == 502
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && .venv/bin/pytest tests/test_amp_router.py -q`
Expected: FAIL — 404s (routes not mounted yet) / import error.

- [ ] **Step 3: Create the router**

Create `backend/app/routers/amp.py`:

```python
"""AMP Instances HTTP layer.

Translates amp_service's stdlib-style exceptions to HTTP: not-configured -> 503,
AMP upstream failure (unreachable / login rejected / call refused) -> 502.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_current_user
from app.schemas.amp import Instance
from app.services import amp_service

router = APIRouter(prefix="/api/amp", tags=["amp"])


@router.get("/instances", response_model=list[Instance])
def list_instances(_: str = Depends(get_current_user)) -> list[Instance]:
    try:
        return amp_service.list_instances()
    except amp_service.AmpNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except amp_service.AmpUpstreamError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


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

- [ ] **Step 4: Register the router in main.py**

In `backend/app/main.py`, add `amp,` to the `from app.routers import (...)` tuple (keep alphabetical — before `archery,`):

```python
from app.routers import (
    amp,
    archery,
    auth,
    context_switch,
    floor_planner,
    hotaru,
    iss_vanguard,
    kalendariq,
    kitchencraft,
    listies,
    pagemage,
    qotd,
    shared_notes,
    shell,
    tea,
)
```

And add this line next to the other `include_router` calls (after `app.include_router(shell.router)`):

```python
app.include_router(amp.router)
```

- [ ] **Step 5: Add the app to the shell registry (`_APPS`)**

In `backend/app/routers/shell.py`, append to the `_APPS` list (after the `pagemage` entry):

```python
    AppDescriptor(
        id="amp",
        label="AMP Instances",
        icon="dns",
        route="/amp",
    ),
```

- [ ] **Step 6: Run the router tests**

Run: `cd backend && .venv/bin/pytest tests/test_amp_router.py -q`
Expected: PASS (5 passed)

- [ ] **Step 7: Run the whole backend suite (catches the registry-parity test)**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS. (The frontend registry entry in Task 5 must match this `_APPS` entry; if `test_app_registry_parity.py` fails here, it is expected until Task 5 is done — note it and continue, or do Task 5 before re-running. If it is a backend-only parity test comparing against the frontend file, complete Task 5 first.)

- [ ] **Step 8: Format, lint, commit**

```bash
cd backend && black app/routers/amp.py app/main.py app/routers/shell.py tests/test_amp_router.py && ruff check app/routers/amp.py app/main.py app/routers/shell.py tests/test_amp_router.py
git add backend/app/routers/amp.py backend/app/main.py backend/app/routers/shell.py backend/tests/test_amp_router.py
git commit -m "feat(amp): instances router, registration, and shell registry entry"
```

---

## Task 4: Frontend types + store (TDD)

**Files:**
- Create: `frontend/src/apps/amp/types.ts`
- Create: `frontend/src/apps/amp/stores/useAmpStore.ts`
- Test: `frontend/src/apps/amp/stores/useAmpStore.spec.ts`

- [ ] **Step 1: Create the types**

Create `frontend/src/apps/amp/types.ts`:

```ts
export interface AmpInstance {
  id: string;
  name: string;
  module: string;
  running: boolean;
  state: string;
  active_users: number | null;
  max_users: number | null;
}
```

- [ ] **Step 2: Write the failing store spec**

Create `frontend/src/apps/amp/stores/useAmpStore.spec.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock },
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
    ...over,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
});

describe("useAmpStore", () => {
  it("fetch loads instances and clears loading", async () => {
    getMock.mockResolvedValue([inst("i1")]);
    const store = useAmpStore();

    await store.fetch();

    expect(getMock).toHaveBeenCalledWith("/amp/instances");
    expect(store.instances).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  it("fetch keeps the last known list and sets error on failure", async () => {
    getMock.mockResolvedValueOnce([inst("i1")]);
    const store = useAmpStore();
    await store.fetch();

    getMock.mockRejectedValueOnce(new Error("AMP down"));
    await store.fetch();

    expect(store.instances).toHaveLength(1);
    expect(store.error).toBe("AMP down");
  });

  it("start posts, refetches, and clears the starting flag", async () => {
    postMock.mockResolvedValue(undefined);
    getMock.mockResolvedValue([inst("i1", { running: true, state: "Running" })]);
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

- [ ] **Step 3: Run to verify it fails**

Run: `cd frontend && npx vitest run src/apps/amp/stores/useAmpStore.spec.ts`
Expected: FAIL — cannot resolve `./useAmpStore`.

- [ ] **Step 4: Implement the store**

Create `frontend/src/apps/amp/stores/useAmpStore.ts`:

```ts
import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { AmpInstance } from "@/apps/amp/types";

export const useAmpStore = defineStore("amp", () => {
  const instances = ref<AmpInstance[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  // Ids with a start request in flight — drives per-row button spinner/disable.
  const starting = ref<string[]>([]);

  function isStarting(id: string): boolean {
    return starting.value.includes(id);
  }

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      instances.value = await api.get<AmpInstance[]>("/amp/instances");
    } catch (e) {
      // A failed poll keeps the last known list rather than blanking the page.
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

  return { instances, loading, error, starting, isStarting, fetch, start };
});
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd frontend && npx vitest run src/apps/amp/stores/useAmpStore.spec.ts`
Expected: PASS (4 passed)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/amp/types.ts frontend/src/apps/amp/stores/useAmpStore.ts frontend/src/apps/amp/stores/useAmpStore.spec.ts
git commit -m "feat(amp): frontend types and polling store"
```

---

## Task 5: Frontend page + registry + route

**Files:**
- Create: `frontend/src/apps/amp/pages/InstancesPage.vue`
- Modify: `frontend/src/apps/registry.ts` (append to `apps`)
- Modify: `frontend/src/router/routes.ts` (add a child route under the `/` layout)

- [ ] **Step 1: Create the page**

Create `frontend/src/apps/amp/pages/InstancesPage.vue`:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { storeToRefs } from "pinia";
import { useAmpStore } from "@/apps/amp/stores/useAmpStore";

const store = useAmpStore();
const { instances, loading, error } = storeToRefs(store);

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

    <div
      v-else-if="!loading && !error"
      class="text-grey text-center q-pa-xl"
    >
      No AMP instances found.
    </div>
  </q-page>
</template>
```

- [ ] **Step 2: Append the registry entry**

In `frontend/src/apps/registry.ts`, append to the `apps` array (after the `pagemage` entry). It MUST match the backend `_APPS` entry exactly (id, label, icon, route):

```ts
  {
    id: "amp",
    // A server-rack glyph — the app lists AMP game-server instances.
    label: "AMP Instances",
    icon: "dns",
    route: "/amp",
  },
```

- [ ] **Step 3: Add the route**

In `frontend/src/router/routes.ts`, add this as a child of the `/` layout route (next to the other app routes, e.g. after the `pagemage` route or anywhere among the `children`):

```ts
      {
        path: "amp",
        name: "amp-instances",
        component: () => import("@/apps/amp/pages/InstancesPage.vue"),
        meta: { title: "AMP Instances", requiresAuth: true },
      },
```

- [ ] **Step 4: Lint and type-check the frontend**

Run: `cd frontend && npm run lint && npx vue-tsc --noEmit`
Expected: no errors. (If `vue-tsc` isn't a configured script, the build in Step 6 covers type-checking.)

- [ ] **Step 5: Run the full frontend test suite (incl. any parity test)**

Run: `cd frontend && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/amp/pages/InstancesPage.vue frontend/src/apps/registry.ts frontend/src/router/routes.ts
git commit -m "feat(amp): instances page, registry entry, and route"
```

---

## Task 6: Full verification + manual check

**Files:** none (verification only)

- [ ] **Step 1: Run the entire backend suite**

Run: `cd backend && .venv/bin/pytest -q`
Expected: PASS, including `test_app_registry_parity.py` (backend `_APPS` now matches the frontend registry).

- [ ] **Step 2: Run the entire frontend suite + lint**

Run: `cd frontend && npm test && npm run lint`
Expected: PASS, no lint errors.

- [ ] **Step 3: Manual smoke (requires real AMP + env vars)**

Set `AMP_USERNAME` / `AMP_PASSWORD` (and `AMP_BASE_URL` if not `http://localhost:8080`) in the root `.env`, start both dev servers (`.vscode` "Launch App" task, or `uvicorn app.main:app --reload --port 9000` with `DATA_DIR=./local-data` + `npm run dev`), log in, open the landing page, and confirm:
  - An "AMP Instances" card appears and routes to `/amp`.
  - The page lists instances with status chips.
  - A stopped instance's **Start** button boots it; after ~refresh the status moves off "Stopped".
  - The list refreshes on its own within ~60s.
  - With credentials unset, the page shows an error banner (503 surfaced) rather than crashing.

- [ ] **Step 4: Final commit if anything changed during verification**

```bash
git add -A
git commit -m "chore(amp): verification fixups" # only if needed
```

---

## Self-review notes

- **Spec coverage:** list (Task 2/3/4/5), start (Task 2/3/4/5), 60s polling (Task 5), env-var config (Task 1), live-proxy/no-persistence (no repository layer anywhere), error banner + quiet retry (store keeps list on failed poll; page banner), tests backend+frontend (Tasks 2/3/4), registry+parity (Tasks 3/5/6). All covered.
- **Error-code refinement vs spec:** documented at the top — `503` not-configured, `502` upstream — matching the tea-label-scan convention; the spec's `404`-unknown-instance path is intentionally dropped as undetectable.
- **Parity test constraints:** `backend/tests/test_app_registry_parity.py` parses `registry.ts` as text and asserts (a) same id set, (b) label/icon/route all agree, (c) **same order** — both lists append `amp` last, so this holds — and (d) `route == "/" + id` — `/amp` matches `amp`. Both the shell `_APPS` entry (Task 3) and the frontend entry (Task 5) must be byte-for-byte consistent on `label` ("AMP Instances"), `icon` ("dns"), and `route` ("/amp"). This test lives in the backend suite, so the full backend run only goes green after Task 5.
- **Type consistency:** backend `Instance` fields (`id,name,module,running,state,active_users,max_users`) match the frontend `AmpInstance` interface and the store/page usage; `amp_service` function names (`list_instances`, `start_instance`, `AmpNotConfiguredError`, `AmpUpstreamError`, `_post_api`, `_session`) are used identically in tests, the router, and the service.
