import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn(), put: vi.fn().mockResolvedValue({}), del: vi.fn(), upload: vi.fn() },
}));

import BrewStrip from "./BrewStrip.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
});

describe("BrewStrip", () => {
  it("shows the infusion and its target, and starts and stops the steep", async () => {
    const timer = useTeaTimerStore();
    const wrapper = mount(BrewStrip);
    expect(wrapper.get("[data-testid=brew-strip-back]").text()).toContain("Inf 1");
    expect(wrapper.get("[data-testid=brew-strip-back]").text()).toContain("0:10");

    await wrapper.get("[data-testid=brew-strip-toggle]").trigger("click");
    expect(timer.running).toBe(true);
    vi.setSystemTime(Date.now() + 12_000);
    await wrapper.get("[data-testid=brew-strip-toggle]").trigger("click");
    expect(timer.running).toBe(false);
    expect(timer.brewed.map((i) => i.actual_seconds)).toEqual([12]);
  });

  it("asks to go back to the timer when tapped", async () => {
    const wrapper = mount(BrewStrip);
    await wrapper.get("[data-testid=brew-strip-back]").trigger("click");
    expect(wrapper.emitted("back")).toHaveLength(1);
  });
});
