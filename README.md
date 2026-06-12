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
└── docs/
    ├── architecture/         ← coding-standards.md, tech-stack.md, source-tree.md
    ├── stories/              ← per-app subfolders (archery-tracker/, application-dock-general/, etc.)
    │                           each contains for-review/ and done/ buckets; drafts sit in the app root
    ├── implementation-artifacts/
    └── planning-artifacts/   ← architecture.md, epics.md, prd, ux-designs/
```

For the authoritative architecture and full project source tree, see `docs/architecture/source-tree.md`.

## Updating

The Settings page exposes an **Update applications** button that triggers a host-side
update script via the Docker socket. To enable it:

1. **Create an update script** at a path on the host, e.g. `/opt/application-dock/scripts/update-application-dock.sh`.
   The script must be executable (`chmod +x`) and may issue any `docker compose` / `docker`
   commands needed to pull and restart the stack.

2. **Pre-pull the sidecar image** on the host:
   ```bash
   docker pull docker:cli
   ```

3. **Set `HOST_SCRIPTS_DIR`** in your environment (or a `.env` file alongside `docker-compose.yml`)
   to the absolute host path of the scripts directory:
   ```bash
   HOST_SCRIPTS_DIR=/opt/application-dock/scripts
   ```
   Both the volume mount and the `HOST_SCRIPTS_DIR_ON_HOST` env var inside the container
   are derived from this single value.

4. **Restart the stack** — `docker compose up -d` — to apply the new mounts.

When `HOST_SCRIPTS_DIR` is unset or the script is absent, the button renders as
**Update not available** and no action is possible (graceful degradation).

> **Security note:** mounting `/var/run/docker.sock` gives the container root-equivalent
> access to the host. This is intentional for single-user home deployments. Do not expose
> the app to an untrusted network without removing or replacing this feature.

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
