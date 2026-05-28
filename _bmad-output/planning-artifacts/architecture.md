---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
lastStep: 8
status: 'complete'
completedAt: '2026-05-28'
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Code-2026-05-26/prd.md
workflowType: 'architecture'
project_name: 'Code (Multi-App Platform)'
user_name: 'The Jacob'
date: '2026-05-28'
---

# Architecture Decision Document

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**
21 FRs across 5 areas: multi-app shell (extensible via registry), session setup (roster, auto-label), score entry (18 targets, 5 valid values, any-order entry, back-navigation within target), session results (ranked totals + per-target breakdown, finalisation), and session history (read-only, append-only, newest-first). Architecturally: the shell/app boundary and the session state machine are the two load-bearing concerns.

**Non-Functional Requirements:**
- NFR-1/2: Responsive ≥360px, tap targets ≥44px — drives Quasar component selection
- NFR-3: No auth, LAN-only — eliminates security surface area entirely
- NFR-4: ≤3s initial load on LAN — SPA bundle size matters; lazy-load per-app routes
- NFR-5: Single `docker compose up` — build pipeline must be image-internal

**Scale & Complexity:**

- Primary domain: Full-stack web (mobile-optimized SPA + REST API)
- Complexity level: Low
- Estimated architectural components: ~6 (shell, app registry, archery app module, session API, file store, Docker build pipeline)

### Technical Constraints & Dependencies

- Backend: Python / FastAPI (fixed)
- Frontend: Vue 3 + Quasar (fixed)
- Persistence: JSON files on host filesystem, mounted as Docker volume at DATA_DIR
- Deployment: Single docker-compose.yml, one container, one port
- FE delivery: SPA static assets served by FastAPI (e.g. via StaticFiles mount)
- No external services, no database, no auth

### Cross-Cutting Concerns Identified

- **App registry pattern**: Shell must discover apps without coupling — impacts both router config and BE route namespacing
- **API contract**: FE/BE interface for session lifecycle (create, auto-save, resume, discard, finalise, history list, history detail)
- **Atomic file I/O**: Temp file writes must not corrupt on partial failure — write-then-rename pattern required
- **State hydration**: On resume, BE returns full session state; FE reconstructs board (green targets, entered scores) from that payload — schema must support this

## Starter Template Evaluation

### Primary Technology Domain

Full-stack web (mobile-optimized SPA + REST API) — stack fixed by PRD technical constraints.

### Starter Options Considered

No unified FastAPI + Vue 3 + Quasar starter template with sufficient maintenance status exists.
Closest candidates reviewed:
- Vue3-FastAPI-WebApp-template (Tomansion/GitHub) — uses Vuetify, not Quasar; would require significant divergence
- Vue3-Vite-Quasar-starter-template (Shathiso/GitHub) — FE only, no backend

**Decision: Custom scaffold.** Given the constrained, well-defined stack, a thin manual scaffold avoids inheriting mismatched opinions and keeps the project surface minimal.

### Selected Approach: Manual Scaffold

**Rationale:** PRD has already made all significant technology decisions. A custom scaffold gives full control over the monorepo layout, avoids Quasar-incompatible UI library conflicts, and keeps the Docker wiring explicit.

**Initialization Commands:**

```bash
# Frontend — Quasar CLI (Vue 3 + Vite, Composition API, Sass)
npm create quasar@latest frontend
# Select: Quasar App CLI with Vite → Vue 3 → Composition API → Sass

# Backend — FastAPI
mkdir backend
cd backend && python -m venv .venv && pip install fastapi uvicorn
```

**Architectural Decisions Established by Scaffold:**

**Language & Runtime:**
- Frontend: TypeScript (selected during Quasar init), Vite build toolchain
- Backend: Python 3.x, Uvicorn ASGI server

**Styling Solution:**
- Quasar component library (mobile-first, ≥44px targets by default), Sass for custom styles

**Build Tooling:**
- Frontend: Vite (fast dev server, optimized prod bundle via `quasar build`)
- Backend: No build step; Python runs directly

