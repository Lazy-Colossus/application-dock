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

import ListiesHomePage from "./ListiesHomePage.vue";
import type { Sheet, SheetSummary } from "@/apps/listies/types";

const SUMMARY: SheetSummary = {
  id: "s-1",
  name: "Trip planning",
  tab_count: 2,
  row_count: 7,
  created_at: "2026-08-30T10:00:00Z",
};

const CREATED: Sheet = {
  id: "s-9",
  name: "Cafés",
  created_at: "2026-08-30T11:00:00Z",
  tabs: [{ id: "tb-1", name: "Tab 1", order: 0, columns: [], rows: [] }],
};

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template:
      "<div :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></div>",
    emits: ["click"],
  },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": { template: "<div><slot /></div>" },
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
  "q-spinner": { template: "<div />" },
  CreateSheetDialog: {
    name: "CreateSheetDialog",
    template: "<div />",
    props: ["modelValue"],
    emits: ["update:modelValue", "submit"],
  },
};

const OPTS = { global: { stubs: STUBS } };

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset().mockResolvedValue([]);
  postMock.mockReset().mockResolvedValue(CREATED);
  push.mockReset();
});

describe("ListiesHomePage", () => {
  it("loads my sheets on mount", async () => {
    getMock.mockResolvedValue([SUMMARY]);
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/listies/sheets");
    expect(wrapper.text()).toContain("Trip planning");
  });

  it("shows each sheet's row count", async () => {
    getMock.mockResolvedValue([SUMMARY]);
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="sheet-s-1"]').text()).toContain(
      "7 rows",
    );
  });

  it("shows a calm empty state when I have no sheets", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(false);
  });

  it("opens the create dialog from the New sheet button", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="new-sheet"]').trigger("click");

    expect(
      wrapper.findComponent({ name: "CreateSheetDialog" }).props("modelValue"),
    ).toBe(true);
  });

  it("creates a sheet and navigates to it", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    await wrapper
      .findComponent({ name: "CreateSheetDialog" })
      .vm.$emit("submit", {
        name: "Cafés",
        columns: [{ name: "Name", type: "text" }],
      });
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/listies/sheets", {
      name: "Cafés",
      columns: [{ name: "Name", type: "text" }],
    });
    expect(push).toHaveBeenCalledWith("/listies/sheets/s-9");
  });

  it("does not navigate when creating fails, and surfaces the error", async () => {
    postMock.mockRejectedValue(new Error("nope"));
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    await wrapper
      .findComponent({ name: "CreateSheetDialog" })
      .vm.$emit("submit", {
        name: "Cafés",
        columns: [{ name: "N", type: "text" }],
      });
    await flushPromises();

    expect(push).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="error"]').text()).toContain("nope");
  });

  it("opens a sheet when I select it", async () => {
    getMock.mockResolvedValue([SUMMARY]);
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="sheet-s-1"]').trigger("click");

    expect(push).toHaveBeenCalledWith("/listies/sheets/s-1");
  });

  it("surfaces a load failure instead of an empty state", async () => {
    getMock.mockRejectedValue(new Error("offline"));
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="error"]').text()).toContain("offline");
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false);
  });
});
