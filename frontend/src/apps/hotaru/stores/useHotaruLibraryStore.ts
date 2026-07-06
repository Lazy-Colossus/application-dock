import { ref, computed } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { Word } from "@/apps/hotaru/types";

// Order lessons for the filter tabs: "G" (greetings/intro) first, then L1..L9
// by numeric order. Any other code sorts alphabetically after these.
function lessonRank(lesson: string): [number, number, string] {
  if (lesson === "G") return [0, 0, ""];
  const m = /^L(\d+)$/.exec(lesson);
  if (m) return [1, Number(m[1]), ""];
  return [2, 0, lesson];
}

export const useHotaruLibraryStore = defineStore("hotaruLibrary", () => {
  const words = ref<Word[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const lessons = computed<string[]>(() => {
    const unique = Array.from(new Set(words.value.map((w) => w.lesson)));
    return unique.sort((a, b) => {
      const [ga, na, sa] = lessonRank(a);
      const [gb, nb, sb] = lessonRank(b);
      return ga - gb || na - nb || sa.localeCompare(sb);
    });
  });

  function wordsByLesson(lesson: string): Word[] {
    return words.value.filter((w) => w.lesson === lesson);
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

  return { words, loading, error, lessons, wordsByLesson, loadWords };
});
