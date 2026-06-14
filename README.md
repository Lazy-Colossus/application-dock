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

### One-time setup

**1. Create the update script on the host**

```bash
mkdir -p /home/jake/scripts
cat > /home/jake/scripts/update-application-dock.sh << 'EOF'
#!/bin/sh
cd /path/to/your/compose/dir
docker compose pull
docker compose up -d
EOF
chmod +x /home/jake/scripts/update-application-dock.sh
```

The script has access to the host Docker socket and can run any `docker`/`docker compose`
commands it needs. It is responsible for knowing where your `docker-compose.yml` lives.

**2. Pre-pull the sidecar image on the host**

```bash
docker pull docker:cli
```

The button will fail with a 502 if this image is missing when the update is triggered.

**3. Set the env var and restart**

Create or edit a `.env` file next to `docker-compose.yml`:

```bash
HOST_SCRIPTS_DIR=/home/jake/scripts
```

Then do a full restart so the new mounts are applied:

```bash
docker compose down && docker compose up -d --build
```

> **Why two env vars?** The compose file passes `HOST_SCRIPTS_DIR` as both a volume mount
> source and as `HOST_SCRIPTS_DIR_ON_HOST` inside the container. The Docker SDK (running
> inside the container) needs the *host* path when it tells the daemon to mount the scripts
> directory into the sidecar — it can't use the container's own `/host-scripts` path for
> that. Setting `HOST_SCRIPTS_DIR` once in `.env` covers both.

### Verifying the setup

Confirm both mounts are present in the running container:

```bash
# Docker socket
docker exec application-dock ls /var/run/docker.sock

# Scripts directory
docker exec application-dock ls /host-scripts/update-application-dock.sh
```

Both should return the path without errors. If the socket is missing the button will show
**Update not available** and clicking it returns a 503. If `docker.sock` is there but the
SDK can't connect, you'll see an **Update launch failed** error — see Troubleshooting below.

### Troubleshooting

**"Update launch failed: Error while fetching server API version … FileNotFoundError"**

The container can't reach the Docker socket. Steps:
1. Check that `docker-compose.yml` has the socket mount (`/var/run/docker.sock:/var/run/docker.sock`).
2. Verify you restarted *after* pulling the updated compose file: `docker compose down && up -d`.
3. Confirm the socket exists on the host: `ls /var/run/docker.sock`. Some distros put it at `/run/docker.sock` — if so, edit the volume line in `docker-compose.yml` to match.
4. Run `docker exec application-dock ls /var/run/docker.sock` to confirm the mount is live inside the container.

**"Update not available" button even after setup**

The backend checks for the script at startup. Causes:
- `HOST_SCRIPTS_DIR` was not set before `docker compose up` — set it in `.env` and restart.
- The file is named differently — it must be exactly `update-application-dock.sh`.
- The volume mount path doesn't match — confirm with `docker exec application-dock ls /host-scripts/`.

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
