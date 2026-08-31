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

import { useListiesStore } from "./useListiesStore";
import type { CellValue, Sheet, SheetSummary } from "@/apps/listies/types";

// A factory, not a shared object: the store mutates the summary it holds when
// renaming, so tests must not share one instance across cases.
const summary = (): SheetSummary => ({
  id: "s-1",
  name: "Trip planning",
  tab_count: 1,
  row_count: 0,
  created_at: "2026-08-30T10:00:00Z",
});

// A factory for the same reason as `summary()`: the store pushes rows into the
// tab it holds, so a shared instance leaks state between cases.
const sheet = (): Sheet => ({
  id: "s-2",
  name: "Cafés",
  created_at: "2026-08-30T10:00:00Z",
  tabs: [
    {
      id: "tb-1",
      name: "Tab 1",
      order: 0,
      columns: [{ id: "c-1", name: "Item", type: "text", order: 0 }],
      rows: [],
    },
  ],
});

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset().mockResolvedValue([]);
  postMock.mockReset().mockImplementation(() => Promise.resolve(sheet()));
});

describe("useListiesStore — fetchSheets", () => {
  it("loads sheet summaries from the API", async () => {
    getMock.mockResolvedValue([summary()]);
    const store = useListiesStore();

    await store.fetchSheets();

    expect(getMock).toHaveBeenCalledWith("/listies/sheets");
    expect(store.sheets).toEqual([summary()]);
  });

  it("clears loading when the request succeeds", async () => {
    const store = useListiesStore();
    await store.fetchSheets();
    expect(store.loading).toBe(false);
  });

  it("routes a failure into error rather than throwing", async () => {
    getMock.mockRejectedValue(new Error("boom"));
    const store = useListiesStore();

    await store.fetchSheets();

    expect(store.error).toBe("boom");
    expect(store.loading).toBe(false);
  });
});

