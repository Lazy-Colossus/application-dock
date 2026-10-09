import { onScopeDispose, watch, type Ref } from "vue";

/**
 * Keeps the screen on while `active`. Browsers drop the lock whenever the tab
 * is hidden, so it is taken again on return. Unsupported browsers (and
 * insecure origins, where the API is absent) just get no lock.
 */
export function useWakeLock(active: Readonly<Ref<boolean>>): void {
  let sentinel: WakeLockSentinel | null = null;

  async function acquire(): Promise<void> {
    if (!("wakeLock" in navigator) || sentinel !== null) return;
    try {
      sentinel = await navigator.wakeLock.request("screen");
    } catch {
      sentinel = null;
    }
  }

  async function release(): Promise<void> {
    const held = sentinel;
    sentinel = null;
    await held?.release().catch(() => undefined);
  }

  function onVisibility(): void {
    if (document.visibilityState !== "visible" || !active.value) return;
    sentinel = null;
    void acquire();
  }

  watch(active, (on) => void (on ? acquire() : release()), { immediate: true });
  document.addEventListener("visibilitychange", onVisibility);
  onScopeDispose(() => {
    document.removeEventListener("visibilitychange", onVisibility);
    void release();
  });
}
