import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));
// A reactive route: switching lists (Story 3.1) changes only the param, which
// does not remount the page — tests drive that by mutating `route.params`.
vi.mock("vue-router", async () => {
  const { reactive } = await import("vue");
  const route = reactive({ params: { listId: "l-42" } });
  return { useRoute: () => route, useRouter: () => ({ push }) };
});

import { useRoute } from "vue-router";
import BoardPage from "./BoardPage.vue";
import type { ListSummary, Todo, TodoList } from "@/apps/context-switch/types";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
  "q-dialog": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "label", "type", "dense", "outlined", "autofocus"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: [
      "label",
      "disable",
      "color",
      "unelevated",
      "noCaps",
      "icon",
      "flat",
      "dense",
      "round",
    ],
    emits: ["click"],
  },
};

const MOUNT_OPTS = { global: { stubs: STUBS } };

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "t-1",
    header: "First",
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

function makeList(
  todos: Todo[] = [],
  grid = { columns: 3, rows: 2 },
  id = "l-42",
  name = "Work",
): TodoList {
  return {
    id,
    name,
    grid,
    created_at: "2026-08-13T10:00:00Z",
    todos,
  };
}

function makeTodos(count: number): Todo[] {
  return Array.from({ length: count }, (_, i) =>
    makeTodo({ id: `t-${i + 1}`, header: `Todo ${i + 1}`, order: i }),
  );
}

// The board now reads two endpoints — its own list and the list sequence the
// arrows walk (Story 3.1) — so GET is dispatched by URL instead of by call order.
let boards: Record<string, TodoList>;
let summaries: ListSummary[];
let archivedTodos: Todo[];
let boardError: Error | null;

function setBoard(list: TodoList): void {
  boards[list.id] = list;
}

function setRoute(listId: string): void {
  useRoute().params.listId = listId;
}

beforeEach(() => {
  setActivePinia(createPinia());
  boards = { "l-42": makeList() };
  summaries = [{ id: "l-42", name: "Work", active_count: 0 }];
  archivedTodos = [];
  boardError = null;
  setRoute("l-42");

  getMock.mockReset().mockImplementation((url: string) => {
    if (url === "/context-switch/lists") return Promise.resolve(summaries);
    const archived = /^\/context-switch\/lists\/([^/]+)\/archived$/.exec(url);
    if (archived) return Promise.resolve(archivedTodos);
    const board = /^\/context-switch\/lists\/([^/]+)$/.exec(url);
    if (board) {
      if (boardError) return Promise.reject(boardError);
      return Promise.resolve(
        boards[board[1]] ?? makeList([], undefined, board[1]),
      );
    }
    return Promise.reject(new Error(`unexpected GET ${url}`));
  });
  postMock.mockReset();
  putMock.mockReset();
  delMock.mockReset();
  push.mockReset();
});