describe("useListiesStore — createSheet", () => {
  it("posts the name and columns and returns the created sheet", async () => {
    const store = useListiesStore();

    const created = await store.createSheet("Cafés", [
      { name: "Item", type: "text" },
    ]);

    expect(postMock).toHaveBeenCalledWith("/listies/sheets", {
      name: "Cafés",
      columns: [{ name: "Item", type: "text" }],
    });
    expect(created).toEqual(sheet());
  });

  it("appends a summary for the new sheet without refetching", async () => {
    const store = useListiesStore();

    await store.createSheet("Cafés", [{ name: "Item", type: "text" }]);

    expect(store.sheets).toEqual([
      {
        id: "s-2",
        name: "Cafés",
        tab_count: 1,
        row_count: 0,
        created_at: "2026-08-30T10:00:00Z",
      },
    ]);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("surfaces the error AND rethrows so the caller can skip navigation", async () => {
    postMock.mockRejectedValue(new Error("nope"));
    const store = useListiesStore();

    await expect(
      store.createSheet("Cafés", [{ name: "Item", type: "text" }]),
    ).rejects.toThrow("nope");
    expect(store.error).toBe("nope");
    expect(store.loading).toBe(false);
  });
});

describe("useListiesStore — renameSheet", () => {
  it("puts the new name and updates the local summary", async () => {
    getMock.mockResolvedValue([summary()]);
    putMock
      .mockReset()
      .mockResolvedValue({ ...sheet(), id: "s-1", name: "Lisbon" });
    const store = useListiesStore();
    await store.fetchSheets();

    await store.renameSheet("s-1", "Lisbon");

    expect(putMock).toHaveBeenCalledWith("/listies/sheets/s-1", {
      name: "Lisbon",
    });
    expect(store.sheets[0]!.name).toBe("Lisbon");
  });

  it("leaves the local name alone and surfaces the error when it fails", async () => {
    getMock.mockResolvedValue([summary()]);
    putMock.mockReset().mockRejectedValue(new Error("nope"));
    const store = useListiesStore();
    await store.fetchSheets();

    await store.renameSheet("s-1", "Lisbon");

    expect(store.sheets[0]!.name).toBe("Trip planning");
    expect(store.error).toBe("nope");
    expect(store.loading).toBe(false);
  });
});

describe("useListiesStore — deleteSheet", () => {
  it("deletes and drops the sheet locally without refetching", async () => {
    getMock.mockResolvedValue([summary()]);
    delMock.mockReset().mockResolvedValue(undefined);
    const store = useListiesStore();
    await store.fetchSheets();
    getMock.mockClear();

    await store.deleteSheet("s-1");

    expect(delMock).toHaveBeenCalledWith("/listies/sheets/s-1");
    expect(store.sheets).toEqual([]);
    expect(getMock).not.toHaveBeenCalled();
  });

  it("keeps the sheet and surfaces the error when deleting fails", async () => {
    getMock.mockResolvedValue([summary()]);
    delMock.mockReset().mockRejectedValue(new Error("busy"));
    const store = useListiesStore();
    await store.fetchSheets();

    await store.deleteSheet("s-1");

    expect(store.sheets).toHaveLength(1);
    expect(store.error).toBe("busy");
    expect(store.loading).toBe(false);
  });
});

describe("useListiesStore — fetchSheet (Story 2.1)", () => {
  it("loads one sheet and selects its first tab", async () => {
    getMock.mockImplementation(() => Promise.resolve(sheet()));
    const store = useListiesStore();

    await store.fetchSheet("s-2");

    expect(getMock).toHaveBeenCalledWith("/listies/sheets/s-2");
    expect(store.currentSheet).toEqual(sheet());
    expect(store.activeTabId).toBe("tb-1");
    expect(store.activeTab?.id).toBe("tb-1");
  });

  it("selects the tab with the lowest order, not merely the first in the array", async () => {
    getMock.mockResolvedValue({
      ...sheet(),
      tabs: [
        { id: "tb-b", name: "Second", order: 1, columns: [], rows: [] },
        { id: "tb-a", name: "First", order: 0, columns: [], rows: [] },
      ],
    });
    const store = useListiesStore();

    await store.fetchSheet("s-2");

    expect(store.activeTabId).toBe("tb-a");
  });

  it("routes a 404 into error and leaves currentSheet null", async () => {
    getMock.mockRejectedValue(new Error("Sheet not found"));
    const store = useListiesStore();

    await store.fetchSheet("s-nope");

    expect(store.currentSheet).toBeNull();
    expect(store.error).toBe("Sheet not found");
    expect(store.loading).toBe(false);
  });
});

describe("useListiesStore — addRow (Story 2.1)", () => {
  const NEW_ROW = {
    id: "r-1",
    order: 0,
    cells: {},
    created_at: "t",
    updated_at: "t",
  };

  it("posts to the active tab and appends the row locally", async () => {
    getMock.mockImplementation(() => Promise.resolve(sheet()));
    postMock.mockReset().mockResolvedValue(NEW_ROW);
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.addRow();

    expect(postMock).toHaveBeenCalledWith(
      "/listies/sheets/s-2/tabs/tb-1/rows",
      {
        cells: {},
      },
    );
    expect(store.activeTab!.rows).toEqual([NEW_ROW]);
  });

  it("sends initial cells when given them", async () => {
    getMock.mockImplementation(() => Promise.resolve(sheet()));
    postMock.mockReset().mockResolvedValue(NEW_ROW);
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.addRow({ "c-1": "Tent" });

    expect(postMock).toHaveBeenCalledWith(
      "/listies/sheets/s-2/tabs/tb-1/rows",
      {
        cells: { "c-1": "Tent" },
      },
    );
  });

  it("adds nothing and surfaces the error when the request fails", async () => {
    getMock.mockImplementation(() => Promise.resolve(sheet()));
    postMock.mockReset().mockRejectedValue(new Error("nope"));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.addRow();

    expect(store.activeTab!.rows).toEqual([]);
    expect(store.error).toBe("nope");
  });

  it("does nothing when no sheet is open", async () => {
    const store = useListiesStore();

    await store.addRow();

    expect(postMock).not.toHaveBeenCalled();
  });
});

describe("useListiesStore — commitCell (Story 2.2)", () => {
  const withRow = (): Sheet => {
    const s = sheet();
    s.tabs[0]!.rows = [
      {
        id: "r-1",
        order: 0,
        cells: { "c-1": "Tent" },
        created_at: "t",
        updated_at: "t",
      },
    ];
    return s;
  };

  beforeEach(() => {
    getMock.mockImplementation(() => Promise.resolve(withRow()));
  });

  it("shows the new value before the request resolves", async () => {
    let resolve: (row: unknown) => void = () => {};
    putMock.mockReset().mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    const pending = store.commitCell("r-1", "c-1", "Stove");

    expect(store.activeTab!.rows[0]!.cells["c-1"]).toBe("Stove");

    resolve({
      id: "r-1",
      order: 0,
      cells: { "c-1": "Stove" },
      created_at: "t",
      updated_at: "t2",
    });
    await pending;
  });

  it("sends only the changed cell", async () => {
    putMock.mockReset().mockResolvedValue({
      id: "r-1",
      order: 0,
      cells: { "c-1": "Stove" },
      created_at: "t",
      updated_at: "t2",
    });
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.commitCell("r-1", "c-1", "Stove");

    expect(putMock).toHaveBeenCalledWith(
      "/listies/sheets/s-2/tabs/tb-1/rows/r-1",
      {
        cells: { "c-1": "Stove" },
      },
    );
  });

  it("reconciles the row with the server's response", async () => {
    putMock.mockReset().mockResolvedValue({
      id: "r-1",
      order: 0,
      cells: { "c-1": "Stove" },
      created_at: "t",
      updated_at: "t2",
    });
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.commitCell("r-1", "c-1", "Stove");

    expect(store.activeTab!.rows[0]!.updated_at).toBe("t2");
  });

  it("rolls the cell back and surfaces the error when the write fails", async () => {
    putMock.mockReset().mockRejectedValue(new Error("nope"));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.commitCell("r-1", "c-1", "Stove");

    expect(store.activeTab!.rows[0]!.cells["c-1"]).toBe("Tent");
    expect(store.error).toBe("nope");
  });

  it("restores an empty cell to empty on rollback, not to undefined", async () => {
    putMock.mockReset().mockRejectedValue(new Error("nope"));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.commitCell("r-1", "c-1", null);
    expect(store.activeTab!.rows[0]!.cells["c-1"]).toBe("Tent");
  });

  it("clears a cell optimistically by removing the key", async () => {
    putMock.mockReset().mockResolvedValue({
      id: "r-1",
      order: 0,
      cells: {},
      created_at: "t",
      updated_at: "t2",
    });
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.commitCell("r-1", "c-1", null);

    expect(store.activeTab!.rows[0]!.cells["c-1"]).toBeUndefined();
  });

  it("never blocks the grid on the network", async () => {
    putMock.mockReset().mockImplementation(() => new Promise(() => {}));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    void store.commitCell("r-1", "c-1", "Stove");
    await Promise.resolve();

    expect(store.loading).toBe(false);
  });

  it("does nothing when the row is not in the active tab", async () => {
    putMock.mockReset();
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.commitCell("r-nope", "c-1", "Stove");

    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("useListiesStore — deleteRow (Story 2.4)", () => {
  const withRows = (): Sheet => {
    const s = sheet();
    s.tabs[0]!.rows = [
      { id: "r-1", order: 0, cells: {}, created_at: "t", updated_at: "t" },
      { id: "r-2", order: 1, cells: {}, created_at: "t", updated_at: "t" },
    ];
    return s;
  };

  beforeEach(() => {
    getMock.mockImplementation(() => Promise.resolve(withRows()));
  });

  it("deletes the row and drops it locally", async () => {
    delMock.mockReset().mockResolvedValue(undefined);
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.deleteRow("r-1");

    expect(delMock).toHaveBeenCalledWith(
      "/listies/sheets/s-2/tabs/tb-1/rows/r-1",
    );
    expect(store.activeTab!.rows.map((r) => r.id)).toEqual(["r-2"]);
  });

  it("keeps the row and surfaces the error when the delete fails", async () => {
    delMock.mockReset().mockRejectedValue(new Error("nope"));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.deleteRow("r-1");

    expect(store.activeTab!.rows).toHaveLength(2);
    expect(store.error).toBe("nope");
  });

  it("does nothing when the row is not in the active tab", async () => {
    delMock.mockReset();
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.deleteRow("r-nope");

    expect(delMock).not.toHaveBeenCalled();
  });
});

describe("useListiesStore — columns (Story 2.5)", () => {
  const threeColumns = (): Sheet => {
    const s = sheet();
    s.tabs[0]!.columns = [
      { id: "c-1", name: "Item", type: "text", order: 0 },
      { id: "c-2", name: "Qty", type: "number", order: 1 },
      { id: "c-3", name: "Due", type: "date", order: 2 },
    ];
    return s;
  };

  const returnedTab = {
    id: "tb-1",
    name: "Tab 1",
    order: 0,
    columns: [{ id: "c-1", name: "Gear", type: "text", order: 0 }],
    rows: [],
  };

  beforeEach(() => {
    getMock.mockImplementation(() => Promise.resolve(threeColumns()));
    postMock.mockReset().mockResolvedValue(returnedTab);
    putMock.mockReset().mockResolvedValue(returnedTab);
    delMock.mockReset().mockResolvedValue(undefined);
  });

  it("adds a column and replaces the tab with the response", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.addColumn("Notes", "text");

    expect(postMock).toHaveBeenCalledWith(
      "/listies/sheets/s-2/tabs/tb-1/columns",
      { name: "Notes", type: "text" },
    );
    expect(store.activeTab!.columns).toEqual(returnedTab.columns);
  });

  it("renames a column", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.renameColumn("c-1", "Gear");

    expect(putMock).toHaveBeenCalledWith(
      "/listies/sheets/s-2/tabs/tb-1/columns/c-1",
      { name: "Gear" },
    );
  });

  it("retypes a column", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.retypeColumn("c-2", "text");

    expect(putMock).toHaveBeenCalledWith(
      "/listies/sheets/s-2/tabs/tb-1/columns/c-2",
      { type: "text" },
    );
  });

  it("moves a column by sending the whole new order", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.moveColumn("c-1", 1);

    expect(putMock).toHaveBeenCalledWith(
      "/listies/sheets/s-2/tabs/tb-1/columns/order",
      { column_ids: ["c-2", "c-1", "c-3"] },
    );
  });

  it("does not move the first column further left", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.moveColumn("c-1", -1);

    expect(putMock).not.toHaveBeenCalled();
  });

  it("does not move the last column further right", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.moveColumn("c-3", 1);

    expect(putMock).not.toHaveBeenCalled();
  });

  it("deletes a column and drops it locally", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.deleteColumn("c-2");

    expect(delMock).toHaveBeenCalledWith(
      "/listies/sheets/s-2/tabs/tb-1/columns/c-2",
    );
    expect(store.activeTab!.columns.map((c) => c.id)).toEqual(["c-1", "c-3"]);
  });

  it("also drops the deleted column's values from every row", async () => {
    getMock.mockImplementation(() => {
      const s = threeColumns();
      s.tabs[0]!.rows = [
        {
          id: "r-1",
          order: 0,
          cells: { "c-1": "Tent", "c-2": 1 },
          created_at: "t",
          updated_at: "t",
        },
      ];
      return Promise.resolve(s);
    });
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.deleteColumn("c-2");

    expect(store.activeTab!.rows[0]!.cells).toEqual({ "c-1": "Tent" });
  });

  it("keeps the column and surfaces the error when a column write fails", async () => {
    putMock.mockRejectedValue(new Error("duplicate column name: Qty"));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.renameColumn("c-1", "Qty");

    expect(store.activeTab!.columns[0]!.name).toBe("Item");
    expect(store.error).toBe("duplicate column name: Qty");
  });
});

