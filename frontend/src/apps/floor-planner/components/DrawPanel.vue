<template>
  <div class="draw-panel" data-testid="draw-panel">
    <div class="draw-panel__history">
      <button
        type="button"
        class="fp-button"
        :disabled="locked || !canUndo"
        data-testid="undo"
        @click="emit('undo')"
      >
        Undo
      </button>
      <button
        type="button"
        class="fp-button"
        :disabled="locked || !canRedo"
        data-testid="redo"
        @click="emit('redo')"
      >
        Redo
      </button>
    </div>

    <p v-if="locked" class="draw-panel__hint" data-testid="draw-locked">
      Unlock the plan to draw.
    </p>

    <section>
      <h3 class="draw-panel__heading">Structure</h3>
      <button
        v-for="s in STRUCTURE"
        :key="s.id"
        type="button"
        class="draw-panel__row"
        :class="{ 'draw-panel__row--active': brush.id === s.id }"
        :aria-pressed="brush.id === s.id"
        :disabled="locked"
        :data-testid="`brush-${s.id}`"
        @click="emit('update:brush', structureBrush(s))"
      >
        <span class="draw-panel__swatch" :style="{ background: s.colour }" />
        {{ s.label }}
      </button>
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
          :disabled="locked"
          :data-testid="`brush-${f.id}`"
          @click="emit('update:brush', floorBrush(f, chosen(f)))"
        >
          <span
            class="draw-panel__swatch"
            :style="{ background: swatchOf(f) }"
          />
          {{ f.label }}
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
            :disabled="locked"
            :data-testid="`chip-${s.code}`"
            @click="emit('update:brush', floorBrush(f, s.code))"
          />
        </div>
      </div>
    </section>

    <section>
      <h3 class="draw-panel__heading">Tools</h3>
      <button
        type="button"
        class="draw-panel__row"
        :class="{ 'draw-panel__row--active': brush.id === 'eraser' }"
        :aria-pressed="brush.id === 'eraser'"
        :disabled="locked"
        data-testid="brush-eraser"
        @click="emit('update:brush', ERASER)"
      >
        <span class="draw-panel__swatch draw-panel__swatch--eraser">×</span>
        Eraser
      </button>
      <button
        type="button"
        class="draw-panel__row"
        :class="{ 'draw-panel__row--active': brush.id === 'label' }"
        :aria-pressed="brush.id === 'label'"
        :disabled="locked"
        data-testid="brush-label"
        @click="emit('update:brush', LABEL_TOOL)"
      >
        <span class="draw-panel__swatch draw-panel__swatch--label">Aa</span>
        Room label
      </button>
    </section>

    <section>
      <h3 class="draw-panel__heading">Draw as</h3>
      <div class="draw-panel__segmented" role="group" aria-label="Draw as">
        <button
          v-for="s in shapes"
          :key="s.id"
          type="button"
          :class="{ 'draw-panel__seg--on': shape === s.id }"
          :aria-pressed="shape === s.id"
          :disabled="locked"
          :data-testid="`shape-${s.id}`"
          @click="emit('update:shape', s.id)"
        >
          {{ s.label }}
        </button>
      </div>
    </section>

    <section>
      <h3 class="draw-panel__heading">Brush size</h3>
      <div class="draw-panel__segmented" role="group" aria-label="Brush size">
        <button
          v-for="n in BRUSH_SIZES"
          :key="n"
          type="button"
          :class="{ 'draw-panel__seg--on': size === n }"
          :aria-pressed="size === n"
          :disabled="locked || shape === 'rectangle'"
          :data-testid="`size-${n}`"
          @click="emit('update:size', n)"
        >
          {{ n }}×{{ n }}
        </button>
      </div>
      <p v-if="shape === 'rectangle'" class="draw-panel__note">
        Freehand only.
      </p>
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
  locked: boolean;
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
.draw-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.draw-panel section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.draw-panel__heading {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fp-muted);
}
.draw-panel__hint {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--fp-unlocked-bg);
  color: var(--fp-unlocked-ink);
  font-size: 13px;
}
.draw-panel__row {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 40px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--fp-ink);
  font: 500 14px/1 var(--fp-sans);
  text-align: left;
  cursor: pointer;
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
.draw-panel__row--active {
  border-color: var(--fp-accent);
  background: #e8eefc;
}
.draw-panel__row--bare {
  height: 28px;
  padding: 0;
}
.draw-panel__floor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
}
.draw-panel__floor--active {
  border-color: var(--fp-accent);
  background: #e8eefc;
}
.draw-panel__swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
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
  font-size: 10px;
}
.draw-panel__chips {
  display: flex;
  gap: 8px;
  padding-left: 30px;
}
.draw-panel__chip {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  cursor: pointer;
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
.draw-panel__chip--on {
  outline: 2px solid var(--fp-accent);
  outline-offset: 2px;
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
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
  height: 34px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #3d3b36;
  font: 500 13px/1 var(--fp-sans);
  cursor: pointer;
}
.draw-panel__segmented .draw-panel__seg--on {
  background: var(--fp-chrome);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  color: var(--fp-ink);
  font-weight: 600;
}
.draw-panel__note {
  margin: 2px 0 0;
  font-size: 12px;
  color: var(--fp-muted);
}
.draw-panel__history {
  display: flex;
  gap: 6px;
}
.draw-panel__history .fp-button {
  flex: 1;
}
</style>
