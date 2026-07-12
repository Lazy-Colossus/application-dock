import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Word, Topic, Visibility } from "@/apps/hotaru/types";

export interface CreateWordInput {
  reading: string;
  meaning: string;
  kanji?: string | null;
  romaji?: string;
  pos?: string;
  source?: string;
  lesson?: string;
  visibility?: Visibility;
}

// Edit omits source: id and source are server-preserved on update.
export interface UpdateWordInput {
  reading: string;
  meaning: string;
  kanji?: string | null;
  romaji?: string;
  pos?: string;
  lesson?: string;
  visibility?: Visibility;
}

// Order lessons for the filter tabs: "G" (greetings/intro) first, then L1..L9
// by numeric order. Any other code sorts alphabetically after these.
function lessonRank(lesson: string): [number, number, string] {
  if (lesson === "G") return [0, 0, ""];
  const m = /^L(\d+)$/.exec(lesson);
  if (m) return [1, Number(m[1]), ""];
  return [2, 0, lesson];
}

function sortLessons(values: string[]): string[] {
  return [...values].sort((a, b) => {
    const [ga, na, sa] = lessonRank(a);
    const [gb, nb, sb] = lessonRank(b);
    return ga - gb || na - nb || sa.localeCompare(sb);
  });
}

export const useHotaruLibraryStore = defineStore("hotaruLibrary", () => {
  const words = ref<Word[]>([]);
  const topics = ref<Topic[]>([]);
  // The active user's per-word familiarity tier. Only reviewed words appear;
  // an absent word is New (tier 0), resolved by `familiarityTier`.
  const familiarity = ref<Record<string, number>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Last-viewed Library section/subsection, remembered across in-app navigation
  // (e.g. adding a word) so the user returns to where they were. null = not yet
  // chosen; LibraryPage picks a sensible default on first visit.
  const activeSection = ref<string | null>(null);
  const activeSubsection = ref<string | null>(null);

  const lessons = computed<string[]>(() =>
    sortLessons(Array.from(new Set(words.value.map((w) => w.lesson)))),
  );

  function wordsByLesson(lesson: string): Word[] {
    return words.value.filter((w) => w.lesson === lesson);
  }

  // A word is "custom" (user-added) iff its source is one of the user ids;
  // otherwise it belongs to a textbook section grouped by lesson.
  function textbookSources(userIds: string[]): string[] {
    const set = new Set(userIds);
    return Array.from(new Set(words.value.map((w) => w.source)))
      .filter((s) => !set.has(s))
      .sort();
  }

  function lessonsForSource(source: string): string[] {
    return sortLessons(
      Array.from(
        new Set(
          words.value.filter((w) => w.source === source).map((w) => w.lesson),
        ),
      ),
    );
  }

  function wordsBySourceLesson(source: string, lesson: string): Word[] {
    return words.value.filter(
      (w) => w.source === source && w.lesson === lesson,
    );
  }

  function customWords(userIds: string[], visibility: Visibility): Word[] {
    const set = new Set(userIds);
    return words.value.filter(
      (w) => set.has(w.source) && w.visibility === visibility,
    );
  }

  // All user-added words regardless of visibility (the Custom "All" view).
  function allCustomWords(userIds: string[]): Word[] {
    const set = new Set(userIds);
    return words.value.filter((w) => set.has(w.source));
  }

  async function loadWords(user?: string | null): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const query = user ? `?user=${encodeURIComponent(user)}` : "";
      words.value = await api.get<Word[]>(`/hotaru/words${query}`);
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  // The active user's per-word familiarity, for the icon on each library row.
  // Best-effort context: a load failure leaves rows reading New rather than
  // blocking the library, so it doesn't touch the shared `error`.
  async function loadFamiliarity(user: string): Promise<void> {
    try {
      familiarity.value = await api.get<Record<string, number>>(
        `/hotaru/practice/familiarity?user=${encodeURIComponent(user)}`,
      );
    } catch {
      familiarity.value = {};
    }
  }

  function familiarityTier(wordId: string): number {
    return familiarity.value[wordId] ?? 0;
  }

  async function createWord(
    payload: CreateWordInput,
    user: string,
  ): Promise<Word | null> {
    loading.value = true;
    error.value = null;
    try {
      const created = await api.post<Word>(
        `/hotaru/words?user=${encodeURIComponent(user)}`,
        payload as unknown as Record<string, unknown>,
      );
      // The word is already persisted; a refresh failure must NOT report the
      // create as failed (that would risk a duplicate re-submit). Reflect the
      // new word locally and let a reload error surface only via loadWords.
      words.value = [...words.value, created];
      void loadWords(user);
      return created;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      loading.value = false;
    }
  }

  function wordById(id: string): Word | undefined {
    return words.value.find((w) => w.id === id);
  }

  async function deleteWord(id: string, user: string): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      await api.del(
        `/hotaru/words/${encodeURIComponent(id)}?user=${encodeURIComponent(user)}`,
      );
      // Reflect locally (already persisted) and refresh in the background —
      // mirrors createWord: a reload failure must not report the delete as failed.
      words.value = words.value.filter((w) => w.id !== id);
      void loadWords(user);
      return true;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function updateWord(
    id: string,
    payload: UpdateWordInput,
    user: string,
  ): Promise<Word | null> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.put<Word>(
        `/hotaru/words/${encodeURIComponent(id)}?user=${encodeURIComponent(user)}`,
        payload as unknown as Record<string, unknown>,
      );
      words.value = words.value.map((w) => (w.id === id ? updated : w));
      void loadWords(user);
      return updated;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      loading.value = false;
    }
  }

  // --- Topics --------------------------------------------------------------

  function topicById(id: string): Topic | undefined {
    return topics.value.find((t) => t.id === id);
  }

  function topicsForWord(wordId: string): Topic[] {
    return topics.value.filter((t) => t.word_ids.includes(wordId));
  }

  // The topic view is a client-side intersection with the already-loaded (and
  // privacy-correct) master list — snappy, and it can't expose a word the
  // active user can't see.
  function wordsForTopic(topicId: string): Word[] {
    const topic = topicById(topicId);
    if (!topic) return [];
    const ids = new Set(topic.word_ids);
    return words.value.filter((w) => ids.has(w.id));
  }

  async function loadTopics(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      topics.value = await api.get<Topic[]>("/hotaru/topics");
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function createTopic(name: string): Promise<Topic | null> {
    loading.value = true;
    error.value = null;
    try {
      const created = await api.post<Topic>("/hotaru/topics", { name });
      topics.value = [...topics.value, created];
      return created;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      loading.value = false;
    }
  }

  function replaceTopic(updated: Topic): void {
    topics.value = topics.value.map((t) => (t.id === updated.id ? updated : t));
  }

  async function assignWord(
    topicId: string,
    wordId: string,
    user: string,
  ): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      const updated = await api.post<Topic>(
        `/hotaru/topics/${encodeURIComponent(topicId)}/words/${encodeURIComponent(wordId)}?user=${encodeURIComponent(user)}`,
      );
      replaceTopic(updated);
      return true;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function unassignWord(
    topicId: string,
    wordId: string,
    user: string,
  ): Promise<boolean> {
    loading.value = true;
    error.value = null;
    try {
      await api.del(
        `/hotaru/topics/${encodeURIComponent(topicId)}/words/${encodeURIComponent(wordId)}?user=${encodeURIComponent(user)}`,
      );
      // 204 (no body) — reflect the removal locally.
      const topic = topicById(topicId);
      if (topic) {
        replaceTopic({
          ...topic,
          word_ids: topic.word_ids.filter((id) => id !== wordId),
        });
      }
      return true;
    } catch (e) {
      error.value =
        (e as { detail?: string }).detail ??
        (e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      loading.value = false;
    }
  }

  // --- Bulk actions (Story 1.9) --------------------------------------------
  // Best-effort batches over the existing per-word endpoints: loop the API
  // directly (so we refresh once at the end, not per item), catch per item, and
  // return {ok, failed} so the caller can summarise. Like submitGrades, these
  // don't hijack the shared `error` — a seeded/foreign word simply counts as
  // failed (its 403/404 is expected, not a page error).
  interface BulkResult {
    ok: number;
    failed: number;
  }

  async function bulkAssignTopic(
    topicId: string,
    wordIds: string[],
    user: string,
  ): Promise<BulkResult> {
    loading.value = true;
    let ok = 0;
    let failed = 0;
    try {
      for (const id of wordIds) {
        try {
          await api.post(
            `/hotaru/topics/${encodeURIComponent(topicId)}/words/${encodeURIComponent(id)}?user=${encodeURIComponent(user)}`,
          );
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      await loadTopics();
      return { ok, failed };
    } finally {
      loading.value = false;
    }
  }

  async function bulkUnassignTopic(
    topicId: string,
    wordIds: string[],
    user: string,
  ): Promise<BulkResult> {
    loading.value = true;
    let ok = 0;
    let failed = 0;
    try {
      for (const id of wordIds) {
        try {
          await api.del(
            `/hotaru/topics/${encodeURIComponent(topicId)}/words/${encodeURIComponent(id)}?user=${encodeURIComponent(user)}`,
          );
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      await loadTopics();
      return { ok, failed };
    } finally {
      loading.value = false;
    }
  }

  async function bulkChangeLesson(
    lesson: string,
    wordIds: string[],
    user: string,
  ): Promise<BulkResult> {
    loading.value = true;
    let ok = 0;
    let failed = 0;
    try {
      for (const id of wordIds) {
        const word = wordById(id);
        if (!word) {
          failed += 1;
          continue;
        }
        const payload: UpdateWordInput = {
          reading: word.reading,
          meaning: word.meaning,
          kanji: word.kanji,
          romaji: word.romaji,
          pos: word.pos,
          visibility: word.visibility,
          lesson,
        };
        try {
          await api.put<Word>(
            `/hotaru/words/${encodeURIComponent(id)}?user=${encodeURIComponent(user)}`,
            payload as unknown as Record<string, unknown>,
          );
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      await loadWords(user);
      return { ok, failed };
    } finally {
      loading.value = false;
    }
  }

  async function bulkDelete(
    wordIds: string[],
    user: string,
  ): Promise<BulkResult> {
    loading.value = true;
    let ok = 0;
    let failed = 0;
    try {
      for (const id of wordIds) {
        try {
          await api.del(
            `/hotaru/words/${encodeURIComponent(id)}?user=${encodeURIComponent(user)}`,
          );
          ok += 1;
        } catch {
          failed += 1;
        }
      }
      await loadWords(user);
      return { ok, failed };
    } finally {
      loading.value = false;
    }
  }

  return {
    words,
    topics,
    familiarity,
    loading,
    error,
    activeSection,
    activeSubsection,
    lessons,
    loadFamiliarity,
    familiarityTier,
    wordsByLesson,
    textbookSources,
    lessonsForSource,
    wordsBySourceLesson,
    customWords,
    allCustomWords,
    wordById,
    topicById,
    topicsForWord,
    wordsForTopic,
    loadWords,
    createWord,
    updateWord,
    deleteWord,
    loadTopics,
    createTopic,
    assignWord,
    unassignWord,
    bulkAssignTopic,
    bulkUnassignTopic,
    bulkChangeLesson,
    bulkDelete,
  };
});
