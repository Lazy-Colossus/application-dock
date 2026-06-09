import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '@/composables/useApi';
import type { SessionData, SessionSummary } from '@/apps/archery/types';

export const useArcheryHistoryStore = defineStore('archeryHistory', () => {
  // List state
  const summaries = ref<SessionSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Detail state (kept separate so list is not clobbered on navigation)
  const detail = ref<SessionData | null>(null);
  const detailLoading = ref(false);
  const detailError = ref<string | null>(null);

  async function loadHistory(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      summaries.value = await api.get<SessionSummary[]>('/archery/sessions');
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function loadDetail(label: string): Promise<void> {
    detail.value = null;
    detailLoading.value = true;
    detailError.value = null;
    try {
      detail.value = await api.get<SessionData>(`/archery/sessions/${encodeURIComponent(label)}`);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 404) {
        detailError.value = `Session ${label} not found.`;
      } else {
        detailError.value = e instanceof Error ? e.message : String(e);
      }
    } finally {
      detailLoading.value = false;
    }
  }

  return {
    summaries,
    loading,
    error,
    detail,
    detailLoading,
    detailError,
    loadHistory,
    loadDetail
  };
});
