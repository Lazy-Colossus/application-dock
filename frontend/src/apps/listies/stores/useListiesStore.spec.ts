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
import type { Sheet, SheetSummary } from "@/apps/listies/types";

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
