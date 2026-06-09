# Deferred Work

## Deferred from: code review of 1.1 & 1.2 (2026-06-03)

- conftest.py import ordering fragile — works correctly under current pytest structure, risk only if tests are reorganised to import `app.main` at module level outside of `backend/tests/`
- Docker image runs as root — no `USER` instruction in `backend/Dockerfile`; security hardening, out of scope for scaffold story
- `requirements.txt` lacks hash verification — supply-chain hardening (`--require-hashes`), out of scope for v1
- No auth on any API endpoint — explicitly excluded from v1 scope per architecture ("No auth, no CORS, no DB")
- Frontend/backend registry duplication (`registry.ts` vs `shell.py` `_APPS`) — acknowledged v1 limitation; the `/api/apps` endpoint is informational and not consumed by the frontend shell in v1
- Hash/history mode env-var dependency (`VUE_ROUTER_MODE`) — deployment concern; if built without `VUE_ROUTER_MODE=history`, the SPA uses hash mode and deep-link refreshes behave differently

## Deferred from: code review of 1.1 & 1.2 (2026-06-09)

- Build-time `RUN mkdir -p /data` creates root-owned layer in Docker image — latent failure when `USER` directive is added for security hardening [`backend/Dockerfile:18`]
- `useApi.ts` 204→`undefined as T` cast is silent — callers typed to non-void receive `undefined` with no runtime diagnostic [`frontend/src/composables/useApi.ts:31`]
- Race condition in session label generation: two concurrent `POST /api/archery/sessions` calls within the same millisecond can compute the same label; the second `write_in_progress` silently overwrites the first session [`backend/app/services/archery_service.py`] — found during edge-case sweep, not part of stories 1.1/1.2 diff
- Deterministic `.tmp` path in `_atomic_write_json` (`path.with_suffix(".tmp")`) — two concurrent writes targeting the same label produce the same temp filename; one clobbers the other's payload before the rename [`backend/app/repositories/session_repo.py`] — found during edge-case sweep, not part of stories 1.1/1.2 diff
