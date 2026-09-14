<template>
  <div class="kc-head">
    <label class="kc-label" for="kc-search">Search</label>
    <input
      id="kc-search"
      type="text"
      class="kc-field"
      autocomplete="off"
      aria-label="Search names and recipe text"
      data-testid="search"
      :value="modelValue.search"
      @input="patch({ search: ($event.target as HTMLInputElement).value })"
    />

    <div class="kc-group">
      <span class="kc-label">Meal type</span>
      <ul class="kc-chips">
        <li v-for="mealType in MEAL_TYPES" :key="mealType">
          <button
            type="button"
            class="kc-chip kc-chip--control"
            :class="{ 'kc-chip--on': modelValue.mealType === mealType }"
            :aria-pressed="modelValue.mealType === mealType"
            :data-testid="`meal-${mealType}`"
            @click="toggleMealType(mealType)"
          >
            {{ mealType }}
          </button>
        </li>
      </ul>
    </div>

    <!--
      Tags open on demand: a collection with many of them would be a wall of
      chips if the list were always in the way of the search field.
    -->
    <div v-if="tagsInUse.length > 0" class="kc-group">
      <button
        type="button"
        class="kc-label"
        style="
          background: transparent;
          border: 0;
          cursor: pointer;
          text-align: left;
        "
        :aria-expanded="showTags"
        data-testid="toggle-tags"
        @click="showTags = !showTags"
      >
        Tags
      </button>
      <ul v-if="showTags" class="kc-chips" data-testid="tag-filters">
        <li v-for="tag in tagsInUse" :key="tag">
          <button
            type="button"
            class="kc-chip kc-chip--control"
            :class="{ 'kc-chip--on': modelValue.tags.includes(tag) }"
            :aria-pressed="modelValue.tags.includes(tag)"
            :data-testid="`tag-filter-${tag}`"
            @click="toggleIn('tags', tag)"
          >
            {{ tag }}
          </button>
        </li>
      </ul>
    </div>

    <div class="kc-group">
      <button
        type="button"
        class="kc-chip kc-chip--control"
        :class="{ 'kc-chip--on': modelValue.favouritesOnly }"
        :aria-pressed="modelValue.favouritesOnly"
        data-testid="favourites-only"
        @click="patch({ favouritesOnly: !modelValue.favouritesOnly })"
      >
        Favourites only
      </button>
    </div>

    <!--
      Always rendered when anything is active, in `meta`. Never hidden, never a
      badge.
    -->
    <p
      v-if="countLabel"
      class="kc-meta"
      style="margin: 12px 0 0"
      data-testid="count"
    >
      {{ countLabel }}
    </p>

    <div v-if="anyActive" class="kc-group">
      <button
        type="button"
        class="kc-btn kc-btn--quiet"
        style="min-height: 44px"
        data-testid="clear-filters"
        @click="emit('clear-all')"
      >
        Clear filters
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { MEAL_TYPES, type MealType } from "@/apps/kitchencraft/types";
import type { Filters } from "@/apps/kitchencraft/composables/useCollectionFilters";

const props = defineProps<{
  modelValue: Filters;
  /** Tags this collection actually carries, most-used first. */
  tagsInUse: string[];
  countLabel: string | null;
  anyActive: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [filters: Filters];
  "clear-all": [];
}>();

const showTags = ref(false);

function patch(change: Partial<Filters>): void {
  emit("update:modelValue", { ...props.modelValue, ...change });
}

function toggleMealType(mealType: MealType): void {
  patch({ mealType: props.modelValue.mealType === mealType ? null : mealType });
}

function toggleIn(key: "tags", value: string): void {
  const held = props.modelValue[key];
  patch({
    [key]: held.includes(value)
      ? held.filter((v) => v !== value)
      : [...held, value],
  });
}
</script>
