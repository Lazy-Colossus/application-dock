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
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Sheet, SheetView } from "@/apps/listies/types";

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
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click', $event)\">{{ label }}<slot /></button>",
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
  MapPane: {
    name: "MapPane",
    template: "<div />",
    props: ["tab", "browserKey", "selectedRowId", "shownRowIds"],
    emits: ["select-row", "show-all", "show-none"],
  },
  GroupManager: {
    name: "GroupManager",
    template: '<div data-testid="group-manager-stub" />',
    props: ["groups"],
    emits: ["save"],
  },
  CreateTabDialog: {
    name: "CreateTabDialog",
    template: "<div />",
    props: ["modelValue", "existingTabs"],
    emits: ["update:modelValue", "submit"],
  },
  ShareSheetDialog: {
    name: "ShareSheetDialog",
    template: '<div data-testid="share-dialog-stub" />',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
  "q-chip": {
    template:
      "<div :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></div>",
    props: ["label", "icon", "dense", "clickable"],
    emits: ["click"],
  },
  "q-space": { template: "<div />" },
  "q-tooltip": { template: "<div><slot /></div>" },
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

describe("SheetPage — the map pane (Story 4.4)", () => {
  const withPlaces = (): Sheet => {
    const s = sheet();
    s.tabs = [
      {
        id: "tb-1",
        name: "Cafés",
        order: 0,
        columns: [
          { id: "c-1", name: "Cafe", type: "text", order: 0 },
          { id: "c-2", name: "Where", type: "place", order: 1 },
        ],
        rows: [],
      },
      {
        id: "tb-2",
        name: "Plain",
        order: 1,
        columns: [{ id: "c-9", name: "Item", type: "text", order: 0 }],
        rows: [],
      },
    ];
    return s;
  };

  const mapsOn = () =>
    getMock.mockImplementation((path: string) =>
      path === "/listies/maps-config"
        ? Promise.resolve({ enabled: true, browser_key: "k" })
        : Promise.resolve(withPlaces()),
    );

  const openMap = async (wrapper: ReturnType<typeof mount>) => {
    await wrapper.find('[data-testid="toggle-map"]').trigger("click");
    await flushPromises();
  };

  beforeEach(() => {
    mapsOn();
  });

  it("offers a map for a tab that has places", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="toggle-map"]').exists()).toBe(true);
  });

  it("offers no map for a tab with no place column", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("select", "tb-2");
    await flushPromises();

    expect(wrapper.find('[data-testid="toggle-map"]').exists()).toBe(false);
  });

  it("offers no map when the server has no maps configured", async () => {
    getMock.mockImplementation((path: string) =>
      path === "/listies/maps-config"
        ? Promise.resolve({ enabled: false })
        : Promise.resolve(withPlaces()),
    );
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="toggle-map"]').exists()).toBe(false);
  });

  it("is closed until asked for, so the SDK is not loaded uninvited", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.findComponent({ name: "MapPane" }).exists()).toBe(false);
  });

  it("opens beside the grid and hands over the browser key", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await openMap(wrapper);

    const pane = wrapper.findComponent({ name: "MapPane" });
    expect(pane.exists()).toBe(true);
    expect(pane.props("browserKey")).toBe("k");
    expect(wrapper.findComponent({ name: "SheetGrid" }).exists()).toBe(true);
  });

  it("closes again, giving the grid its width back", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();
    await openMap(wrapper);

    await wrapper.find('[data-testid="toggle-map"]').trigger("click");

    expect(wrapper.findComponent({ name: "MapPane" }).exists()).toBe(false);
  });

  it("remembers that a tab's map was open when you come back to it", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();
    await openMap(wrapper);

    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("select", "tb-2");
    await flushPromises();
    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("select", "tb-1");
    await flushPromises();

    expect(wrapper.findComponent({ name: "MapPane" }).exists()).toBe(true);
  });

  it("highlights the row whose marker was clicked", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();
    await openMap(wrapper);

    await wrapper
      .findComponent({ name: "MapPane" })
      .vm.$emit("select-row", "r-7");
    await flushPromises();

    expect(
      wrapper.findComponent({ name: "SheetGrid" }).props("highlightedRowId"),
    ).toBe("r-7");
  });

  it("points the map at the row the grid moved to", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();
    await openMap(wrapper);

    await wrapper
      .findComponent({ name: "SheetGrid" })
      .vm.$emit("select-row", "r-3");
    await flushPromises();

    expect(
      wrapper.findComponent({ name: "MapPane" }).props("selectedRowId"),
    ).toBe("r-3");
  });
});

