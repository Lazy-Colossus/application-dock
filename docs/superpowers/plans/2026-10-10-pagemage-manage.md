# PageMage Manage (delete / rename / name-on-upload) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (or subagent-driven-development). Steps use `- [ ]` checkboxes.

**Goal:** Let the owner name a page while uploading, rename a page, and delete a page.

**Architecture:** Extend the PageMage layers (router → service → repo). Delete + rename live on the home cards; upload shows a name dialog pre-filled from the filename. All HTTP stays in `useApi` (its `upload` gains an optional `fields` arg for the multipart `name`).

**Tech Stack:** FastAPI/Pydantic/pytest; Vue 3/Quasar/Pinia/TS/vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-pagemage-manage-design.md`

**Env:** venv on PATH (`pytest`/`python` directly). Backend deps already installed.

---

## Task M1: Backend schema + repo delete + service (name/rename/delete)

**Files:**
- Modify: `backend/app/schemas/pagemage.py`, `backend/app/repositories/pagemage_repo.py`, `backend/app/services/pagemage_service.py`
- Test: `backend/tests/test_pagemage_service.py`

- [ ] **Step 1: Write failing service tests** (append to `test_pagemage_service.py`)

```python
def test_create_page_uses_explicit_name_when_given() -> None:
    page = service.create_page("ana", "report.html", b"<p>x</p>", name="My Title")
    assert page.name == "My Title"


def test_create_page_falls_back_to_filename_when_name_blank() -> None:
    page = service.create_page("ana", "report.html", b"<p>x</p>", name="   ")
    assert page.name == "report"


def test_rename_page_changes_the_name() -> None:
    page = service.create_page("ana", "p.html", b"<p>x</p>")
    renamed = service.rename_page("ana", page.id, "Renamed")
    assert renamed.name == "Renamed"
    assert service.get_page("ana", page.id).name == "Renamed"


def test_rename_page_rejects_blank() -> None:
    page = service.create_page("ana", "p.html", b"<p>x</p>")
    with pytest.raises(ValueError):
        service.rename_page("ana", page.id, "  ")


def test_rename_missing_page_raises() -> None:
    with pytest.raises(FileNotFoundError):
        service.rename_page("ana", "p-missing1", "x")


def test_delete_page_removes_it() -> None:
    page = service.create_page("ana", "p.html", b"<p>x</p>")
    service.delete_page("ana", page.id)
    with pytest.raises(FileNotFoundError):
        service.get_page("ana", page.id)


def test_delete_missing_page_raises() -> None:
    with pytest.raises(FileNotFoundError):
        service.delete_page("ana", "p-missing1")
```

- [ ] **Step 2: Run — expect fail**

Run: `cd backend && pytest tests/test_pagemage_service.py -q`
Expected: FAIL (rename_page/delete_page missing; create_page has no `name` kwarg).

- [ ] **Step 3: Add `RenameRequest` to `schemas/pagemage.py`**

```python
class UpdateHtmlRequest(BaseModel):
    html: str


class RenameRequest(BaseModel):
    name: str
```

- [ ] **Step 4: Add `delete_page` to `repositories/pagemage_repo.py`**

```python
def delete_page(user: str, page_id: str) -> None:
    """Remove a page's file; a missing file is not an error here."""
    _page_path(user, page_id).unlink(missing_ok=True)
```

- [ ] **Step 5: Update `services/pagemage_service.py`**

Change `create_page` to accept an optional name:

```python
def create_page(user: str, filename: str, raw: bytes, name: str | None = None) -> Page:
    """Validate an uploaded HTML file and persist it as a new page.

    `name` is the user-facing title; a blank/omitted name falls back to the
    filename.
    """
    if len(raw) > _MAX_BYTES:
        raise ValueError("file too large (max 2 MB)")
    base = _base_filename(filename).lower()
    if not base.endswith(_ALLOWED_SUFFIXES):
        raise ValueError("only .html or .htm files are supported")
    try:
        html = raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValueError("file must be UTF-8 text") from exc
    stamp = now_iso()
    page = Page(
        id=new_id(),
        name=(name.strip() if name and name.strip() else _derive_name(filename)),
        html=html,
        created_at=stamp,
        updated_at=stamp,
    )
    repo.write_page(user, page)
    return page
