# PageMage Shareable Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each PageMage page a public, revocable, view-only share link that renders the stored HTML without login.

**Architecture:** Add a `share_token` to the page record (minted on an explicit Share, cleared on Disable). A public, unauthenticated `share_router` serves the stored HTML verbatim with a `Content-Security-Policy: sandbox allow-scripts allow-forms` header (opaque origin — safe). Mirrors the existing `kalendariq.share_router` convention.

**Tech Stack:** FastAPI (Python 3.12), Pydantic v2, pytest. Vue 3 / Quasar v2 / Pinia / TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-10-10-pagemage-sharing-design.md`

**Env note:** venv is at the repo root and on PATH — run `pytest`/`python` directly (not `.venv/bin/...`). Backend deps `anthropic` and `python-multipart` must be installed (`pip install -r backend/requirements-dev.txt`) or the suite can't import.

---

## Task 1: Schema fields

**Files:**
- Modify: `backend/app/schemas/pagemage.py`

- [ ] **Step 1: Add `share_token` to `Page` and `shared` to `PageSummary`**

In `Page`, add after `html`:

```python
    html: str
    share_token: str = ""
```

In `PageSummary`, add after `name`:

```python
    name: str
    shared: bool = False
```

- [ ] **Step 2: Verify import**

Run: `cd backend && python -c "from app.schemas.pagemage import Page, PageSummary; print(Page.model_fields['share_token'].default, PageSummary.model_fields['shared'].default)"`
Expected: prints `  False` (empty string then False).

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/pagemage.py
git commit -m "feat(pagemage): add share_token/shared schema fields"
```

---

## Task 2: Repository — find_by_share_token

**Files:**
- Modify: `backend/app/repositories/pagemage_repo.py`
- Test: `backend/tests/test_pagemage_repo.py`

- [ ] **Step 1: Write the failing tests** (append to the existing test file)

```python
def test_find_by_share_token_matches_across_users() -> None:
    p = _page("p-shared01", "Shared")
    p.share_token = "tok-abc"
    repo.write_page("bob", p)
    found = repo.find_by_share_token("tok-abc")
    assert found is not None
    assert found.id == "p-shared01"


def test_find_by_share_token_unknown_is_none() -> None:
    repo.write_page("ana", _page("p-aaaaaaaa"))
    assert repo.find_by_share_token("nope") is None


def test_find_by_share_token_ignores_empty_token() -> None:
    # A page with no token must never be matched by an empty query.
    repo.write_page("ana", _page("p-aaaaaaaa"))  # share_token defaults to ""
    assert repo.find_by_share_token("") is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_pagemage_repo.py -q`
Expected: FAIL — `find_by_share_token` does not exist (AttributeError).

- [ ] **Step 3: Implement `find_by_share_token`** (append to `pagemage_repo.py`)

