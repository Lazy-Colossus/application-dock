import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock, FakeApiError } = vi.hoisted(() => {
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
    delMock: vi.fn(),
    FakeApiError,
  };
});
vi.mock("@/composables/useApi", () => ({
  ApiError: FakeApiError,
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

import { AUTOSAVE_MS, useFloorPlanStore } from "./useFloorPlanStore";
import type { Apartment, ApartmentSummary } from "../types";
import type { PieceDraft } from "../furniture";
import { FLOORS, STRUCTURE, floorBrush, structureBrush } from "../codes";
import { emptyRows } from "../grid";

function apartment(over: Partial<Apartment> = {}): Apartment {
  return {
    id: "a_1",
    name: "Our flat",
    updated_at: null,
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
  // Autosave timers must never fire into a later test.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.useRealTimers();
});

function summary(over: Partial<ApartmentSummary> = {}): ApartmentSummary {
  return {
    id: "a_1",
    name: "Our flat",
    owner: "jake",
    members: ["jake"],
    is_owner: true,
    updated_at: null,
    ...over,
  };
}

describe("useFloorPlanStore", () => {
  it("opens an apartment by id and toggles loading", async () => {
    getMock.mockResolvedValue(apartment());
    const store = useFloorPlanStore();
    const pending = store.openApartment("a_1");
    expect(store.loading).toBe(true);
    await pending;
    expect(store.loading).toBe(false);
    expect(getMock).toHaveBeenCalledWith("/floor-planner/apartments/a_1");
    expect(store.apartment?.id).toBe("a_1");
  });

  it("locks against the rev it holds", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    postMock.mockResolvedValue(
      apartment({ rev: 4, plan_rev: 4, locked: true }),
    );
    expect(await store.lock()).toBe(true);
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/lock",
      {
        base_rev: 3,
      },
    );
    expect(store.apartment?.locked).toBe(true);
  });

  it("checks plan writes against plan_rev, not the document rev", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment({ rev: 9, plan_rev: 2 });
    postMock.mockResolvedValue(
      apartment({ rev: 10, plan_rev: 3, locked: true }),
    );
    await store.lock();
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/lock",
      {
        base_rev: 2,
      },
    );
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
    expect(getMock).toHaveBeenCalledWith("/floor-planner/apartments/a_1");
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

  it("saves the present snapshot against the held rev", async () => {
    const store = drawing();
    store.addLabel(" Hall ", { col: 2, row: 2 });
    putMock.mockResolvedValue(apartment({ rev: 4, plan_rev: 4 }));
    expect(await store.savePlan()).toBe(true);
    const [path, body] = putMock.mock.calls[0];
    expect(path).toBe("/floor-planner/apartments/a_1/plan");
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
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/lock",
      {
        base_rev: 4,
      },
    );
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

describe("autosave", () => {
  const wall = structureBrush(STRUCTURE[0]);

  function drawn() {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    store.applyStroke([{ col: 0, row: 0 }], wall);
    return store;
  }

  it("saves once drawing pauses, restarting the wait on each stroke", async () => {
    const store = drawn();
    putMock.mockResolvedValue(apartment({ rev: 4, plan_rev: 4 }));
    vi.advanceTimersByTime(AUTOSAVE_MS - 100);
    store.applyStroke([{ col: 1, row: 0 }], wall);
    vi.advanceTimersByTime(AUTOSAVE_MS - 100);
    expect(putMock).not.toHaveBeenCalled();
    expect(store.saveState).toBe("unsaved");
    vi.advanceTimersByTime(100);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(store.saveState).toBe("saving");
    await vi.waitFor(() => expect(store.saveState).toBe("saved"));
    expect(putMock.mock.calls[0][1].feature[0].slice(0, 4)).toBe("wlwl");
  });

  it("keeps undo after a save, and saves the undo too", async () => {
    const store = drawn();
    putMock.mockResolvedValueOnce(apartment({ rev: 4, plan_rev: 4 }));
    await store.savePlan();
    expect(store.dirty).toBe(false);
    expect(store.canUndo).toBe(true);
    store.undo();
    expect(store.plan?.feature[0].slice(0, 2)).toBe("..");
    expect(store.dirty).toBe(true);
    putMock.mockResolvedValueOnce(apartment({ rev: 5, plan_rev: 5 }));
    vi.advanceTimersByTime(AUTOSAVE_MS);
    expect(putMock).toHaveBeenCalledTimes(2);
    expect(putMock.mock.calls[1][1].base_rev).toBe(4);
  });

  it("drops a clean history when someone else moves the plan on", async () => {
    const store = drawn();
    putMock.mockResolvedValue(apartment({ rev: 4, plan_rev: 4 }));
    await store.savePlan();
    store.apartment = apartment({ rev: 6, plan_rev: 6 });
    expect(store.canUndo).toBe(false);
    expect(store.saveState).toBeNull();
  });

  it("queues a save behind one in flight instead of racing it", async () => {
    const store = drawn();
    let finish: (a: Apartment) => void = () => {};
    putMock.mockReturnValueOnce(new Promise((r) => (finish = r)));
    const first = store.savePlan();
    store.applyStroke([{ col: 5, row: 5 }], wall);
    const second = store.savePlan();
    expect(putMock).toHaveBeenCalledTimes(1);
    putMock.mockResolvedValueOnce(apartment({ rev: 5, plan_rev: 5 }));
    finish(apartment({ rev: 4, plan_rev: 4 }));
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(putMock).toHaveBeenCalledTimes(2);
    expect(putMock.mock.calls[1][1].base_rev).toBe(4);
  });

  it("stops autosaving after a conflict, and flush refuses to overwrite", async () => {
    const store = drawn();
    putMock.mockRejectedValue(new FakeApiError(409, "dani changed this"));
    getMock.mockResolvedValue(apartment({ rev: 5, plan_rev: 5 }));
    await store.savePlan();
    store.applyStroke([{ col: 2, row: 0 }], wall);
    vi.advanceTimersByTime(AUTOSAVE_MS * 2);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(await store.flush()).toBe(false);
  });
});

describe("apartments", () => {
  it("lists the caller's apartments", async () => {
    getMock.mockResolvedValue([summary(), summary({ id: "a_2" })]);
    const store = useFloorPlanStore();
    expect((await store.fetchApartments()).map((a) => a.id)).toEqual([
      "a_1",
      "a_2",
    ]);
    expect(getMock).toHaveBeenCalledWith("/floor-planner/apartments");
  });

  it("saves pending drawing, then creates and opens a new apartment", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    store.applyStroke([{ col: 0, row: 0 }], structureBrush(STRUCTURE[0]));
    putMock.mockResolvedValue(apartment({ rev: 4, plan_rev: 4 }));
    postMock.mockResolvedValue(apartment({ id: "a_2", name: "Second" }));
    getMock.mockResolvedValue([summary({ id: "a_2", name: "Second" })]);
    expect(await store.createApartment("Second")).toBe("a_2");
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith("/floor-planner/apartments", {
      name: "Second",
    });
    expect(store.apartment?.id).toBe("a_2");
    expect(store.canUndo).toBe(false);
  });

  it("duplicates and renames the open apartment", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    getMock.mockResolvedValue([]);
    postMock.mockResolvedValue(apartment({ id: "a_3" }));
    await store.duplicateApartment("Copy");
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/duplicate",
      { name: "Copy" },
    );
    putMock.mockResolvedValue(apartment({ id: "a_3", name: "B" }));
    expect(await store.renameApartment("B")).toBe(true);
    expect(putMock).toHaveBeenCalledWith("/floor-planner/apartments/a_3/name", {
      name: "B",
    });
  });

  it("deleting and leaving answer with where to go next", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    delMock.mockResolvedValue([summary({ id: "a_2" })]);
    expect(await store.deleteApartment()).toBe("a_2");
    expect(delMock).toHaveBeenCalledWith("/floor-planner/apartments/a_1");
    postMock.mockResolvedValue([summary({ id: "a_4" })]);
    expect(await store.leave()).toBe("a_4");
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/leave",
    );
  });
});

