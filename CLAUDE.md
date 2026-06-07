# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Application Dock is a multi-app platform **shell**. v1 ships one app: **Archery Score Counter**. The shell renders a landing page of app cards; each app lives self-contained under its own directory. Adding an app is meant to be a two-file change (see "Adding a new app").

Stack: FastAPI (Python 3.12) backend + Vue 3 / Quasar v2 / Vite / TypeScript / Pinia frontend. **Persistence is JSON files on disk — there is no database.** Production runs as a single Docker container where FastAPI also serves the built SPA.

## Commands

### Backend (`backend/`)
```bash
source .venv/bin/activate                 # venv lives at backend/.venv (Python 3.12)
export DATA_DIR=./local-data              # REQUIRED outside Docker — default /data isn't writable
uvicorn app.main:app --reload --port 8000 # dev server

.venv/bin/pytest                          # all tests
.venv/bin/pytest tests/test_archery_finalise.py            # one file
.venv/bin/pytest tests/test_archery_finalise.py::test_name # one test
black . && ruff check .                   # format + lint (CI enforces both; line-length 100)
```
Tests set `DATA_DIR` to a temp dir automatically via `conftest.py`, so pytest needs no env setup.

### Frontend (`frontend/`)
```bash
npm run dev          # Quasar dev server on :9000, proxies /api/* → localhost:8000
npm test             # vitest run (one-shot)
npm run test:watch   # vitest watch
npx vitest run src/apps/archery/pages/ResultsPage.spec.ts   # one file
npm run lint         # eslint
npm run format       # prettier
```
Requires **Node ≥22.22** (`package.json` engines; Quasar v2.6+ requirement). The README says "Node 20+" — that's stale.

There is also a `.vscode/tasks.json` — "Launch App" runs both dev servers in parallel.

### Production
```bash
docker compose up --build   # builds SPA + serves API on host port 8123 → container 8000
```
Data persists in the `archery-data` named volume at `/data`. The multi-stage `backend/Dockerfile` builds the SPA with Node, then copies `dist/spa/` into the Python image; `app/main.py` mounts it only when that directory exists (so dev, where it doesn't, still boots).

## Architecture

### Backend — strict 3-layer, never skip a layer
```
routers/      HTTP only. Translate stdlib exceptions → HTTPException here, nowhere else.
services/     Business logic. Raises stdlib exceptions (FileNotFoundError, ValueError). No HTTPException.
repositories/ The ONLY code that touches the filesystem.
```
- `app/repositories/session_repo.py` is the single I/O module. **All writes go through `_atomic_write_json` (write-`.tmp`-then-`os.replace`)** — never bypass this for persisted state.
- `app/core/config.py` exposes `settings.data_dir` and runs `mkdir(parents=True, exist_ok=True)` **at import time**. This is why `conftest.py` sets `DATA_DIR` before any app import, and why dev needs a writable `DATA_DIR`.
- `app/routers/shell.py` serves `GET /api/apps` (the static app registry for the shell). `app/routers/archery.py` is the archery API under `/api/archery`.

### Sessions data model (the core domain)
A session is one JSON file. Two lifecycle states, distinguished by **filename**, not just a status field:
- **In-progress:** `_ip_{label}.json`. The leading `_` keeps it out of history listings. Multiple may coexist (concurrent sessions). A legacy single `_in_progress.json` is migrated on read.
- **Finalised:** `{label}.json` where label is `YYYY-MM-DD` or `YYYY-MM-DD-N` (N≥2 for the 2nd+ session that day). Newest-first sort = date desc, then suffix desc.
- Other `_`-prefixed files are non-session state, e.g. `_recurring_players.json`.

`SessionData.label` is the date-based ID; `name` is the user-facing title (defaults to the label). **Schema strictness is status-dependent** (`app/schemas/session.py`): in-progress sessions are lenient (partial rosters, `null` shots = "not yet entered", which is distinct from `0`); finalised sessions are strict (every target covers the full roster with two non-null shots). Finalising materialises all 18 targets, filling unentered shots with `0`. Valid shot values: `{0, 5, 8, 10, 11}`. Targets numbered 1–18.

### Frontend — feature-grouped
```
src/apps/{app-id}/   self-contained app code: pages/, components/, composables/, stores/, types.ts
src/components/       shared primitives ONLY — no app-specific code here
src/composables/useApi.ts   the single HTTP boundary
src/apps/registry.ts        static list of apps the shell landing page renders
src/router/routes.ts        lazy-loaded routes
```
- **All HTTP goes through `src/composables/useApi.ts`.** No raw `fetch`/`axios` in components or stores. It throws `ApiError` (`.status`, `.detail`) on non-2xx and surfaces backend `{ detail }` errors.
- **Pinia stores** (`useArcherySessionStore`, `useArcheryHistoryStore`) must expose `loading` and `error` refs; every async action sets `loading` in a `try/finally` and routes errors into `error.value` (never bare `console.error`).
- API contract: snake_case JSON fields, **direct serialization (no `{ data, status }` envelopes)**, ISO 8601 date strings, errors as `{ detail }`.

### Adding a new app
1. Append an entry to `src/apps/registry.ts` (id, label, Material icon, route).
2. Add lazy-loaded route(s) in `src/router/routes.ts`.
3. (If it needs a backend) add it to the `_APPS` list in `app/routers/shell.py` and a new router.

The shell's `HomePage` iterates the registry and `AppCard` is generic — no other shell changes needed.

## Conventions

Authoritative source: `docs/architecture/coding-standards.md`. Highlights beyond standard practice:
- **YAGNI / no dead code / minimal comments** — comment only the non-obvious *why*, never restate *what*.
- Backend: type hints on all public signatures; `pathlib` over `os.path`; f-strings.
- Frontend: `<script setup lang="ts">`; `defineProps<{}>()` / `defineEmits<{}>()` generic syntax; no `any` without a justifying comment; `interface` for object shapes, `type` for unions.
- Tests: backend in `backend/tests/` as `test_*.py` (use `tmp_path` + `monkeypatch` on `settings.data_dir`); frontend `*.spec.ts` co-located next to the unit. Test the public contract; don't mock what you own.

## Docs

`docs/` files (`architecture.md`, `prd.md`, `epics.md`, `ux/`) are **symlinks** into `_bmad-output/` — that directory holds the canonical planning artifacts. `docs/stories/` has one file per implementation story; code comments reference these (e.g. "Story 6.1", "FR-2.8") as the rationale for specific behaviors.
