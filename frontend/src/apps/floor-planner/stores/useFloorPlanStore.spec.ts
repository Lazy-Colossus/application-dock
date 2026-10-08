import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(`${status}: ${detail}`);
    }
  }
  return { getMock: vi.fn(), postMock: vi.fn(), FakeApiError };
});
vi.mock("@/composables/useApi", () => ({
  ApiError: FakeApiError,
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));

import { useFloorPlanStore } from "./useFloorPlanStore";
import type { Apartment } from "../types";

function apartment(over: Partial<Apartment> = {}): Apartment {
  return {
    id: "a_1",
    owner: "jake",
    members: ["dani", "jake"],
    is_owner: true,
    rev: 3,
    cols: 50,
    rows: 40,
    surface: [],
    feature: [],
    labels: [],
    locked: false,
    furniture: [],
    layouts: [{ id: "l_1", name: "Layout A", placements: [] }],
    ...over,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("useFloorPlanStore", () => {
  it("fetches the apartment and toggles loading", async () => {
    getMock.mockResolvedValue(apartment());
    const store = useFloorPlanStore();
    const pending = store.fetchApartment();
    expect(store.loading).toBe(true);
    await pending;
    expect(store.loading).toBe(false);
    expect(store.apartment?.id).toBe("a_1");
  });

  it("locks against the rev it holds", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    postMock.mockResolvedValue(apartment({ rev: 4, locked: true }));
    expect(await store.lock()).toBe(true);
    expect(postMock).toHaveBeenCalledWith("/floor-planner/apartment/lock", {
      base_rev: 3,
    });
    expect(store.apartment?.locked).toBe(true);
  });

  it("turns a stale write into a notice and reloads", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    postMock.mockRejectedValue(new FakeApiError(409, "dani changed this"));
    getMock.mockResolvedValue(apartment({ rev: 4, locked: true }));
    expect(await store.unlock()).toBe(false);
    expect(store.notice).toBe("dani changed this, reloaded");
    expect(store.error).toBeNull();
    expect(store.apartment?.rev).toBe(4);
  });

  it("shows any other refusal as an error and still reloads", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    postMock.mockRejectedValue(
      new FakeApiError(422, "There's no one called 'zed'"),
    );
    getMock.mockResolvedValue(apartment());
    expect(await store.addMember("zed")).toBe(false);
    expect(store.error).toBe("There's no one called 'zed'");
    expect(store.notice).toBeNull();
    expect(getMock).toHaveBeenCalledWith("/floor-planner/apartment");
  });
});
