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

## Deferred from: code review of archery Chunk A (2026-06-10)

- `_migrate_legacy_in_progress` TOCTOU — both `read_in_progress` and `list_in_progress` call it with no lock; a corrupt legacy file could leave an orphaned legacy file after successful migration [`session_repo.py:115–126`] (story 6.1)
- `_pick_finalise_label` ignores in-progress labels — concurrent finalisation of two same-day sessions where a finalised file already exists can assign the same label to both; second write silently clobbers first [`archery_service.py:47–59`] (story 6.1)
- `update_in_progress` check-then-write TOCTOU — concurrent `DELETE` between existence check and write silently recreates a discarded session [`archery_service.py:137–141`] (story 7.1)
- `read_session`/`read_in_progress` do not catch `ValidationError` — corrupt-but-valid-JSON file returns 500 instead of 404; `list_*` functions handle this correctly [`session_repo.py:57–67, :140–147`] (stories 2.1/6.1)

## Deferred from: code review of archery Chunk B (2026-06-10)

- `discardAllInProgress` / `onConflictDelete` partial-failure navigation patched in Chunk C — residual: if all DELETEs succeed but the error flag was set by something else, the gate may still block navigation (negligible risk given single-process LAN server) [`frontend/src/apps/archery/pages/ArcheryHomePage.vue`]
- `ResultsTable.vue` renders `[null, null]` shots as "0 / 0" rather than "—" — a partially-saved unconfirmed target shows the same display as two real zero scores; visually indistinguishable but consistent with the total-treats-null-as-0 domain rule [`frontend/src/apps/archery/components/ResultsTable.vue:25`]
- `loadHistory` in `useArcheryHistoryStore` uses `e.message` rather than `messageFrom(e)` — misses the `ApiError.detail` field; list error banner shows the full "404: Not Found" status string instead of the backend's detail message [`frontend/src/apps/archery/stores/useArcheryHistoryStore.ts:22–24`]
- Single shared `loading` ref in `useArcherySessionStore` covers all async operations — a background `discardAllInProgress` call disables the `ScoreEntryPanel` confirm button; separate loading flags per concern would improve UX [`frontend/src/apps/archery/stores/useArcherySessionStore.ts`]

## Deferred from: code review of archery Chunk C (2026-06-10)

- `today` constant in `ArcheryHomePage` is captured at component construction — if the page stays mounted past midnight the `todaysInProgress` computed uses a stale date; low risk on LAN session context [`frontend/src/apps/archery/pages/ArcheryHomePage.vue:98`]
- `resumeLabel` rethrows on failure but is called via `void resumeLabel(...)` in `onResume` — rejection is silently dropped; `store.error` is now surfaced by the P8 error banner so the user sees the failure, but the `void` swallows any further error propagation [`frontend/src/apps/archery/pages/ArcheryHomePage.vue:135`]
- `route.params.label` in `HistoryDetailPage` is cast with `as string` without an array-element guard — if the router ever supplies an array param (e.g. `/archery/history/a/b`), the cast passes a string array to the API silently [`frontend/src/apps/archery/pages/HistoryDetailPage.vue`]