**Code Organization:**
- Frontend: Quasar's default layout — `src/layouts/`, `src/pages/`, `src/components/`, `src/router/`, `src/stores/`
- Backend: `app/main.py`, `app/routers/`, `app/services/`, `app/repositories/`, `app/schemas/`, `app/core/`

**Development Experience:**
- Quasar CLI dev server with HMR on port 9000 (or similar)
- Uvicorn with `--reload` on port 8000
- Docker Compose wires them for production: FE static assets served by FastAPI StaticFiles mount

**Note:** Project initialization using this scaffold is the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- JSON session schema (all CRUD depends on this shape)
- Atomic write strategy (data integrity)
- REST API endpoint contract (FE/BE coupling point)
- App registry pattern (shell extensibility)

**Important Decisions (Shape Architecture):**
- Pinia for state management
- Vue Router history mode + FastAPI catch-all
- Multi-stage Docker build
- FastAPI router namespacing per app

**Deferred Decisions (Post-MVP):**
- API versioning (`/v1/` prefix) — add when breaking changes occur
- CORS config — not needed while same-origin; revisit if FE moves to separate service
- PWA manifest / offline support

### Data Architecture

**Session JSON Schema:**
```json
{
  "label": "2026-05-28",
  "created": "2026-05-28T14:00:00Z",
  "status": "finalised | in_progress",
  "archers": ["Alice", "Bob"],
  "targets": [
    {
      "number": 1,
      "scores": {
        "Alice": [10, 8],
        "Bob": [5, 0]
      }
    }
  ]
}
```
- `archers` array preserves roster order
- `scores` keyed by archer name (names are unique per session per FR-2.2)
- `targets` array contains only confirmed targets (absent = not yet confirmed)

**Atomic Write Strategy:**
- Write to a `.tmp` swap file first, then `os.replace()` over the target path
- `os.replace()` is atomic on POSIX; best-effort on Windows (acceptable for LAN personal use)
- Applies to both in-progress temp file and finalised session files

**File Naming:**
- Finalised sessions: `YYYY-MM-DD.json`, `YYYY-MM-DD-2.json`, `YYYY-MM-DD-3.json`
- In-progress temp: `_in_progress.json` (single, fixed name — only one at a time per FR-3.8)
- All files stored in `DATA_DIR` (env var, default `/data` in container)

### Authentication & Security

None required (FR: no auth, LAN-only). Architectural implications:
- No CORS configuration needed — FE SPA served from same FastAPI origin
- No session tokens, no middleware auth layer
- FastAPI catch-all route serves `index.html` for all unknown paths (supports Vue Router history mode)

### API & Communication Patterns

**REST Endpoints:**
```
GET    /api/apps                                  → registered app list (shell)
POST   /api/archery/sessions                      → create new session (set roster)
GET    /api/archery/sessions/in-progress          → check for in-progress session
PUT    /api/archery/sessions/in-progress          → auto-save target scores
POST   /api/archery/sessions/in-progress/finalise → write permanent session file
DELETE /api/archery/sessions/in-progress          → discard in-progress session
GET    /api/archery/sessions                      → history list (newest first)
GET    /api/archery/sessions/{label}              → history detail (read-only)
```

**Versioning:** No `/v1/` prefix in v1 — add only when breaking changes require it.

**Error Format:** FastAPI default `{"detail": "..."}` — no custom wrapper needed at this scale.

**HTTP Status Codes:** Standard usage — 200 OK, 201 Created, 404 Not Found, 409 Conflict (e.g. session already in progress), 422 Unprocessable Entity (FastAPI validation).

### Frontend Architecture

**State Management:** Pinia (Vue 3 official, ships with Quasar)
- `useShellStore` — registered apps list
- `useArcherySessionStore` — active session state (roster, targets, scores)
- `useArcheryHistoryStore` — history list + selected detail

**App Registry:** Static `src/apps/registry.ts` exporting a typed array:
```ts
export interface AppDescriptor { id: string; label: string; icon: string; route: string }
export const apps: AppDescriptor[] = [
  { id: 'archery', label: 'Archery Score Counter', icon: 'sports_score', route: '/archery' }
]
```
Adding a new app = append one entry. No dynamic discovery, no backend scanning.

