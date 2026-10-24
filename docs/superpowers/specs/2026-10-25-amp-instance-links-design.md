# AMP Instance Copy-Link + Port Config — Design

**Date:** 2026-10-25
**App:** AMP Instances (`amp`)
**Status:** Approved

## Problem

The AMP Instances page lists game servers but gives no way to share how to
connect to one. Each instance is reachable at the host's public IP on a
per-instance port, but AMP's `GetInstances` response does not carry that port in
a usable form. We want a per-instance "copy link" button that copies
`<public_ip>:<port>`, a place to configure each instance's port, and automatic
cleanup of ports for instances that no longer exist.

## Decisions (from brainstorming)

- **Link format:** `ip:port` (bare connect address, no scheme). e.g. `203.0.113.5:27015`.
- **Config UI:** a dedicated sub-route `/amp/config`, reached by a gear icon on
  the Instances page. Not a dialog, not a separate shell app.
- **Public IP:** supplied as an env var, handed to the SPA at runtime (never
  bundled), mirroring how Listies exposes `google_maps_browser_key` via
  `maps-config`.

## Data model & persistence

One JSON file at `data_dir/amp/ports.json` — a flat map of instance id → port:

```json
{ "ab12cd34-...": 27015, "ef56gh78-...": 25565 }
```

- New repo `backend/app/repositories/amp_repo.py` — the only module that touches
  this file. `read_ports() -> dict[str, int]` and `write_ports(dict[str, int])`,
  both via the shared `app.core.storage.atomic_write_json`, with a
  `app.core.locks.key_lock` on the file path guarding the read-modify-write in
  `reconcile`/`set_ports` (same pattern as `shared_notes_repo`). `read_ports`
  returns `{}` when the file does not exist yet.
- `amp_service.py` stays untouched as a concern — it remains "the only module
  that talks to AMP." Port persistence lives in a new `amp_ports_service.py`.

## Backend

### Config (`app/core/config.py`)

Add, documented alongside the other optional AMP vars:

```python
# Public IP/host the AMP instances are reachable on, for the copy-link button.
# With this unset, the copy-link buttons are disabled and nothing else changes.
amp_public_ip: str = ""   # env: AMP_PUBLIC_IP
```

### Service (`app/services/amp_ports_service.py`)

Stdlib-exception style, like the rest of the layer (no HTTPException):

- `public_ip() -> str | None` — `settings.amp_public_ip or None`.
- `get_ports() -> dict[str, int]` — raw read.
- `set_ports(ports: dict[str, int]) -> dict[str, int]` — validate each value is
  an int in `1..65535` (raise `ValueError` otherwise), persist, return stored.
- `reconcile(live_ids: Iterable[str]) -> dict[str, int]` — drop any stored entry
  whose id is not in `live_ids`; write back **only if the map changed**; return
  the (pruned) map. Guarded by the file lock.

### Router (`app/routers/amp.py`)

- `GET /api/amp/instances` — unchanged error contract (503 not-configured / 502
  upstream). Now: fetch `amp_service.list_instances()`, then
  `ports = amp_ports_service.reconcile([i.id for i in instances])`, and return
  each instance with `port=ports.get(i.id)`. **This is where a removed instance's
  port is pruned** — automatically, on every page load and 60s poll.
- `GET /api/amp/config` — `{ "public_ip": str | None }`. Behind the same
  `require_app("amp")` + `get_current_user` guards.
- `PUT /api/amp/ports` — body `{ "ports": { id: port } }`. Calls
  `set_ports`; `ValueError` → 422. Returns the stored map `{ "ports": {...} }`.

### Schema (`app/schemas/amp.py`)

- `Instance` gains `port: int | None = None`.
- New `AmpConfig(BaseModel)` → `public_ip: str | None = None`.
- New `PortsPayload(BaseModel)` → `ports: dict[str, int]` (request + response body
  for `PUT /api/amp/ports`).