describe("useListiesStore — tabs (Story 3.1)", () => {
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

  const NEW_TAB = {
    id: "tb-3",
    name: "Budget",
    order: 2,
    columns: [{ id: "c-7", name: "Item", type: "text", order: 0 }],
    rows: [],
  };

  beforeEach(() => {
    getMock.mockImplementation(() => Promise.resolve(twoTabs()));
    postMock.mockReset().mockResolvedValue(NEW_TAB);
  });

  it("switches the active tab", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    store.setActiveTab("tb-2");

    expect(store.activeTabId).toBe("tb-2");
    expect(store.activeTab!.name).toBe("Flights");
  });

  it("ignores a tab that is not in this sheet", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    store.setActiveTab("tb-nope");

    expect(store.activeTabId).toBe("tb-1");
  });

  it("creates a tab, appends it, and makes it active", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.createTab("Budget", [{ name: "Item", type: "text" }]);

    expect(postMock).toHaveBeenCalledWith("/listies/sheets/s-2/tabs", {
      name: "Budget",
      columns: [{ name: "Item", type: "text" }],
    });
    expect(store.currentSheet!.tabs.map((t) => t.id)).toEqual([
      "tb-1",
      "tb-2",
      "tb-3",
    ]);
    expect(store.activeTabId).toBe("tb-3");
  });

  it("stays on the current tab and surfaces the error when creating fails", async () => {
    postMock.mockRejectedValue(new Error("nope"));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.createTab("Budget", [{ name: "Item", type: "text" }]);

    expect(store.currentSheet!.tabs).toHaveLength(2);
    expect(store.activeTabId).toBe("tb-1");
    expect(store.error).toBe("nope");
  });

  it("does nothing when no sheet is open", async () => {
    const store = useListiesStore();

    await store.createTab("Budget", [{ name: "Item", type: "text" }]);

    expect(postMock).not.toHaveBeenCalled();
  });
});

