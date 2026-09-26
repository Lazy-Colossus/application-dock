import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { useTargetChime } from "./useTargetChime";

const started = vi.fn();
let instances: FakeContext[] = [];

class FakeContext {
  currentTime = 0;
  destination = {};
  resume = vi.fn().mockResolvedValue(undefined);
  close = vi.fn().mockResolvedValue(undefined);

  constructor() {
    instances.push(this);
  }

  createOscillator() {
    return {
      type: "",
      frequency: { value: 0 },
      connect: (node: unknown) => node,
      start: started,
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      connect: (node: unknown) => node,
    };
  }
}

beforeEach(() => {
  started.mockReset();
  instances = [];
  vi.stubGlobal("AudioContext", FakeContext);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(enabled: boolean) {
  const elapsed = ref(0);
  const target = ref<number | null>(20);
  const scope = effectScope();
  const { unlock } = scope.run(() => useTargetChime(elapsed, target, ref(enabled)))!;
  return { elapsed, target, unlock, scope };
}

describe("useTargetChime", () => {
  it("chimes once when the target is crossed", async () => {
    const { elapsed, unlock, scope } = setup(true);
    unlock();
    elapsed.value = 19;
    await nextTick();
    expect(started).not.toHaveBeenCalled();
    elapsed.value = 20.1;
    await nextTick();
    elapsed.value = 25;
    await nextTick();
    expect(started).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("re-arms for the next steep", async () => {
    const { elapsed, unlock, scope } = setup(true);
    unlock();
    elapsed.value = 21;
    await nextTick();
    elapsed.value = 0;
    await nextTick();
    elapsed.value = 22;
    await nextTick();
    expect(started).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("stays silent when disabled or never unlocked", async () => {
    const off = setup(false);
    off.unlock();
    off.elapsed.value = 30;
    await nextTick();
    const locked = setup(true);
    locked.elapsed.value = 30;
    await nextTick();
    expect(started).not.toHaveBeenCalled();
    off.scope.stop();
    locked.scope.stop();
  });

  it("closes the audio context when its scope is disposed", () => {
    const { unlock, scope } = setup(true);
    unlock();
    expect(instances).toHaveLength(1);
    scope.stop();
    expect(instances[0].close).toHaveBeenCalled();
  });
});
