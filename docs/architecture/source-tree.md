# Source Tree

Loaded into every dev agent's context. Authoritative reference for where code lives. Do not deviate from this structure without architecture review.

## Top-level layout

```
application-dock/                       ← repo root
├── docker-compose.yml                  ← single-service, single-port, named volume
├── .env.example                        ← documents DATA_DIR
├── .gitignore
├── README.md
│
├── backend/
│   ├── Dockerfile                      ← multi-stage: node build → python serve
│   ├── requirements.txt                ← runtime deps
│   ├── requirements-dev.txt            ← pytest, httpx, black, ruff
│   ├── .env.example
│   ├── app/
│   │   └── …                           ← see "Backend (app/)" below
│   └── tests/                          ← pytest tests; one file per module under test
│
├── frontend/                           ← Quasar CLI project root
│   ├── package.json
│   ├── quasar.config.js                ← devServer.proxy, framework brand colors
│   ├── tsconfig.json
│   ├── index.html
│   └── src/
│       └── …                           ← see "Frontend (src/)" below
│
├── docs/
│   ├── architecture.md                 ← symlink → _bmad-output/planning-artifacts/architecture.md
│   ├── architecture/                   ← dev-load-always shards (this file + tech-stack + coding-standards)
│   ├── prd.md                          ← symlink → _bmad-output/planning-artifacts/prds/…/prd.md
│   ├── epics.md                        ← symlink → _bmad-output/planning-artifacts/epics.md
│   ├── ux/                             ← symlink → _bmad-output/planning-artifacts/ux-designs/ux-Code-2026-05-28
│   │   ├── DESIGN.md
│   │   ├── EXPERIENCE.md
│   │   └── mockups/                    ← HTML reference mockups
│   └── stories/                        ← one file per drafted story (created by SM)
│
├── data/                               ← gitignored; exists only on host; mounted into container
│   └── …                               ← *.json finalised sessions + _in_progress.json
│
└── _bmad-output/                       ← original planning-artifacts; symlinked into docs/
```

## Backend (`backend/app/`)

```
backend/app/
├── main.py                             ← FastAPI app, StaticFiles mount, catch-all route
├── routers/
│   ├── __init__.py
│   ├── shell.py                        ← GET /api/apps
│   └── archery.py                      ← all /api/archery/* routes
├── services/
│   ├── __init__.py
│   └── archery_service.py              ← business logic: score calc, label generation, resume/finalise orchestration
├── repositories/
│   ├── __init__.py
│   └── session_repo.py                 ← file I/O ONLY: read_session, write_session, list_sessions, write_in_progress, read_in_progress, delete_in_progress, _atomic_write_json
├── schemas/
│   ├── __init__.py
│   └── session.py                      ← Pydantic models: SessionData, TargetScores, SessionStatus, SessionSummary, CreateSessionRequest
└── core/
    ├── __init__.py
    └── config.py                       ← pydantic-settings `Settings` (DATA_DIR), singleton `settings`
```

### Backend layering rule

```
routers/  →  services/  →  repositories/
  HTTP        logic only      file I/O only
```

- Routers parse/validate request, call service, return response. No business logic. No file I/O.
- Services do all logic. They call repositories — they never touch the filesystem directly.
- Repositories do all file I/O. They never raise `HTTPException`. They raise stdlib exceptions (`FileNotFoundError`, `ValueError`).
- Routers translate stdlib exceptions into `HTTPException`.

`session_repo.py` is the **only** module that touches the filesystem. All writes use `_atomic_write_json` (write `.tmp` → `os.replace()`).

## Frontend (`frontend/src/`)

```
frontend/src/
├── App.vue
│
├── apps/
│   ├── registry.ts                     ← AppDescriptor[] — single source of truth for shell
│   └── archery/                        ← fully self-contained app
│       ├── pages/
│       │   ├── ArcheryHomePage.vue     ← New Session + History + Resume sheet
│       │   ├── SessionSetupPage.vue    ← roster entry (FR-2.1–2.3)
│       │   ├── ScoringBoardPage.vue    ← 18-target board (FR-2.5–2.12)
│       │   ├── ResultsPage.vue         ← ranked results + finalise (FR-2.13–2.17)
│       │   ├── HistoryPage.vue         ← session list (FR-2.18–2.19)
│       │   └── HistoryDetailPage.vue   ← read-only results view (FR-2.20)
│       ├── components/
│       │   ├── TargetIcon.vue
│       │   ├── ScoreEntryPanel.vue
│       │   ├── ShotButton.vue
│       │   ├── ArcherChip.vue
│       │   ├── ResultsTable.vue        ← reused on ResultsPage + HistoryDetailPage
│       │   └── HistoryListItem.vue
│       ├── stores/
│       │   ├── useArcherySessionStore.ts
│       │   └── useArcheryHistoryStore.ts
│       ├── composables/
│       │   ├── useScores.ts            ← totals + ranking helpers
│       │   ├── useScoreEntry.ts        ← (optional) score entry state machine
│       │   └── useSessionLabel.ts      ← display formatting (Story 5.1)
│       └── types.ts                    ← SessionData, TargetScores, SessionSummary TS interfaces
│
├── components/                         ← shared primitives ONLY (used by >=2 apps or shell)
│   └── AppCard.vue                     ← shell landing page card
│
├── layouts/
│   └── MainLayout.vue                  ← shell chrome, top app bar, persistent home button
│
├── pages/                              ← shell pages (NOT app pages)
│   ├── HomePage.vue                    ← landing, renders AppCard per registry entry
│   └── ErrorNotFound.vue
│
├── router/
│   └── index.ts                        ← base routes + lazy-loaded per-app routes
│
├── composables/                        ← shell-level composables
│   ├── useApi.ts                       ← ALL HTTP calls; throws ApiError on non-2xx
│   └── useFormatDate.ts                ← ISO 8601 → display string
│
└── css/
    ├── app.sass
    └── quasar.variables.sass           ← Carbon theme tokens (surface, ink, accent, confirmed, etc.)
```