describe("furniture", () => {
  const sofa: PieceDraft = {
    name: "Sofa",
    colour: "grey",
    note: "",
    shape: "rectangle",
    width_cm: 220,
    depth_cm: 95,
    cells: null,
  };

  it("adds a whole bulk list in one call", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    postMock.mockResolvedValue(apartment({ rev: 4 }));
    await store.addPieces([sofa, { ...sofa, name: "Chair" }]);
    expect(postMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/furniture",
      {
        pieces: [sofa, { ...sofa, name: "Chair" }],
      },
    );
  });

  it("reloads when the piece being edited is gone", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    putMock.mockRejectedValue(
      new FakeApiError(404, "That piece is gone — someone deleted it"),
    );
    getMock.mockResolvedValue(apartment({ rev: 5 }));
    expect(await store.updatePiece("f_1", sofa)).toBe(false);
    expect(store.error).toBe("That piece is gone — someone deleted it");
    expect(store.apartment?.rev).toBe(5);
  });

  it("deletes by id", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    delMock.mockResolvedValue(apartment());
    await store.deletePiece("f_1");
    expect(delMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/furniture/f_1",
    );
  });

  it("counts the layouts a piece is placed in", () => {
    const store = useFloorPlanStore();
    const at = { furniture_id: "f_1", x_cm: 0, y_cm: 0, rotation: 0 as const };
    store.apartment = apartment({
      layouts: [
        { id: "l_a", name: "A", placements: [at] },
        { id: "l_b", name: "B", placements: [] },
        { id: "l_c", name: "C", placements: [at] },
      ],
    });
    expect(store.placedIn("f_1")).toBe(2);
    expect(store.placedIn("f_2")).toBe(0);
  });

  it("leaves an open plan drawing alone", async () => {
    const store = useFloorPlanStore();
    store.apartment = apartment();
    store.applyStroke([{ col: 0, row: 0 }], structureBrush(STRUCTURE[0]));
    postMock.mockResolvedValue(apartment({ rev: 4 }));
    await store.addPieces([sofa]);
    expect(store.dirty).toBe(true);
    expect(store.plan?.feature[0].slice(0, 2)).toBe("wl");
  });
});

