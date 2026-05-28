# Application Dock

Multi-app platform shell. v1 ships with one app: **Archery Score Counter**.

## Stack

- **Backend** — Python 3.12 + FastAPI + Uvicorn + Pydantic v2 + pydantic-settings
- **Frontend** — Vue 3 + Quasar v2 + Vite + TypeScript + Sass + Pinia + Vue Router
- **Persistence** — JSON files on a Docker volume (no database)
- **Deployment** — Single `docker compose up`

## Quickstart — Production (single container)

Prerequisite: Docker + Docker Compose.

```bash
docker compose up --build
```

App is then reachable at <http://localhost:8000>.

Data persists in the named Docker volume `archery-data` (mounted at `/data` inside the container, defaulting from the `DATA_DIR` env var).

## Quickstart — Local dev (two terminals)

Prerequisites: Node 20+, Python 3.12+.

**Terminal 1 — Backend** (FastAPI on port 8000, with hot reload):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
export DATA_DIR=./local-data   # local writable path; /data isn't writable outside Docker
uvicorn app.main:app --reload --port 8000
```

**Terminal 2 — Frontend** (Quasar dev server on port 9000, proxies `/api/*` to backend):

```bash
cd frontend
npm install
npm run dev
```

Open <http://localhost:9000>.

> If port 9000 is taken on your machine, pass `--port 9100` to `npm run dev` and adjust manually.

## Project layout

```
application-dock/
├── backend/          ← FastAPI app + Dockerfile
├── frontend/         ← Quasar SPA (Vite)
├── docker-compose.yml
├── docs/
│   ├── architecture.md       ← whole architecture (symlink → planning-artifacts)
│   ├── architecture/         ← coding-standards.md, tech-stack.md, source-tree.md
│   ├── prd.md                ← (symlink)
│   ├── epics.md              ← (symlink)
│   ├── ux/                   ← DESIGN.md, EXPERIENCE.md, mockups/ (symlink)
│   └── stories/              ← one file per implementation story
└── _bmad-output/     ← original planning artifacts (canonical files; symlinked into docs/)
```

For the authoritative architecture and full project source tree, see `docs/architecture.md` and `docs/architecture/source-tree.md`.

## Tests

**Backend:**

```bash
cd backend
.venv/bin/pytest
```

**Frontend:**

```bash
cd frontend
npm test
```
