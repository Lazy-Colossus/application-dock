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
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import ContextSwitchHomePage from "./ContextSwitchHomePage.vue";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\', $event)">{{ label }}</button>',
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
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template:
      "<div :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></div>",
    emits: ["click"],
  },
  "q-item-section": { template: "<div><slot /></div>" },
};

const MOUNT_OPTS = { global: { stubs: STUBS } };

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset().mockResolvedValue([]);
  postMock.mockReset();
  putMock.mockReset();
  delMock.mockReset();
  push.mockReset();
});

describe("ContextSwitchHomePage (list picker)", () => {
  it("renders the app title and scopes the root class", async () => {
    const wrapper = mount(ContextSwitchHomePage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.text()).toContain("Context-Switch");
    expect(wrapper.find(".context-switch-app").exists()).toBe(true);
  });

  it("shows an empty state when the user has no lists", async () => {
    getMock.mockResolvedValue([]);
    const wrapper = mount(ContextSwitchHomePage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true);
  });

  it("renders a row per list and opens one on click", async () => {
    getMock.mockResolvedValue([{ id: "l-1", name: "Work", active_count: 3 }]);
    const wrapper = mount(ContextSwitchHomePage, MOUNT_OPTS);
    await flushPromises();

    const row = wrapper.find('[data-testid="list-l-1"]');
    expect(row.exists()).toBe(true);
    expect(row.text()).toContain("Work");

    await row.trigger("click");
    expect(push).toHaveBeenCalledWith("/context-switch/lists/l-1");
  });

  it("disables create until a name is typed", async () => {
    const wrapper = mount(ContextSwitchHomePage, MOUNT_OPTS);
    await flushPromises();

    const btn = wrapper.find('[data-testid="create-list-btn"]');
    expect(btn.attributes("disabled")).toBeDefined();

    await wrapper.find('[data-testid="new-list-input"]').setValue("Groceries");
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("creates a list and navigates to its board", async () => {
    postMock.mockResolvedValue({
      id: "l-9",
      name: "Groceries",
      grid: { columns: 3, rows: 2 },
      created_at: "x",
      todos: [],
    });
    const wrapper = mount(ContextSwitchHomePage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="new-list-input"]').setValue("Groceries");
    await wrapper.find('[data-testid="create-list-btn"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/context-switch/lists", {
      name: "Groceries",
    });
    expect(push).toHaveBeenCalledWith("/context-switch/lists/l-9");
  });

  it("renames a list inline", async () => {
    getMock.mockResolvedValue([{ id: "l-1", name: "Old", active_count: 0 }]);
    putMock.mockResolvedValue({
      id: "l-1",
      name: "Renamed",
      grid: { columns: 3, rows: 2 },
      created_at: "x",
      todos: [],
    });
    const wrapper = mount(ContextSwitchHomePage, MOUNT_OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="rename-l-1"]').trigger("click");
    await wrapper.find('[data-testid="rename-input-l-1"]').setValue("Renamed");
    await wrapper.find('[data-testid="rename-save-l-1"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/context-switch/lists/l-1", {
      name: "Renamed",
    });
  });

  it("does not delete until the action is confirmed", async () => {
    getMock.mockResolvedValue([{ id: "l-1", name: "Doomed", active_count: 0 }]);
    const wrapper = mount(ContextSwitchHomePage, MOUNT_OPTS);
    await flushPromises();

    // First click only reveals the confirm control — no request yet.
    await wrapper.find('[data-testid="delete-l-1"]').trigger("click");
    expect(delMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="delete-confirm-l-1"]').exists()).toBe(
      true,
    );

    await wrapper.find('[data-testid="delete-confirm-l-1"]').trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/context-switch/lists/l-1");
  });
});
