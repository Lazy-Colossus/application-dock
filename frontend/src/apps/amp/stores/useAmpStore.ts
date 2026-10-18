import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { AmpInstance } from "@/apps/amp/types";

export const useAmpStore = defineStore("amp", () => {
  const instances = ref<AmpInstance[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  // Ids with a start request in flight — drives per-row button spinner/disable.
  const starting = ref<string[]>([]);

  function isStarting(id: string): boolean {
    return starting.value.includes(id);
  }

  async function fetch(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      instances.value = await api.get<AmpInstance[]>("/amp/instances");
    } catch (e) {
      // A failed poll keeps the last known list rather than blanking the page.
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function start(id: string): Promise<void> {
    if (starting.value.includes(id)) return;
    starting.value.push(id);
    error.value = null;
    try {
      await api.post(`/amp/instances/${id}/start`);
      await fetch();
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      starting.value = starting.value.filter((x) => x !== id);
    }
  }

  return { instances, loading, error, starting, isStarting, fetch, start };
});
