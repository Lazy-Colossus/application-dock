import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, subscribe, closeMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  subscribe: vi.fn(),
  closeMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));
vi.mock("../composables/useShipEvents", () => ({ useShipEvents: subscribe }));

import ShipPage from "./ShipPage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import { emptyGrid } from "../resources";
import type { ShipEventHandlers } from "../composables/useShipEvents";
import type { Ship } from "../types";

function ship(over: Partial<Ship> = {}): Ship {
  const stock = emptyGrid();
  stock.minerals.rare = 1;
  const cost = emptyGrid();
  cost.minerals.rare = 2;
  return {
    id: "s_1",
    owner: "ana",
    members: ["ana"],
    is_owner: true,
    rev: 1,
    stock,
    projects: [
      {
        id: "p-1",
        code: "VB07",
        name: "",
        prerequisite_id: null,
        cost,
        done: false,
      },
    ],
    ...over,
  };
}

let handlers: ShipEventHandlers;

async function page() {
  const auth = useAuthStore();
  auth.username = "ana";
  auth.token = "tok";
  getMock.mockResolvedValue(ship());
  const wrapper = mount(ShipPage, {
    global: {
      stubs: {
        "q-card": { template: '<div class="q-card-stub"><slot /></div>' },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  subscribe.mockImplementation((_token: string, h: ShipEventHandlers) => {
    handlers = h;
    return { close: closeMock };
  });
});

describe("ShipPage", () => {
  it("loads the ship, subscribes, and taps a cell through the stepper", async () => {
    const wrapper = await page();
    expect(subscribe).toHaveBeenCalledWith("tok", expect.any(Object));
    await wrapper.get("[data-testid=cell-minerals-rare]").trigger("click");
    postMock.mockResolvedValue(ship({ rev: 2 }));
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/stock", {
      resource: "minerals",
      tier: "rare",
      delta: 1,
    });
  });

  it("shows the difference and per-project shortfall", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=tab-diff]").trigger("click");
    expect(wrapper.get("[data-testid=cell-minerals-rare]").text()).toBe("-1");
    expect(wrapper.get("[data-testid=shortfall-list]").text()).toContain(
      "VB07",
    );
    expect(wrapper.get("[data-testid=shortfall-list]").text()).toContain(
      "1× Minerály · Vzácny",
    );
  });

  it("warns about short stock before completing", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=tab-needed]").trigger("click");
    await wrapper.get("[data-testid=project-complete-p-1]").trigger("click");
    expect(wrapper.get("[data-testid=confirm-shortfall]").text()).toContain(
      "stop at 0",
    );
    postMock.mockResolvedValue(ship());
    await wrapper.get("[data-testid=confirm-complete-yes]").trigger("click");
    expect(postMock).toHaveBeenCalledWith(
      "/iss-vanguard/ship/projects/p-1/complete",
    );
  });

  it("refetches on a newer remote change and moves ship when closed for me", async () => {
    await page();
    getMock.mockClear();
    handlers.onChanged?.({
      type: "ship.changed",
      ship_id: "s_1",
      rev: 1,
      actor: "bo",
    });
    expect(getMock).not.toHaveBeenCalled();
    handlers.onChanged?.({
      type: "ship.changed",
      ship_id: "s_1",
      rev: 2,
      actor: "bo",
    });
    await flushPromises();
    expect(getMock).toHaveBeenCalledTimes(1);

    handlers.onClosed?.({
      type: "ship.closed",
      ship_id: "s_1",
      reason: "removed",
      member: "bo",
    });
    await flushPromises();
    expect(subscribe).toHaveBeenCalledTimes(1);
    handlers.onClosed?.({
      type: "ship.closed",
      ship_id: "s_1",
      reason: "removed",
      member: "ana",
    });
    await flushPromises();
    expect(closeMock).toHaveBeenCalled();
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it("shows the store error in a banner", async () => {
    const wrapper = await page();
    postMock.mockRejectedValue({ detail: "nope" });
    await wrapper.get("[data-testid=cell-minerals-rare]").trigger("click");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=ship-error]").text()).toContain("nope");
  });
  it("puts every dialog's content on a card, so it never floats over the page", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=cell-minerals-rare]").trigger("click");
    expect(
      wrapper.find(".q-card-stub [data-testid=stock-stepper]").exists(),
    ).toBe(true);
    await wrapper.get("[data-testid=tab-needed]").trigger("click");
    await wrapper.get("[data-testid=project-complete-p-1]").trigger("click");
    expect(
      wrapper.find(".q-card-stub [data-testid=confirm-complete]").exists(),
    ).toBe(true);
  });

  it("separates a project's code from its name in the shortfall list", async () => {
    const named = ship();
    named.projects[0].name = "Reactor";
    getMock.mockResolvedValue(named);
    const wrapper = mount(ShipPage);
    await flushPromises();
    await wrapper.get("[data-testid=tab-diff]").trigger("click");
    expect(wrapper.get("[data-testid=shortfall-list]").text()).toContain(
      "VB07 · Reactor:",
    );
  });
});
