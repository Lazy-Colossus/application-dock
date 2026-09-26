import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { CabinetFilterState } from "@/apps/tea/filters";

// A store rather than page state so the filters survive opening a tea and
// coming back to the cabinet.
export const useTeaCabinetFiltersStore = defineStore("tea-cabinet-filters", () => {
  const nodeId = ref<string | null>(null);
  const country = ref<string | null>(null);
  const query = ref("");
  const showEmpty = ref(true);

  const state = computed<CabinetFilterState>(() => ({
    nodeId: nodeId.value,
    country: country.value,
    query: query.value,
    showEmpty: showEmpty.value,
  }));

  const activeCount = computed(
    () =>
      Number(nodeId.value !== null) +
      Number(country.value !== null) +
      Number(query.value.trim() !== "") +
      Number(!showEmpty.value),
  );

  function clear(): void {
    nodeId.value = null;
    country.value = null;
    query.value = "";
    showEmpty.value = true;
  }

  return { nodeId, country, query, showEmpty, state, activeCount, clear };
});
