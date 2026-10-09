import { describe, it, expect, vi, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useSteepClock } from "./useSteepClock";

afterEach(() => {
  vi.useRealTimers();
});

describe("useSteepClock", () => {
  it("is 0 while stopped and counts up from startedAt", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
    const startedAt = ref<number | null>(null);
    const scope = effectScope();
    const { elapsed } = scope.run(() => useSteepClock(startedAt))!;

    expect(elapsed.value).toBe(0);
    startedAt.value = Date.now();
    await nextTick();
    vi.advanceTimersByTime(3000);
    expect(elapsed.value).toBeCloseTo(3, 0);
    scope.stop();
  });

  it("reads the wall clock after a background gap", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-26T18:00:00Z"));
    const startedAt = ref<number | null>(Date.now());
    const scope = effectScope();
    const { elapsed } = scope.run(() => useSteepClock(startedAt))!;

    // The tab was throttled: no intervals ran, but a minute passed.
    vi.setSystemTime(new Date("2026-09-26T18:01:00Z"));
    vi.advanceTimersByTime(200);
    expect(elapsed.value).toBeCloseTo(60, 0);
    scope.stop();
  });
});