describe("useListiesStore — createTab by copying (Story 3.2)", () => {
  it("sends copy_columns_from and no column list", async () => {
    getMock.mockImplementation(() => Promise.resolve(sheet()));
    postMock.mockReset().mockResolvedValue({
      id: "tb-9",
      name: "Cafés",
      order: 1,
      columns: [],
      rows: [],
    });
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.createTabFrom("Cafés", "tb-1");

    expect(postMock).toHaveBeenCalledWith("/listies/sheets/s-2/tabs", {
      name: "Cafés",
      copy_columns_from: "tb-1",
    });
    expect(store.activeTabId).toBe("tb-9");
  });
});

describe("useListiesStore — rename and delete a tab (Story 3.3)", () => {
  const threeTabs = (): Sheet => {
    const s = sheet();
    s.tabs = [
      { id: "tb-1", name: "Packing", order: 0, columns: [], rows: [] },
      { id: "tb-2", name: "Flights", order: 1, columns: [], rows: [] },
      { id: "tb-3", name: "Budget", order: 2, columns: [], rows: [] },
    ];
    return s;
  };

  beforeEach(() => {
    getMock.mockImplementation(() => Promise.resolve(threeTabs()));
    putMock.mockReset().mockResolvedValue({
      id: "tb-2",
      name: "Flights & trains",
      order: 1,
      columns: [],
      rows: [],
    });
    delMock.mockReset().mockResolvedValue(undefined);
  });

  it("renames a tab in place", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.renameTab("tb-2", "Flights & trains");

    expect(putMock).toHaveBeenCalledWith("/listies/sheets/s-2/tabs/tb-2", {
      name: "Flights & trains",
    });
    expect(store.currentSheet!.tabs[1]!.name).toBe("Flights & trains");
  });

  it("deletes a tab and drops it locally", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.deleteTab("tb-2");

    expect(delMock).toHaveBeenCalledWith("/listies/sheets/s-2/tabs/tb-2");
    expect(store.currentSheet!.tabs.map((t) => t.id)).toEqual(["tb-1", "tb-3"]);
  });

  it("moves to the next tab when the active one is deleted", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");
    store.setActiveTab("tb-2");

    await store.deleteTab("tb-2");

    expect(store.activeTabId).toBe("tb-3");
  });

  it("falls back to the previous tab when the last one is deleted", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");
    store.setActiveTab("tb-3");

    await store.deleteTab("tb-3");

    expect(store.activeTabId).toBe("tb-2");
  });

  it("leaves the active tab alone when another one is deleted", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.deleteTab("tb-3");

    expect(store.activeTabId).toBe("tb-1");
  });

  it("refuses to delete the only tab without asking the server", async () => {
    getMock.mockImplementation(() => Promise.resolve(sheet()));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.deleteTab("tb-1");

    expect(delMock).not.toHaveBeenCalled();
    expect(store.currentSheet!.tabs).toHaveLength(1);
  });

  it("keeps the tab and surfaces the error when a delete fails", async () => {
    delMock.mockRejectedValue(new Error("nope"));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.deleteTab("tb-2");

    expect(store.currentSheet!.tabs).toHaveLength(3);
    expect(store.error).toBe("nope");
  });
});

