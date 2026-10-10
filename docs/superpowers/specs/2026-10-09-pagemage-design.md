# PageMage — Design

**Status:** Approved (design)
**Date:** 2026-10-09
**App id:** `pagemage`

## What it is

A new Application Dock app for uploading standalone HTML files and viewing
them rendered. The normal flow: upload an `.html` file via a button → see all
uploaded pages on a list screen → click a page to open it rendered. Pages may
contain text fields and other form controls that the user can interact with in
view mode, and those edits are **persisted**.

Out of scope for v1 (explicitly later epics): deleting pages, sharing pages.

## Decisions (from brainstorming)

- **Rendering:** sandboxed `<iframe>` with `sandbox="allow-scripts allow-forms"`
  (scripts and form controls work; page is isolated from the shell — opaque
  origin, no access to cookies, the parent app, or other apps).
- **Access:** private to the uploader. Each user sees only their own pages.
- **Edit persistence:** yes. Edits to form fields in view mode are saved back.
- **Persistence mechanism (variant A — full-document snapshot):** the shell
  injects a tiny capture script into the page before rendering. On an explicit
  **Save**, the parent asks the iframe (via `postMessage`) for its current
  state; the injected script copies live field values into the HTML
  (`<input value>`, textarea text, checked/selected state), removes itself from
  the serialized output, and posts `document.documentElement.outerHTML` back.
  The parent writes that HTML to disk. No `allow-same-origin` is used, so the
  sandbox stays locked down.
- **Save trigger:** explicit Save button (not autosave) — predictable, avoids
  write races.

### Why not the alternatives

- `allow-same-origin` + `allow-scripts` would let the parent read the iframe
  DOM directly (simplest to code) but is a documented sandbox escape: uploaded
  HTML would run with the app's origin privileges. Rejected on security.
- A separate field-value overlay (variant B) keeps the original HTML pristine
  but requires reliably keying arbitrary inputs; more code for a narrower win.

## Architecture

Follows the project's strict backend layering and feature-grouped frontend.
Storage is JSON files on disk (HTML lives in a string field), consistent with
the platform convention — there is no database.

### Backend (`backend/app/`)

Base path `/api/pagemage`. Per-user storage mirrors `progress_repo`'s
`users/{user}/...` layout.

