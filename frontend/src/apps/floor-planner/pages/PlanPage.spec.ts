import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const {
  getMock,
  postMock,
  putMock,
  delMock,
  leaveGuards,
  updateGuards,
  routerMock,
  routeParams,
} = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  leaveGuards: [] as (() => Promise<boolean>)[],
  updateGuards: [] as (() => Promise<boolean>)[],
  routerMock: { push: vi.fn(), replace: vi.fn() },
  routeParams: { apartmentId: "a_1" } as { apartmentId?: string },
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  onBeforeRouteLeave: (guard: () => Promise<boolean>) =>
    leaveGuards.push(guard),
  onBeforeRouteUpdate: (guard: () => Promise<boolean>) =>
    updateGuards.push(guard),
  useRoute: () => ({ params: routeParams }),
  useRouter: () => routerMock,
}));

import PlanPage from "./PlanPage.vue";
import { emptyRows } from "../grid";
import { useFloorPlanStore } from "../stores/useFloorPlanStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Apartment, ApartmentSummary, Furniture } from "../types";

function apartment(over: Partial<Apartment> = {}): Apartment {
  return {
    id: "a_1",
    name: "Our flat",
    updated_at: null,
    owner: "jake",
    members: ["dani", "jake"],
    is_owner: true,
    rev: 2,
    plan_rev: 2,
    cols: 50,
    rows: 40,
    surface: emptyRows(50, 40),
    feature: emptyRows(50, 40),
    labels: [],
    locked: false,
    furniture: [],
    layouts: [],
    ...over,
  };
}

function summary(a: Apartment): ApartmentSummary {
  const { id, name, owner, members, is_owner, updated_at } = a;
  return { id, name, owner, members, is_owner, updated_at };
}

async function page(a: Apartment = apartment(), others: Apartment[] = []) {
  useAuthStore().username = "jake";
  getMock.mockImplementation((path: string) => {
    if (path === "/auth/users") return Promise.resolve({ usernames: [] });
    if (path === "/floor-planner/apartments")
      return Promise.resolve([a, ...others].map(summary));
    const found = [a, ...others].find((x) => path.endsWith(`/${x.id}`));
    return Promise.resolve(found ?? a);
  });
  const wrapper = mount(PlanPage);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.restoreAllMocks();
  leaveGuards.length = 0;
  updateGuards.length = 0;
  routeParams.apartmentId = "a_1";
  // Autosave timers must never fire into a later test.
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
  } as DOMRect);
});

afterEach(() => {
  vi.useRealTimers();
});

/** The middle of a square at 100 %: 32 px of ruler, then 16 px per square. */
const at = (col: number, row: number) => ({
  clientX: 32 + col * 16 + 8,
  clientY: 32 + row * 16 + 8,
  pointerId: 1,
});

async function drawWall(wrapper: Awaited<ReturnType<typeof page>>) {
  await wrapper.get("[data-testid=brush-wall]").trigger("click");
  const svg = wrapper.get("[data-testid=plan-canvas]");
  await svg.trigger("pointerdown", at(0, 0));
  await svg.trigger("pointermove", at(3, 0));
  await svg.trigger("pointerup", at(3, 0));
}

