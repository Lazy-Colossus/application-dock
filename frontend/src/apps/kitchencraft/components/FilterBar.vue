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

    <!--
      Always rendered when anything is active, in `meta`. Never hidden, never a
      badge.
    -->
    <div v-if="countLabel" class="kc-countline">
      <p class="kc-meta" data-testid="count">{{ countLabel }}</p>
      <!--
        The way out sits on the same line as the count that made you want it,
        as quiet text rather than a button: clearing is a retreat, not the
        thing you came to the screen to do, and a filled control said
        otherwise. The zero-result state keeps its own full-sized button —
        there the exit IS the offer.
      -->
      <button
        v-if="anyActive"
        type="button"
        class="kc-textbtn"
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

function toggleIn(key: "tags", value: string): void {
  const held = props.modelValue[key];
  patch({
    [key]: held.includes(value)
      ? held.filter((v) => v !== value)
      : [...held, value],
  });
}
</script>
