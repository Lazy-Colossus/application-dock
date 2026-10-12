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
    </dl>
    <div class="inspector__turn">
      <!-- Each button shows the piece already turned that way: the words alone read ambiguously. -->
      <button
        v-for="o in orientations"
        :key="o.to"
        type="button"
        class="fp-button inspector__orient"
        :class="{ 'inspector__orient--on': o.current }"
        :aria-pressed="o.current"
        :title="o.title"
        :data-testid="`rotate-${o.to}`"
        @click="emit('rotate', o.rotation)"
      >
        <svg
          class="inspector__orient-icon"
          :viewBox="`${-ICON_PX / 2} ${-ICON_PX / 2} ${ICON_PX} ${ICON_PX}`"
          :width="ICON_PX"
          :height="ICON_PX"
          aria-hidden="true"
          data-testid="orient-icon"
        >
          <g :transform="o.transform">
            <template v-if="piece.shape === 'custom'">
              <path
                v-for="f in customFills(piece.cells ?? [], iconScale)"
                :key="f.colour"
                :d="f.d"
                :fill="f.hex"
              />
            </template>
            <path
              v-else
              :d="outline(piece, iconScale)"
              :fill="colourHex(piece.colour)"
              stroke="rgba(0,0,0,.45)"
              stroke-width="1"
            />
          </g>
        </svg>
        {{ o.label }}
      </button>
    </div>
    <div class="inspector__angle">
      <label for="fp-rotation">Rotation</label>
      <div class="inspector__stepper">
        <button
          type="button"
          class="fp-button"
          :aria-label="`Turn ${ROTATION_STEP}° anticlockwise`"
          data-testid="rotate-minus"
          @click="turn(-ROTATION_STEP)"
        >
          −
        </button>
        <input
          id="fp-rotation"
          class="fp-mono"
          type="number"
          step="1"
          :value="placement.rotation"
          data-testid="rotation-input"
          @change="typed"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
        <span class="inspector__unit">°</span>
        <button
          type="button"
          class="fp-button"
          :aria-label="`Turn ${ROTATION_STEP}° clockwise`"
          data-testid="rotate-plus"
          @click="turn(ROTATION_STEP)"
        >
          +
        </button>
      </div>
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
import {
  SHAPES,
  colourHex,
  customFills,
  fitScale,
  outline,
  sizeLabel,
} from "../furniture";
import { ROTATION_STEP, bounds, normaliseRotation, orient } from "../geometry";
import type { Furniture, Placement } from "../types";

const props = defineProps<{
  piece: Furniture;
  placement: Placement;
  warnings: string[];
}>();

const emit = defineEmits<{ rotate: [rotation: number]; back: [] }>();

function turn(delta: number): void {
  emit("rotate", normaliseRotation(props.placement.rotation + delta));
}

/** Any whole number is accepted and wrapped into 0–359; anything else puts the value back. */
function typed(e: Event): void {
  const input = e.target as HTMLInputElement;
  const deg = input.valueAsNumber;
  if (Number.isFinite(deg)) emit("rotate", normaliseRotation(deg));
  input.value = String(props.placement.rotation);
}

const ICON_PX = 28;
/** The piece's longer side fills the icon, whichever way it's turned. */
const iconScale = computed(() => fitScale(props.piece, 1, ICON_PX - 4));

const orientations = computed(() =>
  (
    [
      {
        to: "vertical",
        label: "Vertical",
        title: "Long side top to bottom (Shift+R)",
      },
      {
        to: "horizontal",
        label: "Horizontal (R)",
        title: "Long side left to right (R)",
      },
    ] as const
  ).map((o) => {
    const rotation = orient(props.piece, props.placement.rotation, o.to);
    const { width_cm, depth_cm } = props.piece;
    const s = iconScale.value;
    return {
      ...o,
      rotation,
      current: rotation === normaliseRotation(props.placement.rotation),
      // Turned about its centre, which sits in the middle of the icon.
      transform: `rotate(${rotation}) translate(${(-width_cm * s) / 2} ${(-depth_cm * s) / 2})`,
    };
  }),
);

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
.inspector__orient {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: auto;
  padding: 8px 6px;
}
.inspector__orient--on {
  border-color: var(--fp-accent);
  box-shadow: inset 0 0 0 1px var(--fp-accent);
}
.inspector__orient-icon {
  display: block;
  overflow: visible;
}
.inspector__angle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  font-size: 13px;
  color: var(--fp-muted);
}
.inspector__stepper {
  display: flex;
  align-items: center;
  gap: 4px;
}
.inspector__stepper .fp-button {
  width: 36px;
  padding: 0;
  font-size: 16px;
}
.inspector__stepper input {
  box-sizing: border-box;
  width: 56px;
  height: 36px;
  padding: 0 6px;
  border: 1px solid var(--fp-control-line);
  border-radius: 6px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  font-size: 14px;
  text-align: right;
}
.inspector__unit {
  margin-left: -2px;
  color: var(--fp-ink);
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
