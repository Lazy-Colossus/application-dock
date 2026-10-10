import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock, uploadMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  uploadMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: postMock,
    put: putMock,
    del: delMock,
    upload: uploadMock,
  },
}));

import { usePagemageStore } from "./usePagemageStore";

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  delMock.mockReset();
  uploadMock.mockReset();
});

describe("usePagemageStore", () => {
  it("fetchPages loads summaries and clears loading", async () => {
    const summaries = [
      { id: "p-1", name: "A", created_at: "t", updated_at: "t" },
    ];
    getMock.mockResolvedValue(summaries);
    const store = usePagemageStore();
    await store.fetchPages();
    expect(store.pages).toEqual(summaries);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("fetchPages routes errors into error.value", async () => {
    getMock.mockRejectedValue(new Error("boom"));
    const store = usePagemageStore();
    await store.fetchPages();
    expect(store.error).toBe("boom");
    expect(store.loading).toBe(false);
  });

  it("upload posts the file and prepends the summary", async () => {
    const summary = { id: "p-9", name: "New", created_at: "t", updated_at: "t" };
    uploadMock.mockResolvedValue(summary);
    const store = usePagemageStore();
    const file = new File(["<p>x</p>"], "new.html", { type: "text/html" });
    const result = await store.upload(file);
    expect(uploadMock).toHaveBeenCalledWith("/pagemage/pages", file, undefined);
    expect(result).toEqual(summary);
    expect(store.pages[0]).toEqual(summary);
  });

  it("upload returns null and sets error on failure", async () => {
    uploadMock.mockRejectedValue(new Error("bad file"));
    const store = usePagemageStore();
    const file = new File(["x"], "x.html", { type: "text/html" });
    const result = await store.upload(file);
    expect(result).toBeNull();
    expect(store.error).toBe("bad file");
  });

  it("fetchPage stores the current page", async () => {
    const page = {
      id: "p-1",
      name: "A",
      html: "<p>hi</p>",
      created_at: "t",
      updated_at: "t",
    };
    getMock.mockResolvedValue(page);
    const store = usePagemageStore();
    await store.fetchPage("p-1");
    expect(store.currentPage).toEqual(page);
  });

  it("savePage puts the html and returns true on success", async () => {
    const saved = {
      id: "p-1",
      name: "A",
      html: "<p>new</p>",
      created_at: "t",
      updated_at: "t2",
    };
    putMock.mockResolvedValue(saved);
    const store = usePagemageStore();
    const ok = await store.savePage("p-1", "<p>new</p>");
    expect(putMock).toHaveBeenCalledWith("/pagemage/pages/p-1", {
      html: "<p>new</p>",
    });
    expect(ok).toBe(true);
    expect(store.currentPage).toEqual(saved);
  });

  it("savePage returns false and sets error on failure", async () => {
    putMock.mockRejectedValue(new Error("nope"));
    const store = usePagemageStore();
    const ok = await store.savePage("p-1", "<p>x</p>");
    expect(ok).toBe(false);
    expect(store.error).toBe("nope");
  });
});

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

describe("usePagemageStore manage", () => {
  it("upload forwards the name as a field", async () => {
    const summary = {
      id: "p-1",
      name: "Title",
      shared: false,
      created_at: "t",
      updated_at: "t",
    };
    uploadMock.mockResolvedValue(summary);
    const store = usePagemageStore();
    const file = new File(["<p>x</p>"], "a.html", { type: "text/html" });
    await store.upload(file, "Title");
    expect(uploadMock).toHaveBeenCalledWith("/pagemage/pages", file, {
      name: "Title",
    });
  });

  it("upload without a name sends no fields", async () => {
    uploadMock.mockResolvedValue({
      id: "p-1",
      name: "a",
      shared: false,
      created_at: "t",
      updated_at: "t",
    });
    const store = usePagemageStore();
    const file = new File(["<p>x</p>"], "a.html", { type: "text/html" });
    await store.upload(file);
    expect(uploadMock).toHaveBeenCalledWith("/pagemage/pages", file, undefined);
  });

  it("renamePage updates the matching summary", async () => {
    putMock.mockResolvedValue({
      id: "p-1",
      name: "New",
      html: "<p>x</p>",
      share_token: "",
      created_at: "t",
      updated_at: "t2",
    });
    const store = usePagemageStore();
    store.pages = [
      { id: "p-1", name: "Old", shared: false, created_at: "t", updated_at: "t" },
    ];
    const ok = await store.renamePage("p-1", "New");
    expect(putMock).toHaveBeenCalledWith("/pagemage/pages/p-1/name", {
      name: "New",
    });
    expect(ok).toBe(true);
    expect(store.pages[0].name).toBe("New");
  });

  it("deletePage removes it from the list", async () => {
    delMock.mockResolvedValue(undefined);
    const store = usePagemageStore();
    store.pages = [
      { id: "p-1", name: "A", shared: false, created_at: "t", updated_at: "t" },
    ];
    const ok = await store.deletePage("p-1");
    expect(delMock).toHaveBeenCalledWith("/pagemage/pages/p-1");
    expect(ok).toBe(true);
    expect(store.pages).toEqual([]);
  });
});
