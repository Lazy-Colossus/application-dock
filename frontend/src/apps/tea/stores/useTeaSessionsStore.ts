import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { TeaSession } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Sessions as the server holds them: unfinished ones to recover, finished ones per tea. */
export const useTeaSessionsStore = defineStore("tea-sessions", () => {
  const inProgress = ref<TeaSession[]>([]);
  const byTea = ref<Record<string, TeaSession[]>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchInProgress(): Promise<void> {
    loading.value = true;
    try {
      inProgress.value = await api.get<TeaSession[]>("/tea/sessions?status=in_progress");
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchForTea(teaId: string): Promise<void> {
    loading.value = true;
    try {
      const sessions = await api.get<TeaSession[]>(`/tea/teas/${teaId}/sessions`);
      byTea.value = { ...byTea.value, [teaId]: sessions };
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  function forget(sessionId: string): void {
    inProgress.value = inProgress.value.filter((s) => s.id !== sessionId);
  }

  async function discard(sessionId: string): Promise<void> {
    loading.value = true;
    try {
      await api.del(`/tea/sessions/${sessionId}`);
      error.value = null;
      forget(sessionId);
    } catch (e) {
      const status = (e as { status?: unknown }).status;
      if (status === 404) {
        error.value = null;
        forget(sessionId);
      } else {
        error.value = message(e);
      }
    } finally {
      loading.value = false;
    }
  }

  return { inProgress, byTea, loading, error, fetchInProgress, fetchForTea, forget, discard };
});
