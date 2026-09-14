import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));

import { useShoppingListStore } from "@/apps/kitchencraft/stores/useShoppingListStore";
import type { ShoppingItem } from "@/apps/kitchencraft/types";

let counter = 0;

function item(over: Partial<ShoppingItem> = {}): ShoppingItem {
  counter += 1;
  return {
    id: `s-${String(counter).padStart(8, "0")}`,
    text: `Item ${counter}`,
    ticked: false,
    created_at: "2026-09-14T18:40:00+00:00",
    ...over,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  counter = 0;
  vi.clearAllMocks();
});

async function loadedStore(items: ShoppingItem[]) {
  getMock.mockResolvedValueOnce({ schema_version: 1, items });
  const store = useShoppingListStore();
  await store.fetchList();
  return store;
}

describe("fetchList", () => {
  it("loads the items in the order the server gave them", async () => {
    const store = await loadedStore([
      item({ text: "bread" }),
      item({ text: "milk" }),
    ]);

    expect(getMock).toHaveBeenCalledWith("/kitchencraft/shopping-list");
    // Never sorted client-side either.
    expect(store.items.map((i) => i.text)).toEqual(["bread", "milk"]);
    expect(store.loaded).toBe(true);
  });

  it("distinguishes an empty list from one not yet fetched", async () => {
    const store = useShoppingListStore();
    expect(store.isEmpty).toBe(false); // not fetched — not "empty"

    getMock.mockResolvedValueOnce({ schema_version: 1, items: [] });
    await store.fetchList();
    expect(store.isEmpty).toBe(true);
  });

  it("clears loading in a finally even when the request fails", async () => {
    getMock.mockRejectedValueOnce(new Error("Network error"));
    const store = useShoppingListStore();
    await store.fetchList();

    expect(store.loading).toBe(false);
    expect(store.error).toBe("Network error");
  });
});

describe("addItem", () => {
  it("shows the row before the request resolves", async () => {
    const store = await loadedStore([]);
    postMock.mockReturnValueOnce(new Promise(() => {})); // never settles

    void store.addItem("oat milk");

    expect(store.items.map((i) => i.text)).toEqual(["oat milk"]);
    // Outside the global loading flag, like every other optimistic write here.
    expect(store.loading).toBe(false);
  });

  it("sends the text to the API", async () => {
    const store = await loadedStore([]);
    postMock.mockResolvedValueOnce(item({ text: "oat milk" }));

    await store.addItem("oat milk");

    expect(postMock).toHaveBeenCalledWith("/kitchencraft/shopping-list/items", {
      text: "oat milk",
    });
  });

  it("replaces the provisional row with the server's, keeping its place", async () => {
    const store = await loadedStore([item({ text: "bread" })]);
    const saved = item({ text: "oat milk" });
    postMock.mockResolvedValueOnce(saved);

    await store.addItem("oat milk");

    expect(store.items.map((i) => i.text)).toEqual(["bread", "oat milk"]);
    expect(store.items[1].id).toBe(saved.id);
    // No provisional id survives into the loaded list.
    expect(store.items.some((i) => i.id.startsWith("pending-"))).toBe(false);
  });

  it("appends to the end, never to the top", async () => {
    const store = await loadedStore([item({ text: "bread" })]);
    postMock.mockResolvedValueOnce(item({ text: "milk" }));

    await store.addItem("milk");

    expect(store.items.map((i) => i.text)).toEqual(["bread", "milk"]);
  });

  it("trims what it sends", async () => {
    const store = await loadedStore([]);
    postMock.mockResolvedValueOnce(item({ text: "oat milk" }));

    await store.addItem("  oat milk  ");

    expect(postMock).toHaveBeenCalledWith("/kitchencraft/shopping-list/items", {
      text: "oat milk",
    });
  });

  it("does nothing at all for blank text", async () => {
    const store = await loadedStore([]);
    await store.addItem("   ");

    expect(postMock).not.toHaveBeenCalled();
    expect(store.items).toEqual([]);
  });

  it("removes the row again and reports when the write fails", async () => {
    const store = await loadedStore([item({ text: "bread" })]);
    postMock.mockRejectedValueOnce(new Error("Offline"));

    await store.addItem("oat milk");

    expect(store.items.map((i) => i.text)).toEqual(["bread"]);
    expect(store.error).toBe("Offline");
  });

  it("keeps earlier items when a later add fails", async () => {
    const store = await loadedStore([]);
    postMock.mockResolvedValueOnce(item({ text: "bread" }));
    await store.addItem("bread");

    postMock.mockRejectedValueOnce(new Error("Offline"));
    await store.addItem("milk");

    expect(store.items.map((i) => i.text)).toEqual(["bread"]);
  });

  it("allows the same text twice — two items, not a merge", async () => {
    const store = await loadedStore([]);
    postMock
      .mockResolvedValueOnce(item({ text: "milk" }))
      .mockResolvedValueOnce(item({ text: "milk" }));

    await store.addItem("milk");
    await store.addItem("milk");

    // De-duplication belongs to Story 3.4's merge, not to hand-entry.
    expect(store.items).toHaveLength(2);
  });
});
