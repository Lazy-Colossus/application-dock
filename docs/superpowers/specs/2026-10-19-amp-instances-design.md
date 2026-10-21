# AMP Instances — design

**Date:** 2026-10-19
**Status:** Approved (brainstorming)

## What this is

A new Application Dock app that lists the CubeCoders AMP instances running on
the same server and lets the user boot an instance that is stopped/asleep. The
list auto-refreshes its status roughly every 60 seconds.

## Scope

- List all AMP instances with their live status.
- Start (boot) an instance that is not running.
- Auto-poll status every 60s, plus a manual refresh.

Out of scope (YAGNI): stopping/restarting instances, starting the app *inside*
an instance, editing instances, console access, any credential UI.

## Key decision: live proxy, no persistence

Every other app in the dock persists JSON under `DATA_DIR`. This app does **not**.
AMP is the single source of truth for instance state; any cached copy we kept
would go stale immediately. So this app deliberately omits the `repositories/`
layer and writes nothing to disk — the "repository" is AMP's HTTP API. This is a
conscious departure from the house pattern, appropriate because the app owns no
state of its own.

## Configuration

Credentials and endpoint come from the backend environment (never the UI, never
disk):

| Variable        | Default                  | Notes                         |
| --------------- | ------------------------ | ----------------------------- |
| `AMP_BASE_URL`  | `http://localhost:8080`  | AMP ADS controller base URL   |
| `AMP_USERNAME`  | (none — required)        | AMP account username          |
| `AMP_PASSWORD`  | (none — required)        | AMP account password          |

If username/password are unset, the service treats AMP as unconfigured and the
endpoints return 503 with a clear detail message.

## Backend

Layers follow the house 3-layer rule, minus repositories (see decision above).

### `services/amp_service.py` — the AMP client

AMP's API: every call is `POST {base}/API/<Module>/<Method>` with a JSON body;
the session is passed as `SESSIONID` in that body; responses are JSON.

- `list_instances() -> list[Instance]`
  - Ensures a session (see session handling), calls `ADSModule/GetInstances`,
    flattens each target's `AvailableInstances` into a flat list.
  - Maps each AMP instance to our shape (see data model).
- `start_instance(instance_id: str) -> None`
  - Ensures a session, calls `ADSModule/StartInstance` with `{InstanceID}`.
  - Raises `ValueError` if AMP reports the call unsuccessful / unknown instance.

**Session handling:** cache the `sessionID` from `Core/Login`
(`{username, password, token: "", rememberMe: false}`). On a response that
indicates an expired/invalid session, re-login once and retry. A login failure
raises `RuntimeError`.

**Exceptions (stdlib only — no HTTPException here):**
- `ValueError` — missing config, unknown instance, AMP-reported failure.
- `ConnectionError` / `RuntimeError` — AMP unreachable or login failed.

HTTP client: use `httpx` if already a backend dependency, else `requests`;
confirm during planning. Short timeouts so a hung AMP doesn't hang the poll.

### `routers/amp.py` — HTTP layer

- `GET  /api/amp/instances` → `list[Instance]`
- `POST /api/amp/instances/{instance_id}/start` → `202`, `{ "detail": "..." }`

Exception translation (only here):
- `ValueError` (missing config) → `503`
- `ConnectionError` / `RuntimeError` → `503` (AMP unreachable)
- `ValueError` (unknown instance) → `404`

Register the router in `app/main.py` and add the app to `_APPS` in
`routers/shell.py`.

### Data model returned to the frontend (snake_case, direct serialization)

```
Instance {
  id:            str      # AMP InstanceID
  name:          str      # FriendlyName (fallback InstanceName)
  module:        str      # e.g. "Minecraft", "Generic"
  running:       bool      # AMP Running
  state:         str      # human label derived from AppState
  active_users:  int | null
  max_users:     int | null
}
```

`state` is derived from AMP's numeric `AppState` (Stopped / Starting / Running /
Stopping / Sleeping / Suspended / Failed / …). The frontend colors a chip from
this and uses `running` to decide whether Start is enabled.

## Frontend (`frontend/src/apps/amp/`)

- `registry.ts`: append `{ id: "amp", label: "AMP Instances", icon: "dns",
  route: "/amp" }`.
- `router/routes.ts`: lazy route `/amp`.
- `types.ts`: `Instance` interface mirroring the backend shape.
- `stores/useAmpStore.ts` (Pinia): state `instances`, `loading`, `error`,
  `starting` (a `Set<string>` of in-flight instance ids); actions `fetch()` and
  `start(id)` — all HTTP via `composables/useApi.ts`. Each action sets `loading`
  in try/finally and routes errors to `error.value`.
- `pages/InstancesPage.vue`: a list of cards/rows, each with name, module, a
  colored status chip, user count if present, and a **Start** button. Start is
  disabled when `running` is true or the id is in `starting`; shows a spinner
  while starting; refetches on success. Page-level manual refresh button and an
  error banner when `error` is set.
- Polling: `fetch()` on mount, `setInterval(fetch, 60000)`, cleared on unmount.

## Error handling

- AMP down / misconfigured → store `error` populated → page shows a banner; the
  60s poll keeps retrying quietly (a failed poll doesn't wipe the last known
  list).
- Start failure → surface via `error`; button returns to enabled.

## Testing

**Backend**
- `tests/test_amp_service.py`: stub AMP HTTP (login, GetInstances, StartInstance)
  — verify flattening/mapping, session reuse + re-login-on-expiry, and the
  unconfigured/failure error paths.
- `tests/test_amp_router.py`: the two endpoints incl. the 503 (unreachable /
  unconfigured) and 404 (unknown instance) paths.
- `test_app_registry_parity.py` already enforces shell `_APPS` ↔ frontend
  registry agreement.

**Frontend**
- `stores/useAmpStore.spec.ts`: `useApi` mocked — fetch success populates
  `instances`; `start` flow toggles `starting` and refetches; error path sets
  `error`.
