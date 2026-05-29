import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '@/composables/useApi';
import type { SessionData, TargetScores } from '@/apps/archery/types';

function upsertTarget(targets: TargetScores[], t: TargetScores): TargetScores[] {
  return [...targets.filter((x) => x.number !== t.number), t].sort((a, b) => a.number - b.number);
}

export const useArcherySessionStore = defineStore('archerySession', () => {
  const session = ref<SessionData | null>(null);
  const draftRoster = ref<string[]>([]);
  const draftName = ref<string>('');
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Score-entry panel state (Story 2.3)
  const activeTargetNumber = ref<number | null>(null);
  const scoreEntryOpen = ref(false);

  async function createSession(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const data = await api.post<SessionData>('/archery/sessions', {
        archers: draftRoster.value
      });
      session.value = data;
    } catch (e) {
      error.value = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  function resetDraft(): void {
    draftRoster.value = [];
    draftName.value = '';
    error.value = null;
  }

  function targetByNumber(n: number): TargetScores | null {
    return session.value?.targets.find((t) => t.number === n) ?? null;
  }

  function isConfirmed(n: number): boolean {
    return session.value?.targets.some((t) => t.number === n) ?? false;
  }

  function openTarget(n: number): void {
    activeTargetNumber.value = n;
    scoreEntryOpen.value = true;
  }

  async function finaliseSession(): Promise<void> {
    if (!session.value) return;
    loading.value = true;
    error.value = null;
    try {
      await api.post<SessionData>('/archery/sessions/in-progress/finalise', null);
      session.value = null;
    } catch (e) {
      error.value = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function saveTarget(target: TargetScores): Promise<void> {
    if (!session.value) return;
    const next: SessionData = { ...session.value, targets: upsertTarget(session.value.targets, target) };
    loading.value = true;
    error.value = null;
    try {
      const saved = await api.put<SessionData>('/archery/sessions/in-progress', next as unknown as Record<string, unknown>);
      session.value = saved;
    } catch (e) {
      error.value = e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function closeTarget(): void {
    activeTargetNumber.value = null;
    scoreEntryOpen.value = false;
  }

  async function checkInProgress(): Promise<SessionData | null> {
    loading.value = true;
    error.value = null;
    try {
      return await api.get<SessionData>('/archery/sessions/in-progress');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function resumeSession(): Promise<void> {
    const s = await checkInProgress();
    if (s) session.value = s;
  }

  async function discardSession(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      await api.del('/archery/sessions/in-progress');
      session.value = null;
      resetDraft();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  return {
    session,
    draftRoster,
    draftName,
    loading,
    error,
    activeTargetNumber,
    scoreEntryOpen,
    createSession,
    resetDraft,
    targetByNumber,
    isConfirmed,
    openTarget,
    closeTarget,
    saveTarget,
    finaliseSession,
    checkInProgress,
    resumeSession,
    discardSession
  };
});
