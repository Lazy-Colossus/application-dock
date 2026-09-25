import { ref } from "vue";
import { defineStore } from "pinia";
import { api } from "@/composables/useApi";
import type { AlmanacEntryView } from "@/apps/tea/types";

function message(e: unknown): string {
  if (e && typeof e === "object" && "detail" in e) {
    const detail = (e as { detail: unknown }).detail;
    if (typeof detail === "string" && detail.length > 0) return detail;
  }
  return e instanceof Error ? e.message : String(e);
}

function path(country: string, q: string): string {
  const params = new URLSearchParams();
  if (country) params.set("country", country);
  if (q) params.set("q", q);
  const qs = params.toString();
  return qs ? `/tea/almanac?${qs}` : "/tea/almanac";
}

export const useTeaAlmanacStore = defineStore("tea-almanac", () => {
  const entries = ref<AlmanacEntryView[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchEntries(country = "", q = ""): Promise<void> {
    loading.value = true;
    try {
      entries.value = await api.get<AlmanacEntryView[]>(path(country, q));
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  return { entries, loading, error, fetchEntries };
});
