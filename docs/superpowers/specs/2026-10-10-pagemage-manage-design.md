# PageMage Manage (delete, rename, name-on-upload) — Design

**Status:** Approved (design)
**Date:** 2026-10-10
**App id:** `pagemage`
**Builds on:** `2026-10-09-pagemage-design.md`, `2026-10-10-pagemage-sharing-design.md`

## What it is

Three page-management actions for PageMage:

- **Name on upload** — the owner names a page while uploading instead of only
  getting the filename-derived name.
- **Rename** — change a page's name after upload.
- **Delete** — remove a page.

## Decisions (from brainstorming)

- **Upload UX:** pick the file first (existing button → file chooser), then a
  dialog prompts for a name, pre-filled from the filename (minus extension) and
  editable. Confirm uploads with that name.
- **Delete + Rename placement:** on the **home page cards**. Delete uses an
  inline confirm ("Delete this page? Delete / Keep"), matching Shared Notes.
- **Name is optional at upload:** a blank name falls back to the filename
  (preserves today's behaviour).

## Architecture

Extends the existing PageMage app, keeping the strict router → service →
repository layering.

### Backend

- **`schemas/pagemage.py`**: add `RenameRequest { name: str }`.
- **`repositories/pagemage_repo.py`**: add
  `delete_page(user, page_id) -> None` — unlink the validated page path
  (`missing_ok=True`; existence is the service's concern).
- **`services/pagemage_service.py`**:
  - `create_page(user, filename, raw, name=None)` — gains an optional `name`.
    If `name` is given and non-blank, use `name.strip()`; otherwise derive from
    the filename as today (`_derive_name`).
  - `rename_page(user, page_id, name) -> Page` — load the owner's page
    (`FileNotFoundError` if absent), reject a blank name (`ValueError`), set
    `name = name.strip()`, bump `updated_at`, save, return it.
  - `delete_page(user, page_id) -> None` — raise `FileNotFoundError` if the page
    does not exist, otherwise `repo.delete_page`.
- **`routers/pagemage.py`**:
  - `POST /api/pagemage/pages` gains an optional multipart field
    `name: Annotated[str | None, Form()] = None`, passed to `create_page`.
  - `PUT /api/pagemage/pages/{page_id}/name` — body `RenameRequest`; maps
    `FileNotFoundError → 404`, `ValueError → 422`; returns the `Page`.
  - `DELETE /api/pagemage/pages/{page_id}` — `204`; maps
    `FileNotFoundError → 404`. Distinct from the existing
    `DELETE /api/pagemage/pages/{page_id}/share`.

### Frontend

All HTTP through `useApi`.

- **`composables/useApi.ts`**: `upload` gains an optional
  `fields?: Record<string, string>` argument; each entry is appended to the
  `FormData` alongside the file. Keeps multipart construction in the single HTTP
  boundary (no raw `fetch`). Signature:
  `upload<T>(path: string, file: File, fields?: Record<string, string>)`.
- **`stores/usePagemageStore.ts`**:
  - `upload(file, name?)` — calls `api.upload("/pagemage/pages", file,
    name ? { name } : undefined)`; still prepends the returned summary.
  - `renamePage(pageId, name) -> Promise<boolean>` — `PUT
    /pagemage/pages/{id}/name`; updates the matching list summary's `name` and
    `updated_at`, and `currentPage` if it is the open page.
  - `deletePage(pageId) -> Promise<boolean>` — `DELETE /pagemage/pages/{id}`;
    removes it from the list.
- **`pages/HomePage.vue`**:
  - *Upload*: `onFile` stashes the chosen `File` and opens a name dialog
    pre-filled with the filename minus its `.html`/`.htm` extension. Confirm →
    `store.upload(file, name)` → navigate to the new page. Cancel → discard.
  - *Cards*: each card shows **Rename** and **Delete** actions, with
    `@click.stop` so they do not open the viewer.
    - Rename opens a dialog with an input pre-filled with the current name →
      `store.renamePage`.
    - Delete shows an inline confirm (Delete / Keep) → `store.deletePage`.

### Data flow

1. **Upload with name:** pick file → name dialog → `store.upload(file, name)` →
   `POST /pages` (multipart file + name) → summary prepended → open viewer.
2. **Rename:** card Rename → dialog → `store.renamePage(id, name)` → `PUT
   …/name` → list summary updated.
3. **Delete:** card Delete → inline confirm → `store.deletePage(id)` → `DELETE
   …/{id}` → card removed.

### Error handling

- Backend: `FileNotFoundError → 404` (rename, delete); `ValueError → 422`
  (blank rename).
- Frontend: `useApi` throws `ApiError`; store routes it into `error.value` and
  returns `false` on failure (so a failed delete leaves the card in place and a
  failed rename leaves the old name).

## Testing

- **Backend (pytest, `tmp_path` + `monkeypatch`):**
  - service: `create_page` honours an explicit name and falls back to the
    filename when name is blank/None; `rename_page` renames, rejects a blank
    name, and raises for a missing page; `delete_page` removes a page and raises
    for a missing one; a deleted page then 404s on `get_page`.
  - router: `POST …/pages` with a `name` form field returns that name; `PUT
    …/name` renames (and 404/422 paths); `DELETE …/{id}` returns 204 and the
    page is then gone; deleting a missing page is 404.
- **Frontend (vitest):**
  - `useApi.upload` appends the file and each `fields` entry to the FormData
    (assert via a mocked `fetch`).
  - store: `upload` forwards the name; `renamePage` updates the summary;
    `deletePage` removes it.
  - HomePage: choosing a file opens the name dialog pre-filled, and confirming
    calls `upload` with the name; Rename calls `renamePage`; Delete inline
    confirm calls `deletePage` and the card disappears.

## Out of scope

- Bulk delete / multi-select.
- Renaming or deleting from the viewer toolbar (home cards only this round).
- Undo / trash.