```

Append rename + delete:

```python
def rename_page(user: str, page_id: str, name: str) -> Page:
    """Change a page's user-facing name; reject a blank name."""
    cleaned = name.strip()
    if not cleaned:
        raise ValueError("name must not be blank")
    page = get_page(user, page_id)
    page.name = cleaned
    page.updated_at = now_iso()
    repo.write_page(user, page)
    return page


def delete_page(user: str, page_id: str) -> None:
    """Delete a page, or raise `FileNotFoundError` if it does not exist."""
    get_page(user, page_id)  # raises FileNotFoundError if absent
    repo.delete_page(user, page_id)
```

- [ ] **Step 6: Run — expect pass**

Run: `cd backend && pytest tests/test_pagemage_service.py -q`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/pagemage.py backend/app/repositories/pagemage_repo.py backend/app/services/pagemage_service.py backend/tests/test_pagemage_service.py
git commit -m "feat(pagemage): add rename/delete and name-on-create service logic"
```

---

## Task M2: Router (upload name field, rename, delete)

**Files:**
- Modify: `backend/app/routers/pagemage.py`
- Test: `backend/tests/test_pagemage_api.py`

- [ ] **Step 1: Write failing API tests** (append to `test_pagemage_api.py`)

```python
def test_upload_with_name_field_uses_it(as_user) -> None:
    response = client.post(
        "/api/pagemage/pages",
        files={"file": ("report.html", b"<p>x</p>", "text/html")},
        data={"name": "Custom Title"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Custom Title"


def test_rename_changes_the_name(as_user) -> None:
    created = _upload("x.html")
    response = client.put(
        f"/api/pagemage/pages/{created['id']}/name", json={"name": "Renamed"}
    )
    assert response.status_code == 200, response.text
    assert response.json()["name"] == "Renamed"


def test_rename_blank_is_422(as_user) -> None:
    created = _upload("x.html")
    response = client.put(
        f"/api/pagemage/pages/{created['id']}/name", json={"name": "  "}
    )
    assert response.status_code == 422


def test_rename_missing_is_404(as_user) -> None:
    response = client.put("/api/pagemage/pages/p-missing1/name", json={"name": "x"})
    assert response.status_code == 404


def test_delete_removes_the_page(as_user) -> None:
    created = _upload("x.html")
    response = client.delete(f"/api/pagemage/pages/{created['id']}")
    assert response.status_code == 204
    assert client.get(f"/api/pagemage/pages/{created['id']}").status_code == 404


def test_delete_missing_is_404(as_user) -> None:
    response = client.delete("/api/pagemage/pages/p-missing1")
    assert response.status_code == 404
```

- [ ] **Step 2: Run — expect fail**

Run: `cd backend && pytest tests/test_pagemage_api.py -q`
Expected: FAIL (rename/delete routes missing; name field ignored).

- [ ] **Step 3: Update `routers/pagemage.py`**

Update the import to add `Form`:

```python
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
```

Add the optional `name` form field to `upload_page`:

```python
@router.post("/pages", response_model=PageSummary)
async def upload_page(
    file: Annotated[UploadFile, File()],
    name: Annotated[str | None, Form()] = None,
    current_user: str = Depends(get_current_user),
) -> PageSummary:
    raw = await file.read()
    try:
        page = service.create_page(current_user, file.filename or "", raw, name=name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PageSummary(
        id=page.id, name=page.name, created_at=page.created_at, updated_at=page.updated_at
    )
```

(Add `RenameRequest` to the schema import line:
`from app.schemas.pagemage import Page, PageSummary, RenameRequest, UpdateHtmlRequest`.)

