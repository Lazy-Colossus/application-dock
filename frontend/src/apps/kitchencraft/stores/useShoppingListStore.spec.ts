import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

import { useShoppingListStore } from "@/apps/kitchencraft/stores/useShoppingListStore";
import type { ShoppingItem } from "@/apps/kitchencraft/types";

// Verbatim from EXPERIENCE.md § State Patterns → Shopping list / Write failed.
const WRITE_FAILED = "Couldn't save that — check your connection.";

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
    expect(store.error).toBe(WRITE_FAILED);
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

describe("toggleTicked", () => {
  it("marks the row before the request resolves", async () => {
    const store = await loadedStore([item({ text: "bread" })]);
    putMock.mockReturnValueOnce(new Promise(() => {}));

    void store.toggleTicked(store.items[0].id);

    expect(store.items[0].ticked).toBe(true);
    expect(store.loading).toBe(false);
  });

  it("sends the new state", async () => {
    const store = await loadedStore([item({ ticked: false })]);
    const id = store.items[0].id;
    putMock.mockResolvedValueOnce({ ...store.items[0], ticked: true });

    await store.toggleTicked(id);

    expect(putMock).toHaveBeenCalledWith(
      `/kitchencraft/shopping-list/items/${id}`,
      { ticked: true },
    );
  });

  it("unticks a ticked item", async () => {
    const store = await loadedStore([item({ ticked: true })]);
    const id = store.items[0].id;
    putMock.mockResolvedValueOnce({ ...store.items[0], ticked: false });

    await store.toggleTicked(id);

    expect(putMock).toHaveBeenCalledWith(
      `/kitchencraft/shopping-list/items/${id}`,
      { ticked: false },
    );
    expect(store.items[0].ticked).toBe(false);
  });

  it("never moves the item", async () => {
    const store = await loadedStore([
      item({ text: "bread" }),
      item({ text: "milk" }),
      item({ text: "apples" }),
    ]);
    const target = store.items[1];
    putMock.mockResolvedValueOnce({ ...target, ticked: true });

    await store.toggleTicked(target.id);

    expect(store.items.map((i) => i.text)).toEqual(["bread", "milk", "apples"]);
    expect(store.items[1].ticked).toBe(true);
  });

  it("reverts and reports on a failed write", async () => {
    const store = await loadedStore([item({ ticked: false })]);
    putMock.mockRejectedValueOnce(new Error("Offline"));

    await store.toggleTicked(store.items[0].id);

    expect(store.items[0].ticked).toBe(false);
    expect(store.error).toBe(WRITE_FAILED);
  });

  it("is a no-op for an unknown id", async () => {
    const store = await loadedStore([item()]);
    await store.toggleTicked("s-nope");
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("removeItem", () => {
  it("removes the row before the request resolves", async () => {
    const store = await loadedStore([item({ text: "bread" })]);
    delMock.mockReturnValueOnce(new Promise(() => {}));

    void store.removeItem(store.items[0].id);

    expect(store.items).toEqual([]);
    expect(store.loading).toBe(false);
  });

  it("removes only the one asked for", async () => {
    const store = await loadedStore([
      item({ text: "bread" }),
      item({ text: "milk" }),
    ]);
    delMock.mockResolvedValueOnce(undefined);

    await store.removeItem(store.items[0].id);

    expect(store.items.map((i) => i.text)).toEqual(["milk"]);
  });

  it("puts a failed removal back where it was, not at the end", async () => {
    const store = await loadedStore([
      item({ text: "bread" }),
      item({ text: "milk" }),
      item({ text: "apples" }),
    ]);
    delMock.mockRejectedValueOnce(new Error("Offline"));

    await store.removeItem(store.items[1].id);

    // Position is meaningful — this is the order the cook shops in.
    expect(store.items.map((i) => i.text)).toEqual(["bread", "milk", "apples"]);
    expect(store.error).toBe(WRITE_FAILED);
  });

  it("is a no-op for an unknown id", async () => {
    const store = await loadedStore([item()]);
    await store.removeItem("s-nope");
    expect(delMock).not.toHaveBeenCalled();
  });
});

describe("clearList", () => {
  it("empties before the request resolves", async () => {
    const store = await loadedStore([item(), item()]);
    delMock.mockReturnValueOnce(new Promise(() => {}));

    void store.clearList();

    expect(store.items).toEqual([]);
    expect(store.loading).toBe(false);
  });

  it("calls the collection route, not an item one", async () => {
    const store = await loadedStore([item()]);
    delMock.mockResolvedValueOnce(undefined);

    await store.clearList();

    expect(delMock).toHaveBeenCalledWith("/kitchencraft/shopping-list/items");
  });

  it("restores everything, ticks included, when it fails", async () => {
    const store = await loadedStore([
      item({ text: "bread", ticked: true }),
      item({ text: "milk" }),
    ]);
    delMock.mockRejectedValueOnce(new Error("Offline"));

    await store.clearList();

    expect(store.items.map((i) => i.text)).toEqual(["bread", "milk"]);
    expect(store.items[0].ticked).toBe(true);
    expect(store.error).toBe(WRITE_FAILED);
  });
});

describe("what a failure says", () => {
  it("never leaks the exception's own message to a cook in a shop", async () => {
    const store = await loadedStore([item()]);
    putMock.mockRejectedValueOnce(new Error("Failed to fetch"));

    await store.toggleTicked(store.items[0].id);

    expect(store.error).toBe(WRITE_FAILED);
    expect(store.error).not.toContain("fetch");
  });

  it("keeps the real error for a failed LOAD, which has no spec copy", async () => {
    getMock.mockRejectedValueOnce(new Error("Network error"));
    const store = useShoppingListStore();
    await store.fetchList();

    expect(store.error).toBe("Network error");
  });

  it("clears the message on the next successful write", async () => {
    const store = await loadedStore([item()]);
    putMock.mockRejectedValueOnce(new Error("nope"));
    await store.toggleTicked(store.items[0].id);
    expect(store.error).toBe(WRITE_FAILED);

    putMock.mockResolvedValueOnce({ ...store.items[0], ticked: true });
    await store.toggleTicked(store.items[0].id);
    expect(store.error).toBeNull();
  });
});

describe("addItems", () => {
  it("sends the whole batch as one request", async () => {
    const store = await loadedStore([]);
    postMock.mockResolvedValueOnce([
      item({ text: "thighs" }),
      item({ text: "garlic" }),
    ]);

    await store.addItems(["thighs", "garlic"]);

    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      "/kitchencraft/shopping-list/items/bulk",
      { texts: ["thighs", "garlic"], mode: "merge" },
    );
  });

  it("shows the rows before the request resolves", async () => {
    const store = await loadedStore([]);
    postMock.mockReturnValueOnce(new Promise(() => {}));

    void store.addItems(["thighs", "garlic"]);

    expect(store.items.map((i) => i.text)).toEqual(["thighs", "garlic"]);
    expect(store.loading).toBe(false);
  });

  it("appends after what is already on the list", async () => {
    const store = await loadedStore([item({ text: "bread" })]);
    postMock.mockResolvedValueOnce([item({ text: "thighs" })]);

    await store.addItems(["thighs"]);

    expect(store.items.map((i) => i.text)).toEqual(["bread", "thighs"]);
  });

  it("takes the WHOLE batch back out when the write fails", async () => {
    const store = await loadedStore([item({ text: "bread" })]);
    postMock.mockRejectedValueOnce(new Error("nope"));

    await store.addItems(["thighs", "garlic", "lemon"]);

    // All or none — half a recipe's ingredients is not a state worth having.
    expect(store.items.map((i) => i.text)).toEqual(["bread"]);
    expect(store.error).toBe(WRITE_FAILED);
  });

  it("leaves no provisional ids behind on success", async () => {
    const store = await loadedStore([]);
    postMock.mockResolvedValueOnce([item({ text: "thighs" })]);

    await store.addItems(["thighs"]);

    expect(store.items.some((i) => i.id.startsWith("pending-"))).toBe(false);
  });

  it("skips blanks and does nothing at all for an all-blank batch", async () => {
    const store = await loadedStore([]);
    postMock.mockResolvedValueOnce([item({ text: "thighs" })]);

    await store.addItems(["  thighs  ", "   "]);
    expect(postMock).toHaveBeenCalledWith(
      "/kitchencraft/shopping-list/items/bulk",
      { texts: ["thighs"], mode: "merge" },
    );

    postMock.mockClear();
    await store.addItems(["", "  "]);
    expect(postMock).not.toHaveBeenCalled();
  });
});

describe("the open flag", () => {
  it("starts closed and opens and closes", () => {
    const store = useShoppingListStore();
    expect(store.isOpen).toBe(false);
    store.open();
    expect(store.isOpen).toBe(true);
    store.close();
    expect(store.isOpen).toBe(false);
  });
});

describe("addItems: merge and overwrite", () => {
  it("defaults to merge, the non-destructive answer", async () => {
    const store = await loadedStore([]);
    postMock.mockResolvedValueOnce([item({ text: "bread" })]);

    await store.addItems(["bread"]);

    expect(postMock.mock.calls[0][1]).toMatchObject({ mode: "merge" });
  });

  it("passes overwrite through when asked", async () => {
    const store = await loadedStore([item({ text: "old" })]);
    postMock.mockResolvedValueOnce([item({ text: "bread" })]);

    await store.addItems(["bread"], "overwrite");

    expect(postMock.mock.calls[0][1]).toMatchObject({ mode: "overwrite" });
  });

  it("returns what the SERVER created, not what was sent", async () => {
    // A merge that skips duplicates has to report the smaller, true number.
    const store = await loadedStore([item({ text: "bread" })]);
    postMock.mockResolvedValueOnce([item({ text: "milk" })]);

    const added = await store.addItems(["bread", "milk"], "merge");

    expect(added).toBe(1);
  });

  it("does not show an optimistic row for something already on the list", async () => {
    const store = await loadedStore([item({ text: "Bread" })]);
    postMock.mockReturnValueOnce(new Promise(() => {}));

    void store.addItems(["bread", "milk"], "merge");

    // Case-insensitive, like the server's own merge.
    expect(store.items.map((i) => i.text)).toEqual(["Bread", "milk"]);
  });

  it("clears the list optimistically on an overwrite", async () => {
    const store = await loadedStore([item({ text: "old" })]);
    postMock.mockReturnValueOnce(new Promise(() => {}));

    void store.addItems(["bread"], "overwrite");

    expect(store.items.map((i) => i.text)).toEqual(["bread"]);
  });

  it("puts the previous list back, ticks included, when an overwrite fails", async () => {
    const store = await loadedStore([
      item({ text: "old", ticked: true }),
      item({ text: "older" }),
    ]);
    postMock.mockRejectedValueOnce(new Error("nope"));

    const added = await store.addItems(["bread"], "overwrite");

    expect(store.items.map((i) => i.text)).toEqual(["old", "older"]);
    expect(store.items[0].ticked).toBe(true);
    expect(added).toBe(0);
    expect(store.error).toBe(WRITE_FAILED);
  });

  it("sends an empty overwrite, which is how a list gets emptied this way", async () => {
    const store = await loadedStore([item({ text: "old" })]);
    postMock.mockResolvedValueOnce([]);

    await store.addItems([], "overwrite");

    expect(postMock).toHaveBeenCalled();
    expect(store.items).toEqual([]);
  });

  it("still does nothing for an empty merge", async () => {
    const store = await loadedStore([item({ text: "old" })]);
    await store.addItems([], "merge");
    expect(postMock).not.toHaveBeenCalled();
  });
});
