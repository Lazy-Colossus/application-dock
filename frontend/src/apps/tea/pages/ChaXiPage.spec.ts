import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { putMock, push, replace, leaveGuards } = vi.hoisted(() => ({
  putMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  leaveGuards: [] as Array<() => void>,
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn().mockResolvedValue(null), put: putMock, del: vi.fn(), upload: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ query: {}, params: {} }),
  onBeforeRouteLeave: (guard: () => void) => leaveGuards.push(guard),
}));

import ChaXiPage from "./ChaXiPage.vue";
import { useTeaTimerStore } from "../stores/useTeaTimerStore";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function liveWithTea(): void {
  localStorage.setItem(
    "tea-timer:live",
    JSON.stringify({
      version: 1,
      sessionId: "s-1",
      startedAt: "2026-09-28T18:00:00Z",
      tea: { id: "t-1", name: "Dan Cong", class_id: "oolong", grams_remaining: 40 },
      curve: {
        leaf_grams: 6,
        water_temp_c: 95,
        steep_seconds: [10],
        source: "generic",
        source_label: "",
      },
      leafGrams: 6,
      waterTempC: 95,
      infusions: [{ number: 1, target_seconds: 10, actual_seconds: null }],
      steepStartedAt: null,
      pushed: true,
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  putMock.mockReset().mockResolvedValue({});
  push.mockReset();
  replace.mockReset();
  leaveGuards.length = 0;
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("ChaXiPage", () => {
  it("sends the timer home when nothing is brewing", async () => {
    mount(ChaXiPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(replace).toHaveBeenCalledWith({ name: "tea-timer" });
  });

  it("writes edits into the live session and syncs once typing pauses", async () => {
    liveWithTea();
    const timer = useTeaTimerStore();
    const wrapper = mount(ChaXiPage, { global: { stubs: STUBS } });
    await wrapper.get("[data-testid=chaxi-guests]").setValue("E");
    await wrapper.get("[data-testid=chaxi-guests]").setValue("Eva");
    expect(timer.live?.chaXi?.guests).toBe("Eva");
    expect(putMock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1500);
    await flushPromises();
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it("syncs straight away when leaving mid-typing", async () => {
    liveWithTea();
    const wrapper = mount(ChaXiPage, { global: { stubs: STUBS } });
    await wrapper.get("[data-testid=chaxi-notes]").setValue("orchid");
    leaveGuards.forEach((guard) => guard());
    await flushPromises();
    expect(putMock).toHaveBeenCalledTimes(1);
  });

  it("goes back to the timer from the brew strip", async () => {
    liveWithTea();
    const wrapper = mount(ChaXiPage, { global: { stubs: STUBS } });
    await wrapper.get("[data-testid=brew-strip-back]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-timer" });
  });
});
