# Deferred Work

## Deferred from: code review of 3.6.edit-or-delete-a-note (Hotaru Epic 3) — 2026-07-17

- Inline note editor collapses on Save regardless of whether the PATCH succeeded — on validation/permission/network failure the typed edit is lost from the field and only a store-level `error` is set. A clean fix needs the parent to signal success back to the dialog; deferred [`frontend/src/apps/hotaru/components/WordNotesDialog.vue` onEditSave]
- Mid-drill edit/delete are attributed to the captured `drillUser` while the dialog's Edit/Delete controls are gated on the live `activeUser` — after a mid-drill user switch they diverge and a click 403/404s silently. Transient only: the user-switch watcher redirects out of the drill (queue discarded), so the window is a sub-frame [`frontend/src/apps/hotaru/pages/DrillPage.vue`]
- `notes_repo.remove`/`replace` are imperfect on a crash-duplicated note (a note left in BOTH files by an interrupted Story 3.2 move): `remove` deletes only the shared copy; `replace` rewrites only the file matching `note.visibility`. Depends on a prior interrupted move (rare); inherent to the JSON-no-DB store [`backend/app/repositories/notes_repo.py`]
- Note-length count differs frontend vs backend for astral characters (JS UTF-16 units vs Python code points) — now lives in `NoteComposer`; only ever over-blocks client-side (same item recurring from 3.2/3.3–3.5) [`frontend/src/apps/hotaru/components/NoteComposer.vue`]
- Concurrent read-modify-write on `notes_shared.json` (two users / two devices) can lose an edit or delete — last-write-wins on the whole file; inherent to the JSON store, widened by edit/delete [`backend/app/repositories/notes_repo.py`]

## Deferred from: code review of 3.3 + 3.4 + 3.5 (Hotaru Epic 3) — 2026-07-16

- Inline expand-load failure is indistinguishable from "no notes" — `LibraryPage.onToggleExpand` fires `void notesStore.loadNotes(...)` and ignores rejection; `WordRowDetails` shows "No notes yet" whenever the list is empty. A failed load looks noteless (user might add a duplicate). Clean fix needs per-word load/error state — `notesStore.error` is a global singleton, so it can't be attributed to one panel today [`frontend/src/apps/hotaru/pages/LibraryPage.vue`, `WordRowDetails.vue`]
- `notes_service.notes_for_words` re-implements the shared+own-private filter/sort rather than sharing a helper with `list_for_word` — behavior-equivalent and correctly batched, maintainability drift only [`backend/app/services/notes_service.py`]
- Note-length gate counts UTF-16 units (`String.length`) while the backend counts code points — the composer over-counts astral characters (emoji/rare kanji), over-blocking text the backend would accept. Now lives in `NoteComposer` after the 3.5 extraction (same item as the 3.2 deferral) [`frontend/src/apps/hotaru/components/NoteComposer.vue`]
- Drill Flashcard can render the drill-owner's private note for one frame on a mid-drill user switch — the guard watch calls `router.replace` (async) so the card re-renders once with the new `activeUser` before navigating away; transient, and the note author/persistence are now pinned to `drillUser` [`frontend/src/apps/hotaru/pages/DrillPage.vue`]

## Deferred from: code review of 3.2.set-and-change-a-note-s-visibility (Hotaru Epic 3) — 2026-07-16

- Concurrent read-modify-write race on `notes_shared.json` (and per-user private files) — `add`/`set_visibility` do `read_* → write_*` with no lock; two overlapping writers can drop a write. Inherent to the JSON-no-DB architecture (same pattern in `vocab_repo`/`progress_repo`); low risk at 2-user household scale [`backend/app/repositories/notes_repo.py`]
- Per-learner `user` query-param is not tied to the JWT principal — an authenticated user could pass `?user=<other>` on any Hotaru endpoint. App-wide, matches the documented no-auth/trusted-two-user design (NFR-3); privacy is a path boundary, not a security boundary. Revisit if the trust model changes [`backend/app/routers/hotaru.py`]
- No word-existence validation on the notes endpoints, and `delete_word` does not cascade-delete a word's notes — orphaned notes (incl. private) accumulate for deleted/nonexistent words. Scope addition beyond 3.2; candidate follow-up story (the "404 vs allow orphans" + cascade behavior is a product call) [`backend/app/services/notes_service.py`, `backend/app/routers/hotaru.py`]
- Note-length count differs frontend vs backend for astral-plane characters (JS UTF-16 code units vs Python code points) — only ever over-blocks client-side; a ~150-astral-kanji note the backend accepts is rejected in the UI [`frontend/src/apps/hotaru/components/WordNotesDialog.vue`]
- `MAX_NOTE_LENGTH = 300` duplicated across Python (`notes_service.py`) and TS (`WordNotesDialog.vue`) — no clean cross-language share; commented "keep in sync", tested both sides, backend authoritative
- Double type-assertion `payload as unknown as Record<string, unknown>` in `addNote` — pre-existing 3.1 code, unchanged by 3.2 [`frontend/src/apps/hotaru/stores/useHotaruNotesStore.ts`]

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
