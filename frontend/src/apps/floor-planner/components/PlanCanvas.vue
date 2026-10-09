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
    @dragover="dragOver"
    @drop="dropped"
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
      <template v-for="t in TEXTURED" :key="t.code">
        <pattern
          v-if="t.texture === 'tiles'"
          :id="`fp-${t.code}`"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <rect width="40" height="40" :fill="t.colour" />
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            :stroke="t.seam"
            stroke-width="1.5"
            vector-effect="non-scaling-stroke"
          />
        </pattern>
        <!-- 10 cm planks, 80 cm long, joints staggered by half a plank. -->
        <pattern
          v-else
          :id="`fp-${t.code}`"
          width="80"
          height="20"
          patternUnits="userSpaceOnUse"
        >
          <rect width="80" height="20" :fill="t.colour" />
          <rect x="40" width="40" height="10" fill="rgba(0,0,0,.06)" />
          <rect y="10" width="40" height="10" fill="rgba(0,0,0,.06)" />
          <path
            d="M 0 0 H 80 M 0 10 H 80 M 0 0 V 10 M 40 10 V 20"
            fill="none"
            :stroke="t.seam"
            vector-effect="non-scaling-stroke"
          />
        </pattern>
      </template>
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
      v-for="p in shown"
      :key="p.piece.id"
      class="plan-canvas__piece"
      :class="{ 'plan-canvas__piece--movable': arranging }"
      :data-testid="`placed-${p.piece.id}`"
      @pointerdown.stop="pieceDown($event, p)"
    >
      <g :transform="pieceTransform(p)">
        <template v-if="p.piece.shape === 'custom'">
          <path
            v-for="f in customFills(p.piece.cells ?? [], 1)"
            :key="f.colour"
            :d="f.d"
            :fill="f.hex"
          />
          <path
            :d="customEdges(p.piece.cells ?? [], 1)"
            fill="none"
            stroke="rgba(0,0,0,.45)"
            :stroke-width="cmPerPx"
          />
        </template>
        <path
          v-else
          :d="outline(p.piece, 1)"
          :fill="colourHex(p.piece.colour)"
          stroke="rgba(0,0,0,.45)"
          :stroke-width="cmPerPx"
        />
      </g>
      <rect
        v-if="p.warned"
        :x="p.box.x - 3 * cmPerPx"
        :y="p.box.y - 3 * cmPerPx"
        :width="p.box.w + 6 * cmPerPx"
        :height="p.box.h + 6 * cmPerPx"
        fill="none"
        stroke="#c2410c"
        stroke-width="2"
        stroke-dasharray="5 3"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
        data-testid="piece-warned"
      />
      <rect
        v-if="p.piece.id === selectedId"
        :x="p.box.x"
        :y="p.box.y"
        :width="p.box.w"
        :height="p.box.h"
        fill="none"
        stroke="#1d4ed8"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
        pointer-events="none"
        data-testid="piece-selected"
      />
      <text
        class="plan-canvas__piece-name"
        :x="p.box.x + p.box.w / 2"
        :y="p.box.y + p.box.h / 2"
        :font-size="LABEL_PX * cmPerPx"
        :stroke-width="3 * cmPerPx"
        text-anchor="middle"
        dominant-baseline="middle"
        pointer-events="none"
      >
        {{ p.piece.name }}
      </text>
    </g>

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
import {
  BALCONY_PATTERN,
  TEXTURED,
  brushName,
  fillFor,
  type Brush,
} from "../codes";
import {
  PIECE_DRAG_TYPE,
  colourHex,
  customEdges,
  customFills,
  outline,
} from "../furniture";
import { bounds as pieceBounds, snap, type Box } from "../geometry";
import type { Furniture, Placement } from "../types";
import {
  CELL_CM,
  LABEL_PX,
  PX_PER_CM,
  RULER_CM,
  bounds,
  cellAt,
  cmAt,
  labelAtCell,
  lineCells,
  readout,
  rectCells,
  runs,
  stampCells,
  uniqueCells,
  type BrushSize,
  type Cell,
  type PlanGrid,
} from "../grid";

interface PlacedPiece {
  piece: Furniture;
  placement: Placement;
  warned: boolean;
}

const props = withDefaults(
  defineProps<{
    plan: PlanGrid;
    zoom: number;
    editable: boolean;
    brush: Brush | null;
    shape: "freehand" | "rectangle";
    /** Freehand only: each square of the stroke paints an n×n block. */
    brushSize?: BrushSize;
    placed?: PlacedPiece[];
    selectedId?: string | null;
    /** Placed pieces can be selected and dragged. */
    arranging?: boolean;
    /** Tray cards can be dropped onto the plan. */
    droppable?: boolean;
  }>(),
  {
    brushSize: 1,
    placed: () => [],
    selectedId: null,
    arranging: false,
    droppable: false,
  },
);