Append the rename + delete routes (after `update_page`, before the share routes):

```python
@router.put("/pages/{page_id}/name", response_model=Page)
def rename_page(
    page_id: str,
    req: RenameRequest,
    current_user: str = Depends(get_current_user),
) -> Page:
    try:
        return service.rename_page(current_user, page_id, req.name)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Page not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.delete("/pages/{page_id}", status_code=204)
def delete_page(page_id: str, current_user: str = Depends(get_current_user)) -> None:
    try:
        service.delete_page(current_user, page_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Page not found") from exc
```

- [ ] **Step 4: Run — expect pass**

Run: `cd backend && pytest tests/test_pagemage_api.py -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/pagemage.py backend/tests/test_pagemage_api.py
git commit -m "feat(pagemage): add rename/delete routes and upload name field"
```

---

## Task M3: `useApi.upload` fields + store actions

**Files:**
- Modify: `frontend/src/composables/useApi.ts`
- Modify: `frontend/src/apps/pagemage/stores/usePagemageStore.ts`
- Test: `frontend/src/apps/pagemage/stores/usePagemageStore.spec.ts`

- [ ] **Step 1: Extend `useApi.upload` to accept extra fields**

Replace the `upload` function and its `api` entry:

```typescript
async function upload<T>(
  path: string,
  file: File,
  fields?: Record<string, string>,
): Promise<T> {
  const form = new FormData();
  form.append("file", file);
  if (fields) {
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
  }
  return send<T>("POST", path, form, false);
}
```

In the `api` object:

```typescript
  upload: <T>(path: string, file: File, fields?: Record<string, string>) =>
    upload<T>(path, file, fields),
```

- [ ] **Step 2: Write failing store tests** (append to `usePagemageStore.spec.ts`)

```typescript
describe("usePagemageStore manage", () => {
  it("upload forwards the name as a field", async () => {
    const summary = { id: "p-1", name: "Title", shared: false, created_at: "t", updated_at: "t" };
    uploadMock.mockResolvedValue(summary);
    const store = usePagemageStore();
    const file = new File(["<p>x</p>"], "a.html", { type: "text/html" });
    await store.upload(file, "Title");
    expect(uploadMock).toHaveBeenCalledWith("/pagemage/pages", file, { name: "Title" });
  });

  it("upload without a name sends no fields", async () => {
    uploadMock.mockResolvedValue({ id: "p-1", name: "a", shared: false, created_at: "t", updated_at: "t" });
    const store = usePagemageStore();
    const file = new File(["<p>x</p>"], "a.html", { type: "text/html" });
    await store.upload(file);
    expect(uploadMock).toHaveBeenCalledWith("/pagemage/pages", file, undefined);
  });

  it("renamePage updates the matching summary", async () => {
    putMock.mockResolvedValue({
      id: "p-1", name: "New", html: "<p>x</p>", share_token: "", created_at: "t", updated_at: "t2",
    });
    const store = usePagemageStore();
    store.pages = [{ id: "p-1", name: "Old", shared: false, created_at: "t", updated_at: "t" }];
    const ok = await store.renamePage("p-1", "New");
    expect(putMock).toHaveBeenCalledWith("/pagemage/pages/p-1/name", { name: "New" });
    expect(ok).toBe(true);
    expect(store.pages[0].name).toBe("New");
  });

  it("deletePage removes it from the list", async () => {
    delMock.mockResolvedValue(undefined);
    const store = usePagemageStore();
    store.pages = [{ id: "p-1", name: "A", shared: false, created_at: "t", updated_at: "t" }];
    const ok = await store.deletePage("p-1");
    expect(delMock).toHaveBeenCalledWith("/pagemage/pages/p-1");
    expect(ok).toBe(true);
    expect(store.pages).toEqual([]);
  });
});
```

- [ ] **Step 3: Run — expect fail**