describe("useListiesStore — tab colour", () => {
  beforeEach(() => {
    getMock.mockImplementation(() => Promise.resolve(sheet()));
    putMock.mockReset().mockResolvedValue({
      id: "tb-1",
      name: "Tab 1",
      order: 0,
      color: "#ffcc00",
      columns: [],
      rows: [],
    });
  });

  it("sets a tab's colour", async () => {
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.recolourTab("tb-1", "#ffcc00");

    expect(putMock).toHaveBeenCalledWith("/listies/sheets/s-2/tabs/tb-1", {
      color: "#ffcc00",
    });
    expect(store.currentSheet!.tabs[0]!.color).toBe("#ffcc00");
  });

  it("clears a colour by sending an empty string", async () => {
    putMock.mockResolvedValue({
      id: "tb-1",
      name: "Tab 1",
      order: 0,
      color: null,
      columns: [],
      rows: [],
    });
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.recolourTab("tb-1", null);

    expect(putMock).toHaveBeenCalledWith("/listies/sheets/s-2/tabs/tb-1", {
      color: "",
    });
    expect(store.currentSheet!.tabs[0]!.color).toBeNull();
  });

  it("keeps the old colour and surfaces the error when it fails", async () => {
    putMock.mockRejectedValue(new Error("nope"));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    await store.recolourTab("tb-1", "#ffcc00");

    expect(store.currentSheet!.tabs[0]!.color).toBeUndefined();
    expect(store.error).toBe("nope");
  });
});

