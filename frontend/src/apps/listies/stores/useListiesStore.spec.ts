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

const SHEET: Sheet = {
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
};

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset().mockResolvedValue([]);
  postMock.mockReset().mockResolvedValue(SHEET);
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
    expect(created).toEqual(SHEET);
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
      .mockResolvedValue({ ...SHEET, id: "s-1", name: "Lisbon" });
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