Run: `cd frontend && npx vitest run src/apps/pagemage/stores/usePagemageStore.spec.ts`
Expected: FAIL — `upload` signature / `renamePage` / `deletePage` missing.

- [ ] **Step 4: Update the store**

Change `upload` to forward the name, and add the two actions. Replace the existing `upload` body signature:

```typescript
  async function upload(
    file: File,
    name?: string,
  ): Promise<PageSummary | null> {
    loading.value = true;
    error.value = null;
    try {
      const summary = await api.upload<PageSummary>(
        "/pagemage/pages",
        file,
        name ? { name } : undefined,
      );
      pages.value.unshift(summary);
      return summary;
    } catch (e) {
      error.value = message(e);
      return null;
    } finally {
      loading.value = false;
    }
  }
```

Add before the `return` (and include in the returned object):

```typescript
  async function renamePage(pageId: string, name: string): Promise<boolean> {
    error.value = null;
    try {
      const saved = await api.put<Page>(`/pagemage/pages/${pageId}/name`, { name });
      const summary = pages.value.find((p) => p.id === pageId);
      if (summary) {
        summary.name = saved.name;
        summary.updated_at = saved.updated_at;
      }
      if (currentPage.value?.id === pageId) currentPage.value = saved;
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    }
  }

  async function deletePage(pageId: string): Promise<boolean> {
    error.value = null;
    try {
      await api.del(`/pagemage/pages/${pageId}`);
      pages.value = pages.value.filter((p) => p.id !== pageId);
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    }
  }
```

Add `renamePage,` and `deletePage,` to the returned object.

- [ ] **Step 5: Run — expect pass**

Run: `cd frontend && npx vitest run src/apps/pagemage/stores/usePagemageStore.spec.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/composables/useApi.ts frontend/src/apps/pagemage/stores/usePagemageStore.ts frontend/src/apps/pagemage/stores/usePagemageStore.spec.ts
git commit -m "feat(pagemage): store rename/delete + upload name field"
```

> Note: a broad `useApi` change can affect other apps' `upload` callers. `fields` is optional and defaulted, so existing `api.upload(path, file)` calls are unchanged — but run the full frontend suite in Task M5 to confirm.

---

## Task M4: HomePage — upload-name dialog, rename, delete

**Files:**
- Modify: `frontend/src/apps/pagemage/pages/HomePage.vue`
- Test: `frontend/src/apps/pagemage/pages/HomePage.spec.ts`

- [ ] **Step 1: Update `HomePage.vue`**

Add card action buttons inside the `q-card-section`, after the shared badge:

```vue
            <div class="row items-center q-gutter-xs q-mt-sm">
              <template v-if="confirmingId === page.id">
                <span class="text-caption q-mr-xs">Delete this page?</span>
                <q-btn
                  dense flat no-caps color="negative" label="Delete"
                  :data-testid="`delete-confirm-${page.id}`"
                  @click.stop="confirmDelete(page.id)"
                />
                <q-btn
                  dense flat no-caps label="Keep"
                  :data-testid="`delete-cancel-${page.id}`"
                  @click.stop="confirmingId = null"
                />
              </template>
              <template v-else>
                <q-btn
                  dense flat round icon="edit"
                  :data-testid="`rename-${page.id}`"
                  @click.stop="openRename(page)"
                />
                <q-btn
                  dense flat round icon="delete"
                  :data-testid="`delete-${page.id}`"
                  @click.stop="confirmingId = page.id"
                />
              </template>
            </div>
```

Add two dialogs before the closing `</q-page>`:

