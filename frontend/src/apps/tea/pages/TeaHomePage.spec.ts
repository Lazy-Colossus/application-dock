import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import TeaHomePage from "./TeaHomePage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Cabinet } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function render() {
  return mount(TeaHomePage, { global: { stubs: STUBS } });
}

function mockCabinet(members: string[]) {
  const cabinet: Cabinet = {
    id: members.length > 1 ? "c_1" : null,
    owner: "jakub",
    members,
    is_owner: true,
  };
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/cabinet") return Promise.resolve(cabinet);
    if (path === "/auth/users") return Promise.resolve({ usernames: [] });
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  useAuthStore().username = "jakub";
  mockCabinet(["jakub"]);
});

describe("TeaHomePage", () => {
  it("offers the cabinet, teaware, brewing and the almanac, in that order", () => {
    const labels = render()
      .findAll('[data-testid="tea-home-section"] .tea-home__name')
      .map((n) => n.text());

    expect(labels).toEqual(["Cabinet", "Teaware", "Brew", "Almanac"]);
  });

  it("draws each section's own icon, with just the name beside it", () => {
    const sections = render().findAll('[data-testid="tea-home-section"]');

    expect(sections.map((s) => s.get("svg").attributes("data-icon"))).toEqual([
      "leaf",
      "pot",
      "pour",
      "tome",
    ]);
    expect(sections.map((s) => s.text())).toEqual([
      "Cabinet",
      "Teaware",
      "Brew",
      "Almanac",
    ]);
  });

  it.each([
    ["Cabinet", "tea-cabinet"],
    ["Teaware", "tea-ware"],
    ["Brew", "tea-timer"],
    ["Almanac", "tea-almanac"],
  ])("opens the %s section", async (label, routeName) => {
    const wrapper = render();
    const section = wrapper
      .findAll('[data-testid="tea-home-section"]')
      .find((s) => s.text().includes(label));

    await section!.trigger("click");

    expect(push).toHaveBeenCalledWith({ name: routeName });
  });

  // The shell bar already says "Tea"; the header only carries sharing.
  it("has no heading of its own, just the share button", async () => {
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get("header").text()).toBe("Share");
  });

  it("offers to share when nobody else is in the cabinet", async () => {
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get("[data-testid=tea-home-household]").text()).toBe(
      "Share",
    );
  });

  it("says who the cabinet is shared with and opens the household sheet", async () => {
    mockCabinet(["jakub", "mia"]);
    const wrapper = render();
    await flushPromises();

    const household = wrapper.get("[data-testid=tea-home-household]");
    expect(household.text()).toBe("Shared with mia");

    await household.trigger("click");
    expect(wrapper.find("[data-testid=household-sheet]").exists()).toBe(true);
  });
});
