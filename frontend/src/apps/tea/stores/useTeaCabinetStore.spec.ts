import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock, uploadMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  uploadMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {
    status = 0;
    detail = "";
  },
  api: { get: getMock, post: postMock, put: putMock, del: delMock, upload: uploadMock },
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
    image_url: null,
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
  uploadMock.mockReset();
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

  it("a fetch failing after a successful one clears the stale list, not just the error", async () => {
    getMock.mockResolvedValueOnce([tea()]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    expect(store.teas).toHaveLength(1);

    getMock.mockRejectedValueOnce(Object.assign(new Error("boom"), { detail: "Server exploded" }));
    await store.fetchTeas();

    expect(store.teas).toEqual([]);
    expect(store.error).not.toBeNull();
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

    expect(store.teas).toHaveLength(1);
    expect(store.teas[0].grams_remaining).toBe(38);
    expect(store.error).toContain("only bought");
  });

  it("setGrams on an unknown id does nothing and sets no error", async () => {
    const store = useTeaCabinetStore();
    await store.setGrams("t-nope", 10);
    expect(putMock).not.toHaveBeenCalled();
    expect(store.error).toBeNull();
  });

  it("uploadImage swaps the tea in place with the server's response", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1", image_url: null })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });
    uploadMock.mockResolvedValue(tea({ id: "t-1", image_url: "/api/tea/teas/t-1/image" }));

    await store.uploadImage("t-1", file);

    expect(uploadMock).toHaveBeenCalledWith("/tea/teas/t-1/image", file);
    expect(store.teas[0].image_url).toBe("/api/tea/teas/t-1/image");
    expect(store.error).toBeNull();
  });

  it("uploadImage routes a rejected upload into error and leaves the tea untouched", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1", image_url: null })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    uploadMock.mockRejectedValue(
      Object.assign(new Error("nope"), { detail: "Only JPEG, PNG, WebP, or GIF" }),
    );

    await store.uploadImage("t-1", new File(["bytes"], "doc.pdf"));

    expect(store.teas[0].image_url).toBeNull();
    expect(store.error).toContain("Only JPEG");
  });

  it("removeImage clears the tea's image_url", async () => {
    getMock.mockResolvedValue([tea({ id: "t-1", image_url: "/api/tea/teas/t-1/image" })]);
    const store = useTeaCabinetStore();
    await store.fetchTeas();
    delMock.mockResolvedValue(tea({ id: "t-1", image_url: null }));

    await store.removeImage("t-1");

    expect(delMock).toHaveBeenCalledWith("/tea/teas/t-1/image");
    expect(store.teas[0].image_url).toBeNull();
    expect(store.error).toBeNull();
  });
});