describe("BoardPage", () => {
  it("loads the list from the route on mount", async () => {
    mount(BoardPage, MOUNT_OPTS);
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith("/context-switch/lists/l-42");
  });

  it("navigates back to the picker", async () => {
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();
    await wrapper.find('[data-testid="back-btn"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/context-switch");
  });

  it("shows an empty state when the list has no todos", async () => {
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true);
  });

  it("renders a pill per active todo in order", async () => {
    setBoard(
      makeList([
        makeTodo({ id: "t-2", header: "Second", order: 1 }),
        makeTodo({ id: "t-1", header: "First", order: 0 }),
      ]),
    );
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    const headers = wrapper
      .findAll('[data-testid="pill-header"]')
      .map((n) => n.text());
    expect(headers).toEqual(["First", "Second"]);
  });

  it("adds a todo through the dialog and renders the new pill", async () => {
    postMock.mockResolvedValue(makeTodo({ id: "t-9", header: "Fresh" }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="add-todo-btn"]').trigger("click");
    await wrapper.find('[data-testid="todo-header-input"]').setValue("Fresh");
    await wrapper.find('[data-testid="todo-submit"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos",
      expect.objectContaining({ header: "Fresh" }),
    );
    expect(wrapper.find('[data-testid="pill-t-9"]').text()).toContain("Fresh");
  });

  it("surfaces a load failure", async () => {
    boardError = new Error("boom");
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
    // A failed load must not also render the "empty list" state or the board.
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="board"]').exists()).toBe(false);
  });

  // ── grid + pagination (Story 2.2) ───────────────────────────────────────────

  it("lays the board out in the list's column count", async () => {
    setBoard(makeList(makeTodos(2), { columns: 4, rows: 2 }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.find('[data-testid="board"]').attributes("style")).toContain(
      "--cs-cols: 4",
    );
  });

  it("shows only one page of pills and no pager when everything fits", async () => {
    setBoard(makeList(makeTodos(4), { columns: 2, rows: 2 }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    expect(wrapper.findAll('[data-testid="pill-header"]')).toHaveLength(4);
    expect(wrapper.find('[data-testid="pager"]').exists()).toBe(false);
  });

  it("paginates the overflow and keeps every todo reachable", async () => {
    setBoard(makeList(makeTodos(5), { columns: 2, rows: 2 }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    const headers = () =>
      wrapper.findAll('[data-testid="pill-header"]').map((n) => n.text());

    expect(headers()).toEqual(["Todo 1", "Todo 2", "Todo 3", "Todo 4"]);
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toBe("1 / 2");
    expect(
      wrapper.find('[data-testid="page-prev"]').attributes("disabled"),
    ).toBeDefined();

    await wrapper.find('[data-testid="page-next"]').trigger("click");
    expect(headers()).toEqual(["Todo 5"]);
    expect(
      wrapper.find('[data-testid="page-next"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("persists a grid change and re-lays the board", async () => {
    setBoard(makeList(makeTodos(5), { columns: 2, rows: 2 }));
    putMock.mockResolvedValue(makeList(makeTodos(5), { columns: 5, rows: 2 }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    const columns = wrapper.find('[data-testid="grid-columns"]');
    (columns.element as HTMLInputElement).value = "5";
    await columns.trigger("change");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/context-switch/lists/l-42", {
      grid: { columns: 5, rows: 2 },
    });
    expect(wrapper.find('[data-testid="board"]').attributes("style")).toContain(
      "--cs-cols: 5",
    );
  });

  // ── open + edit (Story 2.4) ─────────────────────────────────────────────────

  it("opens the detail dialog on the clicked todo", async () => {
    setBoard(makeList(makeTodos(2)));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="todo-detail-dialog"]').exists()).toBe(
      false,
    );

    await wrapper.find('[data-testid="pill-t-2"]').trigger("click");
    const header = wrapper.find('[data-testid="detail-header-input"]')
      .element as HTMLInputElement;
    expect(header.value).toBe("Todo 2");
  });

  it("saves an edit and re-renders the pill", async () => {
    setBoard(makeList(makeTodos(2)));
    putMock.mockResolvedValue(
      makeTodo({ id: "t-1", header: "Renamed", color: "#202124", order: 0 }),
    );
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="pill-t-1"]').trigger("click");
    await wrapper
      .find('[data-testid="detail-header-input"]')
      .setValue("Renamed");
    await wrapper.find('[data-testid="detail-save"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos/t-1",
      { header: "Renamed" },
    );
    expect(wrapper.find('[data-testid="pill-t-1"]').text()).toContain(
      "Renamed",
    );
    expect(
      wrapper.find('[data-testid="pill-t-1"]').attributes("style"),
    ).toContain("background: #202124");
  });

  it("surfaces a rejected edit", async () => {
    setBoard(makeList(makeTodos(1)));
    putMock.mockRejectedValue(new Error("rejected"));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="pill-t-1"]').trigger("click");
    await wrapper.find('[data-testid="detail-header-input"]').setValue("New");
    await wrapper.find('[data-testid="detail-save"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pill-t-1"]').text()).toContain("Todo 1");
  });

  // ── close as done / archive (Story 2.6) ─────────────────────────────────────

  it("closes a todo as done and removes its pill from the board", async () => {
    setBoard(makeList(makeTodos(2)));
    putMock.mockResolvedValue(
      makeTodo({
        id: "t-1",
        header: "Todo 1",
        order: 0,
        status: "archived",
        archived_at: "2026-08-13T12:00:00Z",
      }),
    );
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="pill-t-1"]').trigger("click");
    await wrapper.find('[data-testid="detail-close-done"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos/t-1",
      { status: "archived" },
    );
    expect(wrapper.find('[data-testid="pill-t-1"]').exists()).toBe(false);
    expect(
      wrapper.findAll('[data-testid="pill-header"]').map((n) => n.text()),
    ).toEqual(["Todo 2"]);
  });

  // ── archive view + delete (Story 2.7) ───────────────────────────────────────

  it("opens the archive drawer and loads archived todos", async () => {
    setBoard(makeList(makeTodos(1)));
    archivedTodos = [
      makeTodo({
        id: "t-9",
        header: "Archived one",
        status: "archived",
        archived_at: "2026-08-13T12:00:00Z",
      }),
    ];
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="archive-btn"]').trigger("click");
    await flushPromises();

    expect(getMock).toHaveBeenLastCalledWith(
      "/context-switch/lists/l-42/archived",
    );
    expect(wrapper.find('[data-testid="archived-item-t-9"]').text()).toContain(
      "Archived one",
    );
  });

  it("deletes an archived todo from the drawer", async () => {
    setBoard(makeList(makeTodos(1)));
    archivedTodos = [
      makeTodo({ id: "t-9", header: "Archived one", status: "archived" }),
    ];
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="archive-btn"]').trigger("click");
    await flushPromises();

    delMock.mockResolvedValue(undefined);
    await wrapper.find('[data-testid="archived-delete-t-9"]').trigger("click");
    await wrapper
      .find('[data-testid="archived-delete-confirm-t-9"]')
      .trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos/t-9",
    );
    expect(wrapper.find('[data-testid="archived-item-t-9"]').exists()).toBe(
      false,
    );
  });

  // ── drag reorder (Story 2.3) ────────────────────────────────────────────────

  it("posts the new full id order when a pill is dropped on another", async () => {
    setBoard(makeList(makeTodos(3), { columns: 3, rows: 2 }));
    postMock.mockResolvedValue(undefined);
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="slot-t-1"]').trigger("dragstart");
    await wrapper.find('[data-testid="slot-t-3"]').trigger("drop");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos/reorder",
      { ordered_ids: ["t-2", "t-3", "t-1"] },
    );
    expect(
      wrapper.findAll('[data-testid="pill-header"]').map((n) => n.text()),
    ).toEqual(["Todo 2", "Todo 3", "Todo 1"]);
  });

  it("sends one sequence over all pages, not just the visible one", async () => {
    // 2x1 grid over 4 todos: page 2 shows todos 3 and 4.
    setBoard(makeList(makeTodos(4), { columns: 2, rows: 1 }));
    postMock.mockResolvedValue(undefined);
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="page-next"]').trigger("click");
    await wrapper.find('[data-testid="slot-t-4"]').trigger("dragstart");
    await wrapper.find('[data-testid="slot-t-3"]').trigger("drop");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos/reorder",
      { ordered_ids: ["t-1", "t-2", "t-4", "t-3"] },
    );
  });

  it("rolls the order back and shows the error when the reorder is rejected", async () => {
    setBoard(makeList(makeTodos(3), { columns: 3, rows: 2 }));
    postMock.mockRejectedValue(new Error("rejected"));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="slot-t-1"]').trigger("dragstart");
    await wrapper.find('[data-testid="slot-t-3"]').trigger("drop");
    await flushPromises();

    expect(
      wrapper.findAll('[data-testid="pill-header"]').map((n) => n.text()),
    ).toEqual(["Todo 1", "Todo 2", "Todo 3"]);
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
  });

  it("does not post when a pill is dropped on itself", async () => {
    setBoard(makeList(makeTodos(3), { columns: 3, rows: 2 }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="slot-t-2"]').trigger("dragstart");
    await wrapper.find('[data-testid="slot-t-2"]').trigger("drop");
    await flushPromises();

    expect(postMock).not.toHaveBeenCalled();
  });

  it("pulls the viewer back when the grid change removes their page", async () => {
    setBoard(makeList(makeTodos(5), { columns: 2, rows: 2 }));
    putMock.mockResolvedValue(makeList(makeTodos(5), { columns: 5, rows: 2 }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="page-next"]').trigger("click");
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toBe("2 / 2");

    // 5 columns x 2 rows fits all five todos on a single page.
    const columns = wrapper.find('[data-testid="grid-columns"]');
    (columns.element as HTMLInputElement).value = "5";
    await columns.trigger("change");
    await flushPromises();

    expect(wrapper.find('[data-testid="pager"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid="pill-header"]')).toHaveLength(5);
  });

  // ── quick complete + restore (Story 3.3) ────────────────────────────────────

  it("completes a todo from its pill and takes it off the board", async () => {
    setBoard(makeList(makeTodos(2)));
    putMock.mockResolvedValue(
      makeTodo({
        id: "t-1",
        header: "Todo 1",
        status: "archived",
        archived_at: "2026-08-13T12:00:00Z",
      }),
    );
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="pill-complete-t-1"]').trigger("click");
    await wrapper
      .find('[data-testid="pill-complete-confirm-t-1"]')
      .trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos/t-1",
      { status: "archived" },
    );
    expect(wrapper.find('[data-testid="pill-t-1"]').exists()).toBe(false);
    // The detail dialog must not have opened behind the confirm.
    expect(wrapper.find('[data-testid="detail-header-input"]').exists()).toBe(
      false,
    );
  });

  it("keeps the pill and shows the error when completing is rejected", async () => {
    setBoard(makeList(makeTodos(2)));
    putMock.mockRejectedValue(new Error("rejected"));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="pill-complete-t-1"]').trigger("click");
    await wrapper
      .find('[data-testid="pill-complete-confirm-t-1"]')
      .trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="pill-t-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
  });

  it("restores a todo from the archive back onto the board", async () => {
    setBoard(makeList(makeTodos(1)));
    archivedTodos = [
      makeTodo({
        id: "t-9",
        header: "Archived one",
        status: "archived",
        archived_at: "2026-08-13T12:00:00Z",
      }),
    ];
    putMock.mockResolvedValue(
      makeTodo({ id: "t-9", header: "Archived one", order: 1 }),
    );
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="archive-btn"]').trigger("click");
    await flushPromises();
    await wrapper.find('[data-testid="archived-restore-t-9"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos/t-9",
      { status: "active" },
    );
    expect(wrapper.find('[data-testid="archived-item-t-9"]').exists()).toBe(
      false,
    );
    expect(
      wrapper.findAll('[data-testid="pill-header"]').map((n) => n.text()),
    ).toEqual(["Todo 1", "Archived one"]);
  });

  // ── switch lists from the board (Story 3.1) ─────────────────────────────────

  function threeLists(): void {
    summaries = [
      { id: "l-1", name: "One", active_count: 0 },
      { id: "l-42", name: "Work", active_count: 0 },
      { id: "l-9", name: "Nine", active_count: 0 },
    ];
  }

  it("fetches the list sequence so a deep-linked board knows its neighbours", async () => {
    threeLists();
    mount(BoardPage, MOUNT_OPTS);
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith("/context-switch/lists");
  });

  it("shows an arrow either side of the list name when there are other lists", async () => {
    threeLists();
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="prev-list-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="next-list-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="list-name"]').text()).toBe("Work");
  });

  it("shows no arrows when there is only one list", async () => {
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="prev-list-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="next-list-btn"]').exists()).toBe(false);
  });

  it("moves to the next list in picker order", async () => {
    threeLists();
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="next-list-btn"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/context-switch/lists/l-9");
  });

  it("moves to the previous list in picker order", async () => {
    threeLists();
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="prev-list-btn"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/context-switch/lists/l-1");
  });

  it("wraps from the last list round to the first", async () => {
    threeLists();
    setRoute("l-9");
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="next-list-btn"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/context-switch/lists/l-1");
  });

  it("wraps from the first list back to the last", async () => {
    threeLists();
    setRoute("l-1");
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="prev-list-btn"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/context-switch/lists/l-9");
  });

  it("loads the new list when the route param changes without a remount", async () => {
    threeLists();
    setBoard(makeList(makeTodos(2)));
    setBoard(
      makeList(
        [makeTodo({ id: "t-77", header: "Elsewhere" })],
        undefined,
        "l-9",
        "Nine",
      ),
    );
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    setRoute("l-9");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/context-switch/lists/l-9");
    expect(wrapper.find('[data-testid="list-name"]').text()).toBe("Nine");
    expect(
      wrapper.findAll('[data-testid="pill-header"]').map((n) => n.text()),
    ).toEqual(["Elsewhere"]);
  });

  it("starts the new list on page 1", async () => {
    threeLists();
    setBoard(makeList(makeTodos(5), { columns: 2, rows: 2 }));
    setBoard(makeList(makeTodos(5), { columns: 2, rows: 2 }, "l-9", "Nine"));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="page-next"]').trigger("click");
    expect(wrapper.find('[data-testid="page-indicator"]').text()).toBe("2 / 2");

    setRoute("l-9");
    await flushPromises();

    expect(wrapper.find('[data-testid="page-indicator"]').text()).toBe("1 / 2");
  });

  // ── move a todo to another list (Story 3.2) ─────────────────────────────────

  async function dragPillOverTheListName(
    wrapper: ReturnType<typeof mount>,
    slot = "slot-t-1",
  ): Promise<void> {
    await wrapper.find(`[data-testid="${slot}"]`).trigger("dragstart");
    await wrapper.find('[data-testid="list-name"]').trigger("dragover");
    vi.advanceTimersByTime(600);
    await flushPromises();
  }

  it("opens a popup of the other lists when a pill is held over the list name", async () => {
    vi.useFakeTimers();
    threeLists();
    setBoard(makeList(makeTodos(2)));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="move-popup"]').exists()).toBe(false);
    await dragPillOverTheListName(wrapper);

    expect(wrapper.find('[data-testid="move-popup"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="move-target-l-1"]').text()).toBe("One");
    expect(wrapper.find('[data-testid="move-target-l-9"]').exists()).toBe(true);
    // Never offer the list the todo is already in.
    expect(wrapper.find('[data-testid="move-target-l-42"]').exists()).toBe(
      false,
    );
    vi.useRealTimers();
  });

  it("leaves the name alone until the pill has hovered long enough", async () => {
    vi.useFakeTimers();
    threeLists();
    setBoard(makeList(makeTodos(2)));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="slot-t-1"]').trigger("dragstart");
    await wrapper.find('[data-testid="list-name"]').trigger("dragover");
    vi.advanceTimersByTime(200);
    await flushPromises();

    expect(wrapper.find('[data-testid="move-popup"]').exists()).toBe(false);
    vi.useRealTimers();
  });

  it("does not open the popup when no pill is being dragged", async () => {
    vi.useFakeTimers();
    threeLists();
    setBoard(makeList(makeTodos(2)));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="list-name"]').trigger("dragover");
    vi.advanceTimersByTime(600);
    await flushPromises();

    expect(wrapper.find('[data-testid="move-popup"]').exists()).toBe(false);
    vi.useRealTimers();
  });

  it("does not open an empty popup when there is nowhere to move to", async () => {
    vi.useFakeTimers();
    setBoard(makeList(makeTodos(2)));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await dragPillOverTheListName(wrapper);

    expect(wrapper.find('[data-testid="move-popup"]').exists()).toBe(false);
    vi.useRealTimers();
  });

  it("moves the todo into the list it is dropped on", async () => {
    vi.useFakeTimers();
    threeLists();
    setBoard(makeList(makeTodos(2)));
    postMock.mockResolvedValue(makeTodo({ id: "t-1" }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await dragPillOverTheListName(wrapper);
    await wrapper.find('[data-testid="move-target-l-9"]').trigger("drop");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos/t-1/move",
      { target_list_id: "l-9" },
    );
    expect(wrapper.find('[data-testid="pill-t-1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="move-popup"]').exists()).toBe(false);
    vi.useRealTimers();
  });

  it("keeps the pill and shows the error when the move is rejected", async () => {
    vi.useFakeTimers();
    threeLists();
    setBoard(makeList(makeTodos(2)));
    postMock.mockRejectedValue(new Error("rejected"));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await dragPillOverTheListName(wrapper);
    await wrapper.find('[data-testid="move-target-l-9"]').trigger("drop");
    await flushPromises();

    expect(wrapper.find('[data-testid="pill-t-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="move-popup"]').exists()).toBe(false);
    vi.useRealTimers();
  });

  it("closes the popup when the drag is abandoned", async () => {
    vi.useFakeTimers();
    threeLists();
    setBoard(makeList(makeTodos(2)));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await dragPillOverTheListName(wrapper);
    await wrapper.find('[data-testid="slot-t-1"]').trigger("dragend");

    expect(wrapper.find('[data-testid="move-popup"]').exists()).toBe(false);
    vi.useRealTimers();
  });

  it("still reorders when a pill is dropped on another pill", async () => {
    setBoard(makeList(makeTodos(3), { columns: 3, rows: 2 }));
    postMock.mockResolvedValue(undefined);
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="slot-t-1"]').trigger("dragstart");
    await wrapper.find('[data-testid="slot-t-3"]').trigger("drop");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/context-switch/lists/l-42/todos/reorder",
      { ordered_ids: ["t-2", "t-3", "t-1"] },
    );
  });

  it("closes an open todo dialog when the list changes underneath it", async () => {
    threeLists();
    setBoard(makeList(makeTodos(2)));
    setBoard(makeList(makeTodos(2), undefined, "l-9", "Nine"));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="pill-t-1"]').trigger("click");
    expect(wrapper.find('[data-testid="detail-header-input"]').exists()).toBe(
      true,
    );

    setRoute("l-9");
    await flushPromises();

    expect(wrapper.find('[data-testid="detail-header-input"]').exists()).toBe(
      false,
    );
  });
});
