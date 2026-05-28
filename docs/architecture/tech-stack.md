# Tech Stack

Loaded into every dev agent's context. Authoritative source: `docs/architecture.md`. This file is the dev-facing summary.

## Backend

| Concern | Choice | Version pin (recommended) | Notes |
|---------|--------|---------------------------|-------|
| Language | Python | 3.12 | Container base `python:3.12-slim` |
| Web framework | FastAPI | latest stable | Uvicorn ASGI server |
| ASGI server | Uvicorn (`uvicorn[standard]`) | latest stable | `--reload` in dev |
| Validation / Models | Pydantic v2 | latest stable | Used for all request/response schemas |
| Settings | pydantic-settings | latest stable | Reads `DATA_DIR` env var; default `/data` |
| Persistence | JSON files on filesystem | n/a | No database. One file per session. Atomic write via `os.replace()`. |
| Test runner | pytest | latest stable | + `httpx` for `TestClient` |
| Formatter | black | latest stable | Default settings |
| Linter | ruff | latest stable | Default + isort rules |

## Frontend

| Concern | Choice | Version pin | Notes |
|---------|--------|-------------|-------|
| Language | TypeScript | strict mode | Selected during Quasar init |
| UI framework | Vue 3 | latest stable | Composition API, `<script setup>` |
| Component library | Quasar | v2 | Material Design 2 base; Carbon theme overrides per `docs/ux/DESIGN.md` |
| Build tool | Vite | latest stable | Via Quasar CLI |
| State management | Pinia | latest stable | Ships with Quasar |
| Router | Vue Router | v4, history mode | NOT hash mode |
| HTTP client | axios OR fetch | n/a | Single wrapper in `src/composables/useApi.ts`; throws `ApiError` on non-2xx |
| Styling | Sass | n/a | Carbon theme tokens in `src/css/quasar.variables.sass` |
| Icons | Material Icons | Quasar default set | E.g. `home`, `chevron_right`, `sports_score` |
| Test runner | Vitest | Quasar default | Co-located `*.spec.ts` |
| Component test utils | @vue/test-utils | latest stable | + `@pinia/testing` |
| Formatter | Prettier | Quasar default config | |
| Linter | ESLint | Quasar default config | `@vue/eslint-config-typescript` + `prettier` |

## Infrastructure

| Concern | Choice | Notes |
|---------|--------|-------|
| Container runtime | Docker | Single image, single container |
| Image build | Multi-stage Dockerfile | Stage 1 `node:24-alpine` runs `quasar build`; Stage 2 `python:3.12-slim` serves via Uvicorn |
| Orchestration | Docker Compose | Single service; volume `archery-data:/data`; port `8000:8000` |
| FE asset serving | FastAPI `StaticFiles` | `dist/spa/` mounted at `/`; catch-all serves `index.html` for non-`/api/` paths (Vue Router history mode) |
| Dev FE → BE proxy | `quasar.config.js` `devServer.proxy` | Routes `/api/*` from port 9000 → `http://localhost:8000` |
| Persistence volume | Named Docker volume | `archery-data` mounted at `DATA_DIR` (default `/data`) |
| Environment | `.env` + `DATA_DIR` env var | No other config required in v1 |

## Out of scope (v1)

- Database — JSON files only
- Authentication / authorization — no auth, LAN-only
- CORS — single origin
- API versioning prefix (`/v1/`) — add only when breaking change required
- WebSocket / real-time multi-device — last-write-wins is accepted
- PWA / offline / native install
- CI/CD — manual `docker compose up`
- External services / third-party APIs

## Decisions and references

For full architectural rationale see `docs/architecture.md`. Key sections:
- `#Selected Approach: Manual Scaffold` — why no starter template
- `#Data Architecture` — session JSON schema + atomic write strategy
- `#API & Communication Patterns` — endpoint list + status code conventions
- `#Frontend Architecture` — Pinia + app registry pattern
- `#Infrastructure & Deployment` — Docker multi-stage + Compose + volume
