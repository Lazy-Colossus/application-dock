import { ref, computed, type Ref } from "vue";
import type { QueueItem } from "@/apps/hotaru/types";

// The prompt → reveal → advance state machine for a drill session, over a queue
// the store owns. Pure in-session state — no API calls. Story 2.5 will extend
// `next()` into "grade then advance" with optimistic sync.
export function useDrill(queue: Ref<QueueItem[]>) {
  const index = ref(0);
  const revealed = ref(false);

  const total = computed(() => queue.value.length);
  const finished = computed(() => index.value >= queue.value.length);
  const current = computed<QueueItem | null>(() =>
    finished.value ? null : queue.value[index.value],
  );
  // 1-based position for display, clamped to the total.
  const progress = computed(
    () => `${Math.min(index.value + 1, total.value)} / ${total.value}`,
  );

  function reveal(): void {
    revealed.value = true;
  }

  function next(): void {
    if (finished.value) return;
    index.value += 1;
    revealed.value = false;
  }

  return {
    index,
    total,
    revealed,
    current,
    finished,
    progress,
    reveal,
    next,
  };
}
