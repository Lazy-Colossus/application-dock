# AMP Instance Game Identification — Design

**Date:** 2026-10-25
**App:** AMP Instances (`amp`)
**Status:** Approved

## Problem

The AMP Instances page shows each instance's AMP `Module`, but every game server
runs under the generic `GenericModule`, so the module tells you nothing about
*which game* an instance is. We want each instance to display its actual game.

## Discovery (live AMP data)

`ADSModule/GetInstances` returns, per instance, a `DisplayImageSource` field that
carries the Steam App ID in one of two forms:

- `steam:1604030` (V Rising)
- `url:https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/1623730/header.jpg` (Palworld)
- `null` for non-game instances (e.g. the ADS controller `ADS01`)

So the game is auto-detectable from the Steam App ID; no manual labelling needed.

## Decisions (from brainstorming)

- **Source:** auto-detect from the Steam App ID only — no manual labels/overrides.
  Instances with no detectable App ID simply show no game.
- **Name lookup:** resolve the App ID to a name via Steam's public `appdetails`
  API, cached to disk so steady-state polls make no external calls.

## Architecture

### Parse the App ID — `amp_service._map_instance`

Add `_parse_steam_app_id(display_image_source: Any) -> int | None`:

- `steam:<digits>` → the digits as int.
- any string containing `/apps/<digits>/` → those digits as int.
- otherwise (null, no match) → `None`.

`_map_instance` sets `steam_app_id` on the returned `Instance`. This stays in
`amp_service` because that is where the raw AMP payload is mapped.

### Resolve + cache the name — `steam_service` + `steam_repo`

- **`app/repositories/steam_repo.py`** — the only module that touches the Steam
  name cache file `data_dir/steam/games.json` (`{appid_str: name}`).
  `read_names() -> dict[str, str]` (`{}` when absent) and
  `write_names(names: dict[str, str])` via `app.core.storage.atomic_write_json`.
  Kept separate from `amp_repo` (ports) so each repo has one responsibility; the
  Steam cache is game-platform data, not AMP-app data.
- **`app/services/steam_service.py`** — the only module that talks to Steam.
  - `_fetch_app_name(app_id: int) -> str | None` — the single HTTP seam (tests
    stub this). `GET https://store.steampowered.com/api/appdetails` with
    `appids=<id>&filters=basic`, timeout 5s. Returns
    `data[str(app_id)]["data"]["name"]` when `data[str(app_id)]["success"]` is
    truthy, else `None`. Any `httpx.HTTPError`/`ValueError` → `None`.
  - `game_name(app_id: int) -> str | None` — return the cached name if the key is
    present; otherwise fetch, and **cache only on success**, returning the name
    (or `None`). Not caching failures means a transient Steam outage is retried
    on the next poll rather than permanently marking a game unknown.

### Enrich in the router — `GET /api/amp/instances`

After the existing port join, loop the instances and, for each with a
`steam_app_id`, set `inst.game = steam_service.game_name(inst.steam_app_id)`.
`game_name` never raises, so a Steam failure degrades to "no game shown" without
breaking the list. First load resolves each uncached App ID (bounded by the 5s
timeout each); every subsequent poll hits the cache and makes zero calls.

### Schema — `app/schemas/amp.py`

`Instance` gains:

```python
steam_app_id: int | None = None
game: str | None = None
```

### Frontend

- `AmpInstance` (`types.ts`) gains `steam_app_id: number | null` and
  `game: string | null`.
- `InstancesPage.vue` caption currently renders `{{ inst.module }}`. Change it to
  `{{ inst.game ?? inst.module }}` so a resolved game name ("Palworld") replaces
  the useless `GenericModule`, while non-game instances still fall back to the
  module (e.g. the controller shows "ADS").

## Edge cases

- **No `DisplayImageSource` / unparseable:** `steam_app_id` is `None`; the router
  skips resolution; the row shows the module as before.
- **Steam API down or app not found:** `game_name` returns `None`, not cached;
  the row falls back to the module; next poll retries.
- **Container networking:** the server already makes outbound calls (Anthropic,
  Google Maps); reaching Steam needs no infra change.

## Out of scope

- Manual game labels / overrides (decided against).
- Showing the Steam header image (name text only).
- Cache eviction (the cache only grows; trivial at this scale).

## Testing

### Backend
- `amp_service`: `_parse_steam_app_id` for `steam:<id>`, `url:.../apps/<id>/...`,
  and null/garbage; `_map_instance` populates `steam_app_id` from a payload
  carrying `DisplayImageSource`.
- `steam_repo`: missing file → `{}`; write/read round-trip. (`tmp_path` +
  `monkeypatch` on `settings.data_dir`, matching the other repo tests — avoids
  the shared-session-`data_dir` pollution.)
- `steam_service`: cache hit returns without fetching; cache miss fetches (stub
  `_fetch_app_name`), caches, returns name; a failed fetch returns `None` and
  writes nothing. (`data_dir` isolated as above.)
- Router: `GET /amp/instances` sets `game` from a stubbed `steam_service.game_name`
  for instances with a `steam_app_id` and leaves it `None` otherwise.

### Frontend
- `useAmpStore.spec.ts`: `inst` factory gains `steam_app_id`/`game` defaults; a
  fetch test asserts `game` is carried through.
- `InstancesPage.spec.ts`: a row with `game` set renders the game name; a row
  without `game` renders the module.