**Routing:** Vue Router, history mode. Lazy-loaded per-app routes:
```ts
{ path: '/archery', component: () => import('@/apps/archery/ArcheryApp.vue') }
```
FastAPI serves `index.html` for all unmatched routes (catch-all after API and static routes).

**Component Architecture:** Feature-based folders under `src/apps/{app-id}/` — each app is self-contained. Shared UI primitives in `src/components/`.

### Infrastructure & Deployment

**Docker Build:** Multi-stage Dockerfile
- Stage 1 (`node`): `npm install && quasar build` → outputs to `dist/spa/`
- Stage 2 (`python`): installs FastAPI deps, copies `dist/spa/`, runs Uvicorn
- Single image, single container

**Port:** FastAPI on `0.0.0.0:8000` inside container → `8000:8000` mapping in Compose.

**Volume:** Named Docker volume mounted at `DATA_DIR` (`/data`). Compose definition:
```yaml
volumes:
  archery-data:
services:
  app:
    volumes:
      - archery-data:/data
    environment:
      - DATA_DIR=/data
```

### Decision Impact Analysis

**Implementation Sequence:**
1. Scaffold (Quasar init + FastAPI setup + Dockerfile + Compose)
2. App registry + shell routing
3. Session JSON schema + file repository layer
4. Archery session API endpoints
5. Archery FE — session setup flow
6. Archery FE — scoring board + score entry panel
7. Archery FE — results screen
8. Archery FE — history list + detail

**Cross-Component Dependencies:**
- Session schema shared between BE repository and FE Pinia store shape
- App registry drives both FE router config and shell landing page cards
- Docker multi-stage build couples `quasar build` output path to FastAPI `StaticFiles` mount path

## Implementation Patterns & Consistency Rules

### Naming Patterns

**API Naming:**
- Endpoints: plural `kebab-case` segments — `/api/archery/sessions`, not `/session` or `/Sessions`
- Query params: `snake_case` — `?archer_name=Alice`
- JSON fields (both request and response): `snake_case` throughout

**Python (Backend):**
- Functions/variables: `snake_case`
- Classes / Pydantic models: `PascalCase`
- Files/modules: `snake_case` (`session_repository.py`)

**TypeScript/Vue (Frontend):**
- Vue components: `PascalCase` filename and component name (`ScoreEntryPanel.vue`)
- Composables: `camelCase` with `use` prefix (`useArcherySession.ts`)
- Pinia stores: `camelCase` with `use` prefix + `Store` suffix (`useArcherySessionStore`)
- TypeScript interfaces/types: `PascalCase` (`SessionData`, `AppDescriptor`)
- CSS classes: `kebab-case`

### Structure Patterns

**Backend layout:**
```
backend/
  app/
    main.py              ← FastAPI app + StaticFiles mount + catch-all route
    routers/
      archery.py         ← all /api/archery/* routes
      shell.py           ← /api/apps route
    services/
      archery_service.py ← business logic (score calculation, session label generation)
    repositories/
      session_repo.py    ← all file I/O (read/write/list JSON), atomic writes
    schemas/
      session.py         ← Pydantic request/response models
    core/
      config.py          ← DATA_DIR and all env-var settings
```

**Frontend layout:**
```
frontend/src/
  apps/
    archery/             ← self-contained; all archery pages + components
      pages/
      components/
      stores/
      composables/
    registry.ts          ← AppDescriptor[] — single source of truth for shell
  components/            ← shared primitives only (AppCard, etc.)
  layouts/
    MainLayout.vue       ← shell chrome, persistent home control
  router/
    index.ts             ← base routes + lazy imports per app
  composables/
    useApi.ts            ← all HTTP calls — never raw fetch/axios in components
```

### Format Patterns

**API Responses — direct, no envelope:**
- Success: resource serialized directly (Pydantic model)
- List: array directly `[...]`
- Error: FastAPI default `{"detail": "message"}`
- No `{"data": ..., "status": "ok"}` wrapper

**Dates/times:** Always ISO 8601 strings in JSON (`"2026-05-28T14:00:00Z"`). Frontend formats for display via a single `formatDate()` utility — never inline.

**Shot values:** Always stored/transmitted as integers (`0, 5, 8, 10, 11`) — never strings.

