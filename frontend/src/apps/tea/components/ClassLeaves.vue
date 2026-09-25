<template>
  <div :class="['leaves', { 'leaves--active': active }]" data-testid="section-leaves" aria-hidden="true">
    <svg
      v-for="(leaf, i) in layout"
      :key="i"
      class="leaves__leaf"
      :width="leaf.width"
      :height="leaf.height"
      :viewBox="viewBox"
      :style="leaf.style"
    >
      <path :d="path" :fill="tokens.liquor" :opacity="leaf.opacity" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CLASS_TOKENS } from "../tokens";
import type { TeaClass } from "../types";

const props = defineProps<{ classId: TeaClass; index: number; active: boolean }>();

// Copied verbatim from mockups/shelf.html (#sin / #ass) — they are the
// drawing; redrawing them by eye would not match.
const SINENSIS = "M6 47 C54 9 148 1 254 43 C210 62 150 78 96 76 C56 74 24 62 6 47 Z";
const ASSAMICA = "M12 62 C44 14 128 2 208 44 C198 96 128 128 66 116 C36 110 18 88 12 62 Z";

const tokens = computed(() => CLASS_TOKENS[props.classId]);
const isBroad = computed(() => tokens.value.leaf === "assamica");
const path = computed(() => (isBroad.value ? ASSAMICA : SINENSIS));
const viewBox = computed(() => (isBroad.value ? "0 0 220 130" : "0 0 260 90"));

// Descending sizes at DESIGN.md's opacities. Sections alternate which edge
// they hang off so no two in a row repeat.
const layout = computed(() => {
  const fromLeft = props.index % 2 === 0;
  const edge = fromLeft ? "left" : "right";
  const flip = fromLeft ? "" : " scaleX(-1)";
  const base = isBroad.value ? { w: 250, h: 148 } : { w: 300, h: 104 };

  return [
    { scale: 1, opacity: 0.17, top: 2, offset: -60, rotate: fromLeft ? -15 : 15 },
    { scale: 0.83, opacity: 0.1, top: 60, offset: 28, rotate: fromLeft ? 10 : -10 },
    { scale: 0.66, opacity: 0.06, top: 120, offset: -16, rotate: fromLeft ? -3 : 3 },
  ].map((leaf) => ({
    width: Math.round(base.w * leaf.scale),
    height: Math.round(base.h * leaf.scale),
    opacity: leaf.opacity,
    style: {
      [edge]: `${leaf.offset}px`,
      top: `${leaf.top}px`,
      transform: `rotate(${leaf.rotate}deg)${flip}`,
    },
  }));
});
</script>

<style scoped lang="scss">
.leaves {
  position: absolute;
  inset: -30px -10px;
  pointer-events: none;
  z-index: 0;
  opacity: 0.14;
  transition: opacity 0.85s cubic-bezier(0.22, 0.61, 0.36, 1);
}
.leaves--active {
  opacity: 1;
}
.leaves__leaf {
  position: absolute;
}
@media (prefers-reduced-motion: reduce) {
  .leaves {
    transition: none;
  }
}
</style>
