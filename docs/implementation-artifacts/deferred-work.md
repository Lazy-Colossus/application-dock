# Deferred Work

## Deferred from: code review of 1.5.jwt-authentication pass 2 (2026-06-18)

- No test validates 7-day expiry claim in JWT — `test_login_success` checks only token presence; low risk, `jose.jwt.decode` validates `exp` at runtime [`backend/tests/test_auth.py:48–56`]
- `restoreSession` retries `GET /auth/me` on every navigation when a non-401 error occurs — 401 path is safe (logout clears token); non-401 errors retry each nav; acceptable for self-hosted LAN [`frontend/src/stores/useAuthStore.ts`]
- `_atomic_write_json` imported as private underscore-prefixed symbol from `session_repo` — P8 dedup fix; extract to shared `core/utils.py` when touching repositories again [`backend/app/repositories/auth_repo.py:14`]
- `conftest.py` exact `== "test_auth.py"` match would include a future `test_auth_helpers.py` in auth bypass — proper fix is a pytest marker; low probability currently [`backend/tests/conftest.py:16`]

## Deferred from: code review of 1.5.jwt-authentication (2026-06-18)

- JWT token stored in `localStorage` — XSS-accessible; documented design decision ("acceptable for self-hosted personal use") [`frontend/src/stores/useAuthStore.ts:13`]
- `isAuthenticated` based on token presence, not expiry/signature validity — by design; server 401s handle the expiry path [`frontend/src/stores/useAuthStore.ts:18`]
- Cross-tab logout not reflected in current tab's Pinia store — `localStorage` is not watched for changes; out of scope for this story
- World-readable tmp file permissions in `_atomic_write_json` — pre-existing in session_repo too; security hardening out of scope [`backend/app/repositories/auth_repo.py:29`]
- AC5: no setup-script round-trip integration test — functional coverage via auth_repo unit paths; setup-script integration test is nice-to-have
- No minimum password length/entropy validation — setup script validates non-empty; login schema correctly returns 401; out of scope
- Concurrent 401 responses trigger multiple `logout()` calls — harmless (logout is idempotent); same root cause as the login-loop patch item

## Deferred from: code review of 9.1.history-subtext-top-3-archers (2026-06-12)

- All-zero finalised session renders as `Alice 0 · Bob 0 · Charlie 0` with no "no scores recorded" hint — pre-existing (Story 7.1 materialises unentered shots as 0); subtext line now makes this more visible than before
- Pre-existing name-validation gaps now newly visible in the prominent subtext: names containing `·`, `,`, embedded newline, or zero-width space corrupt the rendered list. Only `/` is currently rejected (and only by `AddPlayerRequest`, not `CreateSessionRequest`/`SessionData`) — broader name-validation hardening is out of scope for 9.1
- Aria-label pluralisation says `"1 archers"` for single-archer sessions — pre-existing string template, predates 9.1

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

## Deferred from: code review of story-1.5 (Hotaru Epic 1) — 2026-07-06

- Unsaved-changes guard (`AddWordPage` `onBeforeRouteLeave`) has no test coverage — the spec mocks it to a no-op. Low risk; add a route-guard test if the guard grows.
- No runtime guard for corrupt/missing JSON (the shipped seed or a writable `vocab_shared.json`/`words_private.json`) — an unparseable file surfaces as a 500. Matches the existing platform pattern (archery `session_repo` uses bare `json.loads`); worth a platform-wide hardening pass rather than a Hotaru-only fix.
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

## Deferred from: code review of 8.4.pick-recurring-players-in-setup (2026-06-11)

- `pickPlayer` failure sets `inputError` on typed input, not the picker — unreachable in practice (names come from `availablePlayers`); pre-existing design constraint [`SessionSetupPage.vue:addName`]
- `recurringStore.error` not surfaced in `SessionSetupPage` — `loadPlayers` failure shows "No recurring players" instead of an error banner; UX hardening out of story scope [`SessionSetupPage.vue`]
- No loading indicator on picker while `loadPlayers` in flight — transient false "No recurring players" display; UX polish [`SessionSetupPage.vue`]
- `RecurringPlayersPage` local duplicate check uses `store.players.includes(name.toLowerCase())` (strict match) rather than case-insensitive `.some()` — misses legacy mixed-case entries; backend deduplication handles it correctly [`RecurringPlayersPage.vue:83`]

## Deferred from: code review of archery Chunk C (2026-06-10)

