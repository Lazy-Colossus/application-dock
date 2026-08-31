import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { componentAt } from "@/test-utils";
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
import { usePageDetailStore } from "@/stores/usePageDetailStore";
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
  "q-page": {
    template: '<div class="q-page-stub"><slot /></div>',
    props: ["styleFn"],
  },
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
  // Rendered by the real TabBar and SheetGrid this page mounts; each has its
  // own spec, so here they only need to resolve.
  "q-menu": { template: "<div><slot /></div>" },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": { template: "<div><slot /></div>" },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-input": {
    template: "<input />",
    props: ["modelValue", "label", "dense", "outlined", "autofocus"],
  },
  // A div, not a <select>: `options` is a read-only DOM property on a real
  // select element, so a native root turns the stub into a warning factory.
  "q-select": {
    template: "<div />",
    props: [
      "modelValue",
      "options",
      "label",
      "dense",
      "outlined",
      "emitValue",
      "mapOptions",
    ],
  },
  CreateTabDialog: {
    name: "CreateTabDialog",
    template: "<div />",
    props: ["modelValue", "existingTabs"],
    emits: ["update:modelValue", "submit"],
  },
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

  it("publishes the sheet name to the shell's title bar", async () => {
    // The page used to render its own title row; that was the second header
    // (and second back arrow) stacked under the shell's.
    mount(SheetPage, OPTS);
    await flushPromises();

    expect(usePageDetailStore().detail).toBe("Trip planning");
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

describe("SheetPage — deleting a row (Story 2.4)", () => {
  it("deletes the row the grid asks to remove", async () => {
    delMock.mockReset().mockResolvedValue(undefined);
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper
      .findComponent({ name: "SheetGrid" })
      .vm.$emit("delete-row", "r-1");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith(
      "/listies/sheets/s-1/tabs/tb-1/rows/r-1",
    );
  });
});

describe("SheetPage — column management (Story 2.5)", () => {
  const TAB = {
    id: "tb-1",
    name: "Packing",
    order: 0,
    columns: [{ id: "c-1", name: "Gear", type: "text", order: 0 }],
    rows: [],
  };

  it("passes each column action through to the API", async () => {
    postMock.mockResolvedValue(TAB);
    putMock.mockReset().mockResolvedValue(TAB);
    delMock.mockReset().mockResolvedValue(undefined);
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();
    const grid = wrapper.findComponent({ name: "SheetGrid" });

    await grid.vm.$emit("add-column", { name: "Notes", type: "text" });
    await grid.vm.$emit("rename-column", { columnId: "c-1", name: "Gear" });
    await grid.vm.$emit("retype-column", { columnId: "c-1", type: "number" });
    await grid.vm.$emit("delete-column", "c-1");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/listies/sheets/s-1/tabs/tb-1/columns",
      { name: "Notes", type: "text" },
    );
    expect(putMock).toHaveBeenCalledWith(
      "/listies/sheets/s-1/tabs/tb-1/columns/c-1",
      { name: "Gear" },
    );
    expect(putMock).toHaveBeenCalledWith(
      "/listies/sheets/s-1/tabs/tb-1/columns/c-1",
      { type: "number" },
    );
    expect(delMock).toHaveBeenCalledWith(
      "/listies/sheets/s-1/tabs/tb-1/columns/c-1",
    );
  });
});

describe("SheetPage — tabs (Story 3.1)", () => {
  const twoTabs = (): Sheet => {
    const s = sheet();
    s.tabs = [
      {
        id: "tb-1",
        name: "Packing",
        order: 0,
        columns: [{ id: "c-1", name: "Item", type: "text", order: 0 }],
        rows: [],
      },
      {
        id: "tb-2",
        name: "Flights",
        order: 1,
        columns: [{ id: "c-9", name: "Airline", type: "text", order: 0 }],
        rows: [],
      },
    ];
    return s;
  };

  beforeEach(() => {
    getMock.mockImplementation(() => Promise.resolve(twoTabs()));
  });

  it("shows a tab bar carrying the sheet's tabs", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    const bar = wrapper.findComponent({ name: "TabBar" });
    expect(bar.exists()).toBe(true);
    expect(bar.props("tabs")).toHaveLength(2);
    expect(bar.props("activeTabId")).toBe("tb-1");
  });

  it("switches the grid to the chosen tab without refetching", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();
    getMock.mockClear();

    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("select", "tb-2");
    await flushPromises();

    expect(getMock).not.toHaveBeenCalled();
    expect(wrapper.findComponent({ name: "SheetGrid" }).props("tab").id).toBe(
      "tb-2",
    );
  });

  it("opens the create-tab dialog from the bar", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("add");

    expect(
      wrapper.findComponent({ name: "CreateTabDialog" }).props("modelValue"),
    ).toBe(true);
  });

  it("tells the dialog which tabs already exist", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(
      wrapper.findComponent({ name: "CreateTabDialog" }).props("existingTabs"),
    ).toHaveLength(2);
  });

  it("creates the tab the dialog asks for", async () => {
    postMock.mockResolvedValue({
      id: "tb-3",
      name: "Budget",
      order: 2,
      columns: [{ id: "c-7", name: "Item", type: "text", order: 0 }],
      rows: [],
    });
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper
      .findComponent({ name: "CreateTabDialog" })
      .vm.$emit("submit", {
        name: "Budget",
        columns: [{ name: "Item", type: "text" }],
      });
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/listies/sheets/s-1/tabs", {
      name: "Budget",
      columns: [{ name: "Item", type: "text" }],
    });
    expect(wrapper.findComponent({ name: "SheetGrid" }).props("tab").id).toBe(
      "tb-3",
    );
  });
});

