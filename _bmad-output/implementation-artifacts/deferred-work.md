# Deferred Work

## Deferred from: code review of 1.1 & 1.2 (2026-06-03)

- conftest.py import ordering fragile — works correctly under current pytest structure, risk only if tests are reorganised to import `app.main` at module level outside of `backend/tests/`
- Docker image runs as root — no `USER` instruction in `backend/Dockerfile`; security hardening, out of scope for scaffold story
- `requirements.txt` lacks hash verification — supply-chain hardening (`--require-hashes`), out of scope for v1
- No auth on any API endpoint — explicitly excluded from v1 scope per architecture ("No auth, no CORS, no DB")
- Frontend/backend registry duplication (`registry.ts` vs `shell.py` `_APPS`) — acknowledged v1 limitation; the `/api/apps` endpoint is informational and not consumed by the frontend shell in v1
- Hash/history mode env-var dependency (`VUE_ROUTER_MODE`) — deployment concern; if built without `VUE_ROUTER_MODE=history`, the SPA uses hash mode and deep-link refreshes behave differently
