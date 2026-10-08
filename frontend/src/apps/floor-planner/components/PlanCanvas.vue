<template>
  <svg
    ref="svg"
    class="plan-canvas"
    :class="{ 'plan-canvas--editable': editable }"
    :viewBox="`${-RULER_CM} ${-RULER_CM} ${widthCm + RULER_CM} ${heightCm + RULER_CM}`"
    :width="(widthCm + RULER_CM) * scale"
    :height="(heightCm + RULER_CM) * scale"
    role="img"
    aria-label="Floor plan"
    data-testid="plan-canvas"
    @pointerdown="down"
    @pointermove="move"
    @pointerup="up"
    @pointercancel="cancel"
    @pointerleave="emit('hover', null)"
  >
    <defs>
      <pattern
        id="fp-grid-minor"
        :width="CELL_CM"
        :height="CELL_CM"
        patternUnits="userSpaceOnUse"
      >
        <path
          :d="`M ${CELL_CM} 0 L 0 0 0 ${CELL_CM}`"
          fill="none"
          stroke="rgba(0,0,0,.09)"
          vector-effect="non-scaling-stroke"
        />
      </pattern>
      <pattern
        id="fp-grid-major"
        width="100"
        height="100"
        patternUnits="userSpaceOnUse"
      >
        <path
          d="M 100 0 L 0 0 0 100"
          fill="none"
          stroke="rgba(0,0,0,.26)"
          vector-effect="non-scaling-stroke"
        />
      </pattern>
      <pattern
        :id="BALCONY_PATTERN"
        width="8"
        height="8"
        patternUnits="userSpaceOnUse"
        patternTransform="rotate(45)"
      >
        <rect width="8" height="8" fill="#cbd5c0" />
        <rect width="2" height="8" fill="#aebb9f" />
      </pattern>
    </defs>

    <g class="plan-canvas__rulers">
      <rect
        :x="-RULER_CM"
        :y="-RULER_CM"
        :width="widthCm + RULER_CM"
        :height="RULER_CM"
        fill="#ecebe6"
      />
      <rect
        :x="-RULER_CM"
        :y="0"
        :width="RULER_CM"
        :height="heightCm"
        fill="#ecebe6"
      />
      <g v-for="m in metresAcross" :key="`x${m}`">
        <line
          :x1="m * 100"
          :x2="m * 100"
          :y1="-RULER_CM"
          y2="0"
          stroke="#6f6c62"
          vector-effect="non-scaling-stroke"
        />
        <text
          :x="m * 100 + 4 * cmPerPx"
          :y="-RULER_CM / 2"
          :font-size="10 * cmPerPx"
          dominant-baseline="middle"
          fill="#3f3c35"
        >
          {{ m }}
        </text>
      </g>
      <g v-for="m in metresDown" :key="`y${m}`">
        <line
          :y1="m * 100"
          :y2="m * 100"
          :x1="-RULER_CM"
          x2="0"
          stroke="#6f6c62"
          vector-effect="non-scaling-stroke"
        />
        <text
          :x="-RULER_CM / 2"
          :y="m * 100 + 12 * cmPerPx"
          :font-size="10 * cmPerPx"
          text-anchor="middle"
          fill="#3f3c35"
        >
          {{ m }}
        </text>
      </g>
      <text
        :x="-RULER_CM / 2"
        :y="-RULER_CM / 2"
        :font-size="10 * cmPerPx"
        text-anchor="middle"
        dominant-baseline="middle"
        fill="#3f3c35"
      >
        m
      </text>
    </g>

    <rect :width="widthCm" :height="heightCm" fill="#fbfbf9" />
    <g shape-rendering="crispEdges" data-testid="surface-runs">
      <rect
        v-for="r in surfaceRuns"
        :key="`s${r.row}-${r.col}`"
        :x="r.col * CELL_CM"
        :y="r.row * CELL_CM"
        :width="r.len * CELL_CM"
        :height="CELL_CM"
        :fill="fillFor(r.code)"
      />
    </g>
    <rect
      :width="widthCm"
      :height="heightCm"
      fill="url(#fp-grid-minor)"
      pointer-events="none"
    />
    <rect
      :width="widthCm"
      :height="heightCm"
      fill="url(#fp-grid-major)"
      pointer-events="none"
    />
    <g shape-rendering="crispEdges" data-testid="feature-runs">
      <rect
        v-for="r in featureRuns"
        :key="`f${r.row}-${r.col}`"
        :x="r.col * CELL_CM"
        :y="r.row * CELL_CM"
        :width="r.len * CELL_CM"
        :height="CELL_CM"
        :fill="fillFor(r.code)"
      />
    </g>

    <text
      v-for="l in plan.labels"
      :key="l.id"
      class="plan-canvas__label"
      :x="l.col * CELL_CM + 4"
      :y="l.row * CELL_CM + CELL_CM / 2"
      :font-size="LABEL_PX * cmPerPx"
      :stroke-width="3 * cmPerPx"
      dominant-baseline="middle"
      :data-testid="`plan-label-${l.id}`"
    >
      {{ l.text }}
    </text>

    <g
      v-if="stroke.length && brush"
      pointer-events="none"
      data-testid="stroke-preview"
    >
      <rect
        v-for="c in stroke"
        :key="`p${c.col}-${c.row}`"
        :x="c.col * CELL_CM"
        :y="c.row * CELL_CM"
        :width="CELL_CM"
        :height="CELL_CM"
        :fill="brush.layer === 'both' ? '#ffffff' : fillFor(brush.code)"
        opacity="0.6"
      />
      <rect
        v-if="box"
        :x="box.x"
        :y="box.y"
        :width="box.w"
        :height="box.h"
        fill="none"
        stroke="#1d4ed8"
        stroke-dasharray="4 3"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
      />
      <g v-if="readoutText && box">
        <rect
          :x="box.x"
          :y="box.y - 26 * cmPerPx"
          :width="(readoutText.length * 7 + 16) * cmPerPx"
          :height="22 * cmPerPx"
          :rx="4 * cmPerPx"
          fill="#1c1c1a"
        />
        <text
          :x="box.x + 8 * cmPerPx"
          :y="box.y - 15 * cmPerPx"
          :font-size="12 * cmPerPx"
          dominant-baseline="middle"
          fill="#ffffff"
          font-weight="600"
          data-testid="stroke-readout"
        >
          {{ readoutText }}
        </text>
      </g>
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { BALCONY_PATTERN, brushName, fillFor, type Brush } from "../codes";
import {
  CELL_CM,
  LABEL_PX,
  PX_PER_CM,
  RULER_CM,
  bounds,
  cellAt,
  labelAtCell,
  lineCells,
  readout,
  rectCells,
  runs,
  uniqueCells,
  type Cell,
  type PlanGrid,
} from "../grid";