describe("useListiesStore — maps configuration (Story 4.2)", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("assumes maps are off until told otherwise", () => {
    const store = useListiesStore();
    expect(store.mapsEnabled).toBe(false);
    expect(store.browserKey).toBeNull();
  });

  it("loads the configuration and keeps the browser key", async () => {
    getMock.mockResolvedValue({
      enabled: true,
      browser_key: "browser-key-xyz",
    });
    const store = useListiesStore();

    await store.fetchMapsConfig();

    expect(getMock).toHaveBeenCalledWith("/listies/maps-config");
    expect(store.mapsEnabled).toBe(true);
    expect(store.browserKey).toBe("browser-key-xyz");
  });

  it("stays off when the server reports it is not configured", async () => {
    getMock.mockResolvedValue({ enabled: false });
    const store = useListiesStore();

    await store.fetchMapsConfig();

    expect(store.mapsEnabled).toBe(false);
    expect(store.browserKey).toBeNull();
  });

  it("asks only once per session", async () => {
    getMock.mockResolvedValue({ enabled: true, browser_key: "k" });
    const store = useListiesStore();

    await store.fetchMapsConfig();
    await store.fetchMapsConfig();

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("stays off, and quiet, when the request fails", async () => {
    getMock.mockRejectedValue(new Error("offline"));
    const store = useListiesStore();

    await store.fetchMapsConfig();

    // Maps are optional: a failure here must not put an error banner over a
    // sheet that works perfectly well without them.
    expect(store.mapsEnabled).toBe(false);
    expect(store.error).toBeNull();
  });
});

describe("useListiesStore — place search (Story 4.3)", () => {
  const RESULT = {
    place_id: "ChIJ_1",
    name: "Blue Bottle",
    address: "Rua Nova 12",
    lat: 38.71,
    lng: -9.13,
  };

  beforeEach(() => {
    getMock.mockReset().mockResolvedValue([RESULT]);
  });

  it("searches through the API", async () => {
    const store = useListiesStore();

    const results = await store.searchPlaces("coffee");

    expect(getMock).toHaveBeenCalledWith("/listies/places/search?q=coffee");
    expect(results).toEqual([RESULT]);
  });

  it("encodes the query rather than pasting it into the URL", async () => {
    const store = useListiesStore();

    await store.searchPlaces("caf & bar");

    // URLSearchParams encodes a space as "+", which a query string decodes
    // back to a space server-side (pinned by a backend test).
    expect(getMock).toHaveBeenCalledWith(
      "/listies/places/search?q=caf+%26+bar",
    );
  });

  it("passes a near point when given one", async () => {
    const store = useListiesStore();

    await store.searchPlaces("cafe", "38.71,-9.13");

    expect(getMock).toHaveBeenCalledWith(
      "/listies/places/search?q=cafe&near=38.71%2C-9.13",
    );
  });

  it("does not gate the grid on a search", async () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    const store = useListiesStore();

    void store.searchPlaces("coffee");
    await Promise.resolve();

    // A keystroke in one cell must not put a spinner over the whole sheet.
    expect(store.loading).toBe(false);
    expect(store.searching).toBe(true);
  });

  it("clears the in-flight flag when the search finishes", async () => {
    const store = useListiesStore();
    await store.searchPlaces("coffee");
    expect(store.searching).toBe(false);
  });

  it("rethrows so the cell can show the failure, without a sheet-wide banner", async () => {
    getMock.mockRejectedValue(new Error("502: upstream"));
    const store = useListiesStore();

    await expect(store.searchPlaces("coffee")).rejects.toThrow("502: upstream");
    expect(store.error).toBeNull();
    expect(store.searching).toBe(false);
  });
});

