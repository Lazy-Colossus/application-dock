/**
 * Debounce a save so typing is never blocked on the network.
 *
 * `schedule` restarts the clock on every keystroke; `flush` runs a pending
 * save immediately (leaving a page should not silently drop what was typed);
 * `cancel` drops one. Nothing is scheduled if no save is pending, so `flush`
 * on a clean editor is a no-op.
 */
export function useAutosave(save: () => void | Promise<void>, delayMs = 600) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  function cancel(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function schedule(): void {
    cancel();
    timer = setTimeout(() => {
      timer = null;
      void save();
    }, delayMs);
  }

  function flush(): void {
    if (timer === null) return;
    cancel();
    void save();
  }

  return { schedule, flush, cancel };
}