### State Management Patterns

**Pinia store shape — consistent across all stores:**
```ts
export const useArcherySessionStore = defineStore('archerySession', () => {
  const session = ref<SessionData | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function loadInProgress() {
    loading.value = true
    error.value = null
    try {
      session.value = await api.get('/api/archery/sessions/in-progress')
    } catch (e) {
      error.value = String(e)
    } finally {
      loading.value = false
    }
  }

  return { session, loading, error, loadInProgress }
})
```
- Every store exposes: data ref + `loading` + `error`
- State is never mutated outside the store's own actions
- All HTTP calls go through `useApi.ts` composable — never raw `fetch`/`axios`

### Process Patterns

**Error Handling:**
- Backend: raise `HTTPException` at router layer; repositories never swallow errors silently
- Frontend: API errors land in `store.error` ref; components display via `QBanner` or `$q.notify` — `console.error` alone is never the only handling

**Loading States:**
- Every async store action: `loading = true` before call, `loading = false` in `finally` block
- Components bind `QBtn :loading="store.loading"` or show `QSpinner` while loading is true

### Enforcement Guidelines

**All AI agents MUST:**
- Follow the backend/frontend folder structures exactly — do not create new top-level directories without architecture review
- Use `snake_case` for all JSON fields, `PascalCase` for all Vue components and Pydantic models
- Route all HTTP calls through `useApi.ts` — never call `fetch` directly in a component or store
- Use atomic write pattern (`write to .tmp` → `os.replace()`) for all file persistence operations
- Expose `loading` and `error` refs from every Pinia store action

**Anti-Patterns to Avoid:**
- ❌ Wrapping API responses in `{"data": ..., "status": ...}` envelopes
- ❌ Storing dates as Unix timestamps in JSON (use ISO 8601 strings)
- ❌ Placing archery-specific components in `src/components/` (use `src/apps/archery/components/`)
- ❌ Direct `fetch()` calls in Vue components
- ❌ Skipping the `loading`/`error` pattern in async store actions

## Project Structure & Boundaries

### Complete Project Directory Structure

```
application-dock/                         ← repo root
├── docker-compose.yml
├── .env.example
├── .gitignore
├── README.md
│
├── backend/
│   ├── Dockerfile                        ← multi-stage: node build → python serve
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py                       ← FastAPI app, StaticFiles mount, catch-all
│       ├── routers/
│       │   ├── __init__.py
│       │   ├── shell.py                  ← GET /api/apps
│       │   └── archery.py                ← all /api/archery/* routes
│       ├── services/
│       │   ├── __init__.py
│       │   └── archery_service.py        ← score calc, session label generation, resume logic
│       ├── repositories/
│       │   ├── __init__.py
│       │   └── session_repo.py           ← file I/O: read/write/list JSON, atomic writes
│       ├── schemas/
│       │   ├── __init__.py
│       │   └── session.py                ← Pydantic models: SessionData, TargetScores, etc.
│       └── core/
│           ├── __init__.py
│           └── config.py                 ← DATA_DIR and all env-var settings (pydantic-settings)
│
├── frontend/                             ← Quasar CLI project root
│   ├── package.json
│   ├── quasar.config.js
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       ├── App.vue
│       ├── apps/
│       │   ├── registry.ts               ← AppDescriptor[] — shell source of truth
│       │   └── archery/
│       │       ├── pages/
│       │       │   ├── ArcheryHomePage.vue       ← new session + history entry point
│       │       │   ├── SessionSetupPage.vue      ← roster entry (FR-2.1–2.3)
│       │       │   ├── ScoringBoardPage.vue      ← 18 target board (FR-2.5–2.12)
│       │       │   ├── ResultsPage.vue           ← ranked results + breakdown (FR-2.13–2.17)
│       │       │   ├── HistoryPage.vue           ← session list (FR-2.18–2.19)
│       │       │   └── HistoryDetailPage.vue     ← read-only results view (FR-2.20)
│       │       ├── components/
│       │       │   ├── TargetIcon.vue            ← single target (green/open state)
│       │       │   ├── ScoreEntryPanel.vue       ← per-archer shot entry (FR-2.7–2.10)
│       │       │   ├── ShotButton.vue            ← single value button (0/5/8/10/11)
│       │       │   ├── ResultsTable.vue          ← per-archer per-target breakdown
│       │       │   └── HistoryListItem.vue       ← single history card
│       │       ├── stores/
│       │       │   ├── useArcherySessionStore.ts ← active session state + API actions
│       │       │   └── useArcheryHistoryStore.ts ← history list + detail
│       │       └── composables/
│       │           └── useSessionLabel.ts        ← display formatting for session labels
│       ├── components/                   ← shared primitives only
│       │   └── AppCard.vue               ← shell landing page app tile
│       ├── layouts/
│       │   └── MainLayout.vue            ← shell chrome, persistent home button (FR-1.3)
│       ├── pages/
│       │   ├── HomePage.vue              ← shell landing, renders AppCard per registry entry
│       │   └── ErrorNotFound.vue
│       ├── router/
│       │   └── index.ts                  ← routes + lazy-loaded app routes
│       ├── composables/
│       │   ├── useApi.ts                 ← all HTTP calls (axios or fetch wrapper)
│       │   └── useFormatDate.ts          ← ISO 8601 → display string
│       └── css/
│           └── app.sass
│
└── data/                                 ← gitignored; exists only on host
    ← JSON session files land here via Docker volume
```