describe("SheetPage — which places are plotted (Story 4.5)", () => {
  const placeRow = (id: string, name: string) => ({
    id,
    order: Number(id.slice(2)),
    cells: {
      "c-2": { place_id: `p-${id}`, name, address: "a", lat: 1, lng: 2 },
    },
    created_at: "t",
    updated_at: "t",
  });

  const withPlaces = (): Sheet => {
    const s = sheet();
    s.tabs = [
      {
        id: "tb-1",
        name: "Cafés",
        order: 0,
        columns: [
          { id: "c-1", name: "Cafe", type: "text", order: 0 },
          { id: "c-2", name: "Where", type: "place", order: 1 },
        ],
        rows: [placeRow("r-1", "Blue"), placeRow("r-2", "Fabrica")],
      },
      {
        id: "tb-2",
        name: "Other",
        order: 1,
        columns: [
          { id: "c-3", name: "Cafe", type: "text", order: 0 },
          { id: "c-4", name: "Where", type: "place", order: 1 },
        ],
        rows: [],
      },
    ];
    return s;
  };

  beforeEach(() => {
    getMock.mockImplementation((path: string) =>
      path === "/listies/maps-config"
        ? Promise.resolve({ enabled: true, browser_key: "k" })
        : Promise.resolve(withPlaces()),
    );
  });

  const open = async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();
    await wrapper.find('[data-testid="toggle-map"]').trigger("click");
    await flushPromises();
    return wrapper;
  };

  const grid = (w: ReturnType<typeof mount>) =>
    w.findComponent({ name: "SheetGrid" });
  const pane = (w: ReturnType<typeof mount>) =>
    w.findComponent({ name: "MapPane" });

  it("starts with every place shown", async () => {
    const wrapper = await open();

    expect(pane(wrapper).props("shownRowIds")).toEqual(["r-1", "r-2"]);
    expect(grid(wrapper).props("mappedRowIds")).toEqual(["r-1", "r-2"]);
  });

  it("gives the grid no ticks while the map is closed", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(grid(wrapper).props("mappedRowIds")).toBeNull();
  });

  it("drops a row from the map when it is unticked", async () => {
    const wrapper = await open();

    await grid(wrapper).vm.$emit("toggle-mapped", "r-2");
    await flushPromises();

    expect(pane(wrapper).props("shownRowIds")).toEqual(["r-1"]);
  });

  it("puts it back when it is ticked again", async () => {
    const wrapper = await open();
    await grid(wrapper).vm.$emit("toggle-mapped", "r-2");
    await flushPromises();

    await grid(wrapper).vm.$emit("toggle-mapped", "r-2");
    await flushPromises();

    expect(pane(wrapper).props("shownRowIds")).toEqual(["r-1", "r-2"]);
  });

  it("never writes anything when ticking", async () => {
    const wrapper = await open();
    putMock.mockReset();

    await grid(wrapper).vm.$emit("toggle-mapped", "r-2");
    await flushPromises();

    expect(putMock).not.toHaveBeenCalled();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("shows all and shows none", async () => {
    const wrapper = await open();

    await pane(wrapper).vm.$emit("show-none");
    await flushPromises();
    expect(pane(wrapper).props("shownRowIds")).toEqual([]);

    await pane(wrapper).vm.$emit("show-all");
    await flushPromises();
    expect(pane(wrapper).props("shownRowIds")).toEqual(["r-1", "r-2"]);
  });

  it("resets the ticks when the tab changes", async () => {
    const wrapper = await open();
    await grid(wrapper).vm.$emit("toggle-mapped", "r-2");
    await flushPromises();

    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("select", "tb-2");
    await flushPromises();
    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("select", "tb-1");
    await flushPromises();

    expect(pane(wrapper).props("shownRowIds")).toEqual(["r-1", "r-2"]);
  });

  it("shows a newly added place without being asked", async () => {
    const wrapper = await open();

    const store = (
      await import("@/apps/listies/stores/useListiesStore")
    ).useListiesStore();
    store.currentSheet!.tabs[0]!.rows.push(placeRow("r-3", "Dear Breakfast"));
    await flushPromises();

    expect(pane(wrapper).props("shownRowIds")).toContain("r-3");
  });
});

