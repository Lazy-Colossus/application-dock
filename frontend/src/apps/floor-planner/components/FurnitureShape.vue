<template>
  <svg
    class="furniture-shape"
    :width="width"
    :height="height"
    :viewBox="`-1 -1 ${width} ${height}`"
    role="img"
    :aria-label="`${piece.name}, ${sizeLabel(piece)}`"
    data-testid="furniture-shape"
  >
    <template v-if="piece.shape === 'custom'">
      <!-- Squares are filled without strokes; only the outer edge is drawn, so no seams show. -->
      <path
        v-for="f in customFills(piece.cells ?? [], scaleUsed)"
        :key="f.colour"
        :d="f.d"
        :fill="f.hex"
      />
      <path
        :d="customEdges(piece.cells ?? [], scaleUsed)"
        fill="none"
        stroke="rgba(0,0,0,.4)"
        stroke-width="1"
        data-testid="custom-edges"
      />
    </template>
    <path
      v-else
      :d="outline(piece, scaleUsed)"
      :fill="colourHex(piece.colour)"
      stroke="rgba(0,0,0,.4)"
      stroke-width="1"
    />
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  colourHex,
  customEdges,
  customFills,
  fitScale,
  outline,
  sizeLabel,
} from "../furniture";
import type { Furniture } from "../types";

const props = defineProps<{
  piece: Pick<
    Furniture,
    "name" | "colour" | "shape" | "width_cm" | "depth_cm" | "cells"
  >;
  /** px per cm. */
  scale: number;
  /** Shrinks the drawing so its longer side fits this many px. */
  maxPx?: number;
}>();

const scaleUsed = computed(() =>
  props.maxPx ? fitScale(props.piece, props.scale, props.maxPx) : props.scale,
);
// One extra px on each side keeps the outline inside the svg.
const width = computed(
  () => +(props.piece.width_cm * scaleUsed.value + 2).toFixed(2),
);
const height = computed(
  () => +(props.piece.depth_cm * scaleUsed.value + 2).toFixed(2),
);
</script>

<style scoped lang="scss">
.furniture-shape {
  display: block;
  overflow: visible;
}
</style>
