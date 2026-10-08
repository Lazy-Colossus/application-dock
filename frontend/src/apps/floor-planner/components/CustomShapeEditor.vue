<template>
  <div class="shape-editor" data-testid="shape-editor">
    <div
      ref="gridEl"
      class="shape-editor__grid"
      :style="{
        gridTemplateColumns: `repeat(${CUSTOM_MAX}, ${CELL_PX}px)`,
        gridTemplateRows: `repeat(${CUSTOM_MAX}, ${CELL_PX}px)`,
      }"
      @pointerdown="down"
      @pointermove="move"
      @pointerup="up"
      @pointercancel="up"
    >
      <template v-for="(row, r) in grid" :key="r">
        <span
          v-for="(ch, c) in row"
          :key="c"
          class="shape-editor__cell"
          :class="{
            'shape-editor__cell--on': ch === '#',
            'shape-editor__cell--metre-x': (c + 1) % 5 === 0,
            'shape-editor__cell--metre-y': (r + 1) % 5 === 0,
          }"
        />
      </template>
    </div>
    <p class="fp-mono shape-editor__readout" data-testid="shape-readout">
      {{ readoutText }}
    </p>
    <p class="shape-editor__hint">
      Paint the squares the piece covers. Each square is 20 cm.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { maskSize, pad, toggle, trim } from "../customShape";
import { CUSTOM_MAX } from "../furniture";
import { metres, type Cell } from "../grid";

const CELL_PX = 11;

const props = defineProps<{ modelValue: string[] }>();
const emit = defineEmits<{ "update:modelValue": [mask: string[]] }>();

const grid = ref(pad(props.modelValue, CUSTOM_MAX));
const gridEl = ref<HTMLElement | null>(null);
let painting: boolean | null = null;

watch(
  () => props.modelValue,
  (mask) => {
    if (painting === null && trim(grid.value).join() !== mask.join()) {
      grid.value = pad(mask, CUSTOM_MAX);
    }
  },
);

const readoutText = computed(() => {
  const { cols, rows, widthCm, depthCm } = maskSize(trim(grid.value));
  return cols === 0
    ? "Nothing painted yet"
    : `${metres(cols)} × ${metres(rows)} m · ${widthCm} × ${depthCm} cm`;
});

function cellOf(e: PointerEvent): Cell | null {
  const rect = gridEl.value?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const col = Math.floor((e.clientX - rect.left) / CELL_PX);
  const row = Math.floor((e.clientY - rect.top) / CELL_PX);
  if (col < 0 || row < 0 || col >= CUSTOM_MAX || row >= CUSTOM_MAX) return null;
  return { col, row };
}

function down(e: PointerEvent): void {
  const cell = cellOf(e);
  if (!cell) return;
  gridEl.value?.setPointerCapture?.(e.pointerId);
  // The first square decides the stroke: an empty one paints, a painted one clears.
  painting = grid.value[cell.row][cell.col] !== "#";
  grid.value = toggle(grid.value, cell, painting);
}

function move(e: PointerEvent): void {
  if (painting === null) return;
  const cell = cellOf(e);
  if (cell) grid.value = toggle(grid.value, cell, painting);
}

function up(): void {
  if (painting === null) return;
  painting = null;
  emit("update:modelValue", trim(grid.value));
}
</script>

<style scoped lang="scss">
.shape-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.shape-editor__grid {
  display: grid;
  width: max-content;
  border: 1px solid var(--fp-control-line);
  background: var(--fp-chrome);
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}
.shape-editor__cell {
  box-sizing: border-box;
  border-right: 1px solid rgba(0, 0, 0, 0.08);
  border-bottom: 1px solid rgba(0, 0, 0, 0.08);
}
.shape-editor__cell--metre-x {
  border-right-color: rgba(0, 0, 0, 0.28);
}
.shape-editor__cell--metre-y {
  border-bottom-color: rgba(0, 0, 0, 0.28);
}
.shape-editor__cell--on {
  background: var(--fp-accent);
}
.shape-editor__readout {
  margin: 0;
  font-size: 13px;
}
.shape-editor__hint {
  margin: 0;
  font-size: 12px;
  color: var(--fp-muted);
}
</style>
