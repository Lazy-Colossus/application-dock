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

App is then reachable at <http://localhost:8123>.

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
update script via the Docker socket. When the feature is not configured the button shows
**Update not available** — the app degrades gracefully without crashing.

### How it works

Clicking the button causes the backend to spawn a short-lived `docker:cli` sidecar
container with the host Docker socket mounted. The sidecar runs your
`update-application-dock-docker.sh` script, then exits. The backend returns immediately
(fire-and-forget) — the page warns you that connection will drop and you refresh manually
once the new container is up.

The sidecar can be given up to three host directories, each mounted at a fixed path:

| Env var | Sidecar path | Mode | Purpose |
|---|---|---|---|
| `HOST_SCRIPTS_DIR` | `/host-scripts` | rw | Script location; log files go here |
| `HOST_PROJECT_DIR` | `/host-project` | rw | Git repo root (for `git pull` + `docker build`) |
| `HOST_COMPOSE_FILE_DIR` | `/host-compose-dir` | ro | Directory containing your `docker-compose.yml` |

Only `HOST_SCRIPTS_DIR` is required. The other two are optional — set them if your update
script needs to access your repo or a compose file that lives outside the scripts directory.

### One-time setup

**1. Pre-pull the sidecar image on the host**

```bash
docker pull docker:cli
```

**2. Create `.env` next to `docker-compose.yml`**

Minimum (script only):
```bash
HOST_SCRIPTS_DIR=/home/jake/scripts
```

If your script also does `git pull` / `docker build` and `docker compose up`:
```bash
HOST_SCRIPTS_DIR=/home/jake/scripts
HOST_PROJECT_DIR=/DATA/AppData/Application-Dock/application-dock
HOST_COMPOSE_FILE_DIR=/var/lib/casaos/apps/cheerful_bethany
```

**3. Write the update script**

The script runs inside the `docker:cli` sidecar — use the fixed mount paths, not host
paths. A typical full-update script:

```bash
#!/bin/bash
set -euo pipefail

REPO=/host-project
COMPOSE=/host-compose-dir/docker-compose.yml
LOG=/host-scripts/update-application-dock.log

log() { echo "[$(date '+%F %T')] $*" >> "$LOG"; }

cd "$REPO"
git fetch --quiet origin
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse '@{u}')
if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date"
    exit 0
fi

log "Update detected: $LOCAL -> $REMOTE"
{
    git pull --ff-only --quiet
    docker build -t app-doc:latest -f backend/Dockerfile .
    docker compose -f "$COMPOSE" up -d
} >> "$LOG" 2>&1
log "Update complete"
```

```bash
chmod +x /home/jake/scripts/update-application-dock-docker.sh
```

**4. Restart the stack**

```bash
docker compose down && docker compose up -d --build
```

### Verifying the setup

```bash
# Socket accessible inside the app container
docker exec application-dock ls /var/run/docker.sock

# Script visible inside the app container
docker exec application-dock ls /host-scripts/update-application-dock-docker.sh
```

Test the sidecar manually (same command the backend runs):

```bash
docker run --rm \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /home/jake/scripts:/host-scripts:rw \
  -v /DATA/AppData/Application-Dock/application-dock:/host-project:rw \
  -v /var/lib/casaos/apps/cheerful_bethany:/host-compose-dir:ro \
  docker:cli \
  sh /host-scripts/update-application-dock.sh
```

You should see your script's output with no "No such file or directory" errors.

### Troubleshooting

**"Update launch failed: … FileNotFoundError" (docker socket)**

The sidecar can't reach `/var/run/docker.sock`:
1. Confirm the socket exists on the host: `ls /var/run/docker.sock`. Some distros use `/run/docker.sock` — update the volume line in `docker-compose.yml` to match.
2. Verify you restarted after updating compose: `docker compose down && up -d`.
3. Confirm it's mounted: `docker exec application-dock ls /var/run/docker.sock`.

**Script runs but "can't cd to /some/host/path"**

The script is using a host path instead of the sidecar path. Replace host paths in your
script with the fixed sidecar paths (`/host-project`, `/host-compose-dir`, `/host-scripts`).
Make sure the corresponding `HOST_*` env vars are set in `.env` and the stack was restarted.

**"Update not available" button even after setup**

The backend checks for the script at startup. Causes:
- `HOST_SCRIPTS_DIR` not set before `docker compose up` — set it in `.env` and restart.
- File is named differently — it must be exactly `update-application-dock-docker.sh`.
- Confirm: `docker exec application-dock ls /host-scripts/`.

> **Security note:** mounting `/var/run/docker.sock` gives the container root-equivalent
> access to the host daemon. This is intentional for single-user home deployments. Do not
> expose the app to an untrusted network without removing or replacing this feature.

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
