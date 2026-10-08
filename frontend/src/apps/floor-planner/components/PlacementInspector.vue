<template>
  <div class="inspector" data-testid="placement-inspector">
    <h3 class="inspector__heading">Selected</h3>
    <div class="inspector__who">
      <FurnitureShape :piece="piece" :scale="0.8" :max-px="48" />
      <div>
        <div class="inspector__name">{{ piece.name }}</div>
        <div class="inspector__kind">{{ shapeLabel }} · {{ piece.colour }}</div>
      </div>
    </div>
    <dl class="inspector__facts">
      <dt>Size</dt>
      <dd class="fp-mono">{{ sizeLabel(piece) }}</dd>
      <dt>Position</dt>
      <dd class="fp-mono" data-testid="inspector-position">{{ position }}</dd>
      <dt>Rotation</dt>
      <dd class="fp-mono" data-testid="inspector-rotation">
        {{ placement.rotation }}°
      </dd>
    </dl>
    <div class="inspector__turn">
      <button
        type="button"
        class="fp-button"
        data-testid="rotate-left"
        @click="emit('rotate', -90)"
      >
        Left
      </button>
      <button
        type="button"
        class="fp-button"
        data-testid="rotate-right"
        @click="emit('rotate', 90)"
      >
        Right (R)
      </button>
    </div>
    <div
      v-if="warnings.length"
      class="inspector__warn"
      data-testid="inspector-warnings"
    >
      <strong v-for="w in warnings" :key="w">{{ w }}.</strong>
      You can leave it there, it's only a warning.
    </div>
    <button
      type="button"
      class="fp-button"
      data-testid="back-to-tray"
      @click="emit('back')"
    >
      Back to tray
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FurnitureShape from "./FurnitureShape.vue";
import { SHAPES, sizeLabel } from "../furniture";
import { bounds } from "../geometry";
import type { Furniture, Placement } from "../types";

const props = defineProps<{
  piece: Furniture;
  placement: Placement;
  warnings: string[];
}>();

const emit = defineEmits<{ rotate: [delta: -90 | 90]; back: [] }>();

const shapeLabel = computed(
  () =>
    SHAPES.find((s) => s.id === props.piece.shape)?.label ?? props.piece.shape,
);
/** The rotated box's top-left, as the plan's rulers would read it. */
const position = computed(() => {
  const b = bounds(props.piece, props.placement);
  return `${(b.x / 100).toFixed(2)} m, ${(b.y / 100).toFixed(2)} m`;
});
</script>

<style scoped lang="scss">
.inspector {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.inspector__heading {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fp-muted);
}
.inspector__who {
  display: flex;
  align-items: center;
  gap: 12px;
}
.inspector__name {
  font: 600 18px var(--fp-sans);
}
.inspector__kind {
  font-size: 13px;
  color: #4a4843;
}
.inspector__facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 8px 14px;
  margin: 0;
  font-size: 13px;
}
.inspector__facts dt {
  color: var(--fp-muted);
}
.inspector__facts dd {
  margin: 0;
}
.inspector__turn {
  display: flex;
  gap: 6px;
}
.inspector__turn .fp-button {
  flex: 1;
}
.inspector__warn {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  border: 1px solid #f4c3a3;
  border-radius: 6px;
  background: var(--fp-warn-bg);
  color: var(--fp-warn-ink);
  font-size: 13px;
  line-height: 1.4;
}
</style>
