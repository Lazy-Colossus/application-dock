import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly detail: string,
    ) {
      super(`${status}: ${detail}`);
    }
  }
  return {
    getMock: vi.fn(),
    postMock: vi.fn(),
    putMock: vi.fn(),
    FakeApiError,
  };
});
vi.mock("@/composables/useApi", () => ({
  ApiError: FakeApiError,
  api: { get: getMock, post: postMock, put: putMock, del: vi.fn() },
}));

import { useFloorPlanStore } from "./useFloorPlanStore";
import type { Apartment } from "../types";
import { FLOORS, STRUCTURE, floorBrush, structureBrush } from "../codes";
import { emptyRows } from "../grid";

function apartment(over: Partial<Apartment> = {}): Apartment {
  return {
    id: "a_1",
    owner: "jake",
    members: ["dani", "jake"],
    is_owner: true,
    rev: 3,
    plan_rev: 3,
    cols: 50,
    rows: 40,
    surface: emptyRows(50, 40),
    feature: emptyRows(50, 40),
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
    postMock.mockResolvedValue(
      apartment({ rev: 4, plan_rev: 4, locked: true }),
    );
    expect(await store.lock()).toBe(true);
    expect(postMock).toHaveBeenCalledWith("/floor-planner/apartment/lock", {
      base_rev: 3,
    });
    expect(store.apartment?.locked).toBe(true);
  });

  it("checks plan writes against plan_rev, not the document rev", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment({ rev: 9, plan_rev: 2 });
    postMock.mockResolvedValue(
      apartment({ rev: 10, plan_rev: 3, locked: true }),
    );
    await store.lock();
    expect(postMock).toHaveBeenCalledWith("/floor-planner/apartment/lock", {
      base_rev: 2,
    });
  });

  it("turns a stale write into a notice and reloads", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    postMock.mockRejectedValue(new FakeApiError(409, "dani changed this"));
    getMock.mockResolvedValue(apartment({ rev: 4, plan_rev: 4, locked: true }));
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

describe("the plan draft", () => {
  const wall = structureBrush(STRUCTURE[0]);
  const wood = floorBrush(FLOORS[1]);

  function drawing() {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    store.applyStroke(
      [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
      ],
      wall,
    );
    store.applyStroke([{ col: 0, row: 1 }], wood);
    return store;
  }

  it("makes each stroke one undo step", () => {
    const store = drawing();
    expect(store.dirty).toBe(true);
    expect(store.plan?.feature[0].slice(0, 4)).toBe("wlwl");
    store.undo();
    expect(store.plan?.surface[1].slice(0, 2)).toBe("..");
    expect(store.plan?.feature[0].slice(0, 4)).toBe("wlwl");
    store.redo();
    expect(store.plan?.surface[1].slice(0, 2)).toBe("w1");
    store.undo();
    store.undo();
    expect(store.dirty).toBe(false);
    expect(store.canRedo).toBe(true);
  });

  it("saves the present snapshot against the held rev and clears the draft", async () => {
    const store = drawing();
    store.addLabel(" Hall ", { col: 2, row: 2 });
    putMock.mockResolvedValue(apartment({ rev: 4, plan_rev: 4 }));
    expect(await store.savePlan()).toBe(true);
    const [path, body] = putMock.mock.calls[0];
    expect(path).toBe("/floor-planner/apartment/plan");
    expect(body.base_rev).toBe(3);
    expect(body.feature[0].slice(0, 4)).toBe("wlwl");
    expect(body.labels[0]).toMatchObject({ text: "Hall", col: 2, row: 2 });
    expect(store.dirty).toBe(false);
  });

  it("keeps the drawing when someone else saved first", async () => {
    const store = drawing();
    putMock.mockRejectedValue(new FakeApiError(409, "dani changed this"));
    getMock.mockResolvedValue(apartment({ rev: 5, plan_rev: 5 }));
    expect(await store.savePlan()).toBe(false);
    expect(store.notice).toBe(
      "dani changed the plan. Save again to replace it with yours, or Discard to see theirs.",
    );
    expect(store.planConflict).toBe(true);
    expect(store.dirty).toBe(true);
    expect(store.apartment?.rev).toBe(5);

    putMock.mockResolvedValue(apartment({ rev: 6, plan_rev: 6 }));
    await store.savePlan();
    expect(putMock.mock.calls[1][1].base_rev).toBe(5);
  });

  it("discards back to the server plan", () => {
    const store = drawing();
    store.discardDraft();
    expect(store.dirty).toBe(false);
    expect(store.plan?.feature[0].slice(0, 4)).toBe("....");
  });

  it("saves before locking, using the saved rev", async () => {
    const store = drawing();
    putMock.mockResolvedValue(apartment({ rev: 4, plan_rev: 4 }));
    postMock.mockResolvedValue(
      apartment({ rev: 5, plan_rev: 5, locked: true }),
    );
    expect(await store.lockWithSave()).toBe(true);
    expect(postMock).toHaveBeenCalledWith("/floor-planner/apartment/lock", {
      base_rev: 4,
    });
  });

  it("does not lock when the save fails", async () => {
    const store = drawing();
    putMock.mockRejectedValue(new FakeApiError(422, "boom"));
    expect(await store.lockWithSave()).toBe(false);
    expect(postMock).not.toHaveBeenCalled();
    expect(store.error).toBe("boom");
    expect(store.dirty).toBe(true);
  });

  it("drops labels when a resize shrinks past them", () => {
    const store = drawing();
    store.addLabel("Bath", { col: 45, row: 1 });
    store.resizePlan(40, 40);
    expect(store.plan?.labels).toEqual([]);
    expect(store.plan?.surface[0]).toHaveLength(80);
  });
});
