<template>
  <!--
    The folder's own index tabs, and the collection's meal filter — one control,
    not two. They sit outside `.kc-band` because they belong to the folder's
    edge, not to the paper inside it, and the open one rises to join the cover.
  -->
  <nav class="kc-tabs" aria-label="Recipe dividers">
    <!--
      Below 640px the label is swapped for the glyph, not hidden behind a
      scroll: five typed labels do not fit across a phone, and a rail you have
      to scroll to see the divider you want is a rail that has stopped doing
      the job. `aria-label` carries the name in both modes, so nothing is lost
      when the word goes.
    -->
    <button
      v-for="tab in TABS"
      :key="tab.key"
      type="button"
      class="kc-tab"
      :aria-label="tab.label"
      :aria-pressed="isOpen(tab)"
      :data-testid="`tab-${tab.key}`"
      @click="select(tab)"
    >
      <span class="kc-tab__label">{{ tab.label }}</span>
      <svg
        class="kc-tab__icon"
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.7"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path :d="tab.glyph" />
      </svg>
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
  /** Drawn at phone width, where the label does not fit. */
  glyph: string;
}

/**
 * The glyphs are the FOOD, not the time of day.
 *
 * A sun for breakfast and a moon for dinner is the tidier pair, but dessert
 * has no hour and `Kept` has none either, so half the rail would be telling
 * the time and half would not. Drawn objects keep one register across all
 * five: a list, an egg, a cloche, a slice, a heart.
 *
 * `Kept` wears the same heart as the favourite mark on every row, so the
 * divider and the thing it collects are visibly the same idea.
 */
const GLYPH = {
  // A list: three ruled lines, the last one short.
  all: "M4 7h16M4 12h16M4 17h10",
  // A fried egg — white and yolk. The one breakfast that is not a cuisine.
  breakfast:
    "M5.4 13.6c-1.7-3.7 1-7.3 4.6-7.7 3-.3 4.3 1.9 6.3 2.2 2.2.2 3.5 1.4 3.3 3.4-.3 3.2-3.6 5.4-7.4 5.4-3.2 0-5.8-1-6.8-3.3ZM13.6 11a2.6 2.6 0 1 1-5.2 0 2.6 2.6 0 0 1 5.2 0Z",
  // A cloche: a served meal, which is what dinner is and lunch is not.
  dinner: "M4 17.5h16M5.6 17.5a6.4 6.4 0 0 1 12.8 0M12 7.6V6.2",
  // A slice of cake, cut side on, with its filling and a cherry.
  dessert: "M5.6 18h12.8M6.4 18 12 8l5.6 10M8.6 14.2h6.8M12 6.9v-.8",
  // The favourite mark, at divider size.
  kept: "M12 19.6l-1.2-1.1C6.2 14 3.2 11.4 3.2 8.2A4.4 4.4 0 0 1 7.6 3.8c1.5 0 2.9.7 4.4 2 1.1-1.3 2.5-2 4-2a4.4 4.4 0 0 1 4.4 4.4c0 3.2-3 5.8-7.6 10.3L12 19.6Z",
};

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
  {
    key: "all",
    label: "All",
    mealType: null,
    favouritesOnly: false,
    glyph: GLYPH.all,
  },
  {
    key: "breakfast",
    label: "Breakfast",
    mealType: "breakfast",
    favouritesOnly: false,
    glyph: GLYPH.breakfast,
  },
  {
    key: "dinner",
    label: "Dinner",
    mealType: "dinner",
    favouritesOnly: false,
    glyph: GLYPH.dinner,
  },
  {
    key: "dessert",
    label: "Dessert",
    mealType: "dessert",
    favouritesOnly: false,
    glyph: GLYPH.dessert,
  },
  {
    key: "kept",
    label: "Kept",
    mealType: null,
    favouritesOnly: true,
    glyph: GLYPH.kept,
  },
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
