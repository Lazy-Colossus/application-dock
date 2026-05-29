import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api, ApiError } from '@/composables/useApi';
import type { InProgressSummary, SessionData, TargetScores } from '@/apps/archery/types';

function upsertTarget(targets: TargetScores[], t: TargetScores): TargetScores[] {
  return [...targets.filter((x) => x.number !== t.number), t].sort((a, b) => a.number - b.number);
}

function messageFrom(e: unknown): string {
  return e instanceof ApiError ? e.detail : e instanceof Error ? e.message : String(e);
}

export const useArcherySessionStore = defineStore('archerySession', () => {
  const session = ref<SessionData | null>(null);
  const draftRoster = ref<string[]>([]);
  const draftName = ref<string>('');
  const draftSessionName = ref<string>('');
  const loading = ref(false);
  const error = ref<string | null>(null);

  // In-progress sessions for the home screen / resume picker (Stories 6.1/6.3/6.4)
  const inProgressList = ref<InProgressSummary[]>([]);

  // Score-entry panel state (Story 2.3)
  const activeTargetNumber = ref<number | null>(null);
  const scoreEntryOpen = ref(false);

  async function createSession(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const name = draftSessionName.value.trim();
      const data = await api.post<SessionData>('/archery/sessions', {
        archers: draftRoster.value,
        ...(name ? { name } : {})
      });
      session.value = data;
    } catch (e) {
      error.value = messageFrom(e);
    } finally {
      loading.value = false;
    }
  }

  function resetDraft(): void {
    draftRoster.value = [];
    draftName.value = '';
    draftSessionName.value = '';
    error.value = null;
  }

  function targetByNumber(n: number): TargetScores | null {
    return session.value?.targets.find((t) => t.number === n) ?? null;
  }

  function isConfirmed(n: number): boolean {
    return session.value?.targets.some((t) => t.number === n && t.confirmed === true) ?? false;
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
      await api.post<SessionData>(`/archery/sessions/in-progress/${session.value.label}/finalise`, null);
      session.value = null;
    } catch (e) {
      error.value = messageFrom(e);
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
      const saved = await api.put<SessionData>(`/archery/sessions/in-progress/${next.label}`, next as unknown as Record<string, unknown>);
      session.value = saved;
    } catch (e) {
      error.value = messageFrom(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function closeTarget(): void {
    activeTargetNumber.value = null;
    scoreEntryOpen.value = false;
  }

  // Story 6.3/6.4: load all in-progress sessions for the home screen.
  async function loadInProgress(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      inProgressList.value = await api.get<InProgressSummary[]>('/archery/sessions/in-progress');
    } catch (e) {
      error.value = messageFrom(e);
    } finally {
      loading.value = false;
    }
  }

  // Story 6.4: resume a specific in-progress session by label.
  async function resumeSession(label: string): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      session.value = await api.get<SessionData>(`/archery/sessions/in-progress/${label}`);
    } catch (e) {
      error.value = messageFrom(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  // Story 6.3: "New Session" conflict popup → delete every open session.
  async function discardAllInProgress(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      for (const s of inProgressList.value) {
        await api.del(`/archery/sessions/in-progress/${s.label}`);
      }
      inProgressList.value = [];
      session.value = null;
    } catch (e) {
      error.value = messageFrom(e);
    } finally {
      loading.value = false;
    }
  }

  return {
    session,
    draftRoster,
    draftName,
    draftSessionName,
    loading,
    error,
    inProgressList,
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
    loadInProgress,
    resumeSession,
    discardAllInProgress
  };
});