```vue
    <q-dialog v-model="uploadDialog">
      <q-card style="min-width: 320px">
        <q-card-section class="text-subtitle1">Name this page</q-card-section>
        <q-card-section>
          <q-input
            v-model="uploadName"
            dense outlined autofocus label="Name"
            data-testid="upload-name"
            @keyup.enter="confirmUpload"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancel" data-testid="upload-cancel" @click="cancelUpload" />
          <q-btn
            unelevated no-caps color="primary" label="Upload"
            data-testid="upload-submit" @click="confirmUpload"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>

    <q-dialog v-model="renameDialog">
      <q-card style="min-width: 320px">
        <q-card-section class="text-subtitle1">Rename page</q-card-section>
        <q-card-section>
          <q-input
            v-model="renameName"
            dense outlined autofocus label="Name"
            data-testid="rename-name"
            @keyup.enter="confirmRename"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat no-caps label="Cancel" data-testid="rename-cancel" @click="renameDialog = false" />
          <q-btn
            unelevated no-caps color="primary" label="Save"
            :disable="!renameName.trim()"
            data-testid="rename-submit" @click="confirmRename"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
```

Replace the `<script setup>` body with (keeping existing imports, adding `PageSummary` type + `computed` not needed):

```typescript
import { onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { usePagemageStore } from "@/apps/pagemage/stores/usePagemageStore";
import type { PageSummary } from "@/apps/pagemage/types";

const store = usePagemageStore();
const router = useRouter();
const fileInput = ref<HTMLInputElement | null>(null);

const uploadDialog = ref(false);
const uploadName = ref("");
const pendingFile = ref<File | null>(null);

const renameDialog = ref(false);
const renameName = ref("");
const renamingId = ref<string | null>(null);

const confirmingId = ref<string | null>(null);

onMounted(() => void store.fetchPages());

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function stripExt(filename: string): string {
  return filename.replace(/\.html?$/i, "");
}

function pickFile(): void {
  fileInput.value?.click();
}

function onFile(event: Event): void {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = ""; // allow re-selecting the same file
  if (!file) return;
  pendingFile.value = file;
  uploadName.value = stripExt(file.name);
  uploadDialog.value = true;
}

async function confirmUpload(): Promise<void> {
  const file = pendingFile.value;
  if (!file) return;
  const summary = await store.upload(file, uploadName.value.trim() || undefined);
  uploadDialog.value = false;
  pendingFile.value = null;
  if (summary) void router.push(`/pagemage/pages/${summary.id}`);
}

function cancelUpload(): void {
  uploadDialog.value = false;
  pendingFile.value = null;
}

function openRename(page: PageSummary): void {
  renamingId.value = page.id;
  renameName.value = page.name;
  renameDialog.value = true;
}

async function confirmRename(): Promise<void> {
  const id = renamingId.value;
  const name = renameName.value.trim();
  if (!id || !name) return;
  const ok = await store.renamePage(id, name);
  if (ok) renameDialog.value = false;
}

async function confirmDelete(pageId: string): Promise<void> {
  await store.deletePage(pageId);
  confirmingId.value = null;
}

function open(pageId: string): void {
  if (confirmingId.value === pageId) return;
  void router.push(`/pagemage/pages/${pageId}`);
}
```

- [ ] **Step 2: Update `HomePage.spec.ts`**

Add stubs for the new components (merge into `STUBS`):

```typescript
  "q-dialog": { template: '<div v-if="modelValue"><slot /></div>', props: ["modelValue"] },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
```

> The existing upload test (“uploads a chosen file and navigates…”) changes: upload now goes through the dialog. Replace that test body with the dialog flow:

```typescript
  it("uploads via the name dialog and navigates to the new page", async () => {
    getMock.mockResolvedValue([]);
    uploadMock.mockResolvedValue({
      id: "p-new", name: "Chosen", shared: false, created_at: "t", updated_at: "t",
    });
    const wrapper = render();
    await flushPromises();
    const file = new File(["<p>x</p>"], "new.html", { type: "text/html" });
    const input = wrapper.find('[data-testid="file-input"]');
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    // Dialog opened, name pre-filled from filename.
    const nameInput = wrapper.find('[data-testid="upload-name"]')
      .element as HTMLInputElement;
    expect(nameInput.value).toBe("new");
    await wrapper.find('[data-testid="upload-submit"]').trigger("click");
    await flushPromises();
    expect(uploadMock).toHaveBeenCalledWith("/pagemage/pages", file, { name: "new" });
    expect(push).toHaveBeenCalledWith("/pagemage/pages/p-new");
  });
```