## Frontend

### Types (`src/apps/amp/types.ts`)

`AmpInstance` gains `port: number | null`.

### Store (`src/apps/amp/stores/useAmpStore.ts`)

- New refs: `publicIp: string | null`, and the port map is carried on each
  instance (no separate ref needed for the instances page).
- `fetch()` also calls `GET /amp/config` to populate `publicIp` (tolerant: a
  failed config fetch leaves `publicIp` null, copy buttons just stay disabled).
- `linkFor(inst): string | null` — `publicIp && inst.port ? \`${publicIp}:${inst.port}\` : null`.
- `savePorts(ports: Record<string, number>): Promise<void>` — `PUT /amp/ports`,
  sets `loading`/`error` in try/finally, re-fetches on success.

### Instances page (`pages/InstancesPage.vue`)

- Per row: a "copy link" icon button, `:disable="!store.linkFor(inst)"` so a new
  instance with no configured port (or an unset `AMP_PUBLIC_IP`) is greyed out,
  with a tooltip explaining why. Click copies `store.linkFor(inst)` via
  `navigator.clipboard.writeText` and shows a Quasar `notify` "Copied".
- A gear icon button in the header routes to `/amp/config`.

### Config page (`pages/ConfigPage.vue`, new)

- Lists each current instance (name + module) with a numeric `q-input` prefilled
  from its stored port.
- A Save button calls `store.savePorts(...)` with the full map of entered ports
  (instances left blank are omitted → effectively cleared). Shows save feedback
  via `notify` and routes back / stays with a success banner.
- Reuses the store's `instances`/`loading`/`error`; triggers `store.fetch()` on
  mount.

### Routing (`src/router/routes.ts`)

Add a sibling route under the authed shell layout:

```ts
{ path: "amp/config", name: "amp-config",
  component: () => import("@/apps/amp/pages/ConfigPage.vue"),
  meta: { title: "AMP Config", requiresAuth: true } }
```

No `registry.ts` change — this is a sub-page of the existing AMP app, not a new
shell card.

## Edge cases

- **Public IP unset:** every copy button disabled; tooltip points at
  `AMP_PUBLIC_IP`. Config page still works (you can set ports ahead of time).
- **New instance:** appears with `port: null` → copy button greyed until a port
  is set on the config page.
- **Instance removed:** its stored port is pruned by `reconcile` on the next
  `GET /amp/instances` (write only when the map actually changes).
- **Invalid port** (0, >65535, non-int): `set_ports` raises `ValueError` → 422;
  the config page surfaces the backend `detail`.

## Testing

### Backend
- `amp_ports_service`: `set_ports` validation (rejects out-of-range / non-int,
  accepts 1 and 65535); `reconcile` prunes stale ids, keeps live ids, and does
  not rewrite when unchanged. Repo exercised via `tmp_path` + `monkeypatch` on
  `settings.data_dir`.
- Router: `GET /amp/instances` returns instances with joined `port` and prunes a
  stale entry; `PUT /amp/ports` persists and 422s on a bad port; `GET /amp/config`
  returns the public IP. Reuse the existing `_post_api` stub pattern from the
  current AMP router/service tests.

### Frontend
- `useAmpStore.spec.ts` (extend): `fetch` merges `port` and populates `publicIp`;
  `linkFor` builds `ip:port` and returns null when either is missing; `savePorts`
  PUTs and re-fetches; a failed config fetch leaves `publicIp` null without
  erroring the whole load.
- `InstancesPage`: copy button disabled when `linkFor` is null; enabled + copies
  when both present.
- `ConfigPage.spec.ts` (new): renders a row per instance prefilled with stored
  port; Save sends the entered map.

## Out of scope

- No per-instance scheme/URL (decided: bare `ip:port`).
- No editing of AMP instances themselves beyond the existing Start action.
- No auth/permission changes — reuses `require_app("amp")` + `get_current_user`.