describe("SheetPage — place groups (Story 4.6)", () => {
  const withGroupColumn = (): Sheet => {
    const s = sheet();
    s.tabs = [
      {
        id: "tb-1",
        name: "Cafés",
        order: 0,
        place_groups: [{ id: "g-1", name: "Must see", color: "#e5484d" }],
        columns: [
          { id: "c-1", name: "Cafe", type: "text", order: 0 },
          { id: "c-2", name: "Bucket", type: "place_group", order: 1 },
        ],
        rows: [],
      },
      {
        id: "tb-2",
        name: "Plain",
        order: 1,
        columns: [{ id: "c-9", name: "Item", type: "text", order: 0 }],
        rows: [],
      },
    ];
    return s;
  };

  const groupsSheet = () =>
    getMock.mockImplementation((path: string) =>
      path === "/listies/maps-config"
        ? Promise.resolve({ enabled: false })
        : Promise.resolve(withGroupColumn()),
    );

  beforeEach(() => {
    groupsSheet();
    putMock.mockReset().mockResolvedValue({
      id: "tb-1",
      name: "Cafés",
      order: 0,
      place_groups: [],
      columns: [],
      rows: [],
    });
  });

  it("shows the Groups button when the tab has a group column — even with maps off", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="toggle-groups"]').exists()).toBe(true);
  });

  it("hides the Groups button on a tab with no group column", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("select", "tb-2");
    await flushPromises();

    expect(wrapper.find('[data-testid="toggle-groups"]').exists()).toBe(false);
  });

  it("hands the tab's groups to the manager", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    const manager = wrapper.findComponent({ name: "GroupManager" });
    expect(manager.exists()).toBe(true);
    expect(manager.props("groups")).toEqual([
      { id: "g-1", name: "Must see", color: "#e5484d" },
    ]);
  });

  it("persists a group change through the store", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    const next = [
      { id: "g-1", name: "Must see", color: "#e5484d" },
      { id: "g-2", name: "Maybe", color: "#3e63dd" },
    ];
    await wrapper
      .findComponent({ name: "GroupManager" })
      .vm.$emit("save", next);
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/listies/sheets/s-1/tabs/tb-1", {
      place_groups: next,
    });
  });
});