### Frontend boundary rules

- `src/apps/archery/` is **self-contained**. Shell never imports from it except `apps/registry.ts`.
- `src/components/` holds **primitives only** (used by shell or multiple apps). Archery-specific components live under `src/apps/archery/components/`.
- Stores never call other stores. Components orchestrate.
- All HTTP through `useApi.ts`. No raw `fetch`/`axios`.
- Routes are **lazy-loaded** (`() => import(...)`) for bundle splitting (NFR-4).
- Vue Router uses `createWebHistory()` (history mode). The backend serves `index.html` for any non-`/api/` path.

## File naming patterns

| Asset | Convention | Example |
|-------|-----------|---------|
| Python modules | `snake_case` | `session_repo.py` |
| Python classes | `PascalCase` | `SessionData` |
| Vue components (files + names) | `PascalCase` | `ScoreEntryPanel.vue` |
| Composables | `camelCase` with `use` prefix | `useArcherySession.ts` |
| Pinia stores | `useXStore` camelCase | `useArcheryHistoryStore` |
| TS types/interfaces | `PascalCase` | `AppDescriptor` |
| API endpoints | `kebab-case`, plural | `/api/archery/sessions` |
| JSON fields | `snake_case` | `archer_count`, `winning_score` |
| Session files | `YYYY-MM-DD[-N].json` | `2026-05-28-2.json` |
| In-progress file | fixed name | `_in_progress.json` |

## Where things go (quick lookup by FR)

| FR area | Backend | Frontend |
|---------|---------|----------|
| Multi-app shell (FR-1.x) | `routers/shell.py` | `layouts/MainLayout.vue`, `pages/HomePage.vue`, `apps/registry.ts`, `router/index.ts`, `components/AppCard.vue` |
| Session setup (FR-2.1–2.4) | `routers/archery.py` POST `/sessions`, `services/archery_service.py` (label gen) | `apps/archery/pages/SessionSetupPage.vue`, `apps/archery/stores/useArcherySessionStore.ts`, `apps/archery/components/ArcherChip.vue` |
| Scoring board (FR-2.5–2.12) | n/a (UI-only here) | `apps/archery/pages/ScoringBoardPage.vue`, `apps/archery/components/TargetIcon.vue` |
| Score entry (FR-2.7–2.10) | n/a (UI-only here) | `apps/archery/components/ScoreEntryPanel.vue`, `apps/archery/components/ShotButton.vue` |
| Results + finalise (FR-2.13–2.17) | `routers/archery.py` POST `/sessions/in-progress/finalise` | `apps/archery/pages/ResultsPage.vue`, `apps/archery/components/ResultsTable.vue` |
| History (FR-2.18–2.21) | `routers/archery.py` GET `/sessions`, GET `/sessions/{label}` | `apps/archery/pages/HistoryPage.vue`, `apps/archery/pages/HistoryDetailPage.vue`, `apps/archery/components/HistoryListItem.vue` |
| Persistence (FR-3.x) | `repositories/session_repo.py`, `schemas/session.py`, `core/config.py` | n/a (state is server-side) |
| Auto-save / resume (FR-3.5–3.8) | `routers/archery.py` PUT/GET/DELETE `/sessions/in-progress` | `useArcherySessionStore` actions: `saveTarget`, `checkInProgress`, `resumeSession`, `discardSession` |

## Anti-patterns (NEVER)

- New top-level directory without architecture review.
- Files placed under wrong layer (e.g. business logic in `repositories/`, UI primitive under `apps/archery/`).
- Cross-app imports (`apps/archery/` importing from another `apps/*`).
- `src/components/` containing archery-specific code.
- Raw `fetch`/`axios` in components or stores.
- File I/O outside `repositories/`.
