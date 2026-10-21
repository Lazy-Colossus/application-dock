import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock },
}));

import { useAmpStore } from "./useAmpStore";
import type { AmpInstance } from "@/apps/amp/types";

function inst(id: string, over: Partial<AmpInstance> = {}): AmpInstance {
  return {
    id,
    name: id,
    module: "Generic",
    running: false,
    state: "Stopped",
    active_users: null,
    max_users: null,
    ...over,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
});

describe("useAmpStore", () => {
  it("fetch loads instances and clears loading", async () => {
    getMock.mockResolvedValue([inst("i1")]);
    const store = useAmpStore();

    await store.fetch();

    expect(getMock).toHaveBeenCalledWith("/amp/instances");
    expect(store.instances).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  it("fetch keeps the last known list and sets error on failure", async () => {
    getMock.mockResolvedValueOnce([inst("i1")]);
    const store = useAmpStore();
    await store.fetch();

    getMock.mockRejectedValueOnce(new Error("AMP down"));
    await store.fetch();

    expect(store.instances).toHaveLength(1);
    expect(store.error).toBe("AMP down");
  });

  it("start posts, refetches, and clears the starting flag", async () => {
    postMock.mockResolvedValue(undefined);
    getMock.mockResolvedValue([inst("i1", { running: true, state: "Running" })]);
    const store = useAmpStore();

    await store.start("i1");

    expect(postMock).toHaveBeenCalledWith("/amp/instances/i1/start");
    expect(getMock).toHaveBeenCalledWith("/amp/instances");
    expect(store.isStarting("i1")).toBe(false);
  });

  it("start sets error and clears the starting flag on failure", async () => {
    postMock.mockRejectedValue(new Error("nope"));
    const store = useAmpStore();

    await store.start("i1");

    expect(store.error).toBe("nope");
    expect(store.isStarting("i1")).toBe(false);
  });
});