describe("SheetPage — copying a tab's columns (Story 3.2)", () => {
  it("sends the source tab rather than a column list", async () => {
    postMock.mockResolvedValue({
      id: "tb-3",
      name: "Cafés",
      order: 2,
      columns: [],
      rows: [],
    });
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper
      .findComponent({ name: "CreateTabDialog" })
      .vm.$emit("submit", { name: "Cafés", copyColumnsFrom: "tb-1" });
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/listies/sheets/s-1/tabs", {
      name: "Cafés",
      copy_columns_from: "tb-1",
    });
  });
});

describe("SheetPage — renaming and deleting tabs (Story 3.3)", () => {
  const twoTabs = (): Sheet => {
    const s = sheet();
    s.tabs = [
      { id: "tb-1", name: "Packing", order: 0, columns: [], rows: [] },
      { id: "tb-2", name: "Flights", order: 1, columns: [], rows: [] },
    ];
    return s;
  };

  beforeEach(() => {
    getMock.mockImplementation(() => Promise.resolve(twoTabs()));
  });

  it("renames the tab the bar asks about", async () => {
    putMock.mockReset().mockResolvedValue({
      id: "tb-2",
      name: "Trains",
      order: 1,
      columns: [],
      rows: [],
    });
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper
      .findComponent({ name: "TabBar" })
      .vm.$emit("rename", { tabId: "tb-2", name: "Trains" });
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/listies/sheets/s-1/tabs/tb-2", {
      name: "Trains",
    });
  });

  it("deletes the tab the bar asks about", async () => {
    delMock.mockReset().mockResolvedValue(undefined);
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("delete", "tb-2");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith("/listies/sheets/s-1/tabs/tb-2");
    expect(
      wrapper.findComponent({ name: "TabBar" }).props("tabs"),
    ).toHaveLength(1);
  });
});

describe("SheetPage — the page fills the viewport (UI fix 1)", () => {
  it("gives the page a definite height rather than a minimum", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    const styleFn = componentAt(wrapper, ".q-page-stub").props("styleFn") as (
      offset: number,
    ) => Record<string, string>;

    // A *definite* height is what lets the grid scroll internally and the tab
    // bar stay put; min-height would let tall content push the bar off-screen.
    expect(styleFn(50)).toEqual({ height: "calc(100vh - 50px)" });
    expect(styleFn(0)).toEqual({ height: "100vh" });
  });

  it("lays the page out as a column so the grid can take the slack", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find(".q-page-stub").classes()).toContain("listies-sheet");
    expect(wrapper.find(".listies-sheet__body").exists()).toBe(true);
  });

  it("keeps the tab bar outside the scrolling area, after the grid", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    const body = wrapper.find(".listies-sheet__body");
    expect(body.findComponent({ name: "SheetGrid" }).exists()).toBe(true);
    expect(body.findComponent({ name: "TabBar" }).exists()).toBe(false);
    expect(wrapper.findComponent({ name: "TabBar" }).exists()).toBe(true);
  });
});

describe("SheetPage — tab colour", () => {
  it("recolours the tab the bar asks about", async () => {
    putMock.mockReset().mockResolvedValue({
      id: "tb-1",
      name: "Packing",
      order: 0,
      color: "#ffcc00",
      columns: [],
      rows: [],
    });
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper
      .findComponent({ name: "TabBar" })
      .vm.$emit("recolour", { tabId: "tb-1", color: "#ffcc00" });
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/listies/sheets/s-1/tabs/tb-1", {
      color: "#ffcc00",
    });
  });

  it("accents the grid with the active tab's colour", async () => {
    getMock.mockImplementation(() => {
      const s = sheet();
      s.tabs[0]!.color = "#ffcc00";
      return Promise.resolve(s);
    });
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find(".listies-sheet__body").attributes("style")).toContain(
      "#ffcc00",
    );
  });
});

describe("SheetPage — one header, not two", () => {
  it("names the sheet in the shell bar instead of its own title row", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(usePageDetailStore().detail).toBe("Trip planning");
    // The name is the shell bar's job now; repeating it here is the duplicate
    // header the user was looking at.
    expect(wrapper.find('[data-testid="sheet-title"]').exists()).toBe(false);
  });

  it("has no back arrow of its own — the shell bar already has one", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="back-to-sheets"]').exists()).toBe(false);
  });

  it("keeps a way back from the not-found state, where there is no sheet to name", async () => {
    getMock.mockRejectedValue(new Error("Sheet not found"));
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="back-to-sheets"]').exists()).toBe(true);
    expect(usePageDetailStore().detail).toBeNull();
  });

  it("clears the detail when it goes away", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    wrapper.unmount();

    expect(usePageDetailStore().detail).toBeNull();
  });

  it("renames the bar when the sheet is renamed elsewhere", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    wrapper.findComponent({ name: "SheetGrid" }); // sheet is loaded
    const store = (
      await import("@/apps/listies/stores/useListiesStore")
    ).useListiesStore();
    store.currentSheet!.name = "Lisbon trip";
    await flushPromises();

    expect(usePageDetailStore().detail).toBe("Lisbon trip");
  });
});