- `today` constant in `ArcheryHomePage` is captured at component construction — if the page stays mounted past midnight the `todaysInProgress` computed uses a stale date; low risk on LAN session context [`frontend/src/apps/archery/pages/ArcheryHomePage.vue:98`]
- `resumeLabel` rethrows on failure but is called via `void resumeLabel(...)` in `onResume` — rejection is silently dropped; `store.error` is now surfaced by the P8 error banner so the user sees the failure, but the `void` swallows any further error propagation [`frontend/src/apps/archery/pages/ArcheryHomePage.vue:135`]
- `route.params.label` in `HistoryDetailPage` is cast with `as string` without an array-element guard — if the router ever supplies an array param (e.g. `/archery/history/a/b`), the cast passes a string array to the API silently [`frontend/src/apps/archery/pages/HistoryDetailPage.vue`]

## Deferred from: code review of context-switch Epic 1 (2026-08-15)

- Concurrent same-user read-modify-write of the user doc has no locking → last-writer-wins lost update (double-click "New list", two tabs) — pre-existing platform pattern (archery/auth repos identical); proper fix is a per-user lock / compare-and-swap at the platform level [`backend/app/services/context_switch_service.py:62`] (stories 1.3/1.4)
- Corrupt/invalid on-disk JSON unhandled in `read_doc` — surfaces as 500 via GET but as a 422 leaking raw parser text via POST/PUT (router catches the `ValueError` that `json.JSONDecodeError` subclasses); matches the archery/hotaru `json.loads` pattern already flagged for a platform-wide hardening pass [`backend/app/repositories/context_switch_repo.py:65`] (story 1.2)
- `_validate_username` does not harden for Windows — reserved device names (CON/AUX/NUL/…), case-insensitive collision (Alice/alice), trailing-dot collision (`name.`), drive-colon (`C:evil`) unguarded; harmless on the Linux/Docker target and username is JWT-sourced, but the docstring overstates the guarantee [`backend/app/repositories/context_switch_repo.py:28`] (story 1.2)
- `read_doc`/`migrate()` does not reject an unknown future `schema_version` → unknown fields silently dropped and lost on next write; only v1 exists today [`backend/app/repositories/context_switch_repo.py:48`] (story 1.2)
- No maximum length on a list name — unbounded string persisted; no spec requirement, robustness only [`backend/app/services/context_switch_service.py:64`] (story 1.3)
- `renameList` store action silently no-ops when the local summary isn't found (no refetch fallback) — rare desync leaves a stale name until manual refresh [`frontend/src/apps/context-switch/stores/useContextSwitchStore.ts`] (story 1.4)

## Deferred from: code review of context-switch Epic 2 (2026-08-15)

- Concurrent same-user mutations (add / reorder / archive / update) are unguarded read-modify-write of the whole doc — now far more likely with drag-reorder + updates log; a concurrent write silently clobbers another. Same platform pattern already logged for Epic 1 / archery; needs a platform-level lock or optimistic-concurrency decision [`backend/app/services/context_switch_service.py`] (stories 2.1/2.3/2.5)
- Dialogs (AddTodoDialog, TodoDetailDialog) close synchronously before the async persist resolves — on failure the dialog is gone and the user's typed input is lost; only an error banner remains. Test-encoded behavior; changing it (keep dialog open until resolve) needs spec updates [`frontend/src/apps/context-switch/components/AddTodoDialog.vue`, `TodoDetailDialog.vue`] (stories 2.1/2.4)
- GridControl controlled number input desyncs from state when the typed value clamps to the current value or the setGrid request fails — field shows the invalid text while the grid stays correct, no revert [`frontend/src/apps/context-switch/components/GridControl.vue`] (story 2.2)
- Board-switch / archive-open flashes the previous list's pills/archived items — singleton store state replaced only when the new fetch resolves; reset to null/[] at fetch start [`frontend/src/apps/context-switch/stores/useContextSwitchStore.ts`] (stories 2.1/2.7)
- No max length on todo header or update text — unbounded strings grow the per-user JSON file [`backend/app/schemas/context_switch.py`] (stories 2.1/2.5)
- Reactivating an archived todo leaves a stale `order` (can collide with active orders); re-archiving overwrites the original `archived_at` — both latent, no v1 UI path [`backend/app/services/context_switch_service.py` update_todo] (story 2.6)
- Empty-body PUT to a nonexistent todo returns 422 (empty-fields guard) instead of 404 — not-found should win [`backend/app/routers/context_switch.py` update_todo] (story 2.4)
- AddTodoDialog has no double-submit guard (rapid double-click can create duplicates); update textarea's Enter both submits and inserts a newline; ArchiveDrawer keeps stale delete-confirm on reopen — minor UX [various frontend components] (stories 2.1/2.5/2.7)
- Test-quality nits: updated_at bump asserted with >= (can't detect a missing bump); add_update created_at not asserted ISO-8601 [`backend/tests/test_context_switch_api.py`] (stories 2.4/2.5)
