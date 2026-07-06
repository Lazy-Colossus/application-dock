import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Word, Visibility } from "@/apps/hotaru/types";

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
  const loading = ref(false);
  const error = ref<string | null>(null);

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

  return {
    words,
    loading,
    error,
    lessons,
    wordsByLesson,
    textbookSources,
    lessonsForSource,
    wordsBySourceLesson,
    customWords,
    wordById,
    loadWords,
    createWord,
    updateWord,
    deleteWord,
  };
});
