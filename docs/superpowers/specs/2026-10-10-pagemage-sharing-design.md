# PageMage Shareable Links — Design

**Status:** Approved (design)
**Date:** 2026-10-10
**App id:** `pagemage`
**Builds on:** `2026-10-09-pagemage-design.md`

## What it is

Each PageMage page can have a **public, shareable link** that lets anyone open
and view that one HTML page **without logging in**. The link is view-only —
recipients cannot edit or save. The owner explicitly creates the link, and can
disable it.

## Decisions (from brainstorming)

- **Recipient view:** the backend serves the stored HTML **verbatim as a raw,
  standalone web page** (not the SPA). It is served with a
  `Content-Security-Policy: sandbox allow-scripts allow-forms` header, which
  forces an opaque origin — scripts and forms work, but the page cannot read
  the app's cookies, `localStorage`, or JWT.
- **Share model:** explicit. A page is private until the owner clicks **Share**,
  which mints the token. Re-sharing returns the same token (stable link).
- **Revocation:** included in v1. The owner can **disable** a link, which
  clears the token so the old link 404s.

### Why this shape

The codebase already has a public-share-link convention (Kalendariq): an
unguessable `secrets.token_urlsafe(24)` token stored on the record, a public
`/api/<app>/share/{token}` router where the token *is* the authorization
(unknown → 404 with no detail), and a frontend route that is deliberately not
`requiresAuth`. This design reuses that convention. It differs in two ways,
both deliberate:

- **Raw serving instead of an in-app viewer.** The user wants to "just view
  that one html". Serving raw (with the CSP `sandbox` header) is lighter and
  needs no public SPA page. CSP `sandbox` gives the same opaque-origin
  isolation the owner's in-app iframe gets.
- **Revocable instead of permanent.** Kalendariq links live forever; a whole
  HTML document is a bigger exposure, so an off-switch is warranted.

## Architecture

Extends the existing PageMage app. Backend keeps the strict router → service →
repository layering; the public route carries no user and the token is the
authorization.

### Data model

`app/schemas/pagemage.py`:
- `Page` gains `share_token: str = ""` (empty = not shared). Defaulted, so
  pages written before this feature read back cleanly.
- `PageSummary` gains `shared: bool = False` (derived from a non-empty token),
  so the list can show a badge without carrying the token.

### Backend

- **`repositories/pagemage_repo.py`** (only FS code):
  - `find_by_share_token(token) -> Page | None`: scans
    `pagemage/users/*/pages/*.json` across all users (no user context on the
    public path, same whole-directory scan style as `shared_notes_repo`).
    Matches only a non-empty token equal to the argument.
- **`services/pagemage_service.py`** (stdlib errors only):
  - `new_share_token() -> str`: `secrets.token_urlsafe(24)`.
  - `create_share(user, page_id) -> Page`: loads the owner's page; if it has no
    token, mints one and saves; returns the page. Idempotent — an already-shared
    page keeps its token.
  - `revoke_share(user, page_id) -> Page`: clears the token, saves, returns the
    page.
  - `get_shared_page(token) -> Page`: returns the page whose token matches, or
    raises `FileNotFoundError`. Raises `FileNotFoundError` for an empty token
    too (so an empty argument never matches an unshared page).
  - `list_pages` populates `PageSummary.shared = bool(page.share_token)`.
- **`routers/pagemage.py`**:
  - Authed (owner), on the existing `router`:
    - `POST /api/pagemage/pages/{page_id}/share` → `create_share`, returns `Page`.
    - `DELETE /api/pagemage/pages/{page_id}/share` → `revoke_share`, returns `Page`.
    - Both map `FileNotFoundError → 404`.
  - Public, on a new `share_router` (prefix `/api/pagemage/share`, no auth):
    - `GET /{token}/raw` → `get_shared_page(token)`; returns the stored HTML as
      a `Response(media_type="text/html; charset=utf-8")` with header
      `Content-Security-Policy: sandbox allow-scripts allow-forms`. Maps
      `FileNotFoundError → 404` with a plain "Not found" detail (never reveals
      whether a page exists).
- **`main.py`**: `include_router(pagemage.share_router)` right after
  `pagemage.router`, matching how `kalendariq.share_router` is wired.

The public path receives `{token}` as a single URL segment; FastAPI will not
match a `/`, and the token is only ever compared as a string (never used as a
filename), so there is no path-traversal surface.

### Frontend

All HTTP through `useApi`.

- **`types.ts`**: `share_token: string` on `Page`; `shared: boolean` on
  `PageSummary`.
- **`stores/usePagemageStore.ts`**:
  - `createShare(pageId) -> Promise<string | null>`: `POST
    /pagemage/pages/{id}/share`; updates `currentPage` and returns the token.
  - `revokeShare(pageId) -> Promise<boolean>`: `DELETE
    /pagemage/pages/{id}/share`; updates `currentPage`.
- **`pages/ViewerPage.vue`**: a **Share** button in the toolbar opens a dialog:
  - Not yet shared → a "Create link" action (calls `createShare`).
  - Shared → a read-only field with the full link
    `${window.location.origin}/api/pagemage/share/${token}/raw`, a **Copy**
    button (`navigator.clipboard.writeText`), and a **Disable link** action
    (calls `revokeShare`).
- **`pages/HomePage.vue`**: a small "shared" badge on cards whose `shared` is
  true.

### Data flow

1. **Create link:** Viewer → `store.createShare(id)` → `POST …/share` →
   service mints token → returns `Page` → dialog shows the link.
2. **Open shared link (recipient, no login):** browser → `GET
   /api/pagemage/share/{token}/raw` → `get_shared_page` → raw HTML with CSP
   sandbox header → browser renders it at an opaque origin.
3. **Disable:** Viewer → `store.revokeShare(id)` → `DELETE …/share` → token
   cleared → old link now 404s.

### Error handling

- Backend: `FileNotFoundError → 404` on all three new routes (owner routes:
  "Page not found"; public route: "Not found").
- Frontend: `useApi` throws `ApiError`; store routes it into `error.value`;
  actions return `null`/`false` on failure so the dialog can stay put.

### Security

- Token is 192-bit `secrets.token_urlsafe` — not guessable.
- Public view is served with `Content-Security-Policy: sandbox allow-scripts
  allow-forms` → opaque origin → cannot reach the app's storage/cookies/JWT.
- Unknown, empty, or revoked tokens all return an identical 404 that never
  reveals whether a page exists.
- The public route is read-only; there is no anonymous write path.

## Testing

- **Backend (pytest, `tmp_path` + `monkeypatch` on `settings.data_dir`):**
  - repo: `find_by_share_token` matches across users; ignores empty tokens;
    returns `None` for an unknown token.
  - service: `create_share` mints and is idempotent; `revoke_share` clears;
    `get_shared_page` returns by token and raises for empty/unknown;
    `list_pages` sets `shared`.
  - router: `POST …/share` returns a token; public `GET …/raw` returns 200 with
    the HTML body and the CSP sandbox header; unknown token → 404; after
    `DELETE …/share` the link → 404; the public route needs no auth.
- **Frontend (vitest, co-located `*.spec.ts`):**
  - store: `createShare`/`revokeShare` call the right endpoints and update
    `currentPage`.
  - ViewerPage: Share dialog creates a link, shows the correct URL, and the
    Disable action calls revoke.

## Out of scope

- An in-app public viewer page (we serve raw instead).
- Per-recipient links, expiry, or view analytics.
- Changing the owner's authenticated view.
