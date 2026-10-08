import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, leaveGuards } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  leaveGuards: [] as (() => boolean)[],
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: vi.fn() },
}));

vi.mock("vue-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("vue-router")>()),
  onBeforeRouteLeave: (guard: () => boolean) => leaveGuards.push(guard),
}));

import PlanPage from "./PlanPage.vue";
import { emptyRows } from "../grid";
import { useFloorPlanStore } from "../stores/useFloorPlanStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Apartment } from "../types";

function apartment(over: Partial<Apartment> = {}): Apartment {
  return {
    id: "a_1",
    owner: "jake",
    members: ["dani", "jake"],
    is_owner: true,
    rev: 2,
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

async function page(a: Apartment = apartment()) {
  useAuthStore().username = "jake";
  getMock.mockImplementation((path: string) =>
    path === "/auth/users"
      ? Promise.resolve({ usernames: [] })
      : Promise.resolve(a),
  );
  const wrapper = mount(PlanPage);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.restoreAllMocks();
  leaveGuards.length = 0;
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
  } as DOMRect);
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
    postMock.mockResolvedValue(apartment({ rev: 3, locked: true }));
    await wrapper.get("[data-testid=lock-toggle]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith("/floor-planner/apartment/lock", {
      base_rev: 2,
    });
    expect(wrapper.get("[data-testid=lock-chip]").text()).toBe("Plan locked");
    expect(wrapper.get("[data-testid=lock-toggle]").text()).toBe("Unlock");
  });

  it("offers Unlock on a locked plan", async () => {
    const wrapper = await page(apartment({ locked: true }));
    postMock.mockResolvedValue(apartment({ rev: 3 }));
    await wrapper.get("[data-testid=lock-toggle]").trigger("click");
    expect(postMock).toHaveBeenCalledWith("/floor-planner/apartment/unlock", {
      base_rev: 2,
    });
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
    putMock.mockResolvedValue(apartment({ rev: 3 }));
    await wrapper.get("[data-testid=save]").trigger("click");
    await flushPromises();
    const [path, body] = putMock.mock.calls[0];
    expect(path).toBe("/floor-planner/apartment/plan");
    expect(body.feature[0].slice(0, 8)).toBe("wlwlwlwl");
    expect(body.base_rev).toBe(2);
  });

  it("saves unsaved drawing before locking", async () => {
    const wrapper = await page();
    await drawWall(wrapper);
    putMock.mockResolvedValue(apartment({ rev: 3 }));
    postMock.mockResolvedValue(apartment({ rev: 4, locked: true }));
    await wrapper.get("[data-testid=lock-toggle]").trigger("click");
    await flushPromises();
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(postMock).toHaveBeenCalledWith("/floor-planner/apartment/lock", {
      base_rev: 3,
    });
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

  it("asks before leaving only with unsaved drawing", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const wrapper = await page();
    expect(leaveGuards[0]()).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
    await drawWall(wrapper);
    expect(leaveGuards[0]()).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("adds a room label through the dialog", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=brush-label]").trigger("click");
    await wrapper
      .get("[data-testid=plan-canvas]")
      .trigger("pointerdown", at(5, 5));
    await wrapper.get("[data-testid=label-text]").setValue("Hall");
    await wrapper.get("[data-testid=label-dialog]").trigger("submit");
    expect(useFloorPlanStore().plan?.labels).toMatchObject([
      { text: "Hall", col: 5, row: 5 },
    ]);
    expect(wrapper.find("[data-testid=label-dialog]").exists()).toBe(false);
  });
});
