import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { WareFilterState } from "@/apps/tea/ware";
import type { TeawareMaterial, TeawareType } from "@/apps/tea/types";

// A store rather than page state so the filters survive opening a piece and coming back.
export const useTeawareFiltersStore = defineStore("tea-teaware-filters", () => {
  const type = ref<TeawareType | null>(null);
  const material = ref<TeawareMaterial | null>(null);
  const minMl = ref<number | null>(null);
  const maxMl = ref<number | null>(null);
  const showRetired = ref(false);

  const state = computed<WareFilterState>(() => ({
    type: type.value,
    material: material.value,
    minMl: minMl.value,
    maxMl: maxMl.value,
    showRetired: showRetired.value,
  }));

  const activeCount = computed(
    () =>
      Number(type.value !== null) +
      Number(material.value !== null) +
      Number(minMl.value !== null || maxMl.value !== null) +
      Number(showRetired.value),
  );

  function clear(): void {
    type.value = null;
    material.value = null;
    minMl.value = null;
    maxMl.value = null;
    showRetired.value = false;
  }

  return { type, material, minMl, maxMl, showRetired, state, activeCount, clear };
});
