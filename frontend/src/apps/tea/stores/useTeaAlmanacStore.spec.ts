import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {
    status = 0;
    detail = "";
  },
  api: { get: getMock },
}));

import { useTeaAlmanacStore } from "./useTeaAlmanacStore";
import type { AlmanacEntryView } from "@/apps/tea/types";

function entry(overrides: Partial<AlmanacEntryView> = {}): AlmanacEntryView {
  return {
    catalogue_node_id: "green.longjing",
    country: "China",
    reading: "Lóngjǐng",
    summary: "A flat, pan-fired green tea.",
    brewing: { leaf_grams: 3, water_temp_c: 80, steep_seconds: [30, 45, 60] },
    source: "seed",
    name: "Longjing",
    name_zh: "龍井",
    default_origin: "Xihu, Zhejiang",
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
});

describe("useTeaAlmanacStore", () => {
  it("fetchEntries with no filters requests the plain endpoint", async () => {
    getMock.mockResolvedValue([entry()]);
    const store = useTeaAlmanacStore();

    await store.fetchEntries();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac");
    expect(store.entries).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  it("fetchEntries builds a query string from country and search filters", async () => {
    getMock.mockResolvedValue([entry({ country: "Japan" })]);
    const store = useTeaAlmanacStore();

    await store.fetchEntries("Japan", "sencha");

    expect(getMock).toHaveBeenCalledWith("/tea/almanac?country=Japan&q=sencha");
  });

  it("omits an empty filter from the query string", async () => {
    getMock.mockResolvedValue([]);
    const store = useTeaAlmanacStore();

    await store.fetchEntries("China", "");

    expect(getMock).toHaveBeenCalledWith("/tea/almanac?country=China");
  });

  it("surfaces a rejected fetch and clears loading", async () => {
    getMock.mockRejectedValue(
      Object.assign(new Error("no"), { detail: "Couldn't load the almanac." }),
    );
    const store = useTeaAlmanacStore();

    await store.fetchEntries();

    expect(store.error).toContain("Couldn't load");
    expect(store.loading).toBe(false);
  });

  it("ignores a stale response when a newer fetch has already started", async () => {
    let resolveFirst: (v: AlmanacEntryView[]) => void = () => {};
    const first = new Promise<AlmanacEntryView[]>((resolve) => {
      resolveFirst = resolve;
    });
    getMock.mockReturnValueOnce(first);
    const store = useTeaAlmanacStore();

    const firstCall = store.fetchEntries("", "lon");
    getMock.mockResolvedValueOnce([
      entry({ catalogue_node_id: "green.japanese.sencha" }),
    ]);
    const secondCall = store.fetchEntries("", "longjing");
    await secondCall;
    resolveFirst([entry()]);
    await firstCall;

    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].catalogue_node_id).toBe("green.japanese.sencha");
  });

  it("fetchEntry adds a new entry to the list", async () => {
    getMock.mockResolvedValue(
      entry({ catalogue_node_id: "green.japanese.matcha" }),
    );
    const store = useTeaAlmanacStore();

    await store.fetchEntry("green.japanese.matcha");

    expect(getMock).toHaveBeenCalledWith("/tea/almanac/green.japanese.matcha");
    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].catalogue_node_id).toBe("green.japanese.matcha");
  });

  it("fetchEntry replaces an existing entry with the same id in place", async () => {
    getMock.mockResolvedValue([entry({ country: "China" })]);
    const store = useTeaAlmanacStore();
    await store.fetchEntries();
    getMock.mockResolvedValue(
      entry({ country: "China", summary: "Updated summary" }),
    );

    await store.fetchEntry("green.longjing");

    expect(store.entries).toHaveLength(1);
    expect(store.entries[0].summary).toBe("Updated summary");
  });
});
