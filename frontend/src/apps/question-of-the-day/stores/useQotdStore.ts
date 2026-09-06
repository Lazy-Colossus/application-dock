import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type {
  Answer,
  HistoryRow,
  PastDayView,
  TodayFeed,
  TodayView,
} from "@/apps/question-of-the-day/types";

// The single HTTP boundary for QotD is `useApi`; this store is the only place
// components reach the network. Every async action sets `loading` in a
// try/finally and routes failures into `error.value` — never a bare console.
export const useQotdStore = defineStore("qotd", () => {
  const today = ref<TodayView | null>(null);
  const feed = ref<TodayFeed | null>(null);
  const history = ref<HistoryRow[]>([]);
  const day = ref<PastDayView | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchToday(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      today.value = await api.get<TodayView>("/qotd/today");
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  // Today's feed, gated behind answer-to-reveal. Withheld until the caller has
  // answered — the server decides, so this just reflects it.
  async function fetchFeed(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      feed.value = await api.get<TodayFeed>("/qotd/today/answers");
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  // Submit (or edit) the caller's answer to today's question. On success the
  // caller's own answer and the `answered` flag are updated in place and the
  // feed is refetched so it unlocks in place (Story 3.1). Rethrows so a
  // component can react (e.g. keep focus) while `error` is also surfaced.
  async function submitAnswer(payload: {
    text?: string;
    rating?: number;
  }): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const saved = await api.put<Answer>("/qotd/today/answer", payload);
      if (today.value) {
        today.value.answered = true;
        today.value.my_answer = saved;
      }
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
    // Unlock the feed in place after a successful submit.
    await fetchFeed();
  }

  // Past days, newest-first (today excluded), for the history list.
  async function fetchHistory(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      history.value = await api.get<HistoryRow[]>("/qotd/history");
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  // A past day in full, read-only. The archive is always visible (no reveal
  // gate); `null` is cleared before each fetch so a failed load never shows a
  // stale day.
  async function fetchDay(date: string): Promise<void> {
    loading.value = true;
    error.value = null;
    day.value = null;
    try {
      day.value = await api.get<PastDayView>(`/qotd/days/${date}`);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  return {
    today,
    feed,
    history,
    day,
    loading,
    error,
    fetchToday,
    fetchFeed,
    fetchHistory,
    fetchDay,
    submitAnswer,
  };
});
