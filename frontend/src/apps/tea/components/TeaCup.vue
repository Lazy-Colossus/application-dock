<template>
  <svg class="cup" viewBox="0 0 238 180" role="img" :aria-label="`Steep at ${Math.floor(elapsed)} of ${target} seconds`">
    <defs>
      <clipPath :id="clipId">
        <path d="M44 30 Q46 118 92 140 L146 140 Q192 118 194 30 Z" />
      </clipPath>
    </defs>
    <g :clip-path="`url(#${clipId})`">
      <rect
        :class="['cup__liquor', { 'cup__liquor--draining': !running }]"
        data-testid="cup-liquor"
        x="30"
        y="30"
        width="180"
        :height="DEPTH"
        :fill="fill"
        :data-level="Number(level.toFixed(3))"
        :style="{ transform: `translateY(${(1 - level) * DEPTH}px)` }"
      />
    </g>
    <path class="cup__line" d="M40 28 Q44 120 92 142 L146 142 Q194 120 198 28" />
    <path class="cup__line" d="M100 142 L102 152 L136 152 L138 142" />
    <line
      class="cup__target"
      data-testid="cup-target"
      x1="36"
      :y1="targetY"
      x2="202"
      :y2="targetY"
    />
    <g
      class="cup__target-edit"
      data-testid="cup-target-edit"
      role="button"
      tabindex="0"
      aria-label="Edit this steep's target"
      @click="emit('editTarget')"
      @keydown.enter="emit('editTarget')"
    >
      <!-- The label alone is a few pixels tall; this is the finger-sized hit area. -->
      <rect x="198" :y="targetY - 14" width="40" height="28" fill="transparent" />
      <text class="cup__target-label" data-testid="cup-target-label" x="206" :y="targetY + 3">
        {{ target }}s
      </text>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed, useId } from "vue";
import { TARGET_LEVEL, darken, fillLevel, overSteep } from "../timer";

const props = defineProps<{ elapsed: number; target: number; color: string; running: boolean }>();
const emit = defineEmits<{ editTarget: [] }>();

const BOTTOM = 140;
const DEPTH = 110;
const clipId = `cup-clip-${useId()}`;

const level = computed(() => fillLevel(props.elapsed, props.target));
const fill = computed(() => darken(props.color, overSteep(props.elapsed, props.target)));
const targetY = BOTTOM - TARGET_LEVEL * DEPTH;
</script>

<style scoped lang="scss">
.cup {
  display: block;
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
}
.cup__liquor {
  // Short linear easing smooths the 200ms clock ticks while steeping.
  transition: transform 0.2s linear;
}
.cup__liquor--draining {
  transition: transform 0.6s ease-in;
}
.cup__line {
  fill: none;
  stroke: #e4d9c6;
  stroke-width: 2.5;
}
.cup__target {
  stroke: #d9a45b;
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}
.cup__target-edit {
  cursor: pointer;
  outline: none;
}
.cup__target-label {
  fill: #d9a45b;
  font-size: 10px;
  font-family: inherit;
  text-decoration: underline dotted;
}
</style>
