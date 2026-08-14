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
      color: "#aecbfa",
      update: "kickoff",
    });

    expect(postMock).toHaveBeenCalledWith("/context-switch/lists/l-1/todos", {
      header: "Fresh",
      color: "#aecbfa",
      update: "kickoff",
    });
    expect(store.activeTodos.map((t) => t.id)).toEqual(["t-9"]);
  });

  it("updateTodo PUTs the patch and replaces the local todo", async () => {
    getMock.mockResolvedValue({
      ...newList("l-1", "Work"),
      todos: [newTodo("t-1", { header: "Old", color: "#aabbcc" })],
    });
    putMock.mockResolvedValue(newTodo("t-1", { header: "New", color: "#aabbcc" }));
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await store.updateTodo("l-1", "t-1", { header: "New" });

    expect(putMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-1/todos/t-1",
      { header: "New" },
    );
    expect(store.activeTodos[0].header).toBe("New");
    expect(store.activeTodos[0].color).toBe("#aabbcc");
    expect(store.loading).toBe(false);
  });

  it("updateTodo leaves the todo alone and rethrows when rejected", async () => {
    getMock.mockResolvedValue({
      ...newList("l-1", "Work"),
      todos: [newTodo("t-1", { header: "Old" })],
    });
    putMock.mockRejectedValue(new Error("nope"));
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await expect(
      store.updateTodo("l-1", "t-1", { header: "New" }),
    ).rejects.toThrow();

    expect(store.activeTodos[0].header).toBe("Old");
    expect(store.error).toBeTruthy();
    expect(store.loading).toBe(false);
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
      store.addTodo("l-1", { header: "x", color: "#ffffff" }),
    ).rejects.toThrow();
    expect(store.error).toBeTruthy();
    expect(store.activeTodos).toHaveLength(0);
  });

  // ── updates log (Story 2.5) ──────────────────────────────────────────────────

  it("addUpdate posts the text and replaces the local todo with the response", async () => {
    getMock.mockResolvedValue({
      ...newList("l-1", "Work"),
      todos: [newTodo("t-1", { header: "Task" })],
    });
    postMock.mockResolvedValue(
      newTodo("t-1", {
        header: "Task",
        updates: [
          { id: "u-1", text: "progress", created_at: "2026-08-13T11:00:00Z" },
        ],
      }),
    );
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await store.addUpdate("l-1", "t-1", "progress");

    expect(postMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-1/todos/t-1/updates",
      { text: "progress" },
    );
    expect(store.activeTodos[0].updates.map((u) => u.text)).toEqual([
      "progress",
    ]);
    expect(store.loading).toBe(false);
  });

  it("addUpdate surfaces the error and rethrows without touching the todo", async () => {
    getMock.mockResolvedValue({
      ...newList("l-1", "Work"),
      todos: [newTodo("t-1", { header: "Task" })],
    });
    postMock.mockRejectedValue(new Error("nope"));
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await expect(store.addUpdate("l-1", "t-1", "x")).rejects.toThrow();

    expect(store.activeTodos[0].updates).toHaveLength(0);
    expect(store.error).toBeTruthy();
    expect(store.loading).toBe(false);
  });

  // ── archive / close as done (Story 2.6) ──────────────────────────────────────

  it("updateTodo status:archived drops the todo from the active board", async () => {
    getMock.mockResolvedValue({
      ...newList("l-1", "Work"),
      todos: [
        newTodo("t-1", { header: "Keep", order: 0 }),
        newTodo("t-2", { header: "Close", order: 1 }),
      ],
    });
    putMock.mockResolvedValue(
      newTodo("t-2", {
        header: "Close",
        order: 1,
        status: "archived",
        archived_at: "2026-08-13T12:00:00Z",
      }),
    );
    const store = useContextSwitchStore();
    await store.fetchList("l-1");

    await store.updateTodo("l-1", "t-2", { status: "archived" });

    expect(putMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-1/todos/t-2",
      { status: "archived" },
    );
    expect(store.activeTodos.map((t) => t.id)).toEqual(["t-1"]);
  });

  // ── archive view + delete (Story 2.7) ────────────────────────────────────────

  it("fetchArchived loads the archived todos for a list", async () => {
    getMock.mockResolvedValue([
      newTodo("t-9", { status: "archived", archived_at: "2026-08-13T12:00:00Z" }),
    ]);
    const store = useContextSwitchStore();

    await store.fetchArchived("l-1");

    expect(getMock).toHaveBeenCalledWith("/context-switch/lists/l-1/archived");
    expect(store.archived.map((t) => t.id)).toEqual(["t-9"]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("fetchArchived surfaces the error and clears the local list", async () => {
    getMock.mockRejectedValue(new Error("boom"));
    const store = useContextSwitchStore();

    await store.fetchArchived("l-1");

    expect(store.archived).toEqual([]);
    expect(store.error).toBeTruthy();
    expect(store.loading).toBe(false);
  });

  it("deleteTodo DELETEs and drops the record from the archived list", async () => {
    getMock.mockResolvedValue([
      newTodo("t-9", { status: "archived" }),
      newTodo("t-8", { status: "archived" }),
    ]);
    delMock.mockResolvedValue(undefined);
    const store = useContextSwitchStore();
    await store.fetchArchived("l-1");

    await store.deleteTodo("l-1", "t-9");

    expect(delMock).toHaveBeenCalledWith("/context-switch/lists/l-1/todos/t-9");
    expect(store.archived.map((t) => t.id)).toEqual(["t-8"]);
  });

  it("deleteTodo surfaces the error and keeps the record when rejected", async () => {
    getMock.mockResolvedValue([newTodo("t-9", { status: "archived" })]);
    delMock.mockRejectedValue(new Error("nope"));
    const store = useContextSwitchStore();
    await store.fetchArchived("l-1");

    await expect(store.deleteTodo("l-1", "t-9")).rejects.toThrow();

    expect(store.archived.map((t) => t.id)).toEqual(["t-9"]);
    expect(store.error).toBeTruthy();
    expect(store.loading).toBe(false);
  });
});
