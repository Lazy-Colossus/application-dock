import { computed, onScopeDispose, ref, watch, type Ref } from "vue";

/**
 * Seconds since `startedAt`, recomputed from the wall clock on every tick —
 * never by counting ticks, so a throttled or backgrounded tab is right again
 * the moment it next runs.
 */
export function useSteepClock(
  startedAt: Readonly<Ref<number | null>>,
  now: () => number = () => Date.now(),
) {
  const current = ref(now());
  let handle: ReturnType<typeof setInterval> | null = null;

  function stopTicking(): void {
    if (handle !== null) clearInterval(handle);
    handle = null;
  }

  watch(
    startedAt,
    (value) => {
      stopTicking();
      current.value = now();
      if (value !== null) handle = setInterval(() => (current.value = now()), 200);
    },
    { immediate: true },
  );
  onScopeDispose(stopTicking);

  const elapsed = computed(() =>
    startedAt.value === null ? 0 : Math.max(0, (current.value - startedAt.value) / 1000),
  );
  return { elapsed };
}
