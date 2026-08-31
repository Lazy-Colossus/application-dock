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
  "q-spinner": { template: "<div />" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'keyup\', $event)" />',
    props: ["modelValue", "dense", "outlined", "autofocus"],
    emits: ["update:modelValue", "keyup"],
  },
  CreateSheetDialog: {
    name: "CreateSheetDialog",
    template: "<div />",
    props: ["modelValue", "allowPlace"],
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

describe("ListiesHomePage — rename (Story 1.4)", () => {
  beforeEach(() => {
    getMock.mockResolvedValue([SUMMARY]);
    putMock
      .mockReset()
      .mockResolvedValue({ ...CREATED, id: "s-1", name: "Lisbon" });
  });

  it("swaps the row for an input when renaming starts", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="rename-s-1"]').trigger("click");

    expect(wrapper.find('[data-testid="rename-input-s-1"]').exists()).toBe(
      true,
    );
  });

  it("saves the new name", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();
    await wrapper.find('[data-testid="rename-s-1"]').trigger("click");

    await wrapper.find('[data-testid="rename-input-s-1"]').setValue("Lisbon");
    await wrapper.find('[data-testid="rename-save-s-1"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/listies/sheets/s-1", {
      name: "Lisbon",
    });
    expect(wrapper.find('[data-testid="rename-input-s-1"]').exists()).toBe(
      false,
    );
  });

  it("cannot save a blank name", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();
    await wrapper.find('[data-testid="rename-s-1"]').trigger("click");

    await wrapper.find('[data-testid="rename-input-s-1"]').setValue("   ");

    expect(
      wrapper.find('[data-testid="rename-save-s-1"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("cancels without sending anything", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();
    await wrapper.find('[data-testid="rename-s-1"]').trigger("click");

    await wrapper.find('[data-testid="rename-input-s-1"]').setValue("Lisbon");
    await wrapper.find('[data-testid="rename-cancel-s-1"]').trigger("click");

    expect(putMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="rename-input-s-1"]').exists()).toBe(
      false,
    );
  });

  it("does not open the sheet while renaming it", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="rename-s-1"]').trigger("click");

    expect(push).not.toHaveBeenCalled();
  });
});

describe("ListiesHomePage — delete (Story 1.4)", () => {
  beforeEach(() => {
    getMock.mockResolvedValue([SUMMARY]);
    delMock.mockReset().mockResolvedValue(undefined);
  });

  it("asks for confirmation before deleting", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="delete-s-1"]').trigger("click");

    expect(delMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="delete-confirm-s-1"]').exists()).toBe(
      true,
    );
  });

  it("names the sheet in the confirmation", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="delete-s-1"]').trigger("click");

    expect(wrapper.find('[data-testid="sheet-s-1"]').text()).toContain(
      "Delete",
    );
  });

  it("deletes once confirmed", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();
    await wrapper.find('[data-testid="delete-s-1"]').trigger("click");

    await wrapper.find('[data-testid="delete-confirm-s-1"]').trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith("/listies/sheets/s-1");
    expect(wrapper.find('[data-testid="sheet-s-1"]').exists()).toBe(false);
  });

  it("sends nothing when the confirmation is dismissed", async () => {
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();
    await wrapper.find('[data-testid="delete-s-1"]').trigger("click");

    await wrapper.find('[data-testid="delete-cancel-s-1"]').trigger("click");

    expect(delMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="delete-confirm-s-1"]').exists()).toBe(
      false,
    );
  });
});

describe("ListiesHomePage — the place type (Story 4.2)", () => {
  it("tells the create dialog when maps are configured", async () => {
    getMock.mockImplementation((path: string) =>
      path === "/listies/maps-config"
        ? Promise.resolve({ enabled: true, browser_key: "k" })
        : Promise.resolve([]),
    );
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    expect(
      wrapper.findComponent({ name: "CreateSheetDialog" }).props("allowPlace"),
    ).toBe(true);
  });

  it("does not offer the place type when maps are unconfigured", async () => {
    getMock.mockImplementation((path: string) =>
      path === "/listies/maps-config"
        ? Promise.resolve({ enabled: false })
        : Promise.resolve([]),
    );
    const wrapper = mount(ListiesHomePage, OPTS);
    await flushPromises();

    expect(
      wrapper.findComponent({ name: "CreateSheetDialog" }).props("allowPlace"),
    ).toBe(false);
  });
});