describe("SheetPage — filtering (Story 2.9)", () => {
  const grid = (wrapper: ReturnType<typeof mount>) =>
    wrapper.findComponent({ name: "SheetGrid" });

  const setFilter = async (
    wrapper: ReturnType<typeof mount>,
    columnId: string,
    spec: unknown,
  ) => {
    await grid(wrapper).vm.$emit("set-filter", { columnId, spec });
    await flushPromises();
  };

  it("shows no Filters chip until a filter is active", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="clear-filters"]').exists()).toBe(false);
  });

  it("shows a Filters chip with the active count and passes the filter to the grid", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await setFilter(wrapper, "c-1", { kind: "text", contains: "tent" });

    const chip = wrapper.find('[data-testid="clear-filters"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain("1");
    expect(grid(wrapper).props("filters")).toEqual({
      "c-1": { kind: "text", contains: "tent" },
    });
  });

  it("drops an inactive filter spec instead of counting it", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    await setFilter(wrapper, "c-1", { kind: "text", contains: "" });

    expect(wrapper.find('[data-testid="clear-filters"]').exists()).toBe(false);
    expect(grid(wrapper).props("filters")).toEqual({});
  });

  it("clears every filter from the toolbar", async () => {
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();
    await setFilter(wrapper, "c-1", { kind: "text", contains: "tent" });

    await wrapper.find('[data-testid="clear-filters"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="clear-filters"]').exists()).toBe(false);
    expect(grid(wrapper).props("filters")).toEqual({});
  });

  it("clears filters when the tab changes", async () => {
    const twoTabs = (): Sheet => {
      const s = sheet();
      s.tabs = [
        {
          id: "tb-1",
          name: "One",
          order: 0,
          columns: [{ id: "c-1", name: "Item", type: "text", order: 0 }],
          rows: [],
        },
        {
          id: "tb-2",
          name: "Two",
          order: 1,
          columns: [{ id: "c-9", name: "Item", type: "text", order: 0 }],
          rows: [],
        },
      ];
      return s;
    };
    getMock.mockImplementation(() => Promise.resolve(twoTabs()));
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();
    await setFilter(wrapper, "c-1", { kind: "text", contains: "tent" });
    expect(wrapper.find('[data-testid="clear-filters"]').exists()).toBe(true);

    await wrapper.findComponent({ name: "TabBar" }).vm.$emit("select", "tb-2");
    await flushPromises();

    expect(wrapper.find('[data-testid="clear-filters"]').exists()).toBe(false);
  });
});

describe("SheetPage — sharing affordance (Story 5.3)", () => {
  const ownerView = (): SheetView => ({
    ...sheet(),
    shared: true,
    owner: "alice",
    members: ["alice", "bob"],
    rev: 0,
    can_manage: true,
  });
  const memberView = (): SheetView => ({
    ...ownerView(),
    can_manage: false,
  });

  function serve(view: SheetView): void {
    getMock.mockImplementation((path: string) =>
      path.includes("maps-config")
        ? Promise.resolve({ enabled: false })
        : Promise.resolve(view),
    );
  }

  it("shows a Share button on a private sheet and opens the dialog", async () => {
    useAuthStore().username = "alice";
    getMock.mockImplementation((path: string) =>
      path.includes("maps-config")
        ? Promise.resolve({ enabled: false })
        : Promise.resolve(sheet()),
    );
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="share-button"]').exists()).toBe(true);
    await wrapper.find('[data-testid="share-button"]').trigger("click");
    expect(
      wrapper.findComponent({ name: "ShareSheetDialog" }).props("modelValue"),
    ).toBe(true);
  });

  it("shows collaborators and opens the dialog for the owner", async () => {
    useAuthStore().username = "alice";
    serve(ownerView());
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="collaborators"]').exists()).toBe(true);
    await wrapper.find('[data-testid="collaborators"]').trigger("click");
    expect(
      wrapper.findComponent({ name: "ShareSheetDialog" }).props("modelValue"),
    ).toBe(true);
  });

  it("a non-owner member sees collaborators but no dialog and no share button", async () => {
    useAuthStore().username = "bob";
    serve(memberView());
    const wrapper = mount(SheetPage, OPTS);
    await flushPromises();

    expect(wrapper.find('[data-testid="collaborators"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="share-button"]').exists()).toBe(false);
    expect(wrapper.findComponent({ name: "ShareSheetDialog" }).exists()).toBe(
      false,
    );
  });

  it("routes home when a live event ends my access", async () => {
    useAuthStore().username = "bob";
    serve(memberView());
    mount(SheetPage, OPTS);
    await flushPromises();

    useListiesStore().closedReason = "removed";
    await flushPromises();

    expect(push).toHaveBeenCalledWith("/listies");
  });
});
