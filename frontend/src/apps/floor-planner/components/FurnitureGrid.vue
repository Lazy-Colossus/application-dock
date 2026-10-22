<template>
  <div class="furniture-grid" data-testid="furniture-grid">
    <p v-if="pieces.length === 0" class="furniture-grid__empty">
      No furniture yet. Add a piece to get started.
    </p>
    <div
      v-else
      class="furniture-grid__cells"
      :style="{
        gridTemplateColumns: `repeat(${COLS}, 1fr)`,
        gridTemplateRows: `repeat(${ROWS}, 1fr)`,
      }"
    >
      <button
        v-for="p in shown"
        :key="p.id"
        type="button"
        class="furniture-grid__card"
        :data-testid="`grid-piece-${p.id}`"
        @click="emit('select', p.id)"
      >
        <span class="furniture-grid__thumb">
          <FurnitureShape :piece="p" :scale="1" :max-px="72" />
        </span>
        <span class="furniture-grid__name">{{ p.name }}</span>
        <span class="fp-mono furniture-grid__size">{{ sizeLabel(p) }}</span>
      </button>
    </div>
    <div
      v-if="pages > 1"
      class="furniture-grid__pager"
      data-testid="grid-pager"
    >
      <button
        type="button"
        class="fp-button"
        :disabled="page === 0"
        data-testid="grid-prev"
        @click="page--"
      >
        ‹
      </button>
      <span class="fp-mono">{{ page + 1 }} / {{ pages }}</span>
      <button
        type="button"
        class="fp-button"
        :disabled="page >= pages - 1"
        data-testid="grid-next"
        @click="page++"
      >
        ›
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import FurnitureShape from "./FurnitureShape.vue";
import { sizeLabel } from "../furniture";
import type { Furniture } from "../types";

const props = defineProps<{ pieces: Furniture[] }>();
const emit = defineEmits<{ select: [id: string] }>();

const COLS = 6;
const ROWS = 3;
const PER_PAGE = COLS * ROWS;

const page = ref(0);
const pages = computed(() => Math.ceil(props.pieces.length / PER_PAGE));
const shown = computed(() =>
  props.pieces.slice(page.value * PER_PAGE, (page.value + 1) * PER_PAGE),
);

watch(pages, (n) => {
  if (page.value >= n) page.value = Math.max(0, n - 1);
});
</script>

<style scoped lang="scss">
.furniture-grid {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  gap: 12px;
  padding: 16px;
}
.furniture-grid__cells {
  display: grid;
  flex: 1;
  gap: 12px;
  min-height: 0;
}
.furniture-grid__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.furniture-grid__empty {
  margin: 0;
  color: var(--fp-muted);
}
.furniture-grid__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  cursor: pointer;
}
.furniture-grid__card:hover {
  border-color: var(--fp-accent);
}
.furniture-grid__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
}
.furniture-grid__name {
  max-width: 100%;
  overflow: hidden;
  font: 600 14px/1.2 var(--fp-sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.furniture-grid__size {
  font-size: 12px;
  color: #4a4843;
}
</style>
