import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";

let useTargetChime: typeof import("./useTargetChime").useTargetChime;

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

beforeEach(async () => {
  started.mockReset();
  instances = [];
  vi.stubGlobal("AudioContext", FakeContext);
  // The context is module state now, so every test gets a fresh module.
  vi.resetModules();
  ({ useTargetChime } = await import("./useTargetChime"));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function setup(enabled: boolean, startAt = 0) {
  const elapsed = ref(startAt);
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

  it("stays silent when disabled", async () => {
    const off = setup(false);
    off.unlock();
    off.elapsed.value = 30;
    await nextTick();
    expect(started).not.toHaveBeenCalled();
    off.scope.stop();
  });

  it("stays silent until some page has unlocked audio", async () => {
    const locked = setup(true);
    locked.elapsed.value = 30;
    await nextTick();
    expect(started).not.toHaveBeenCalled();
    locked.scope.stop();
  });

  it("keeps one unlocked context for the next page's chime", async () => {
    const first = setup(true);
    first.unlock();
    first.scope.stop();

    const second = setup(true);
    second.elapsed.value = 21;
    await nextTick();

    expect(started).toHaveBeenCalledTimes(1);
    expect(instances).toHaveLength(1);
    expect(instances[0].close).not.toHaveBeenCalled();
    second.scope.stop();
  });

  it("does not chime again for a target already passed when a page opens", async () => {
    const { elapsed, unlock, scope } = setup(true, 25);
    unlock();
    elapsed.value = 25.2;
    await nextTick();
    expect(started).not.toHaveBeenCalled();
    scope.stop();
  });
});