Add rename + delete tests:

```typescript
  it("renames via the rename dialog", async () => {
    getMock.mockResolvedValue([
      { id: "p-1", name: "Old", shared: false, created_at: "t", updated_at: "t" },
    ]);
    putMock.mockResolvedValue({
      id: "p-1", name: "New", html: "", share_token: "", created_at: "t", updated_at: "t2",
    });
    const wrapper = render();
    await flushPromises();
    await wrapper.find('[data-testid="rename-p-1"]').trigger("click");
    const nameInput = wrapper.find('[data-testid="rename-name"]')
      .element as HTMLInputElement;
    expect(nameInput.value).toBe("Old");
    await wrapper.find('[data-testid="rename-name"]').setValue("New");
    await wrapper.find('[data-testid="rename-submit"]').trigger("click");
    await flushPromises();
    expect(putMock).toHaveBeenCalledWith("/pagemage/pages/p-1/name", { name: "New" });
  });

  it("deletes after inline confirm and removes the card", async () => {
    getMock.mockResolvedValue([
      { id: "p-1", name: "A", shared: false, created_at: "t", updated_at: "t" },
    ]);
    delMock.mockResolvedValue(undefined);
    const wrapper = render();
    await flushPromises();
    await wrapper.find('[data-testid="delete-p-1"]').trigger("click");
    await wrapper.find('[data-testid="delete-confirm-p-1"]').trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/pagemage/pages/p-1");
    expect(wrapper.find('[data-testid="page-p-1"]').exists()).toBe(false);
  });
```

The HomePage spec's hoisted mock currently exposes `getMock`/`uploadMock`/`push`. Add `putMock` and `delMock` to the `vi.hoisted` block, the `vi.mock("@/composables/useApi")` `api` object (`put: putMock, del: delMock`), and `beforeEach` resets.

- [ ] **Step 3: Run — expect pass**

Run: `cd frontend && npx vitest run src/apps/pagemage/pages/HomePage.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/apps/pagemage/pages/HomePage.vue frontend/src/apps/pagemage/pages/HomePage.spec.ts
git commit -m "feat(pagemage): home-card rename/delete and upload name dialog"
```

---

## Task M5: Full verification + walkthrough

- [ ] **Step 1: Full PageMage backend + lint**

Run: `cd backend && pytest tests/test_pagemage_repo.py tests/test_pagemage_service.py tests/test_pagemage_api.py -q && black . && ruff check .`
Expected: pass; black nothing new; ruff clean.

- [ ] **Step 2: Full frontend suite + lint** (the `useApi` change touches all apps)

Run: `cd frontend && npx vitest run src/apps/pagemage src/composables && npx eslint src/apps/pagemage src/composables/useApi.ts`
Expected: pass; eslint clean. (If any other app's upload test breaks, investigate — `fields` is optional so it should not.)

- [ ] **Step 3: Manual walkthrough (verify/run skill)**

With both dev servers + a seeded user:
1. Click Upload HTML → choose a file → name dialog appears pre-filled with the filename → edit the name → Upload → the new page opens and the card shows the chosen name.
2. On a card, click Rename → change the name → the card updates.
3. On a card, click Delete → inline confirm → Delete → the card disappears; reload confirms it's gone.

- [ ] **Step 4: Report** spec-coverage + findings.

---

## Notes for the implementer

- Keep layering strict; only `pagemage_repo` touches the filesystem.
- `useApi.upload`'s new `fields` arg is optional — do not change existing callers.
- Card action buttons must use `@click.stop` so they never open the viewer.
- A failed delete/rename must leave the list unchanged (store returns `false`).
