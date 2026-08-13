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
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { listId: "l-42" } }),
  useRouter: () => ({ push }),
}));

import BoardPage from "./BoardPage.vue";
import type { Todo, TodoList } from "@/apps/context-switch/types";

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

function makeList(
  todos: Todo[] = [],
  grid = { columns: 3, rows: 2 },
): TodoList {
  return {
    id: "l-42",
    name: "Work",
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

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset().mockResolvedValue(makeList());
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
    getMock.mockResolvedValue(
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
    getMock.mockRejectedValue(new Error("boom"));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
  });

  // ── grid + pagination (Story 2.2) ───────────────────────────────────────────

  it("lays the board out in the list's column count", async () => {
    getMock.mockResolvedValue(makeList(makeTodos(2), { columns: 4, rows: 2 }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.find('[data-testid="board"]').attributes("style")).toContain(
      "--cs-cols: 4",
    );
  });

  it("shows only one page of pills and no pager when everything fits", async () => {
    getMock.mockResolvedValue(makeList(makeTodos(4), { columns: 2, rows: 2 }));
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await flushPromises();

    expect(wrapper.findAll('[data-testid="pill-header"]')).toHaveLength(4);
    expect(wrapper.find('[data-testid="pager"]').exists()).toBe(false);
  });

  it("paginates the overflow and keeps every todo reachable", async () => {
    getMock.mockResolvedValue(makeList(makeTodos(5), { columns: 2, rows: 2 }));
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
    getMock.mockResolvedValue(makeList(makeTodos(5), { columns: 2, rows: 2 }));
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

  it("pulls the viewer back when the grid change removes their page", async () => {
    getMock.mockResolvedValue(makeList(makeTodos(5), { columns: 2, rows: 2 }));
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
});