```python
def _users_dir() -> Path:
    return settings.data_dir / _APP_DIR / "users"


def find_by_share_token(token: str) -> Page | None:
    """The page carrying `token`, scanning every user's pages. `None` if none.

    No user context exists on the public share path, so this walks
    `pagemage/users/*/pages/*.json`. An empty `token` never matches (pages that
    were never shared also carry an empty token).
    """
    if not token:
        return None
    users = _users_dir()
    if not users.is_dir():
        return None
    for user_dir in sorted(users.iterdir()):
        pages = user_dir / "pages"
        if not pages.is_dir():
            continue
        for path in sorted(pages.glob("*.json")):
            page = Page.model_validate(json.loads(path.read_text(encoding="utf-8")))
            if page.share_token == token:
                return page
    return None
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_pagemage_repo.py -q`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/repositories/pagemage_repo.py backend/tests/test_pagemage_repo.py
git commit -m "feat(pagemage): add find_by_share_token repo scan"
```

---

## Task 3: Service — share / revoke / get_shared, and `shared` in summaries

**Files:**
- Modify: `backend/app/services/pagemage_service.py`
- Test: `backend/tests/test_pagemage_service.py`

- [ ] **Step 1: Write the failing tests** (append to the existing test file)

```python
def test_create_share_mints_a_token_and_is_idempotent() -> None:
    page = service.create_page("ana", "p.html", b"<p>x</p>")
    shared = service.create_share("ana", page.id)
    assert shared.share_token
    again = service.create_share("ana", page.id)
    assert again.share_token == shared.share_token  # stable link


def test_revoke_share_clears_the_token() -> None:
    page = service.create_page("ana", "p.html", b"<p>x</p>")
    service.create_share("ana", page.id)
    revoked = service.revoke_share("ana", page.id)
    assert revoked.share_token == ""


def test_get_shared_page_returns_by_token() -> None:
    page = service.create_page("ana", "p.html", b"<h1>Hi</h1>")
    shared = service.create_share("ana", page.id)
    got = service.get_shared_page(shared.share_token)
    assert got.html == "<h1>Hi</h1>"


def test_get_shared_page_rejects_empty_and_unknown() -> None:
    with pytest.raises(FileNotFoundError):
        service.get_shared_page("")
    with pytest.raises(FileNotFoundError):
        service.get_shared_page("nope")


def test_get_shared_page_404s_after_revoke() -> None:
    page = service.create_page("ana", "p.html", b"<p>x</p>")
    shared = service.create_share("ana", page.id)
    token = shared.share_token
    service.revoke_share("ana", page.id)
    with pytest.raises(FileNotFoundError):
        service.get_shared_page(token)


def test_list_pages_reports_shared_flag() -> None:
    page = service.create_page("ana", "p.html", b"<p>x</p>")
    assert service.list_pages("ana")[0].shared is False
    service.create_share("ana", page.id)
    assert service.list_pages("ana")[0].shared is True


def test_create_share_missing_page_raises() -> None:
    with pytest.raises(FileNotFoundError):
        service.create_share("ana", "p-missing1")
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_pagemage_service.py -q`
Expected: FAIL — `create_share` etc. do not exist.

- [ ] **Step 3: Implement the service changes**

Add the import at the top (next to `import uuid`):

```python
import secrets
import uuid
```

Update `list_pages` to populate `shared`:

```python
def list_pages(user: str) -> list[PageSummary]:
    """All of `user`'s pages as summaries, newest first."""
    pages = repo.list_pages_for(user)
    pages.sort(key=lambda p: p.created_at, reverse=True)
    return [
        PageSummary(
            id=p.id,
            name=p.name,
            shared=bool(p.share_token),
            created_at=p.created_at,
            updated_at=p.updated_at,
        )
        for p in pages
    ]
```

Append the share functions (after `update_html`):

```python
def new_share_token() -> str:
    """The secret in a share link — 192 bits, not guessable, URL-safe."""
    return secrets.token_urlsafe(24)


def create_share(user: str, page_id: str) -> Page:
    """Mint a share token for the page if it has none; return the page.

    Idempotent: an already-shared page keeps its token, so the link is stable.
    """
    page = get_page(user, page_id)
    if not page.share_token:
        page.share_token = new_share_token()
        repo.write_page(user, page)
    return page


def revoke_share(user: str, page_id: str) -> Page:
    """Clear the page's share token so the old link stops resolving."""
    page = get_page(user, page_id)
    page.share_token = ""
    repo.write_page(user, page)
    return page


def get_shared_page(token: str) -> Page:
    """The page behind a share token, or raise `FileNotFoundError`.

    The token IS the authorisation — there is no user on this path. An empty or
    unknown token is the same `FileNotFoundError`, so nothing reveals whether a
    page exists.
    """
    page = repo.find_by_share_token(token)
    if page is None:
        raise FileNotFoundError("shared page not found")
    return page
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_pagemage_service.py -q`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/pagemage_service.py backend/tests/test_pagemage_service.py
git commit -m "feat(pagemage): add share/revoke/get_shared service logic"
```

---

## Task 4: Router — owner share/revoke + public raw view, wire into main

**Files:**
- Modify: `backend/app/routers/pagemage.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_pagemage_api.py`

- [ ] **Step 1: Write the failing tests** (append to the existing test file)

```python
def test_create_share_returns_a_token(as_user) -> None:
    created = _upload("x.html")
    response = client.post(f"/api/pagemage/pages/{created['id']}/share")
    assert response.status_code == 200, response.text
    assert response.json()["share_token"]


def test_public_raw_view_needs_no_auth_and_returns_html(as_user) -> None:
    created = _upload("x.html", b"<h1>Hello</h1>")
    token = client.post(f"/api/pagemage/pages/{created['id']}/share").json()[
        "share_token"
    ]
    # No auth override cleared on purpose — the public route ignores auth anyway.
    response = client.get(f"/api/pagemage/share/{token}/raw")
    assert response.status_code == 200
    assert response.text == "<h1>Hello</h1>"
    assert "text/html" in response.headers["content-type"]
    assert response.headers["content-security-policy"] == "sandbox allow-scripts allow-forms"


def test_public_raw_view_unknown_token_is_404(as_user) -> None:
    response = client.get("/api/pagemage/share/nope/raw")
    assert response.status_code == 404


def test_revoke_makes_the_link_404(as_user) -> None:
    created = _upload("x.html")
    token = client.post(f"/api/pagemage/pages/{created['id']}/share").json()[
        "share_token"
    ]
    assert client.get(f"/api/pagemage/share/{token}/raw").status_code == 200
    del_resp = client.delete(f"/api/pagemage/pages/{created['id']}/share")
    assert del_resp.status_code == 200
    assert del_resp.json()["share_token"] == ""
    assert client.get(f"/api/pagemage/share/{token}/raw").status_code == 404


def test_list_reports_shared_after_share(as_user) -> None:
    created = _upload("x.html")
    client.post(f"/api/pagemage/pages/{created['id']}/share")
    summary = next(p for p in client.get("/api/pagemage/pages").json() if p["id"] == created["id"])
    assert summary["shared"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_pagemage_api.py -q`
Expected: FAIL — share routes 404 / not registered.

- [ ] **Step 3: Add the owner routes + public router to `pagemage.py`**

Update the import line to add `Response`:

```python
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
```

Append the owner routes (after `update_page`):

```python
@router.post("/pages/{page_id}/share", response_model=Page)
def create_share(page_id: str, current_user: str = Depends(get_current_user)) -> Page:
    try:
        return service.create_share(current_user, page_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Page not found") from exc


@router.delete("/pages/{page_id}/share", response_model=Page)
def revoke_share(page_id: str, current_user: str = Depends(get_current_user)) -> Page:
    try:
        return service.revoke_share(current_user, page_id)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Page not found") from exc
```

Append the public router at the end of the file:

```python
# Unauthenticated by design — the share link. The token in the path IS the
# authorisation; an unknown, empty, or revoked token is a 404 with no detail,
# so nothing reveals whether a page exists. Mirrors kalendariq.share_router.
share_router = APIRouter(prefix="/api/pagemage/share", tags=["pagemage-share"])


@share_router.get("/{token}/raw")
def view_shared_raw(token: str) -> Response:
    try:
        page = service.get_shared_page(token)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail="Not found") from exc
    # CSP `sandbox` forces an opaque origin: scripts/forms run, but the served
    # HTML cannot reach this origin's cookies, localStorage, or the app's JWT.
    return Response(
        content=page.html,
        media_type="text/html; charset=utf-8",
        headers={"Content-Security-Policy": "sandbox allow-scripts allow-forms"},
    )
```

- [ ] **Step 4: Wire the public router into `main.py`**

Add after `app.include_router(pagemage.router)`:

```python
app.include_router(pagemage.router)
# Unauthenticated by design — the share link. See routers/pagemage.py.
app.include_router(pagemage.share_router)
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && pytest tests/test_pagemage_api.py -q`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/pagemage.py backend/app/main.py backend/tests/test_pagemage_api.py
git commit -m "feat(pagemage): add share/revoke routes and public raw view"
```

---

## Task 5: Frontend types + store actions

**Files:**
- Modify: `frontend/src/apps/pagemage/types.ts`
- Modify: `frontend/src/apps/pagemage/stores/usePagemageStore.ts`
- Test: `frontend/src/apps/pagemage/stores/usePagemageStore.spec.ts`

- [ ] **Step 1: Update types**

In `types.ts`, add `share_token` to `Page` and `shared` to `PageSummary`:

```typescript
export interface Page {
  id: string;
  name: string;
  html: string;
  share_token: string;
  created_at: string;
  updated_at: string;
}

export interface PageSummary {
  id: string;
  name: string;
  shared: boolean;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Write the failing store tests** (append to the store spec)

```typescript
describe("usePagemageStore sharing", () => {
  it("createShare posts and returns the token, updating currentPage", async () => {
    const shared = {
      id: "p-1",
      name: "A",
      html: "<p>x</p>",
      share_token: "tok-xyz",
      created_at: "t",
      updated_at: "t",
    };
    postMock.mockResolvedValue(shared);
    const store = usePagemageStore();
    const token = await store.createShare("p-1");
    expect(postMock).toHaveBeenCalledWith("/pagemage/pages/p-1/share");
    expect(token).toBe("tok-xyz");
    expect(store.currentPage).toEqual(shared);
  });

  it("revokeShare deletes and clears the token on currentPage", async () => {
    const cleared = {
      id: "p-1",
      name: "A",
      html: "<p>x</p>",
      share_token: "",
      created_at: "t",
      updated_at: "t",
    };
    delMock.mockResolvedValue(cleared);
    const store = usePagemageStore();
    const ok = await store.revokeShare("p-1");
    expect(delMock).toHaveBeenCalledWith("/pagemage/pages/p-1/share");
    expect(ok).toBe(true);
    expect(store.currentPage).toEqual(cleared);
  });

  it("createShare returns null and sets error on failure", async () => {
    postMock.mockRejectedValue(new Error("boom"));
    const store = usePagemageStore();
    const token = await store.createShare("p-1");
    expect(token).toBeNull();
    expect(store.error).toBe("boom");
  });
});
```

> Note: the store spec's `api` mock already exposes `post`/`del` (`postMock`/`delMock`) — no mock change needed.

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/apps/pagemage/stores/usePagemageStore.spec.ts`
Expected: FAIL — `createShare`/`revokeShare` do not exist.

- [ ] **Step 4: Implement the store actions**

Add these inside the store setup (before the `return`), and include them in the returned object:

```typescript
  async function createShare(pageId: string): Promise<string | null> {
    error.value = null;
    try {
      const shared = await api.post<Page>(`/pagemage/pages/${pageId}/share`);
      currentPage.value = shared;
      return shared.share_token;
    } catch (e) {
      error.value = message(e);
      return null;
    }
  }

  async function revokeShare(pageId: string): Promise<boolean> {
    error.value = null;
    try {
      currentPage.value = await api.del<Page>(`/pagemage/pages/${pageId}/share`);
      return true;
    } catch (e) {
      error.value = message(e);
      return false;
    }
  }
```

Add `createShare,` and `revokeShare,` to the returned object.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/apps/pagemage/stores/usePagemageStore.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/apps/pagemage/types.ts frontend/src/apps/pagemage/stores/usePagemageStore.ts frontend/src/apps/pagemage/stores/usePagemageStore.spec.ts
git commit -m "feat(pagemage): add share/revoke store actions and types"
```

---

## Task 6: Viewer Share dialog

**Files:**
- Modify: `frontend/src/apps/pagemage/pages/ViewerPage.vue`
- Test: `frontend/src/apps/pagemage/pages/ViewerPage.spec.ts`

- [ ] **Step 1: Add the Share UI to `ViewerPage.vue`**

In the toolbar's right-hand button group, add a Share button before Save:

```vue
        <q-btn
          flat
          no-caps
          icon="share"
          label="Share"
          :disable="!store.currentPage"
          data-testid="share"
          @click="shareOpen = true"
        />
        <q-btn
          unelevated
          no-caps
          color="primary"
          icon="save"
          label="Save"
          :loading="store.saving"
          :disable="!store.currentPage"
          data-testid="save"
          @click="requestSave"
        />
```

Add the dialog just before the closing `</q-page>`:

```vue
    <q-dialog v-model="shareOpen">
      <q-card style="min-width: 340px">
        <q-card-section class="text-subtitle1">Share this page</q-card-section>
        <q-card-section v-if="!shareToken" class="text-grey-7">
          Create a public link anyone can open without logging in.
        </q-card-section>
        <q-card-section v-else>
          <q-input
            :model-value="shareUrl"
            readonly
            outlined
            dense
            data-testid="share-url"
          />
        </q-card-section>
        <q-card-actions align="right">
          <q-btn
            v-if="!shareToken"
            unelevated
            no-caps
            color="primary"
            label="Create link"
            data-testid="create-link"
            @click="onCreateLink"
          />
          <template v-else>
            <q-btn
              flat
              no-caps
              color="negative"
              label="Disable link"
              data-testid="disable-link"
              @click="onDisableLink"
            />
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="Copy"
              data-testid="copy-link"
              @click="onCopy"
            />
          </template>
        </q-card-actions>
      </q-card>
    </q-dialog>
```

In `<script setup>`, add the state and handlers (keep existing imports; add `computed` is already imported):

```typescript
const shareOpen = ref(false);

const shareToken = computed(() => store.currentPage?.share_token ?? "");
const shareUrl = computed(() =>
  shareToken.value
    ? `${window.location.origin}/api/pagemage/share/${shareToken.value}/raw`
    : "",
);

async function onCreateLink(): Promise<void> {
  await store.createShare(pageId.value);
}

async function onDisableLink(): Promise<void> {
  await store.revokeShare(pageId.value);
}

async function onCopy(): Promise<void> {
  await navigator.clipboard.writeText(shareUrl.value);
}
```

- [ ] **Step 2: Add the component tests** (append to `ViewerPage.spec.ts`)

Add `q-dialog`, `q-card`, `q-card-section`, `q-card-actions`, `q-input` to the `STUBS` object:

```typescript
  "q-dialog": {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ["modelValue"],
  },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" readonly />',
    props: ["modelValue"],
  },
```

Then add the tests:

```typescript
describe("PageMage ViewerPage sharing", () => {
  it("creates a link and shows the share URL", async () => {
    getMock.mockResolvedValue(page());
    postMock.mockImplementation(async () => {
      const shared = { ...page(), share_token: "tok-xyz" };
      return shared;
    });
    const wrapper = render();
    await flushPromises();
    await wrapper.find('[data-testid="share"]').trigger("click");
    await wrapper.find('[data-testid="create-link"]').trigger("click");
    await flushPromises();
    const url = wrapper.find('[data-testid="share-url"]')
      .element as HTMLInputElement;
    expect(url.value).toContain("/api/pagemage/share/tok-xyz/raw");
  });

  it("disable calls revoke", async () => {
    getMock.mockResolvedValue({ ...page(), share_token: "tok-xyz" });
    delMock.mockResolvedValue({ ...page(), share_token: "" });
    const wrapper = render();
    await flushPromises();
    await wrapper.find('[data-testid="share"]').trigger("click");
    await wrapper.find('[data-testid="disable-link"]').trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/pagemage/pages/p-1/share");
  });
});
```

> The ViewerPage spec currently mocks `api` with `post: vi.fn()` and `del: vi.fn()` inline. Replace those two with hoisted `postMock`/`delMock` (like the store spec) so the tests can drive them: add `postMock`/`delMock` to the `vi.hoisted(...)` block and the `vi.mock("@/composables/useApi")` object, and `postMock.mockReset(); delMock.mockReset();` in `beforeEach`.

- [ ] **Step 3: Run the tests**

Run: `cd frontend && npx vitest run src/apps/pagemage/pages/ViewerPage.spec.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/apps/pagemage/pages/ViewerPage.vue frontend/src/apps/pagemage/pages/ViewerPage.spec.ts
git commit -m "feat(pagemage): add Share dialog to viewer"
```

---

## Task 7: Home page shared badge

**Files:**
- Modify: `frontend/src/apps/pagemage/pages/HomePage.vue`
- Test: `frontend/src/apps/pagemage/pages/HomePage.spec.ts`

- [ ] **Step 1: Add a shared badge to the card**

In the card section, after the page-name row's `<div class="text-subtitle1 ellipsis">{{ page.name }}</div>`'s enclosing row, add inside the `q-card-section`:

```vue
            <q-badge
              v-if="page.shared"
              color="primary"
              class="q-mt-xs"
              label="shared"
              :data-testid="`shared-${page.id}`"
            />
```

- [ ] **Step 2: Add the test** (append to `HomePage.spec.ts`)

Add `q-badge` to the `STUBS`:

```typescript
  "q-badge": {
    template: '<span :data-testid="$attrs[\'data-testid\']">{{ label }}</span>',
    props: ["label", "color"],
  },
```

Then:

```typescript
it("shows a shared badge only on shared pages", async () => {
  getMock.mockResolvedValue([
    { id: "p-1", name: "Public", shared: true, created_at: "t", updated_at: "t" },
    { id: "p-2", name: "Private", shared: false, created_at: "t", updated_at: "t" },
  ]);
  const wrapper = render();
  await flushPromises();
  expect(wrapper.find('[data-testid="shared-p-1"]').exists()).toBe(true);
  expect(wrapper.find('[data-testid="shared-p-2"]').exists()).toBe(false);
});
```

- [ ] **Step 3: Run the test**

Run: `cd frontend && npx vitest run src/apps/pagemage/pages/HomePage.spec.ts`
Expected: PASS (all tests).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/apps/pagemage/pages/HomePage.vue frontend/src/apps/pagemage/pages/HomePage.spec.ts
git commit -m "feat(pagemage): show shared badge on home cards"
```

---

## Task 8: Full verification + walkthrough

- [ ] **Step 1: Full PageMage backend + lint**

Run: `cd backend && pytest tests/test_pagemage_repo.py tests/test_pagemage_service.py tests/test_pagemage_api.py -q && black . && ruff check .`
Expected: all pass; black reformats nothing new; ruff clean.

- [ ] **Step 2: Full PageMage frontend + lint**

Run: `cd frontend && npx vitest run src/apps/pagemage && npx eslint src/apps/pagemage`
Expected: all specs pass; eslint clean.

- [ ] **Step 3: Manual walkthrough (verify/run skill)**

With both dev servers running and a seeded user:
1. Open a page in the viewer, click **Share** → **Create link** → a URL appears.
2. Copy the URL, open it in a fresh/incognito context (no login) → the HTML renders.
3. Confirm the browser received `Content-Security-Policy: sandbox allow-scripts allow-forms` on that response.
4. Back in the owner view, **Disable link** → reopening the URL now 404s.
5. Home page shows a "shared" badge only while a link is active.

- [ ] **Step 4: Spec-coverage self-check** and report.

---

## Notes for the implementer

- Layering stays strict: router maps exceptions; service raises stdlib errors; only `pagemage_repo` touches the filesystem.
- The public `share_router` has NO auth dependency — that's the point. The token is the authorization.
- Keep the 404 details generic on the public route; never reveal whether a page exists.
- The CSP `sandbox allow-scripts allow-forms` header is the security boundary for serving user HTML — do not drop it or add `allow-same-origin`.