### Architectural Boundaries

**API Boundaries:**
- All backend routes prefixed `/api/` — FastAPI never serves frontend routes directly
- Shell routes: `/api/apps` (read-only registry)
- Archery routes: `/api/archery/*` (full session lifecycle)
- Catch-all: any non-`/api/` path → `dist/spa/index.html`

**Component Boundaries:**
- `src/apps/archery/` is fully self-contained — shell imports nothing from it except via `registry.ts`
- `src/components/` holds only primitives used by ≥2 apps — archery-specific UI stays in `src/apps/archery/components/`
- Stores never call each other — components orchestrate between stores if needed

**Service Boundaries (Backend):**
- Routers: parse/validate request, delegate to service, return response — no business logic
- Services: business logic only — no file I/O, call repositories
- Repositories: file I/O only — no business logic, no HTTP concerns

**Data Boundaries:**
- `session_repo.py` is the only code that touches the filesystem
- All writes use atomic write-then-replace pattern
- `_in_progress.json` is the only mutable file during a session; all finalised files are immutable

### Requirements to Structure Mapping

| FR Category | Files |
|-------------|-------|
| F1 — Multi-App Shell | `src/layouts/MainLayout.vue`, `src/pages/HomePage.vue`, `src/apps/registry.ts`, `src/router/index.ts`, `backend/app/routers/shell.py` |
| F2.1 — Session Setup | `src/apps/archery/pages/SessionSetupPage.vue`, `backend/app/routers/archery.py` (POST /sessions) |
| F2.2 — Score Entry | `src/apps/archery/pages/ScoringBoardPage.vue`, `src/apps/archery/components/ScoreEntryPanel.vue`, `src/apps/archery/components/ShotButton.vue`, `src/apps/archery/components/TargetIcon.vue` |
| F2.3 — Session Results | `src/apps/archery/pages/ResultsPage.vue`, `src/apps/archery/components/ResultsTable.vue` |
| F2.4 — Session History | `src/apps/archery/pages/HistoryPage.vue`, `src/apps/archery/pages/HistoryDetailPage.vue`, `src/apps/archery/components/HistoryListItem.vue` |
| F3 — Persistence | `backend/app/repositories/session_repo.py`, `backend/app/schemas/session.py`, `backend/app/core/config.py` |

### Data Flow

**Score entry → persistence:**
```
ScoringBoardPage → ScoreEntryPanel (user confirms target)
  → useArcherySessionStore.saveTarget()
    → useApi.ts PUT /api/archery/sessions/in-progress
      → archery router → archery_service → session_repo.write_in_progress()
        → write .tmp → os.replace() → _in_progress.json updated
```

**Session resume:**
```
ArcheryHomePage mounts
  → useArcherySessionStore.checkInProgress()
    → GET /api/archery/sessions/in-progress
      → session_repo.read_in_progress() → returns SessionData with status: in_progress
        → store hydrates → ScoringBoardPage restores green targets from targets array
```

