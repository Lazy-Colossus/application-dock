<template>
  <div class="draw-panel" data-testid="draw-panel">
    <div class="draw-panel__history">
      <button
        type="button"
        class="fp-button"
        :disabled="!canUndo"
        data-testid="undo"
        @click="emit('undo')"
      >
        Undo
      </button>
      <button
        type="button"
        class="fp-button"
        :disabled="!canRedo"
        data-testid="redo"
        @click="emit('redo')"
      >
        Redo
      </button>
    </div>

    <section>
      <h3 class="draw-panel__heading">Structure</h3>
      <div class="draw-panel__tiles">
        <button
          v-for="s in STRUCTURE"
          :key="s.id"
          type="button"
          class="draw-panel__row"
          :class="{ 'draw-panel__row--active': brush.id === s.id }"
          :aria-pressed="brush.id === s.id"
          :title="s.label"
          :data-testid="`brush-${s.id}`"
          @click="emit('update:brush', structureBrush(s))"
        >
          <span class="draw-panel__swatch" :style="{ background: s.colour }" />
          <span class="draw-panel__name">{{ s.label }}</span>
        </button>
      </div>
      <p
        v-if="brush.id === 'door' || brush.id === 'front_door'"
        class="draw-panel__tip"
        data-testid="door-tip"
      >
        Click a door to choose which way it opens, its hinge, or make it double.
      </p>
    </section>

    <section>
      <h3 class="draw-panel__heading">Floors</h3>
      <div
        v-for="f in FLOORS"
        :key="f.id"
        class="draw-panel__floor"
        :class="{ 'draw-panel__floor--active': brush.id === f.id }"
      >
        <button
          type="button"
          class="draw-panel__row draw-panel__row--bare"
          :aria-pressed="brush.id === f.id"
          :data-testid="`brush-${f.id}`"
          @click="emit('update:brush', floorBrush(f, chosen(f)))"
        >
          <span
            class="draw-panel__swatch"
            :style="{ background: swatchOf(f) }"
          />
          <span class="draw-panel__name">{{ f.label }}</span>
        </button>
        <div v-if="f.swatches.length > 1" class="draw-panel__chips">
          <button
            v-for="s in f.swatches"
            :key="s.code"
            type="button"
            class="draw-panel__chip"
            :class="{ 'draw-panel__chip--on': chosen(f) === s.code }"
            :style="{ background: s.colour }"
            :aria-label="`${f.label} ${s.name}`"
            :title="s.name"
            :data-testid="`chip-${s.code}`"
            @click="emit('update:brush', floorBrush(f, s.code))"
          />
        </div>
      </div>
    </section>

    <section>
      <h3 class="draw-panel__heading">Tools</h3>
      <div class="draw-panel__tiles">
        <button
          type="button"
          class="draw-panel__row"
          :class="{ 'draw-panel__row--active': brush.id === 'eraser' }"
          :aria-pressed="brush.id === 'eraser'"
          data-testid="brush-eraser"
          @click="emit('update:brush', ERASER)"
        >
          <span class="draw-panel__swatch draw-panel__swatch--eraser">×</span>
          <span class="draw-panel__name">Eraser</span>
        </button>
        <button
          type="button"
          class="draw-panel__row"
          :class="{ 'draw-panel__row--active': brush.id === 'label' }"
          :aria-pressed="brush.id === 'label'"
          title="Room label"
          data-testid="brush-label"
          @click="emit('update:brush', LABEL_TOOL)"
        >
          <span class="draw-panel__swatch draw-panel__swatch--label">Aa</span>
          <span class="draw-panel__name">Label</span>
        </button>
      </div>
    </section>

    <section>
      <h3 class="draw-panel__heading">Brush</h3>
      <div class="draw-panel__segmented" role="group" aria-label="Draw as">
        <button
          v-for="s in shapes"
          :key="s.id"
          type="button"
          :class="{ 'draw-panel__seg--on': shape === s.id }"
          :aria-pressed="shape === s.id"
          :data-testid="`shape-${s.id}`"
          @click="emit('update:shape', s.id)"
        >
          {{ s.label }}
        </button>
      </div>
      <div class="draw-panel__segmented" role="group" aria-label="Brush size">
        <button
          v-for="n in BRUSH_SIZES"
          :key="n"
          type="button"
          class="fp-mono"
          :class="{ 'draw-panel__seg--on': size === n }"
          :aria-pressed="size === n"
          :disabled="shape === 'rectangle'"
          :title="
            shape === 'rectangle'
              ? 'Brush size is for Freehand only'
              : `${n * 20} cm brush`
          "
          :data-testid="`size-${n}`"
          @click="emit('update:size', n)"
        >
          {{ n }}×{{ n }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import {
  ERASER,
  FLOORS,
  LABEL_TOOL,
  STRUCTURE,
  floorBrush,
  structureBrush,
  swatchBackground,
  type Brush,
  type FloorFamily,
} from "../codes";
import { BRUSH_SIZES, type BrushSize } from "../grid";

type Shape = "freehand" | "rectangle";

const props = defineProps<{
  brush: Brush;
  shape: Shape;
  size: BrushSize;
  canUndo: boolean;
  canRedo: boolean;
}>();

const emit = defineEmits<{
  "update:brush": [brush: Brush];
  "update:shape": [shape: Shape];
  "update:size": [size: BrushSize];
  undo: [];
  redo: [];
}>();

const shapes: { id: Shape; label: string }[] = [
  { id: "freehand", label: "Freehand" },
  { id: "rectangle", label: "Rectangle" },
];

/** The family's current colour: the active brush's if it's this family, else its default. */
function chosen(f: FloorFamily): string {
  return props.brush.id === f.id ? props.brush.code : f.defaultCode;
}

function swatchOf(f: FloorFamily): string {
  return swatchBackground(chosen(f));
}
</script>

<style scoped lang="scss">
// Compact so every tool fits on a laptop screen without scrolling the panel.
.draw-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.draw-panel section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.draw-panel__heading {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fp-muted);
}
.draw-panel__tip {
  margin: 2px 0 0;
  font-size: 12px;
  line-height: 1.4;
  color: var(--fp-muted);
}
.draw-panel__tiles {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
}
.draw-panel__row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--fp-ink);
  font: 500 13px/1 var(--fp-sans);
  text-align: left;
  cursor: pointer;
  &:hover {
    background: #f1efea;
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
.draw-panel__name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.draw-panel__row--active,
.draw-panel__row--active:hover {
  border-color: var(--fp-accent);
  background: #e8eefc;
}
.draw-panel__row--bare {
  flex: 1;
  height: 28px;
  padding: 0;
  &:hover {
    background: transparent;
  }
}
.draw-panel__floor {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid transparent;
  border-radius: 6px;
}
.draw-panel__floor--active {
  border-color: var(--fp-accent);
  background: #e8eefc;
}
.draw-panel__swatch {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  box-sizing: border-box;
  border: 1px solid rgba(0, 0, 0, 0.25);
  border-radius: 3px;
  font-size: 11px;
  font-weight: 600;
}
.draw-panel__swatch--eraser {
  border-style: dashed;
  border-color: #77746a;
}
.draw-panel__swatch--label {
  font-size: 9px;
}
.draw-panel__chips {
  display: flex;
  gap: 6px;
}
.draw-panel__chip {
  width: 18px;
  height: 18px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  cursor: pointer;
}
.draw-panel__chip--on {
  outline: 2px solid var(--fp-accent);
  outline-offset: 1px;
}
.draw-panel__segmented {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: #f1efea;
}
.draw-panel__segmented button {
  flex: 1;
  height: 28px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #3d3b36;
  font: 500 12px/1 var(--fp-sans);
  cursor: pointer;
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
.draw-panel__segmented .fp-mono {
  font-family: var(--fp-mono);
}
.draw-panel__segmented .draw-panel__seg--on {
  background: var(--fp-chrome);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  color: var(--fp-ink);
  font-weight: 600;
}
.draw-panel__history {
  display: flex;
  gap: 6px;
}
.draw-panel__history .fp-button {
  flex: 1;
  height: 32px;
}
</style>
