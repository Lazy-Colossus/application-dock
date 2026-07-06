import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { PracticeOverview } from "@/apps/hotaru/types";

export const useHotaruPracticeStore = defineStore("hotaruPractice", () => {
  const overview = ref<PracticeOverview | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

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

  return { overview, loading, error, loadOverview };
});