### Development Workflow Integration

**Development:** Quasar CLI dev server (port 9000, HMR) + Uvicorn `--reload` (port 8000). FE proxies `/api/*` to BE during dev via `quasar.config.js` `devServer.proxy`.

**Production:** `docker compose up` — single container, single port (8000). Multi-stage Dockerfile builds SPA in node stage, copies `dist/spa/` into Python image, served via FastAPI `StaticFiles`.

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:** All technology choices compatible — FastAPI/Uvicorn/Pydantic + Vue 3/Quasar/Vite/Pinia/Vue Router. No version conflicts.

**Pattern Consistency:** snake_case JSON/Python, PascalCase Vue/Pydantic — consistent throughout. `useApi.ts` as single HTTP boundary eliminates store-level API divergence.

**Structure Alignment:** Directory structure directly reflects layered architecture decisions. Multi-stage Docker build cleanly separates concerns.

**Correction Applied:** `useShellStore` removed from scope — `registry.ts` is a static array, no store required. Shell reads `apps` directly from `registry.ts`.

### Requirements Coverage Validation ✅

**Functional Requirements:** 21/21 FRs covered — all mapped to specific files in Project Structure section.

**Non-Functional Requirements:**
- NFR-1/2: Quasar mobile-first layout + ShotButton ≥44px tap targets ✅
- NFR-3: No auth, no CORS, LAN-only ✅
- NFR-4: Lazy-loaded routes minimise initial bundle ✅
- NFR-5: Single `docker compose up` via multi-stage Dockerfile ✅

### Implementation Readiness Validation ✅

**Decision Completeness:** All critical decisions documented. API contract fully specified. Session JSON schema defined. Atomic write strategy specified.

**Structure Completeness:** Every file named and mapped to a FR. Boundaries explicit.

**Pattern Completeness:** Naming, structure, format, state management, and error handling patterns all defined with examples and anti-patterns.

### Gap Analysis Results

**Critical Gaps:** None.

**Minor Gaps:**
- Test directory structure not defined — co-located `*.spec.ts` for FE, `backend/tests/` for pytest (add in scaffold story)
- `docker-compose.override.yml` for dev workflow not specified (add in scaffold story)

**Nice-to-Have:**
- Explicit pinned versions in `requirements.txt` not listed (implementation detail for scaffold story)

### Architecture Completeness Checklist

**Requirements Analysis**
- [x] Project context thoroughly analyzed
- [x] Scale and complexity assessed
- [x] Technical constraints identified
- [x] Cross-cutting concerns mapped

**Architectural Decisions**
- [x] Critical decisions documented with versions
- [x] Technology stack fully specified
- [x] Integration patterns defined
- [x] Performance considerations addressed

**Implementation Patterns**
- [x] Naming conventions established
- [x] Structure patterns defined
- [x] Communication patterns specified
- [x] Process patterns documented

**Project Structure**
- [x] Complete directory structure defined
- [x] Component boundaries established
- [x] Integration points mapped
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION

**Confidence Level:** High

**Key Strengths:**
- Extremely tight scope — stack fixed, no auth, no database, one active session at a time
- Clear layering (router → service → repository) prevents logic leakage
- Static app registry makes shell extensibility trivial
- Atomic file writes protect data integrity without a database

**Areas for Future Enhancement:**
- API versioning prefix when breaking changes arrive
- CORS config if FE moves to a separate service/container
- Real-time concurrent scoring (WebSocket) for multi-device entry
- PWA manifest for offline/homescreen support

### Implementation Handoff

**AI Agent Guidelines:**
- Follow all architectural decisions exactly as documented
- Use implementation patterns consistently across all components
- Respect project structure and boundaries
- Refer to this document for all architectural questions
- Never add a new top-level directory without architecture review

**First Implementation Priority:**
```bash
# Stage 1 — Scaffold
npm create quasar@latest frontend
# Select: Quasar App CLI with Vite → Vue 3 → Composition API → TypeScript → Sass

mkdir backend && cd backend
python -m venv .venv && pip install fastapi uvicorn pydantic-settings
```