describe("layouts and placements", () => {
  const spot = { x_cm: 100, y_cm: 200, rotation: 90 as const };

  function arranged() {
    const store = useFloorPlanStore();
    store.apartment = apartment({
      locked: true,
      layouts: [
        {
          id: "l_a",
          name: "Layout A",
          placements: [
            { furniture_id: "f_bed", x_cm: 0, y_cm: 0, rotation: 0 },
          ],
        },
      ],
    });
    return store;
  }

  it("moves a piece on screen before the server answers", async () => {
    const store = arranged();
    let answer: (a: Apartment) => void = () => {};
    putMock.mockReturnValue(new Promise<Apartment>((r) => (answer = r)));
    const pending = store.placePiece("l_a", "f_sofa", spot);
    expect(store.apartment?.layouts[0].placements).toEqual([
      { furniture_id: "f_bed", x_cm: 0, y_cm: 0, rotation: 0 },
      { furniture_id: "f_sofa", ...spot },
    ]);
    expect(putMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/layouts/l_a/placements/f_sofa",
      spot,
    );
    answer(store.apartment!);
    expect(await pending).toBe(true);
  });

  it("snaps back to the server's truth when a move is refused", async () => {
    const store = arranged();
    putMock.mockRejectedValue(
      new FakeApiError(422, "Keep the piece on the plan"),
    );
    getMock.mockResolvedValue(
      apartment({ layouts: [{ id: "l_a", name: "Layout A", placements: [] }] }),
    );
    expect(await store.placePiece("l_a", "f_sofa", spot)).toBe(false);
    expect(store.error).toBe("Keep the piece on the plan");
    expect(store.apartment?.layouts[0].placements).toEqual([]);
  });

  it("sends a piece back to the tray at once", async () => {
    const store = arranged();
    delMock.mockResolvedValue(store.apartment);
    const pending = store.removePlacement("l_a", "f_bed");
    expect(store.apartment?.layouts[0].placements).toEqual([]);
    await pending;
    expect(delMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/layouts/l_a/placements/f_bed",
    );
  });

  it("names a new layout after the first free letter", () => {
    const store = arranged();
    expect(store.nextLayoutName()).toBe("Layout B");
    store.apartment!.layouts.push({
      id: "l_c",
      name: "Layout B",
      placements: [],
    });
    expect(store.nextLayoutName()).toBe("Layout C");
  });

  it("calls the layout routes", async () => {
    const store = arranged();
    postMock.mockResolvedValue(store.apartment);
    putMock.mockResolvedValue(store.apartment);
    delMock.mockResolvedValue(store.apartment);
    await store.createLayout("Layout B");
    await store.renameLayout("l_a", "Window");
    await store.duplicateLayout("l_a");
    await store.deleteLayout("l_a");
    expect(postMock.mock.calls.map((c) => c[0])).toEqual([
      "/floor-planner/apartments/a_1/layouts",
      "/floor-planner/apartments/a_1/layouts/l_a/duplicate",
    ]);
    expect(putMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/layouts/l_a",
      {
        name: "Window",
      },
    );
    expect(delMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/layouts/l_a",
    );
  });
});
