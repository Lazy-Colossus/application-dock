<template>
  <div class="furniture-grid" data-testid="furniture-grid">
    <p v-if="pieces.length === 0" class="furniture-grid__empty">
      No furniture yet. Add a piece to get started.
    </p>
    <button
      v-for="p in pieces"
      :key="p.id"
      type="button"
      class="furniture-grid__card"
      :data-testid="`grid-piece-${p.id}`"
      @click="emit('select', p.id)"
    >
      <span class="furniture-grid__thumb">
        <FurnitureShape :piece="p" :scale="1" :max-px="96" />
      </span>
      <span class="furniture-grid__name">{{ p.name }}</span>
      <span class="fp-mono furniture-grid__size">{{ sizeLabel(p) }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import FurnitureShape from "./FurnitureShape.vue";
import { sizeLabel } from "../furniture";
import type { Furniture } from "../types";

defineProps<{ pieces: Furniture[] }>();
const emit = defineEmits<{ select: [id: string] }>();
</script>

<style scoped lang="scss">
.furniture-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  padding: 16px;
}
.furniture-grid__empty {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--fp-muted);
}
.furniture-grid__card {
  display: flex;
  flex-direction: column;
  align-items: center;
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
