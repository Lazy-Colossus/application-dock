import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type {
  DrillCap,
  GradeItem,
  PracticeOverview,
  QueueItem,
} from "@/apps/hotaru/types";

export const useHotaruPracticeStore = defineStore("hotaruPractice", () => {
  const overview = ref<PracticeOverview | null>(null);
  const queue = ref<QueueItem[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Drop any cached overview so a returning picker never shows stale, pre-drill
  // stats before a fresh selection re-fetches.
  function clearOverview(): void {
    overview.value = null;
  }

  async function loadOverview(scope: string, user: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      overview.value = await api.get<PracticeOverview>(
        `/hotaru/practice/overview?scope=${encodeURIComponent(scope)}&user=${encodeURIComponent(user)}`,
      );
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
    } finally {
      loading.value = false;
    }
  }

  async function loadQueue(
    scope: string,
    user: string,
    direction: DrillCap = "r2m",
  ): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      queue.value = await api.get<QueueItem[]>(
        `/hotaru/practice/queue?scope=${encodeURIComponent(scope)}&user=${encodeURIComponent(user)}&direction=${direction}`,
      );
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
    } finally {
      loading.value = false;
    }
  }

  // Background batch grade sync — best-effort. Returns whether it succeeded so
  // the caller can re-queue on failure. Deliberately touches NEITHER `loading`
  // NOR the shared `error`: an optimistic background sync must never block or
  // hijack the drill UI (which reads `error` for real page-level failures).
  async function submitGrades(
    user: string,
    grades: GradeItem[],
  ): Promise<boolean> {
    if (grades.length === 0) return true;
    try {
      await api.post(
        `/hotaru/practice/grades?user=${encodeURIComponent(user)}`,
        grades as unknown as Record<string, unknown>[],
      );
      return true;
    } catch {
      return false;
    }
  }

  return {
    overview,
    queue,
    loading,
    error,
    clearOverview,
    loadOverview,
    loadQueue,
    submitGrades,
  };
});
