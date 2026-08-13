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

import { useContextSwitchStore } from "./useContextSwitchStore";

function newList(id: string, name: string) {
  return {
    id,
    name,
    grid: { columns: 3, rows: 2 },
    created_at: "2026-08-13T10:00:00Z",
    todos: [],
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  delMock.mockReset();
});

describe("useContextSwitchStore", () => {
  it("fetchLists loads summaries and clears loading", async () => {
    getMock.mockResolvedValue([{ id: "l-1", name: "Work", active_count: 2 }]);
    const store = useContextSwitchStore();

    await store.fetchLists();

    expect(getMock).toHaveBeenCalledWith("/context-switch/lists");
    expect(store.lists).toHaveLength(1);
    expect(store.lists[0].name).toBe("Work");
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("createList posts the name and adds a summary locally", async () => {
    postMock.mockResolvedValue(newList("l-9", "New"));
    const store = useContextSwitchStore();

    const created = await store.createList("New");

    expect(postMock).toHaveBeenCalledWith("/context-switch/lists", {
      name: "New",
    });
    expect(created.id).toBe("l-9");
    const summary = store.lists.find((l) => l.id === "l-9");
    expect(summary).toBeDefined();
    expect(summary?.active_count).toBe(0);
  });

  it("fetchLists routes errors into error and resets loading", async () => {
    getMock.mockRejectedValue(new Error("boom"));
    const store = useContextSwitchStore();

    await store.fetchLists();

    expect(store.error).toBeTruthy();
    expect(store.loading).toBe(false);
  });

  it("createList surfaces the error and rethrows", async () => {
    postMock.mockRejectedValue(new Error("nope"));
    const store = useContextSwitchStore();

    await expect(store.createList("x")).rejects.toThrow();
    expect(store.error).toBeTruthy();
    expect(store.loading).toBe(false);
  });

  it("renameList PUTs and updates the local summary", async () => {
    getMock.mockResolvedValue([{ id: "l-1", name: "Old", active_count: 0 }]);
    putMock.mockResolvedValue(newList("l-1", "Renamed"));
    const store = useContextSwitchStore();
    await store.fetchLists();

    await store.renameList("l-1", "Renamed");

    expect(putMock).toHaveBeenCalledWith("/context-switch/lists/l-1", {
      name: "Renamed",
    });
    expect(store.lists.find((l) => l.id === "l-1")?.name).toBe("Renamed");
  });

  it("deleteList DELETEs and drops the local summary", async () => {
    getMock.mockResolvedValue([{ id: "l-1", name: "Doomed", active_count: 0 }]);
    delMock.mockResolvedValue(undefined);
    const store = useContextSwitchStore();
    await store.fetchLists();

    await store.deleteList("l-1");

    expect(delMock).toHaveBeenCalledWith("/context-switch/lists/l-1");
    expect(store.lists.some((l) => l.id === "l-1")).toBe(false);
  });
});