describe("PlanPage", () => {
  it("shows design B's frame with Draw plan selected", async () => {
    const wrapper = await page();
    expect(
      wrapper.get("[data-testid=mode-draw]").attributes("aria-selected"),
    ).toBe("true");
    for (const id of ["fp-left", "fp-plan", "fp-right"]) {
      expect(wrapper.find(`[data-testid=${id}]`).exists()).toBe(true);
    }
    expect(wrapper.text()).toContain("1 square = 20 cm");
  });

  it("switches mode", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=mode-furniture]").trigger("click");
    expect(
      wrapper.get("[data-testid=mode-furniture]").attributes("aria-selected"),
    ).toBe("true");
    expect(
      wrapper.get("[data-testid=mode-draw]").attributes("aria-selected"),
    ).toBe("false");
  });

  it("locks an unlocked plan against its rev", async () => {
    const wrapper = await page();
    expect(wrapper.get("[data-testid=lock-chip]").text()).toBe("Unlocked");
    postMock.mockResolvedValue(
      apartment({ rev: 3, plan_rev: 3, locked: true }),
    );
    await wrapper.get("[data-testid=lock-toggle]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/lock",
      {
        base_rev: 2,
      },
    );
    expect(wrapper.get("[data-testid=lock-chip]").text()).toBe("Plan locked");
    expect(wrapper.get("[data-testid=lock-toggle]").text()).toBe("Unlock");
  });

  it("offers Unlock on a locked plan", async () => {
    const wrapper = await page(apartment({ locked: true }));
    postMock.mockResolvedValue(apartment({ rev: 3, plan_rev: 3 }));
    await wrapper.get("[data-testid=lock-toggle]").trigger("click");
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/unlock",
      {
        base_rev: 2,
      },
    );
  });

  it("shows the reload notice", async () => {
    const wrapper = await page();
    useFloorPlanStore().notice = "dani changed this, reloaded";
    await flushPromises();
    expect(wrapper.get("[data-testid=fp-notice]").text()).toContain(
      "dani changed this",
    );
  });

  it("opens the members dialog from the avatars", async () => {
    const wrapper = await page();
    expect(wrapper.find("[data-testid=members-dialog]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=members-open]").text()).toBe("DJ");
    await wrapper.get("[data-testid=members-open]").trigger("click");
    await flushPromises();
    expect(wrapper.find("[data-testid=members-dialog]").exists()).toBe(true);
  });

  it("shows the brushes only while drawing", async () => {
    const wrapper = await page();
    expect(wrapper.find("[data-testid=draw-panel]").exists()).toBe(true);
    await wrapper.get("[data-testid=mode-furniture]").trigger("click");
    expect(wrapper.find("[data-testid=draw-panel]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=plan-canvas]").exists()).toBe(true);
  });

  it("saves a drawn stroke", async () => {
    const wrapper = await page();
    await drawWall(wrapper);
    putMock.mockResolvedValue(apartment({ rev: 3, plan_rev: 3 }));
    await wrapper.get("[data-testid=save]").trigger("click");
    await flushPromises();
    const [path, body] = putMock.mock.calls[0];
    expect(path).toBe("/floor-planner/apartments/a_1/plan");
    expect(body.feature[0].slice(0, 8)).toBe("wlwlwlwl");
    expect(body.base_rev).toBe(2);
  });

  it("saves unsaved drawing before locking", async () => {
    const wrapper = await page();
    await drawWall(wrapper);
    putMock.mockResolvedValue(apartment({ rev: 3, plan_rev: 3 }));
    postMock.mockResolvedValue(
      apartment({ rev: 4, plan_rev: 4, locked: true }),
    );
    await wrapper.get("[data-testid=lock-toggle]").trigger("click");
    await flushPromises();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/lock",
      {
        base_rev: 3,
      },
    );
  });

  it("can't draw on a locked plan", async () => {
    const wrapper = await page(apartment({ locked: true }));
    expect(wrapper.find("[data-testid=draw-locked]").exists()).toBe(true);
    const svg = wrapper.get("[data-testid=plan-canvas]");
    await svg.trigger("pointerdown", at(0, 0));
    await svg.trigger("pointerup", at(0, 0));
    expect(useFloorPlanStore().dirty).toBe(false);
  });

  it("undoes with Cmd+Z and redoes with Shift+Cmd+Z", async () => {
    const wrapper = await page();
    await drawWall(wrapper);
    const store = useFloorPlanStore();
    await wrapper.trigger("keydown", { key: "z", metaKey: true });
    expect(store.dirty).toBe(false);
    await wrapper.trigger("keydown", {
      key: "z",
      metaKey: true,
      shiftKey: true,
    });
    expect(store.dirty).toBe(true);
  });

  it("saves the drawing before leaving, and asks only if that fails", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const wrapper = await page();
    expect(await leaveGuards[0]()).toBe(true);
    await drawWall(wrapper);
    putMock.mockResolvedValueOnce(apartment({ rev: 3, plan_rev: 3 }));
    expect(await updateGuards[0]()).toBe(true);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(confirm).not.toHaveBeenCalled();
    await drawWall(wrapper);
    await wrapper.get("[data-testid=brush-eraser]").trigger("click");
    await drawWall(wrapper);
    putMock.mockRejectedValueOnce(new Error("offline"));
    expect(await leaveGuards[0]()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  describe("apartments", () => {
    it("opens the most recent apartment when the URL names none", async () => {
      routeParams.apartmentId = undefined;
      await page();
      expect(routerMock.replace).toHaveBeenCalledWith({
        name: "floor-planner",
        params: { apartmentId: "a_1" },
      });
    });

    it("lists apartments and switches to another", async () => {
      const wrapper = await page(apartment(), [
        apartment({ id: "a_2", name: "Summer flat" }),
      ]);
      expect(wrapper.get(".apartment-menu__name").text()).toBe("Our flat");
      await wrapper.get("[data-testid=apartment-a_2]").trigger("click");
      expect(routerMock.push).toHaveBeenCalledWith({
        name: "floor-planner",
        params: { apartmentId: "a_2" },
      });
    });

    it("creates a new apartment through the name dialog and goes there", async () => {
      const wrapper = await page();
      const store = useFloorPlanStore();
      await wrapper.get("[data-testid=apartment-new]").trigger("click");
      postMock.mockResolvedValue(apartment({ id: "a_9", name: "Second" }));
      await wrapper.get("[data-testid=name-text]").setValue("Second");
      await wrapper.get("form").trigger("submit");
      await flushPromises();
      expect(postMock).toHaveBeenCalledWith("/floor-planner/apartments", {
        name: "Second",
      });
      expect(store.apartment?.id).toBe("a_9");
      expect(routerMock.push).toHaveBeenCalledWith({
        name: "floor-planner",
        params: { apartmentId: "a_9" },
      });
    });

    it("deletes after confirming and goes to the next one", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const wrapper = await page();
      delMock.mockResolvedValue([
        summary(apartment({ id: "a_2", name: "Left" })),
      ]);
      await wrapper.get("[data-testid=apartment-delete]").trigger("click");
      await flushPromises();
      expect(delMock).toHaveBeenCalledWith("/floor-planner/apartments/a_1");
      expect(routerMock.replace).toHaveBeenCalledWith({
        name: "floor-planner",
        params: { apartmentId: "a_2" },
      });
    });
  });

  it("adds a room label through the dialog", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=brush-label]").trigger("click");
    await wrapper
      .get("[data-testid=plan-canvas]")
      .trigger("pointerdown", at(5, 5));
    await wrapper.get("[data-testid=name-text]").setValue("Hall");
    await wrapper.get("[data-testid=name-dialog] form").trigger("submit");
    expect(useFloorPlanStore().plan?.labels).toMatchObject([
      { text: "Hall", col: 5, row: 5 },
    ]);
    expect(wrapper.find("[data-testid=name-dialog]").exists()).toBe(false);
  });

  describe("furniture mode", () => {
    const sofa: Furniture = {
      id: "f_1",
      name: "Sofa",
      colour: "grey",
      note: "",
      shape: "rectangle",
      width_cm: 220,
      depth_cm: 95,
      cells: null,
    };

    async function furniture(a: Apartment = apartment({ furniture: [sofa] })) {
      const wrapper = await page(a);
      await wrapper.get("[data-testid=mode-furniture]").trigger("click");
      return wrapper;
    }

    it("shows the list and a hint until something is chosen", async () => {
      const wrapper = await furniture();
      expect(wrapper.find("[data-testid=furniture-list]").exists()).toBe(true);
      expect(wrapper.find("[data-testid=piece-hint]").exists()).toBe(true);
      expect(wrapper.find("[data-testid=draw-panel]").exists()).toBe(false);
    });

    it("adds a piece and selects it", async () => {
      const wrapper = await furniture(apartment());
      await wrapper.get("[data-testid=piece-add]").trigger("click");
      await wrapper.get("[data-testid=piece-name]").setValue("Desk");
      postMock.mockResolvedValue(
        apartment({ furniture: [{ ...sofa, id: "f_9", name: "Desk" }] }),
      );
      await wrapper.get("[data-testid=piece-form]").trigger("submit");
      await flushPromises();
      expect(postMock).toHaveBeenCalledWith(
        "/floor-planner/apartments/a_1/furniture",
        {
          pieces: [
            expect.objectContaining({ name: "Desk", shape: "rectangle" }),
          ],
        },
      );
      expect(
        wrapper.get("[data-testid=piece-f_9]").attributes("aria-pressed"),
      ).toBe("true");
    });

    it("edits the selected piece", async () => {
      const wrapper = await furniture();
      await wrapper.get("[data-testid=piece-f_1]").trigger("click");
      await wrapper.get("[data-testid=colour-blue]").trigger("click");
      putMock.mockResolvedValue(
        apartment({ furniture: [{ ...sofa, colour: "blue" }] }),
      );
      await wrapper.get("[data-testid=piece-form]").trigger("submit");
      expect(putMock).toHaveBeenCalledWith(
        "/floor-planner/apartments/a_1/furniture/f_1",
        expect.objectContaining({ colour: "blue" }),
      );
    });

    it("deletes after confirming and clears the selection", async () => {
      vi.spyOn(window, "confirm").mockReturnValue(true);
      const wrapper = await furniture();
      await wrapper.get("[data-testid=piece-f_1]").trigger("click");
      delMock.mockResolvedValue(apartment());
      await wrapper.get("[data-testid=piece-delete]").trigger("click");
      await flushPromises();
      expect(delMock).toHaveBeenCalledWith(
        "/floor-planner/apartments/a_1/furniture/f_1",
      );
      expect(wrapper.find("[data-testid=piece-hint]").exists()).toBe(true);
    });

    it("bulk adds only the lines that parse", async () => {
      const wrapper = await furniture(apartment());
      await wrapper.get("[data-testid=piece-bulk]").trigger("click");
      await wrapper
        .get("[data-testid=bulk-text]")
        .setValue(
          "Sofa; rectangle; 220 x 95; grey\nRug; square; 200 x 200; grey\nLamp; round; 40; yellow",
        );
      postMock.mockResolvedValue(apartment());
      await wrapper.get("[data-testid=bulk-add]").trigger("click");
      await flushPromises();
      const body = postMock.mock.calls[0][1] as { pieces: { name: string }[] };
      expect(body.pieces.map((p) => p.name)).toEqual(["Sofa", "Lamp"]);
      expect(wrapper.find("[data-testid=bulk-dialog]").exists()).toBe(false);
    });
  });

  describe("arrange mode", () => {
    const sofa: Furniture = {
      id: "f_sofa",
      name: "Sofa",
      colour: "grey",
      note: "",
      shape: "rectangle",
      width_cm: 100,
      depth_cm: 40,
      cells: null,
    };
    const bed: Furniture = { ...sofa, id: "f_bed", name: "Bed" };

    function arranged(over: Partial<Apartment> = {}) {
      const surface = Array.from({ length: 40 }, () => "w1".repeat(50));
      return apartment({
        locked: true,
        surface,
        furniture: [sofa, bed],
        layouts: [
          {
            id: "l_a",
            name: "Layout A",
            placements: [
              { furniture_id: "f_bed", x_cm: 200, y_cm: 200, rotation: 0 },
            ],
          },
        ],
        ...over,
      });
    }

    async function arrange(a: Apartment = arranged()) {
      const wrapper = await page(a);
      await wrapper.get("[data-testid=mode-arrange]").trigger("click");
      return wrapper;
    }

    it("asks for a locked plan, and locks from the tray", async () => {
      const wrapper = await arrange(arranged({ locked: false }));
      expect(wrapper.find("[data-testid=tray-lock]").exists()).toBe(true);
      postMock.mockResolvedValue(arranged());
      await wrapper.get("[data-testid=tray-lock] button").trigger("click");
      await flushPromises();
      expect(postMock).toHaveBeenCalledWith(
        "/floor-planner/apartments/a_1/lock",
        {
          base_rev: 2,
        },
      );
    });

    it("lists the tray and places a dropped piece centred under the cursor", async () => {
      const wrapper = await arrange();
      expect(wrapper.find("[data-testid=tray-f_sofa]").exists()).toBe(true);
      expect(wrapper.find("[data-testid=tray-f_bed]").exists()).toBe(false);
      putMock.mockResolvedValue(
        arranged({
          layouts: [
            {
              id: "l_a",
              name: "Layout A",
              placements: [
                { furniture_id: "f_bed", x_cm: 200, y_cm: 200, rotation: 0 },
                { furniture_id: "f_sofa", x_cm: 250, y_cm: 100, rotation: 0 },
              ],
            },
          ],
        }),
      );
      const dataTransfer = {
        types: ["application/x-fp-piece"],
        getData: () => "f_sofa",
      };
      // Plan point (303, 122) cm at 100 %: the 40 cm ruler, then 0.8 px per cm.
      await wrapper.get("[data-testid=plan-canvas]").trigger("drop", {
        clientX: (40 + 303) * 0.8,
        clientY: (40 + 122) * 0.8,
        dataTransfer,
      });
      expect(putMock).toHaveBeenCalledWith(
        "/floor-planner/apartments/a_1/layouts/l_a/placements/f_sofa",
        { x_cm: 250, y_cm: 100, rotation: 0 },
      );
      expect(wrapper.find("[data-testid=placement-inspector]").exists()).toBe(
        true,
      );
    });

    it("rotates the selected piece with R and sends it back to the tray", async () => {
      const wrapper = await arrange();
      await wrapper.get("[data-testid=on-plan-f_bed]").trigger("click");
      putMock.mockResolvedValue(arranged());
      await wrapper.trigger("keydown", { key: "r" });
      expect(putMock).toHaveBeenCalledWith(
        "/floor-planner/apartments/a_1/layouts/l_a/placements/f_bed",
        { furniture_id: "f_bed", x_cm: 200, y_cm: 200, rotation: 90 },
      );
      delMock.mockResolvedValue(arranged());
      await wrapper.get("[data-testid=back-to-tray]").trigger("click");
      expect(delMock).toHaveBeenCalledWith(
        "/floor-planner/apartments/a_1/layouts/l_a/placements/f_bed",
      );
      expect(wrapper.find("[data-testid=arrange-hint]").exists()).toBe(true);
    });

    it("warns about a piece across a wall in the inspector", async () => {
      const feature = Array.from({ length: 40 }, () => "..".repeat(50));
      feature[11] = "wl".repeat(50);
      const wrapper = await arrange(arranged({ feature }));
      await wrapper.get("[data-testid=on-plan-f_bed]").trigger("click");
      expect(wrapper.get("[data-testid=inspector-warnings]").text()).toContain(
        "Overlaps a wall.",
      );
      expect(wrapper.find("[data-testid=piece-warned]").exists()).toBe(true);
    });

    it("creates, duplicates and keeps the last layout", async () => {
      const wrapper = await arrange();
      expect(
        wrapper.get("[data-testid=layout-delete]").attributes("disabled"),
      ).toBeDefined();
      const withB = arranged({
        layouts: [
          { id: "l_a", name: "Layout A", placements: [] },
          { id: "l_b", name: "Layout B", placements: [] },
        ],
      });
      postMock.mockResolvedValue(withB);
      await wrapper.get("[data-testid=layout-create]").trigger("click");
      await flushPromises();
      expect(postMock).toHaveBeenCalledWith(
        "/floor-planner/apartments/a_1/layouts",
        {
          name: "Layout B",
        },
      );
      expect(
        wrapper.get("[data-testid=layout-l_b]").attributes("aria-selected"),
      ).toBe("true");
      postMock.mockResolvedValue(
        arranged({
          layouts: [
            ...withB.layouts,
            { id: "l_c", name: "Layout B copy", placements: [] },
          ],
        }),
      );
      await wrapper.get("[data-testid=layout-duplicate]").trigger("click");
      await flushPromises();
      expect(postMock).toHaveBeenLastCalledWith(
        "/floor-planner/apartments/a_1/layouts/l_b/duplicate",
      );
      expect(
        wrapper.get("[data-testid=layout-l_c]").attributes("aria-selected"),
      ).toBe("true");
    });
  });
});