const emit = defineEmits<{
  stroke: [cells: Cell[]];
  hover: [cell: Cell | null];
  preview: [readout: string | null];
  labelAt: [cell: Cell];
  labelPick: [id: string];
  labelMove: [id: string, cell: Cell];
  select: [id: string | null];
  move: [id: string, x: number, y: number];
  /** A tray card dropped with its centre at (x, y) cm. */
  drop: [id: string, x: number, y: number];
}>();

const svg = ref<SVGSVGElement | null>(null);
const stroke = ref<Cell[]>([]);
let start: Cell | null = null;
let last: Cell | null = null;
let dragged: { id: string; from: Cell; to: Cell } | null = null;
let pieceDrag: {
  id: string;
  grabX: number;
  grabY: number;
  from: Placement;
} | null = null;
/** Where the piece being dragged is drawn until it's dropped. */
const dragPos = ref<{ id: string; x: number; y: number } | null>(null);

/** The selected piece is drawn last, so it's never hidden under another one. */
const shown = computed(() =>
  [
    ...props.placed.filter((p) => p.piece.id !== props.selectedId),
    ...props.placed.filter((p) => p.piece.id === props.selectedId),
  ].map((p) => {
    const moved = dragPos.value?.id === p.piece.id ? dragPos.value : null;
    const placement = moved
      ? { ...p.placement, x_cm: moved.x, y_cm: moved.y }
      : p.placement;
    return { ...p, placement, box: pieceBounds(p.piece, placement) };
  }),
);

function pieceTransform(p: {
  piece: Furniture;
  placement: Placement;
  box: Box;
}): string {
  const cx = p.box.x + p.box.w / 2;
  const cy = p.box.y + p.box.h / 2;
  return (
    `translate(${cx} ${cy}) rotate(${p.placement.rotation}) ` +
    `translate(${-p.piece.width_cm / 2} ${-p.piece.depth_cm / 2})`
  );
}

function cmOf(e: PointerEvent | DragEvent): { x: number; y: number } {
  const rect = svg.value?.getBoundingClientRect() ?? { left: 0, top: 0 };
  return cmAt(e.clientX, e.clientY, rect, props.zoom);
}

function pieceDown(e: PointerEvent, p: PlacedPiece): void {
  if (!props.arranging) return;
  emit("select", p.piece.id);
  const at = cmOf(e);
  pieceDrag = {
    id: p.piece.id,
    grabX: at.x - p.placement.x_cm,
    grabY: at.y - p.placement.y_cm,
    from: p.placement,
  };
  svg.value?.setPointerCapture?.(e.pointerId);
}

function dragOver(e: DragEvent): void {
  if (props.droppable && e.dataTransfer?.types.includes(PIECE_DRAG_TYPE)) {
    e.preventDefault();
  }
}

function dropped(e: DragEvent): void {
  const id = e.dataTransfer?.getData(PIECE_DRAG_TYPE);
  if (!props.droppable || !id) return;
  e.preventDefault();
  const at = cmOf(e);
  emit("drop", id, at.x, at.y);
}

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

function stamp(cells: Cell[]): Cell[] {
  return props.shape === "freehand"
    ? stampCells(cells, props.brushSize, props.plan.cols, props.plan.rows)
    : cells;
}

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
  if (props.arranging) {
    emit("select", null);
    return;
  }
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
  stroke.value = stamp([cell]);
  emit("preview", readoutText.value);
}

function move(e: PointerEvent): void {
  const cell = cellOf(e);
  emit("hover", cell);
  if (pieceDrag) {
    const at = cmOf(e);
    dragPos.value = {
      id: pieceDrag.id,
      x: snap(at.x - pieceDrag.grabX),
      y: snap(at.y - pieceDrag.grabY),
    };
    return;
  }
  if (!cell) return;
  if (dragged) {
    dragged.to = cell;
    return;
  }
  if (!start || !last) return;
  if (props.shape === "rectangle") {
    stroke.value = rectCells(start, cell);
  } else if (cell.col !== last.col || cell.row !== last.row) {
    stroke.value = uniqueCells([
      ...stroke.value,
      ...stamp(lineCells(last, cell).slice(1)),
    ]);
  }
  last = cell;
  emit("preview", readoutText.value);
}

function up(): void {
  if (pieceDrag) {
    const { id, from } = pieceDrag;
    const to = dragPos.value;
    pieceDrag = null;
    dragPos.value = null;
    if (to && (to.x !== from.x_cm || to.y !== from.y_cm))
      emit("move", id, to.x, to.y);
    return;
  }
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
  pieceDrag = null;
  dragPos.value = null;
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
.plan-canvas__piece--movable {
  cursor: grab;
}
.plan-canvas__piece-name {
  fill: #1c1c1a;
  font-family: var(--fp-sans);
  font-weight: 600;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.85);
  stroke-linejoin: round;
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
