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
vi.mock("vue-router", async () => {
  const { reactive } = await import("vue");
  const route = reactive({ params: { sheetId: "s-1" } });
  return { useRoute: () => route, useRouter: () => ({ push }) };
});

import SheetPage from "./SheetPage.vue";
import type { Sheet } from "@/apps/listies/types";

const sheet = (): Sheet => ({
  id: "s-1",
  name: "Trip planning",
  created_at: "t",
  tabs: [
    {
      id: "tb-1",
      name: "Packing",
      order: 0,
      columns: [{ id: "c-1", name: "Item", type: "text", order: 0 }],
      rows: [
        {
          id: "r-1",
          order: 0,
          cells: { "c-1": "Tent" },
          created_at: "t",
          updated_at: "t",
        },
      ],
    },
  ],
});

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click', $event)\">{{ label }}</button>",
    props: [
      "label",
      "disable",
      "icon",
      "flat",
      "dense",
      "round",
      "color",
      "noCaps",
      "unelevated",
      "to",
    ],
    emits: ["click"],
  },
  "q-spinner": { template: '<div data-testid="spinner" />' },
};

const OPTS = { global: { stubs: STUBS } };

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset().mockImplementation(() => Promise.resolve(sheet()));
  postMock.mockReset();
  push.mockReset();
});

describe("SheetPage", () => {
  it("loads the sheet named in the route", async () => {
    mount(SheetPage, OPTS);
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/listies/sheets/s-1");
  });

  it("shows the sheet name", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.text()).toContain("Trip planning");
  });

  it("renders the first tab as a grid", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.findComponent({ name: "SheetGrid" }).exists()).toBe(true);
    expect(wrapper.text()).toContain("Tent");
  });

  it("adds a row when the grid asks for one", async () => {
    postMock.mockResolvedValue({
      id: "r-2",
      order: 1,
      cells: {},
      created_at: "t",
      updated_at: "t",
    });
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper.findComponent({ name: "SheetGrid" }).vm.$emit("add-row");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/listies/sheets/s-1/tabs/tb-1/rows",
      {
        cells: {},
      },
    );
  });

  it("shows a not-found state with a way back when the sheet is not mine", async () => {
    getMock.mockRejectedValue(new Error("Sheet not found"));
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="not-found"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="back-to-sheets"]').exists()).toBe(true);
    expect(wrapper.findComponent({ name: "SheetGrid" }).exists()).toBe(false);
  });

  it("goes back to the sheet list from the not-found state", async () => {
    getMock.mockRejectedValue(new Error("Sheet not found"));
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper.find('[data-testid="back-to-sheets"]').trigger("click");

    expect(push).toHaveBeenCalledWith("/listies");
  });

  it("shows a loading state while the sheet is in flight", async () => {
    let resolve: (value: Sheet) => void = () => {};
    getMock.mockImplementation(
      () =>
        new Promise<Sheet>((r) => {
          resolve = r;
        }),
    );
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="spinner"]').exists()).toBe(true);

    resolve(sheet());
    await flushPromises();
    expect(wrapper.find('[data-testid="spinner"]').exists()).toBe(false);
  });
});

describe("SheetPage — editing (Story 2.2)", () => {
  it("persists a cell the grid commits", async () => {
    putMock.mockReset().mockResolvedValue({
      id: "r-1",
      order: 0,
      cells: { "c-1": "Stove" },
      created_at: "t",
      updated_at: "t2",
    });
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper.findComponent({ name: "SheetGrid" }).vm.$emit("commit-cell", {
      rowId: "r-1",
      columnId: "c-1",
      value: "Stove",
    });
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/listies/sheets/s-1/tabs/tb-1/rows/r-1",
      { cells: { "c-1": "Stove" } },
    );
  });
});

describe("SheetPage — the ghost row (Story 2.3)", () => {
  it("creates a row carrying the value typed into the ghost row", async () => {
    postMock.mockResolvedValue({
      id: "r-2",
      order: 1,
      cells: { "c-1": "Stove" },
      created_at: "t",
      updated_at: "t",
    });
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper
      .findComponent({ name: "SheetGrid" })
      .vm.$emit("add-row", { "c-1": "Stove" });
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/listies/sheets/s-1/tabs/tb-1/rows",
      {
        cells: { "c-1": "Stove" },
      },
    );
  });
});
