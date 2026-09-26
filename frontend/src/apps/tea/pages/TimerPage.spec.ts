import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, push, routeQuery } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
  routeQuery: { value: {} as Record<string, string> },
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: delMock, post: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ query: routeQuery.value }),
}));

import TimerPage from "./TimerPage.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";
import type { BrewingCurve, Tea, TeaSession } from "../types";

function tea(): Tea {
  return {
    id: "t-1",
    name: "Tieguanyin",
    catalogue_node_id: "oolong.anxi.tieguanyin",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 42,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    brewing: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
  };
}

const CURVE: BrewingCurve = {
  leaf_grams: 6,
  water_temp_c: 95,
  steep_seconds: [20, 25],
  source: "almanac",
  source_label: "almanac: Tieguanyin",
};

function routes(inProgress: TeaSession[] = []) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teas") return Promise.resolve([tea()]);
    if (path === "/tea/sessions?status=in_progress") return Promise.resolve(inProgress);
    if (path === "/tea/teas/t-1/curve") return Promise.resolve(CURVE);
    return Promise.resolve([]);
  });
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  getMock.mockReset();
  putMock.mockReset().mockImplementation((_p: string, body: unknown) => Promise.resolve(body));
  delMock.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  routeQuery.value = {};
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("TimerPage", () => {
  it("opens as a plain timer ready to start", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-tea]").text()).toContain("pick a tea");
    expect(wrapper.get("[data-testid=timer-band]").text()).toContain("tap to start");
    expect(wrapper.get("[data-testid=timer-finish]").text()).toBe("End");
  });

  it("starts and stops a steep from the band", async () => {
    routes();
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    expect(wrapper.get("[data-testid=timer-band]").text()).toContain("tap to stop");
    vi.setSystemTime(Date.now() + 11_000);
    await wrapper.get("[data-testid=timer-band]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-chip-1]").text()).toBe("1 · 11s");
  });

  it("attaches the tea from ?tea= and shows its curve source", async () => {
    routes();
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    expect(wrapper.get("[data-testid=timer-tea]").text()).toContain("Tieguanyin");
    expect(wrapper.get("[data-testid=timer-source]").text()).toBe("almanac: Tieguanyin");
    expect(wrapper.get("[data-testid=timer-finish]").text()).toBe("Finish");
  });

  it("offers to resume an unfinished server session", async () => {
    routes([
      {
        id: "s-9",
        tea_id: "t-1",
        status: "in_progress",
        started_at: "2026-09-25T19:40:00Z",
        updated_at: "2026-09-25T19:55:00Z",
        finished_at: null,
        leaf_grams: 6,
        water_temp_c: 95,
        rating: null,
        curve_source: "almanac",
        curve_source_label: "almanac: Tieguanyin",
        infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
      },
    ]);
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=recovery-resume]").trigger("click");
    expect(useTeaTimerStore().live?.sessionId).toBe("s-9");
    expect(wrapper.find("[data-testid=recovery-card]").exists()).toBe(false);
  });

  it("resumes an unfinished server session for ?tea= automatically, without fetching its curve", async () => {
    routes([
      {
        id: "s-9",
        tea_id: "t-1",
        status: "in_progress",
        started_at: "2026-09-25T19:40:00Z",
        updated_at: "2026-09-25T19:55:00Z",
        finished_at: null,
        leaf_grams: 6,
        water_temp_c: 95,
        rating: null,
        curve_source: "almanac",
        curve_source_label: "almanac: Tieguanyin",
        infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
      },
    ]);
    routeQuery.value = { tea: "t-1" };
    mount(TimerPage);
    await flushPromises();
    expect(useTeaTimerStore().live?.sessionId).toBe("s-9");
    expect(getMock).not.toHaveBeenCalledWith("/tea/teas/t-1/curve");
  });

  it("finishes, refreshes the cabinet and goes to the tea", async () => {
    routes();
    routeQuery.value = { tea: "t-1" };
    const wrapper = mount(TimerPage);
    await flushPromises();
    await wrapper.get("[data-testid=timer-finish]").trigger("click");
    await wrapper.get("[data-testid=finish-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls.at(-1)![1]).toMatchObject({ status: "finalised" });
    expect(push).toHaveBeenCalledWith({ name: "tea-detail", params: { teaId: "t-1" } });
  });
});