- `repositories/pagemage_repo.py` — the ONLY filesystem code for this app.
  - Layout: `pagemage/users/{user}/pages/{id}.json`.
  - Record shape: `{id, name, created_at, updated_at, html}`.
  - `id` minted as `p-{hex8}`; validated as a safe bare filename (no `/`, `\`,
    or `.`), as in `shared_notes_repo`, so a crafted id cannot escape the
    pages directory.
  - All writes go through `atomic_write_json`.
  - Functions: `read_page(user, id) -> Page | None`, `write_page(user, page)`,
    `list_pages_for(user) -> list[Page]` (scans the user's dir).
- `services/pagemage_service.py` — business logic; raises stdlib exceptions
  (`FileNotFoundError`, `ValueError`), never `HTTPException`.
  - `create_page(user, filename, html) -> Page`: validates extension
    (`.html`/`.htm`), that body is valid utf-8, and size cap (~2 MB);
    derives `name` from the filename (strip extension); mints id and
    timestamps.
  - `list_pages(user) -> list[PageSummary]`: newest-first (by `created_at`
    desc), excludes `html`.
  - `get_page(user, id) -> Page`.
  - `update_html(user, id, html) -> Page`: replaces `html`, bumps
    `updated_at`.
- `routers/pagemage.py` — HTTP only; translates stdlib exceptions →
  `HTTPException`.
  - `POST /api/pagemage/pages` — multipart file upload; returns the summary.
  - `GET  /api/pagemage/pages` — list of summaries.
  - `GET  /api/pagemage/pages/{id}` — full record (incl. `html`).
  - `PUT  /api/pagemage/pages/{id}` — body `{ "html": "..." }`; saves edits.
  - All guarded by `get_current_user`.
- `schemas/pagemage.py` — `Page`, `PageSummary`, `UpdateHtmlRequest`.
- `routers/shell.py` — add a `pagemage` entry to `_APPS` (kept in parity with
  the frontend registry; enforced by `test_app_registry_parity.py`).

API contract per project convention: snake_case JSON, direct serialization
(no envelopes), ISO 8601 timestamps, errors as `{ detail }`.

### Frontend (`frontend/src/apps/pagemage/`)

All HTTP goes through `src/composables/useApi.ts`.

- `registry.ts` — append `{ id: "pagemage", label: "PageMage",
  icon: "html", route: "/pagemage" }`.
- `router/routes.ts` — two lazy-loaded routes (both `requiresAuth: true`):
  - `/pagemage` → `pages/HomePage.vue` (name `pagemage-home`).
  - `/pagemage/pages/:pageId` → `pages/ViewerPage.vue` (name `pagemage-view`).
- `stores/usePagemageStore.ts` — Pinia store exposing `loading` and `error`
  refs; actions `fetchPages()`, `upload(file)`, `fetchPage(id)`,
  `savePage(id, html)`. Every async action sets `loading` in `try/finally`
  and routes errors into `error.value`.
- `types.ts` — `Page`, `PageSummary`.
- `pages/HomePage.vue` — Upload button backed by a hidden
  `<input type="file" accept=".html,.htm">`; a grid of page cards (name +
  date). Clicking a card routes to the viewer.
- `pages/ViewerPage.vue` — toolbar (page name + Save button) and
  `<iframe sandbox="allow-scripts allow-forms" :srcdoc="...">`. On mount,
  fetch the page and build srcdoc = page HTML + injected capture script. Save
  posts `{ type: "pm:capture" }` to the iframe, awaits the `pm:html` reply,
  and calls `savePage`.
- The capture script's value-copying step (copy live form state into
  attributes on a clone, strip the injected script, serialize) is factored
  into a pure helper so it can be unit-tested independently of the iframe.

#### Upload transport note

`useApi` is the single HTTP boundary; the upload sends `FormData` (multipart).
The implementation must confirm/extend `useApi` to pass a `FormData` body
through without forcing a JSON `Content-Type`. This is called out so the plan
addresses it rather than adding a raw `fetch`.

### Data flow

1. **Upload:** HomePage → `store.upload(file)` → `POST /pages` (multipart) →
   service validates + writes JSON record → returns summary → list refreshes.
2. **List:** HomePage → `store.fetchPages()` → `GET /pages` → summaries.
3. **View:** ViewerPage → `store.fetchPage(id)` → `GET /pages/{id}` → html →
   rendered in sandboxed iframe (with injected capture script).
4. **Save edits:** Save → `postMessage` capture → iframe returns serialized
   HTML → `store.savePage(id, html)` → `PUT /pages/{id}` → record updated.

### Error handling

- Backend: service raises `ValueError` for bad extension / non-utf-8 / oversize
  (router → 400) and `FileNotFoundError` for a missing page (router → 404).
- Frontend: `useApi` throws `ApiError`; store actions capture it into
  `error.value`; pages surface it (banner / notify). No bare `console.error`.

### Security

- Sandbox has `allow-scripts allow-forms` but **not** `allow-same-origin`, so
  the rendered page runs at an opaque origin — it cannot read the app's
  cookies, reach the parent window, or touch other apps' data.
- The parent validates `postMessage` replies by `type` before using them.
- `id` path-traversal is rejected at the repository boundary.
- Upload is size-capped and utf-8-validated before persisting.

## Testing

- **Backend (pytest, `tmp_path` + `monkeypatch` on `settings.data_dir`):**
  - repo: round-trip read/write; `id` validation rejects traversal; list scans
    only the given user's dir (per-user isolation).
  - service: upload validation (extension, utf-8, size), name derivation,
    newest-first ordering, `update_html` bumps `updated_at`.
  - router: upload happy path + 400s, get 404, put round-trip, auth required.
  - `test_app_registry_parity.py` passes with the new app.
- **Frontend (vitest, co-located `*.spec.ts`):**
  - store: actions set `loading`/`error`, call the right endpoints.
  - HomePage: upload wiring, card list renders, navigation.
  - the pure capture helper: copies input/textarea/select/checkbox state into
    serialized HTML and strips the injected script.

## Docs

Create `docs/stories/pagemage/` with empty `for-review/` and `done/`
subfolders, per the "Adding a new app" checklist.