describe("useListiesStore — biasing a search to the column (Story 4.3)", () => {
  const place = (lat: number, lng: number) => ({
    place_id: `ChIJ_${lat}`,
    name: "somewhere",
    address: "",
    lat,
    lng,
  });

  const withPlaces = (
    values: ({ lat: number; lng: number } | null)[],
  ): Sheet => {
    const s = sheet();
    s.tabs[0]!.columns = [
      { id: "c-1", name: "Where", type: "place", order: 0 },
    ];
    s.tabs[0]!.rows = values.map((v, i) => ({
      id: `r-${i}`,
      order: i,
      cells: (v === null ? {} : { "c-1": place(v.lat, v.lng) }) as Record<
        string,
        CellValue
      >,
      created_at: "t",
      updated_at: "t",
    }));
    return s;
  };

  it("has no bias when the column is empty", async () => {
    getMock.mockImplementation(() => Promise.resolve(withPlaces([null, null])));
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    expect(store.placeCentroid("c-1")).toBeNull();
  });

  it("biases to the one place already in the column", async () => {
    getMock.mockImplementation(() =>
      Promise.resolve(withPlaces([{ lat: 38.7, lng: -9.1 }])),
    );
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    expect(store.placeCentroid("c-1")).toBe("38.7,-9.1");
  });

  it("biases to the middle of several places", async () => {
    getMock.mockImplementation(() =>
      Promise.resolve(
        withPlaces([
          { lat: 38.0, lng: -9.0 },
          { lat: 40.0, lng: -7.0 },
        ]),
      ),
    );
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    expect(store.placeCentroid("c-1")).toBe("39,-8");
  });

  it("ignores rows with nothing in that column", async () => {
    getMock.mockImplementation(() =>
      Promise.resolve(withPlaces([{ lat: 38.0, lng: -9.0 }, null])),
    );
    const store = useListiesStore();
    await store.fetchSheet("s-2");

    expect(store.placeCentroid("c-1")).toBe("38,-9");
  });
});
