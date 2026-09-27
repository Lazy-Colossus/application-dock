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
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock, upload: uploadMock },
}));

import { useTeawareStore } from "./useTeawareStore";
import { blankWare } from "../ware";
import type { Teaware } from "../types";

const POT: Teaware = {
  id: "w-1",
  name: "Zhuni",
  type: "pot",
  material: "clay",
  volume_ml: 110,
  porous: false,
  dedicated_node_id: null,
  maker: "",
  origin: "",
  acquired_date: null,
  price_paid: null,
  notes: "",
  image_url: null,
  retired_at: null,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("useTeawareStore", () => {
  it("fetches the shelf", async () => {
    getMock.mockResolvedValue([POT]);
    const store = useTeawareStore();
    await store.fetchItems();
    expect(getMock).toHaveBeenCalledWith("/tea/teaware");
    expect(store.items).toEqual([POT]);
    expect(store.loading).toBe(false);
  });

  it("empties the shelf and shows the reason when the load fails", async () => {
    getMock.mockRejectedValue(Object.assign(new Error("500"), { detail: "boom" }));
    const store = useTeawareStore();
    store.items = [POT];
    await store.fetchItems();
    expect(store.items).toEqual([]);
    expect(store.error).toBe("boom");
  });

  it("creates, replaces and deletes", async () => {
    const store = useTeawareStore();
    postMock.mockResolvedValue(POT);
    expect(await store.createItem(blankWare())).toEqual(POT);
    expect(postMock).toHaveBeenCalledWith("/tea/teaware", expect.objectContaining({ name: "" }));

    putMock.mockResolvedValue({ ...POT, name: "Renamed" });
    await store.replaceItem("w-1", { ...blankWare(), name: "Renamed" });
    expect(store.items[0].name).toBe("Renamed");

    delMock.mockResolvedValue(undefined);
    expect(await store.deleteItem("w-1")).toBe(true);
    expect(store.items).toEqual([]);
  });

  it("keeps a refused write's reason and returns null", async () => {
    postMock.mockRejectedValue(Object.assign(new Error("422"), { detail: "Teaware needs a name" }));
    const store = useTeawareStore();
    expect(await store.createItem(blankWare())).toBeNull();
    expect(store.error).toBe("Teaware needs a name");
    expect(store.saving).toBe(false);
  });

  it("asks for the last-used vessel, and treats a failure as none", async () => {
    const store = useTeawareStore();
    getMock.mockResolvedValueOnce(POT);
    expect(await store.lastUsed("t-1")).toEqual(POT);
    expect(getMock).toHaveBeenCalledWith("/tea/teaware/last-used?tea_id=t-1");
    getMock.mockResolvedValueOnce(null);
    expect(await store.lastUsed(null)).toBeNull();
    expect(getMock).toHaveBeenLastCalledWith("/tea/teaware/last-used");
    getMock.mockRejectedValueOnce(new Error("down"));
    expect(await store.lastUsed("t-1")).toBeNull();
    expect(store.error).toBeNull();
  });

  it("fetches a piece's usage", async () => {
    getMock.mockResolvedValue({ sessions: [], total: 0, off_dedication: 0 });
    const store = useTeawareStore();
    expect(await store.fetchUsage("w-1")).toEqual({ sessions: [], total: 0, off_dedication: 0 });
    expect(getMock).toHaveBeenCalledWith("/tea/teaware/w-1/usage");
  });
});
