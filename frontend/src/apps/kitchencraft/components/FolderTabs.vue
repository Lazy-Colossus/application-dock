<template>
  <!--
    The folder's own index tabs, and the collection's meal filter — one control,
    not two. They sit outside `.kc-band` because they belong to the folder's
    edge, not to the paper inside it, and the open one rises to join the cover.
  -->
  <nav class="kc-tabs" aria-label="Recipe dividers">
    <button
      v-for="tab in TABS"
      :key="tab.key"
      type="button"
      class="kc-tab"
      :aria-pressed="isOpen(tab)"
      :data-testid="`tab-${tab.key}`"
      @click="select(tab)"
    >
      {{ tab.label }}
    </button>
  </nav>
</template>

<script setup lang="ts">
import type { MealType } from "@/apps/kitchencraft/types";
import type { Filters } from "@/apps/kitchencraft/composables/useCollectionFilters";

interface Tab {
  key: string;
  label: string;
  mealType: MealType | null;
  favouritesOnly: boolean;
}

/**
 * Five dividers, and they are mutually exclusive because a folder has one
 * divider open at a time.
 *
 * This is deliberately NOT the six meal types. `lunch`, `snack` and `other`
 * have no divider: a tab rail wide enough for all six stops reading as a
 * folder, and those three are reachable through search and tags. That is the
 * cost of the tabs replacing the meal-type chips, and it is a real one.
 *
 * `Kept` is the favourites view, still one interaction from the collection
 * (Story 2.6 AC 4) — it just arrives as a divider now rather than a chip.
 */
const TABS: Tab[] = [
  { key: "all", label: "All recipes", mealType: null, favouritesOnly: false },
  {
    key: "breakfast",
    label: "Breakfast",
    mealType: "breakfast",
    favouritesOnly: false,
  },
  { key: "dinner", label: "Dinner", mealType: "dinner", favouritesOnly: false },
  {
    key: "dessert",
    label: "Dessert",
    mealType: "dessert",
    favouritesOnly: false,
  },
  { key: "kept", label: "Kept", mealType: null, favouritesOnly: true },
];

const props = defineProps<{ modelValue: Filters }>();
const emit = defineEmits<{ "update:modelValue": [filters: Filters] }>();

function isOpen(tab: Tab): boolean {
  return (
    props.modelValue.mealType === tab.mealType &&
    props.modelValue.favouritesOnly === tab.favouritesOnly
  );
}

/**
 * Flipping to a divider sets only the two values a divider owns. Search and
 * tags are untouched, because filters combine and never replace (FR-11).
 */
function select(tab: Tab): void {
  emit("update:modelValue", {
    ...props.modelValue,
    mealType: tab.mealType,
    favouritesOnly: tab.favouritesOnly,
  });
}
</script>
