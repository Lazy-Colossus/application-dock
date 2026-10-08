import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));

import PlanPage from "./PlanPage.vue";
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
    surface: [],
    feature: [],
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
});

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
});
