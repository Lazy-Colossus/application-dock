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
  let requestId = 0;

  async function fetchEntries(country = "", q = ""): Promise<void> {
    const thisRequest = ++requestId;
    loading.value = true;
    try {
      const result = await api.get<AlmanacEntryView[]>(path(country, q));
      if (thisRequest !== requestId) return;
      entries.value = result;
      error.value = null;
    } catch (e) {
      if (thisRequest !== requestId) return;
      error.value = message(e);
    } finally {
      if (thisRequest === requestId) loading.value = false;
    }
  }

  async function fetchEntry(catalogueNodeId: string): Promise<void> {
    loading.value = true;
    try {
      const found = await api.get<AlmanacEntryView>(
        `/tea/almanac/${catalogueNodeId}`,
      );
      const index = entries.value.findIndex(
        (e) => e.catalogue_node_id === found.catalogue_node_id,
      );
      if (index === -1) {
        entries.value = [...entries.value, found];
      } else {
        entries.value = [
          ...entries.value.slice(0, index),
          found,
          ...entries.value.slice(index + 1),
        ];
      }
      error.value = null;
    } catch (e) {
      error.value = message(e);
    } finally {
      loading.value = false;
    }
  }

  return { entries, loading, error, fetchEntries, fetchEntry };
});
