import { describe, it, expect, vi, afterEach } from "vitest";
import { effectScope, nextTick, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import { useWakeLock } from "./useWakeLock";

function installWakeLock() {
  const release = vi.fn().mockResolvedValue(undefined);
  const request = vi.fn().mockResolvedValue({ release });
  Object.defineProperty(navigator, "wakeLock", { value: { request }, configurable: true });
  return { request, release };
}

afterEach(() => {
  Reflect.deleteProperty(navigator, "wakeLock");
});

describe("useWakeLock", () => {
  it("requests a screen lock while active and releases it after", async () => {
    const { request, release } = installWakeLock();
    const active = ref(true);
    const scope = effectScope();
    scope.run(() => useWakeLock(active));
    await flushPromises();
    expect(request).toHaveBeenCalledWith("screen");

    active.value = false;
    await nextTick();
    await flushPromises();
    expect(release).toHaveBeenCalled();
    scope.stop();
  });

  it("re-acquires when the page becomes visible again", async () => {
    const { request } = installWakeLock();
    const scope = effectScope();
    scope.run(() => useWakeLock(ref(true)));
    await flushPromises();

    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();
    expect(request).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("does nothing where the API is missing", async () => {
    const scope = effectScope();
    expect(() => scope.run(() => useWakeLock(ref(true)))).not.toThrow();
    await flushPromises();
    scope.stop();
  });
});
