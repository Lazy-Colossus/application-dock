import { ref, computed, type Ref } from "vue";
import type { DrillGrade, GradeItem, QueueItem } from "@/apps/hotaru/types";

// The prompt → reveal → grade → advance state machine for a drill session, over
// a queue the store owns. Pure in-session state — no API calls; the page owns
// syncing the buffered `pending` grades.
export function useDrill(queue: Ref<QueueItem[]>) {
  const index = ref(0);
  const revealed = ref(false);
  // Grades recorded this session, buffered for a background batch sync.
  const pending = ref<GradeItem[]>([]);

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

  // Record a grade for the current card and advance immediately (optimistic).
  // `replay` rides along on the buffered item so the server can credit a
  // re-practice without letting it promote a tier.
  function grade(g: DrillGrade, replay = false): void {
    const item = current.value;
    if (!item) return;
    pending.value.push({ word_id: item.word.id, grade: g, replay });
    next();
  }

  // Run the queue again from the top. The caller swaps `queue` first (e.g. to
  // the subset the learner picked out of the recap); this only resets position.
  // `pending` is left alone — a buffered grade still needs to reach the server.
  function restart(): void {
    index.value = 0;
    revealed.value = false;
  }

  return {
    index,
    total,
    revealed,
    current,
    finished,
    progress,
    pending,
    reveal,
    next,
    grade,
    restart,
  };
}
