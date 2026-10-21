<template>
  <div class="furniture-list" data-testid="furniture-list">
    <h3 class="furniture-list__heading">Furniture · {{ pieces.length }}</h3>
    <p v-if="pieces.length === 0" class="furniture-list__empty">
      Nothing yet. Add pieces one by one, or paste a list.
    </p>
    <p v-if="pieces.length > 1" class="furniture-list__hint">
      Drag to reorder. Higher up sits on top on the plan.
    </p>
    <div
      v-for="p in pieces"
      :key="p.id"
      class="furniture-list__item"
      :class="[
        reorder.lineOn(p.id) && `furniture-list__item--${reorder.lineOn(p.id)}`,
        { 'furniture-list__item--dragging': reorder.dragging.value === p.id },
      ]"
      draggable="true"
      :data-testid="`piece-row-${p.id}`"
      @dragstart="reorder.start($event, p.id)"
      @dragover="reorder.hover($event, p.id)"
      @drop="reorder.drop"
      @dragend="reorder.end"
    >
      <span class="furniture-list__grip" aria-hidden="true">⠿</span>
      <button
        type="button"
        class="furniture-list__row"
        :class="{ 'furniture-list__row--on': p.id === selectedId }"
        :aria-pressed="p.id === selectedId"
        :data-testid="`piece-${p.id}`"
        @click="emit('select', p.id)"
      >
        <span class="furniture-list__thumb">
          <FurnitureShape :piece="p" :scale="0.8" :max-px="40" />
        </span>
        <span class="furniture-list__text">
          <span class="furniture-list__name">{{ p.name }}</span>
          <span class="fp-mono furniture-list__size">{{ sizeLabel(p) }}</span>
        </span>
      </button>
    </div>
    <div class="furniture-list__actions">
      <button
        type="button"
        class="fp-button fp-button--primary"
        data-testid="piece-add"
        @click="emit('add')"
      >
        Add a piece
      </button>
      <button
        type="button"
        class="fp-button"
        data-testid="piece-bulk"
        @click="emit('bulk')"
      >
        Bulk add from list
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import FurnitureShape from "./FurnitureShape.vue";
import { sizeLabel } from "../furniture";
import { useReorderDrag } from "../reorder";
import type { Furniture } from "../types";

defineProps<{ pieces: Furniture[]; selectedId: string | null }>();

const emit = defineEmits<{
  select: [id: string];
  add: [];
  bulk: [];
  move: [moved: string, target: string, after: boolean];
}>();

const reorder = useReorderDrag((...args) => emit("move", ...args));
</script>

<style scoped lang="scss">
.furniture-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.furniture-list__heading {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fp-muted);
}
.furniture-list__empty {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--fp-muted);
}
.furniture-list__hint {
  margin: -4px 0 4px;
  font-size: 12px;
  color: var(--fp-muted);
}
.furniture-list__item {
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: 8px;
}
.furniture-list__item--dragging {
  opacity: 0.4;
}
.furniture-list__item--before {
  box-shadow: 0 -3px 0 var(--fp-accent);
}
.furniture-list__item--after {
  box-shadow: 0 3px 0 var(--fp-accent);
}
.furniture-list__grip {
  flex: 0 0 auto;
  padding: 0 2px;
  color: var(--fp-muted);
  cursor: grab;
  user-select: none;
}
.furniture-list__row {
  display: flex;
  flex: 1;
  min-width: 0;
  align-items: center;
  gap: 12px;
  min-height: 56px;
  padding: 6px 10px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  text-align: left;
  cursor: pointer;
}
.furniture-list__row--on {
  border-color: var(--fp-accent);
  background: #e8eefc;
}
.furniture-list__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 48px;
  height: 44px;
}
.furniture-list__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.furniture-list__name {
  overflow: hidden;
  font: 600 14px/1.2 var(--fp-sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.furniture-list__size {
  font-size: 12px;
  color: #4a4843;
}
.furniture-list__actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}
</style>