const props = defineProps<{
  plan: PlanGrid;
  zoom: number;
  editable: boolean;
  brush: Brush | null;
  shape: "freehand" | "rectangle";
}>();

const emit = defineEmits<{
  stroke: [cells: Cell[]];
  hover: [cell: Cell | null];
  preview: [readout: string | null];
  labelAt: [cell: Cell];
  labelPick: [id: string];
  labelMove: [id: string, cell: Cell];
}>();

const svg = ref<SVGSVGElement | null>(null);
const stroke = ref<Cell[]>([]);
let start: Cell | null = null;
let last: Cell | null = null;
let dragged: { id: string; from: Cell; to: Cell } | null = null;

const widthCm = computed(() => props.plan.cols * CELL_CM);
const heightCm = computed(() => props.plan.rows * CELL_CM);
const scale = computed(() => PX_PER_CM * props.zoom);
/** Converts a constant on-screen pixel size into plan cm at the current zoom. */
const cmPerPx = computed(() => 1 / scale.value);
const surfaceRuns = computed(() => runs(props.plan.surface));
const featureRuns = computed(() => runs(props.plan.feature));
const metresAcross = computed(() =>
  Array.from({ length: Math.floor(widthCm.value / 100) + 1 }, (_, m) => m),
);
const metresDown = computed(() =>
  Array.from({ length: Math.floor(heightCm.value / 100) + 1 }, (_, m) => m),
);

const box = computed(() => {
  if (stroke.value.length === 0) return null;
  const minCol = Math.min(...stroke.value.map((c) => c.col));
  const minRow = Math.min(...stroke.value.map((c) => c.row));
  const { cols, rows } = bounds(stroke.value);
  return {
    x: minCol * CELL_CM,
    y: minRow * CELL_CM,
    w: cols * CELL_CM,
    h: rows * CELL_CM,
  };
});
const readoutText = computed(() =>
  stroke.value.length && props.brush
    ? readout(stroke.value, brushName(props.brush.id))
    : null,
);

function cellOf(e: PointerEvent): Cell | null {
  const rect = svg.value?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return cellAt(
    e.clientX,
    e.clientY,
    rect,
    props.zoom,
    props.plan.cols,
    props.plan.rows,
  );
}

function down(e: PointerEvent): void {
  const cell = cellOf(e);
  if (!props.editable || !props.brush || !cell) return;
  svg.value?.setPointerCapture?.(e.pointerId);
  if (props.brush.id === "label") {
    const hit = labelAtCell(props.plan.labels, cell, props.zoom);
    if (hit) dragged = { id: hit.id, from: cell, to: cell };
    else emit("labelAt", cell);
    return;
  }
  start = last = cell;
  stroke.value = [cell];
  emit("preview", readoutText.value);
}

function move(e: PointerEvent): void {
  const cell = cellOf(e);
  emit("hover", cell);
  if (!cell) return;
  if (dragged) {
    dragged.to = cell;
    return;
  }
  if (!start || !last) return;
  if (props.shape === "rectangle") {
    stroke.value = rectCells(start, cell);
  } else if (cell.col !== last.col || cell.row !== last.row) {
    stroke.value = [...stroke.value, ...lineCells(last, cell).slice(1)];
  }
  last = cell;
  emit("preview", readoutText.value);
}

function up(): void {
  if (dragged) {
    const { id, from, to } = dragged;
    dragged = null;
    if (from.col === to.col && from.row === to.row) emit("labelPick", id);
    else emit("labelMove", id, to);
    return;
  }
  if (stroke.value.length) emit("stroke", uniqueCells(stroke.value));
  cancel();
}

function cancel(): void {
  start = last = null;
  dragged = null;
  stroke.value = [];
  emit("preview", null);
}
</script>

<style scoped lang="scss">
.plan-canvas {
  display: block;
  background: #ffffff;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.18),
    0 8px 24px rgba(0, 0, 0, 0.08);
  touch-action: none;
  user-select: none;
}
.plan-canvas--editable {
  cursor: crosshair;
}
.plan-canvas__label {
  fill: #2b2925;
  font-family: var(--fp-sans);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.85);
  stroke-linejoin: round;
}
</style>
