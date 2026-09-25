import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {
    status = 0;
    detail = "";
  },
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

import { useTeaCabinetStore } from "./useTeaCabinetStore";
import type { Tea } from "@/apps/tea/types";

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Da Hong Pao",
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
  delMock.mockReset();
});

describe("useTeaCabinetStore", () => {
  it("fetchTeas loads the shelf and clears loading", async () => {
    getMock.mockResolvedValue([tea()]);
    const store = useTeaCabinetStore();

    await store.fetchTeas();

    expect(getMock).toHaveBeenCalledWith("/tea/teas");
    expect(store.teas).toHaveLength(1);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("fetchTeas routes a failure into error and still clears loading", async () => {
    getMock.mockRejectedValue(Object.assign(new Error("boom"), { detail: "Server exploded" }));
    const store = useTeaCabinetStore();

    await store.fetchTeas();

    expect(store.loading).toBe(false);
    expect(store.error).not.toBeNull();
    expect(store.teas).toEqual([]);
  });

  it("clears a previous error when a later fetch succeeds", async () => {
    const store = useTeaCabinetStore();
    getMock.mockRejectedValueOnce(new Error("boom"));
    await store.fetchTeas();
    getMock.mockResolvedValueOnce([tea()]);

    await store.fetchTeas();

    expect(store.error).toBeNull();
  });

  it("createTea appends the created tea", async () => {
    const store = useTeaCabinetStore();
    postMock.mockResolvedValue(tea({ id: "t-new" }));

    await store.createTea({ name: "New", catalogue_node_id: "oolong" } as never);

    expect(postMock).toHaveBeenCalledWith("/tea/teas", expect.anything());
    expect(store.teas.map((t) => t.id)).toEqual(["t-new"]);
  });

  it("replaceTea swaps the tea in place", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1", name: "Old" })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    putMock.mockResolvedValue(tea({ id: "t-1", name: "New" }));

    await store.replaceTea("t-1", { name: "New" } as never);

    expect(store.teas[0].name).toBe("New");
  });

  it("deleteTea removes it from the shelf", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1" }), tea({ id: "t-2" })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    delMock.mockResolvedValue(undefined);

    await store.deleteTea("t-1");

    expect(store.teas.map((t) => t.id)).toEqual(["t-2"]);
  });

  it("setGrams updates the rim before the server answers", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1", grams_remaining: 38 })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();

    let resolve: (value: Tea) => void = () => {};
    putMock.mockReturnValue(new Promise<Tea>((r) => (resolve = r)));

    const pending = store.setGrams("t-1", 31);
    expect(store.teas[0].grams_remaining).toBe(31);

    resolve(tea({ id: "t-1", grams_remaining: 31 }));
    await pending;
    expect(store.teas[0].grams_remaining).toBe(31);
  });

  it("setGrams rolls the rim back when the write is rejected", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1", grams_remaining: 38 })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    putMock.mockRejectedValue(
      Object.assign(new Error("nope"), { detail: "You've only bought 100g of this." }),
    );

    await store.setGrams("t-1", 500);

    expect(store.teas[0].grams_remaining).toBe(38);
    expect(store.error).toContain("only bought");
  });

  it("setGrams on an unknown id does nothing and sets no error", async () => {
    const store = useTeaCabinetStore();
    await store.setGrams("t-nope", 10);
    expect(putMock).not.toHaveBeenCalled();
    expect(store.error).toBeNull();
  });
});
