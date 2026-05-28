# syntax=docker/dockerfile:1.7
# Multi-stage build: node compiles the SPA, python serves it via FastAPI.
# Build context = repo root. Invoked from docker-compose with:
#   build:
#     context: .
#     dockerfile: backend/Dockerfile

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build the Quasar SPA
# ─────────────────────────────────────────────────────────────────────────────
# Node 24 (Quasar v2.6+ requires Node ≥22.22; mute-stream@4 transitive dep
# requires ≥24.15. Node 24 LTS satisfies both cleanly.)
FROM node:24-alpine AS web-build

WORKDIR /build

# Install dependencies (cached separately from source for fast rebuilds).
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci

# Copy frontend source and build.
COPY frontend/ ./
RUN npx quasar build
# Output ends up at /build/dist/spa/

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2 — Serve the SPA + API
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install runtime Python deps.
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application code.
COPY backend/app/ ./app/

# Copy the built SPA from the build stage. The path is referenced by
# app/main.py via `Path(__file__).resolve().parent.parent / "dist" / "spa"`,
# so it must land at /app/dist/spa/.
COPY --from=web-build /build/dist/spa/ ./dist/spa/

# Ensure /data exists for the case where the volume isn't mounted yet.
RUN mkdir -p /data

ENV DATA_DIR=/data \
    HOST=0.0.0.0 \
    PORT=8000

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
