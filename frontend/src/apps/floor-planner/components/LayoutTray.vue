<template>
  <div class="tray" data-testid="layout-tray">
    <div v-if="!locked" class="tray__lock" data-testid="tray-lock">
      <p>Lock the plan to arrange furniture.</p>
      <button
        type="button"
        class="fp-button fp-button--primary"
        @click="emit('lock')"
      >
        Lock plan
      </button>
    </div>
    <template v-else>
      <section>
        <h3 class="tray__heading">Tray · not in {{ layoutName }}</h3>
        <p v-if="pieces.length + placed.length === 0" class="tray__hint">
          Add furniture first in the Furniture tab.
        </p>
        <p v-else-if="pieces.length === 0" class="tray__hint">
          Everything is on the plan.
        </p>
        <p v-else class="tray__hint">Drag a piece onto the plan.</p>
        <div
          v-for="p in pieces"
          :key="p.id"
          class="tray__card"
          draggable="true"
          :data-testid="`tray-${p.id}`"
          @dragstart="start($event, p.id)"
        >
          <span class="tray__thumb">
            <FurnitureShape :piece="p" :scale="0.8" :max-px="56" />
          </span>
          <span class="tray__name">{{ p.name }}</span>
          <span class="fp-mono tray__size">{{ sizeLabel(p) }}</span>
        </div>
      </section>
      <section v-if="placed.length">
        <h3 class="tray__heading">On the plan · {{ placed.length }}</h3>
        <button
          v-for="p in placed"
          :key="p.id"
          type="button"
          class="tray__row"
          :class="{ 'tray__row--on': p.id === selectedId }"
          :aria-pressed="p.id === selectedId"
          :data-testid="`on-plan-${p.id}`"
          @click="emit('select', p.id)"
        >
          <span>{{ p.name }}</span>
          <span class="fp-mono tray__size">{{ sizeLabel(p) }}</span>
        </button>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import FurnitureShape from "./FurnitureShape.vue";
import { PIECE_DRAG_TYPE, sizeLabel } from "../furniture";
import type { Furniture } from "../types";

defineProps<{
  pieces: Furniture[];
  placed: Furniture[];
  layoutName: string;
  selectedId: string | null;
  locked: boolean;
}>();

const emit = defineEmits<{ select: [id: string]; lock: [] }>();

function start(e: DragEvent, id: string): void {
  if (!e.dataTransfer) return;
  e.dataTransfer.setData(PIECE_DRAG_TYPE, id);
  e.dataTransfer.effectAllowed = "copy";
}
</script>

<style scoped lang="scss">
.tray {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.tray section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.tray__heading {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fp-muted);
}
.tray__hint {
  margin: 0;
  font-size: 12px;
  color: var(--fp-muted);
}
.tray__lock {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 8px;
  background: var(--fp-unlocked-bg);
  color: var(--fp-unlocked-ink);
  font-size: 13px;
}
.tray__lock p {
  margin: 0;
}
.tray__card {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px 8px;
  padding: 10px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background: var(--fp-chrome);
  cursor: grab;
}
.tray__thumb {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  border-radius: 4px;
  background-color: #f6f5f1;
  background-image:
    linear-gradient(to right, rgba(0, 0, 0, 0.07) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.07) 1px, transparent 1px);
  background-size: 8px 8px;
}
.tray__name {
  font: 600 14px var(--fp-sans);
}
.tray__size {
  font-size: 12px;
  color: #4a4843;
}
.tray__row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  min-height: 36px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-bottom-color: #e6e3dc;
  border-radius: 4px;
  background: transparent;
  color: var(--fp-ink);
  font: 400 13px var(--fp-sans);
  text-align: left;
  cursor: pointer;
  align-items: center;
}
.tray__row--on {
  border-color: var(--fp-accent);
  background: #e8eefc;
}
</style>
