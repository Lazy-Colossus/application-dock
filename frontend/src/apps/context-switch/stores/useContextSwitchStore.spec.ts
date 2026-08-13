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
import type { Todo } from "@/apps/context-switch/types";

function newList(id: string, name: string) {
  return {
    id,
    name,
    grid: { columns: 3, rows: 2 },
    created_at: "2026-08-13T10:00:00Z",
    todos: [],
  };
}

function newTodo(id: string, overrides: Partial<Todo> = {}): Todo {
  return {
    id,
    header: "Todo",
    body: "",
    color: "#aecbfa",
    status: "active",
    order: 0,
    created_at: "2026-08-13T10:00:00Z",
    updated_at: "2026-08-13T10:00:00Z",
    archived_at: null,
    updates: [],
    ...overrides,
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

  // ── board (Story 2.1) ──────────────────────────────────────────────────────

  it("fetchList loads the board list", async () => {
    getMock.mockResolvedValue(newList("l-1", "Work"));
    const store = useContextSwitchStore();

    await store.fetchList("l-1");

    expect(getMock).toHaveBeenCalledWith("/context-switch/lists/l-1");
    expect(store.currentList?.name).toBe("Work");
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("fetchList clears the board and surfaces the error on failure", async () => {
    getMock.mockRejectedValue(new Error("boom"));
    const store = useContextSwitchStore();

    await store.fetchList("l-1");

    expect(store.currentList).toBeNull();
    expect(store.error).toBeTruthy();
    expect(store.loading).toBe(false);
  });

  it("activeTodos excludes archived todos and sorts by order", async () => {
    getMock.mockResolvedValue({
      ...newList("l-1", "Work"),
      todos: [
        newTodo("t-b", { order: 1 }),
        newTodo("t-x", { status: "archived", order: 0 }),
        newTodo("t-a", { order: 0 }),
      ],
    });
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    expect(store.activeTodos.map((t) => t.id)).toEqual(["t-a", "t-b"]);
  });

  it("addTodo posts the payload and appends the created todo", async () => {
    getMock.mockResolvedValue(newList("l-1", "Work"));
    postMock.mockResolvedValue(newTodo("t-9", { header: "Fresh", order: 0 }));
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await store.addTodo("l-1", {
      header: "Fresh",
      body: "",
      color: "#aecbfa",
    });

    expect(postMock).toHaveBeenCalledWith("/context-switch/lists/l-1/todos", {
      header: "Fresh",
      body: "",
      color: "#aecbfa",
    });
    expect(store.activeTodos.map((t) => t.id)).toEqual(["t-9"]);
  });

  it("reorderTodos reorders locally before the request resolves", async () => {
    getMock.mockResolvedValue({
      ...newList("l-1", "Work"),
      todos: [newTodo("t-a", { order: 0 }), newTodo("t-b", { order: 1 })],
    });
    let resolvePost: () => void = () => {};
    postMock.mockReturnValue(
      new Promise<void>((resolve) => {
        resolvePost = resolve;
      }),
    );
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    const pending = store.reorderTodos("l-1", ["t-b", "t-a"]);
    expect(store.activeTodos.map((t) => t.id)).toEqual(["t-b", "t-a"]);

    resolvePost();
    await pending;

    expect(postMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-1/todos/reorder",
      { ordered_ids: ["t-b", "t-a"] },
    );
    expect(store.activeTodos.map((t) => t.id)).toEqual(["t-b", "t-a"]);
  });

  it("reorderTodos rolls back and rethrows when the request fails", async () => {
    getMock.mockResolvedValue({
      ...newList("l-1", "Work"),
      todos: [newTodo("t-a", { order: 0 }), newTodo("t-b", { order: 1 })],
    });
    postMock.mockRejectedValue(new Error("nope"));
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await expect(store.reorderTodos("l-1", ["t-b", "t-a"])).rejects.toThrow();

    expect(store.activeTodos.map((t) => t.id)).toEqual(["t-a", "t-b"]);
    expect(store.error).toBeTruthy();
    expect(store.loading).toBe(false);
  });

  it("setGrid PUTs the grid and updates the board locally", async () => {
    getMock.mockResolvedValue(newList("l-1", "Work"));
    putMock.mockResolvedValue({
      ...newList("l-1", "Work"),
      grid: { columns: 4, rows: 3 },
    });
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await store.setGrid("l-1", { columns: 4, rows: 3 });

    expect(putMock).toHaveBeenCalledWith("/context-switch/lists/l-1", {
      grid: { columns: 4, rows: 3 },
    });
    expect(store.currentList?.grid).toEqual({ columns: 4, rows: 3 });
  });

  it("setGrid leaves the board grid alone when the request fails", async () => {
    getMock.mockResolvedValue(newList("l-1", "Work"));
    putMock.mockRejectedValue(new Error("nope"));
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await expect(
      store.setGrid("l-1", { columns: 9, rows: 9 }),
    ).rejects.toThrow();
    expect(store.currentList?.grid).toEqual({ columns: 3, rows: 2 });
    expect(store.error).toBeTruthy();
  });

  it("addTodo surfaces the error and rethrows", async () => {
    getMock.mockResolvedValue(newList("l-1", "Work"));
    postMock.mockRejectedValue(new Error("nope"));
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await expect(
      store.addTodo("l-1", { header: "x", body: "", color: "#ffffff" }),
    ).rejects.toThrow();
    expect(store.error).toBeTruthy();
    expect(store.activeTodos).toHaveLength(0);
  });
});
