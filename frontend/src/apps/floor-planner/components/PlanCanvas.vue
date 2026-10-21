<template>
  <svg
    ref="svg"
    class="plan-canvas"
    :class="{ 'plan-canvas--browse': !editable && !arranging && !measuring }"
    :style="{ cursor }"
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
    @pointerleave="leave"
    @contextmenu="contextMenu"
    @dragover="dragOver"
    @drop="dropped"
  >
    <defs>
      <pattern
        id="fp-grid-minor"
        :width="minorCm"
        :height="minorCm"
        patternUnits="userSpaceOnUse"
      >
        <path
          :d="`M ${minorCm} 0 L 0 0 0 ${minorCm}`"
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
        <!-- 60 cm tiles. -->
        <pattern
          v-if="t.texture === 'tiles'"
          :id="`fp-${t.code}`"
          width="60"
          height="60"
          patternUnits="userSpaceOnUse"
        >
          <rect width="60" height="60" :fill="t.colour" />
          <path
            d="M 60 0 L 0 0 0 60"
            fill="none"
            :stroke="t.seam"
            vector-effect="non-scaling-stroke"
          />
        </pattern>
        <pattern
          v-else-if="t.boards"
          :id="`fp-${t.code}`"
          :width="BOARD_REPEAT.w"
          :height="BOARD_REPEAT.h"
          patternUnits="userSpaceOnUse"
        >
          <rect
            v-for="(b, i) in t.boards.boards"
            :key="i"
            :x="b.x"
            :y="b.y"
            :width="b.w"
            height="20"
            :fill="b.fill"
          />
          <path
            :d="t.boards.rows"
            fill="none"
            :stroke="t.seam"
            stroke-opacity="0.6"
            vector-effect="non-scaling-stroke"
          />
          <path
            :d="t.boards.joints"
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
    <!-- Over the floors only while painting squares; elsewhere it would compete with them. -->
    <template v-if="!editable">
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
    </template>
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
    <template v-if="editable">
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
    </template>
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
      @pointerdown="pieceDown($event, p)"
    >
      <!-- The outlines sit inside the turned group so they follow the piece at any angle. -->
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
        <rect
          v-if="p.warned"
          :x="-3 * cmPerPx"
          :y="-3 * cmPerPx"
          :width="p.piece.width_cm + 6 * cmPerPx"
          :height="p.piece.depth_cm + 6 * cmPerPx"
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
          :width="p.piece.width_cm"
          :height="p.piece.depth_cm"
          fill="none"
          stroke="#1d4ed8"
          stroke-width="2"
          vector-effect="non-scaling-stroke"
          pointer-events="none"
          data-testid="piece-selected"
        />
      </g>

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

    <!-- Doors sit over the furniture, so a swing that would hit a piece shows. -->
    <g
      v-for="d in doorShapes"
      :key="d.door.key"
      class="plan-canvas__door"
      :data-testid="`door-${d.door.key}`"
    >
      <!-- The opening keeps the door's colour, as painted. While drawing, a click on it opens
           the door's setup (handled by the plan); in Arrange it swings the door. -->
      <rect
        :x="d.shape.gap.x"
        :y="d.shape.gap.y"
        :width="d.shape.gap.w"
        :height="d.shape.gap.h"
        :fill="d.tint"
        :class="{ 'plan-canvas__door-hit': arranging }"
        :pointer-events="arranging ? 'all' : 'none'"
        data-testid="door-opening"
        @pointerdown="arranging && $event.stopPropagation()"
        @click="arranging && emit('doorToggle', d.door.key)"
      />
      <template v-for="(leaf, i) in d.shape.leaves" :key="i">
        <path
          :d="wedge(leaf)"
          :fill="d.tint"
          :opacity="d.open ? 0.16 : 0.07"
          pointer-events="none"
          data-testid="door-swing"
        />
        <path
          :d="arc(leaf)"
          fill="none"
          :stroke="d.tint"
          stroke-width="1.2"
          :opacity="d.open ? 0.7 : 0.3"
          vector-effect="non-scaling-stroke"
          pointer-events="none"
        />
        <line
          :x1="leaf.pivot[0]"
          :y1="leaf.pivot[1]"
          :x2="(d.open ? leaf.open : leaf.shut)[0]"
          :y2="(d.open ? leaf.open : leaf.shut)[1]"
          :stroke="d.tint"
          stroke-width="5"
          stroke-linecap="round"
          :class="{ 'plan-canvas__door-hit': arranging }"
          :pointer-events="arranging ? 'stroke' : 'none'"
          data-testid="door-leaf"
          @pointerdown="arranging && $event.stopPropagation()"
          @click="arranging && emit('doorToggle', d.door.key)"
        />
      </template>
      <template v-if="d.shape.slide">
        <!-- The track: everywhere the panel travels, on the side it slides along. -->
        <line
          :x1="d.shape.slide.open.tail[0]"
          :y1="d.shape.slide.open.tail[1]"
          :x2="d.shape.slide.shut.lead[0]"
          :y2="d.shape.slide.shut.lead[1]"
          :stroke="d.tint"
          stroke-width="1.2"
          stroke-dasharray="4 3"
          :opacity="d.open ? 0.7 : 0.3"
          vector-effect="non-scaling-stroke"
          pointer-events="none"
          data-testid="door-track"
        />
        <line
          :x1="(d.open ? d.shape.slide.open : d.shape.slide.shut).tail[0]"
          :y1="(d.open ? d.shape.slide.open : d.shape.slide.shut).tail[1]"
          :x2="(d.open ? d.shape.slide.open : d.shape.slide.shut).lead[0]"
          :y2="(d.open ? d.shape.slide.open : d.shape.slide.shut).lead[1]"
          :stroke="d.tint"
          stroke-width="5"
          :class="{ 'plan-canvas__door-hit': arranging }"
          :pointer-events="arranging ? 'stroke' : 'none'"
          data-testid="door-panel"
          @pointerdown="arranging && $event.stopPropagation()"
          @click="arranging && emit('doorToggle', d.door.key)"
        />
      </template>
      <!-- The handle: one click swings or slides the door open or shut, in any mode. -->
      <g
        v-for="(h, i) in d.handles"
        :key="`handle-${i}`"
        class="plan-canvas__door-handle"
        role="button"
        tabindex="0"
        :aria-label="d.open ? 'Close this door' : 'Open this door'"
        :data-testid="`door-handle-${d.door.key}`"
        @pointerdown.stop
        @click.stop="emit('doorToggle', d.door.key)"
        @keydown.enter.prevent="emit('doorToggle', d.door.key)"
        @keydown.space.prevent="emit('doorToggle', d.door.key)"
      >
        <circle :cx="h[0]" :cy="h[1]" :r="12 * cmPerPx" fill="transparent" />
        <circle :cx="h[0]" :cy="h[1]" :r="4.5 * cmPerPx" fill="#2b2a27" />
      </g>
    </g>

    <!-- Drawn in screen px, over furniture, so a socket a piece would block still shows. -->
    <g pointer-events="none" data-testid="sockets">
      <g
        v-for="s in plan.sockets"
        :key="`${s.col},${s.row}`"
        :transform="`translate(${(s.col + 0.5) * CELL_CM} ${(s.row + 0.5) * CELL_CM}) scale(${cmPerPx})`"
        :data-testid="`socket-${s.col},${s.row}`"
      >
        <circle
          :r="SOCKET_PX / 2"
          fill="#ffffff"
          stroke="#2b2a27"
          stroke-width="1.5"
        />
        <path
          d="M -2 -2.5 V 2.5 M 2 -2.5 V 2.5"
          stroke="#2b2a27"
          stroke-width="1.5"
        />
      </g>
    </g>

    <!-- Over furniture and doors, so a note stays readable wherever it sits. -->
    <g pointer-events="none" data-testid="notes">
      <g
        v-for="n in plan.notes"
        :key="n.id"
        class="plan-canvas__note"
        :transform="noteTransform(n)"
        :data-testid="`plan-note-${n.id}`"
      >
        <rect v-bind="noteRect(n.text)" rx="6" />
        <text :font-size="NOTE_PX" dominant-baseline="central">
          {{ n.text }}
        </text>
      </g>
    </g>

    <g v-if="measured" pointer-events="none" data-testid="hover-measure">
      <template v-if="measured.m.kind === 'feature'">
        <rect
          v-bind="spanBox(measured.m.span, measured.m.dir)"
          fill="#1d4ed8"
          opacity="0.35"
        />
      </template>
      <template v-else>
        <line
          v-for="(l, i) in floorLines(measured.m.h, measured.m.v)"
          :key="i"
          v-bind="l"
          stroke="#1d4ed8"
          stroke-width="1.5"
          stroke-dasharray="4 3"
          vector-effect="non-scaling-stroke"
        />
      </template>
      <rect
        :x="measured.x"
        :y="measured.y"
        :width="(measured.text.length * 7 + 16) * cmPerPx"
        :height="22 * cmPerPx"
        :rx="4 * cmPerPx"
        fill="#1c1c1a"
      />
      <text
        :x="measured.x + 8 * cmPerPx"
        :y="measured.y + 11 * cmPerPx"
        :font-size="12 * cmPerPx"
        dominant-baseline="middle"
        fill="#ffffff"
        font-weight="600"
        data-testid="hover-measure-text"
      >
        {{ measured.text }}
      </text>
    </g>

    <g v-if="ruler" pointer-events="none" data-testid="ruler">
      <line
        :x1="ruler.a.x"
        :y1="ruler.a.y"
        :x2="ruler.b.x"
        :y2="ruler.b.y"
        stroke="#1d4ed8"
        stroke-width="2"
        vector-effect="non-scaling-stroke"
        data-testid="ruler-line"
      />
      <circle
        v-for="(pt, i) in [ruler.a, ruler.b]"
        :key="i"
        :cx="pt.x"
        :cy="pt.y"
        :r="3.5 * cmPerPx"
        fill="#1d4ed8"
      />
      <g
        v-if="rulerLabel"
        :transform="`translate(${rulerLabel.x} ${rulerLabel.y}) scale(${cmPerPx})`"
      >
        <rect
          :x="-rulerLabel.w / 2"
          y="-11"
          :width="rulerLabel.w"
          height="22"
          rx="4"
          fill="#1c1c1a"
        />
        <text
          font-size="12"
          text-anchor="middle"
          dominant-baseline="central"
          fill="#ffffff"
          font-weight="600"
          data-testid="ruler-text"
        >
          {{ rulerLabel.text }}
        </text>
      </g>
    </g>

    <g
      v-if="stroke.length && brush"
      pointer-events="none"
      data-testid="stroke-preview"
    >
      <rect
        v-for="r in strokeRuns"
        :key="`p${r.row}-${r.col}`"
        :x="r.col * CELL_CM"
        :y="r.row * CELL_CM"
        :width="r.len * CELL_CM"
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
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  BALCONY_PATTERN,
  BOARD_REPEAT,
  MEASURE_TOOL,
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
import {
  DOOR_CODES,
  doorShape,
  findDoors,
  type Door,
  type Leaf,
  type Panel,
} from "../doors";
import {
  bounds as pieceBounds,
  snap,
  snapToWalls,
  type Box,
} from "../geometry";
import { SOCKET_PX, socketAt } from "../sockets";
import {
  buildRunIndex,
  measureAt,
  measureText,
  rulerText,
  snapPoint,
  straightPoint,
  type Point,
  type Span,
} from "../measure";
import { NOTE_PX, noteAnchor, noteAt, noteBox } from "../notes";
import { cursorFor } from "../cursors";
import type { Furniture, Placement, PlanNote, PlanObject } from "../types";
import {
  CELL_CM,
  LABEL_PX,
  PX_PER_CM,
  RULER_CM,
  bounds,
  cellAt,
  cellRuns,
  cmAt,
  codeAt,
  labelAtCell,
  lineCells,
  minorGridCm,
  readout,
  rectCells,
  runs,
  stampCells,
  straightEnd,
  uniqueCells,
  type PlanBrushSize,
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
    /** Freehand and straight: each square of the stroke paints an n×n block. */
    brushSize?: PlanBrushSize;
    /** Strokes become one horizontal or vertical line at the brush width, whatever the shape. */
    straight?: boolean;
    /** Top first: an earlier piece covers a later one. */
    placed?: PlacedPiece[];
    selectedId?: string | null;
    /** Placed pieces can be selected and dragged. */
    arranging?: boolean;
    /** Tray cards can be dropped onto the plan. */
    droppable?: boolean;
    /** Keys of the doors this viewer has swung shut. */
    closedDoors?: string[];
    /** Clicks and drags lay a ruler instead of painting or arranging. */
    measuring?: boolean;
  }>(),
  {
    measuring: false,
    closedDoors: () => [],
    brushSize: 1,
    straight: false,
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
  /** A Socket tool click on a new square, or the eraser on a socket. */
  socketToggle: [cell: Cell];
  labelMove: [id: string, cell: Cell];
  /** A Note tool click on an empty spot. */
  noteAt: [cell: Cell];
  noteMove: [id: string, cell: Cell];
  /** A click on a door, socket, note or label; `at` is where its menu goes, in px. */
  pick: [target: PlanObject, at: { left: number; top: number }];
  /** A right click while drawing: put the tool down. */
  deselect: [];
  select: [id: string | null];
  move: [id: string, x: number, y: number];
  /** A tray card dropped with its centre at (x, y) cm. */
  drop: [id: string, x: number, y: number];
  doorToggle: [key: string];
}>();

const svg = ref<SVGSVGElement | null>(null);
const stroke = ref<Cell[]>([]);
let start: Cell | null = null;
let last: Cell | null = null;
/** A label or note pressed with its tool: a click edits it, a drag moves it. */
let dragged: {
  kind: "label" | "note";
  id: string;
  from: Cell;
  to: Cell;
} | null = null;
/** The ruler: `done` once both ends are down, until then `b` follows the pointer. */
const ruler = ref<{ a: Point; b: Point; done: boolean } | null>(null);
/** The button is still down on the ruler's first end; releasing elsewhere finishes a drag. */
let rulerPress = false;
/** A press on a door, socket, note or label: a click opens its menu, a drag paints. */
let pressed: { target: PlanObject; at: Cell } | null = null;
/** The pointer is over something a click would pick. */
const pointing = ref(false);
let pieceDrag: {
  id: string;
  grabX: number;
  grabY: number;
  from: Placement;
} | null = null;
/** Where the piece being dragged is drawn until it's dropped. */
const dragPos = ref<{ id: string; x: number; y: number } | null>(null);

/** `placed` is top first, as the furniture list reads, so it's drawn from the end. */
const shown = computed(() =>
  [...props.placed].reverse().map((p) => {
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
  // Not arranging (say, measuring), the press falls through to the plan.
  if (!props.arranging) return;
  e.stopPropagation();
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
// Doors are drawn as symbols below rather than as painted squares.
const featureRuns = computed(() =>
  runs(props.plan.feature).filter((r) => !DOOR_CODES.has(r.code)),
);
const doors = computed(() => findDoors(props.plan));

/** The square under the pointer; only changes when the pointer crosses into another square. */
const hovered = ref<Cell | null>(null);
// Lazy: built on the first hover after a plan change, never per pointer move.
const runIndex = computed(() => buildRunIndex(props.plan));
const measured = computed(() => {
  const cell = hovered.value;
  if (!cell || props.measuring || stroke.value.length || dragPos.value)
    return null;
  const m = measureAt(runIndex.value, cell);
  if (!m) return null;
  return {
    m,
    text: measureText(m),
    x: (cell.col + 1) * CELL_CM + 10 * cmPerPx.value,
    y: cell.row * CELL_CM - 26 * cmPerPx.value,
  };
});

function spanBox(s: Span, dir: "h" | "v") {
  return {
    x: s.col * CELL_CM,
    y: s.row * CELL_CM,
    width: (dir === "h" ? s.len : 1) * CELL_CM,
    height: (dir === "v" ? s.len : 1) * CELL_CM,
  };
}

/** Lines through the middle of the hovered square, wall to wall each way. */
function floorLines(h: Span, v: Span) {
  const cx = (v.col + 0.5) * CELL_CM;
  const cy = (h.row + 0.5) * CELL_CM;
  return [
    { x1: h.col * CELL_CM, y1: cy, x2: (h.col + h.len) * CELL_CM, y2: cy },
    { x1: cx, y1: v.row * CELL_CM, x2: cx, y2: (v.row + v.len) * CELL_CM },
  ];
}

function noteTransform(n: PlanNote): string {
  const { x, y } = noteAnchor(n);
  return `translate(${x} ${y}) rotate(${n.vertical ? -90 : 0}) scale(${cmPerPx.value})`;
}

function noteRect(text: string) {
  const b = noteBox(text);
  return { x: b.x, y: b.y, width: b.w, height: b.h };
}

/** The length, in a pill by the ruler's middle: above a level ruler, beside any other. */
const rulerLabel = computed(() => {
  const r = ruler.value;
  if (!r || (r.a.x === r.b.x && r.a.y === r.b.y)) return null;
  const text = rulerText(r.a, r.b);
  const w = text.length * 7 + 16;
  const [dx, dy] = r.a.y === r.b.y ? [0, -18] : [w / 2 + 10, 0];
  return {
    text,
    w,
    x: (r.a.x + r.b.x) / 2 + dx * cmPerPx.value,
    y: (r.a.y + r.b.y) / 2 + dy * cmPerPx.value,
  };
});

function rulerPoint(e: PointerEvent, from?: Point): Point {
  const p = snapPoint(cmOf(e), props.plan.cols, props.plan.rows);
  return from && e.shiftKey ? straightPoint(from, p) : p;
}

function rulerDown(e: PointerEvent): void {
  const r = ruler.value;
  if (r && !r.done) {
    ruler.value = { ...r, b: rulerPoint(e, r.a), done: true };
    return;
  }
  const at = rulerPoint(e);
  ruler.value = { a: at, b: at, done: false };
  rulerPress = true;
  svg.value?.setPointerCapture?.(e.pointerId);
}

function rulerUp(): void {
  rulerPress = false;
  const r = ruler.value;
  // A plain click leaves the ruler following the pointer, for a second click to finish.
  if (r && (r.a.x !== r.b.x || r.a.y !== r.b.y))
    ruler.value = { ...r, done: true };
}

watch(
  () => props.measuring,
  () => {
    ruler.value = null;
    rulerPress = false;
  },
);

function clearRuler(e: KeyboardEvent): void {
  if (e.key === "Escape") ruler.value = null;
}
onMounted(() => window.addEventListener("keydown", clearRuler));
onBeforeUnmount(() => window.removeEventListener("keydown", clearRuler));

function setHovered(cell: Cell | null): void {
  const was = hovered.value;
  if (was?.col === cell?.col && was?.row === cell?.row) return;
  hovered.value = cell;
}

function leave(): void {
  setHovered(null);
  pointing.value = false;
  emit("hover", null);
}

/** While drawing a click picks things on the plan, except with the eraser, which erases them. */
const picking = computed(
  () => props.editable && !props.measuring && props.brush?.id !== "eraser",
);

const MEASURE_CURSOR = cursorFor(MEASURE_TOOL);
const cursor = computed(() => {
  if (props.measuring) return MEASURE_CURSOR;
  if (!props.editable) return undefined;
  if (pointing.value) return "pointer";
  return props.brush ? cursorFor(props.brush) : "default";
});

function doorAt(cell: Cell): Door | undefined {
  if (!DOOR_CODES.has(codeAt(props.plan.feature, cell))) return undefined;
  return doors.value.find(
    (d) =>
      cell.col >= d.col &&
      cell.col < d.col + d.cols &&
      cell.row >= d.row &&
      cell.row < d.row + d.rows,
  );
}

/** What a click there would pick, topmost first, as drawn. */
function objectAt(e: PointerEvent, cell: Cell): PlanObject | null {
  const at = cmOf(e);
  const note = noteAt(props.plan.notes, at, cmPerPx.value);
  if (note) return { kind: "note", id: note.id };
  const socket = socketAt(props.plan.sockets, at, cmPerPx.value);
  if (socket) return { kind: "socket", col: socket.col, row: socket.row };
  const door = doorAt(cell);
  if (door) return { kind: "door", key: door.key };
  const label = labelAtCell(props.plan.labels, cell, props.zoom);
  return label ? { kind: "label", id: label.id } : null;
}

function contextMenu(e: MouseEvent): void {
  if (!props.editable) return;
  e.preventDefault();
  cancel();
  ruler.value = null;
  emit("deselect");
}

const doorShapes = computed(() =>
  doors.value.map((door) => {
    const shape = doorShape(door);
    const open = !props.closedDoors.includes(door.key);
    return {
      door,
      shape,
      tint: fillFor(door.code),
      open,
      handles: shape.slide
        ? [panelHandle(open ? shape.slide.open : shape.slide.shut)]
        : shape.leaves.map((l) => handleAt(l, open)),
    };
  }),
);

function wedge(l: Leaf): string {
  return `M ${l.pivot.join(" ")} L ${l.open.join(" ")} A ${l.len} ${l.len} 0 0 ${l.sweep} ${l.shut.join(" ")} Z`;
}

function arc(l: Leaf): string {
  return `M ${l.open.join(" ")} A ${l.len} ${l.len} 0 0 ${l.sweep} ${l.shut.join(" ")}`;
}

/** Just in from the panel's leading edge, where you'd pull it. */
function panelHandle(p: Panel): [number, number] {
  const t = 0.88;
  return [
    p.tail[0] + (p.lead[0] - p.tail[0]) * t,
    p.tail[1] + (p.lead[1] - p.tail[1]) * t,
  ];
}

/** Near the free end of the leaf, where a real handle would be. */
function handleAt(l: Leaf, open: boolean): [number, number] {
  const end = open ? l.open : l.shut;
  const t = 0.82;
  return [
    l.pivot[0] + (end[0] - l.pivot[0]) * t,
    l.pivot[1] + (end[1] - l.pivot[1]) * t,
  ];
}

/** The door's setup panel and the smaller menu everything else gets, in px. */
const DOOR_SETUP_PX = 250;
const MENU_PX = 200;

/** The plan box, in cm, a picked thing's menu sits beside. */
function boxOf(target: PlanObject): Box {
  const square = (col: number, row: number, cols = 1): Box => ({
    x: col * CELL_CM,
    y: row * CELL_CM,
    w: cols * CELL_CM,
    h: CELL_CM,
  });
  switch (target.kind) {
    case "door": {
      const d = doors.value.find((d) => d.key === target.key);
      return d
        ? { ...square(d.col, d.row, d.cols), h: d.rows * CELL_CM }
        : square(0, 0);
    }
    case "socket":
      return square(target.col, target.row);
    case "note": {
      const n = props.plan.notes.find((n) => n.id === target.id);
      if (!n) return square(0, 0);
      const { x, y } = noteAnchor(n);
      const b = noteBox(n.text);
      const [w, h] = [b.w * cmPerPx.value, b.h * cmPerPx.value];
      return n.vertical
        ? { x: x - h / 2, y: y - w, w: h, h: w }
        : { x, y: y - h / 2, w, h };
    }
    case "label": {
      const l = props.plan.labels.find((l) => l.id === target.id);
      return l ? square(l.col, l.row) : square(0, 0);
    }
  }
}

/** Where the menu goes: beside the thing, flipped left when it would run off the plan. */
function menuAt(target: PlanObject): { left: number; top: number } {
  const menuPx = target.kind === "door" ? DOOR_SETUP_PX : MENU_PX;
  const box = boxOf(target);
  const px = (cm: number) => (cm + RULER_CM) * scale.value;
  const right = px(box.x + box.w) + 12;
  const width = px(widthCm.value);
  const left =
    right + menuPx <= width ? right : Math.max(4, px(box.x) - menuPx - 12);
  return { left, top: px(box.y) };
}
const metresAcross = computed(() =>
  Array.from({ length: Math.floor(widthCm.value / 100) + 1 }, (_, m) => m),
);
const metresDown = computed(() =>
  Array.from({ length: Math.floor(heightCm.value / 100) + 1 }, (_, m) => m),
);

const minorCm = computed(() => minorGridCm(props.zoom));
const strokeRuns = computed(() => cellRuns(stroke.value));
const box = computed(() => {
  if (stroke.value.length === 0) return null;
  const { col, row, cols, rows } = bounds(stroke.value);
  return {
    x: col * CELL_CM,
    y: row * CELL_CM,
    w: cols * CELL_CM,
    h: rows * CELL_CM,
  };
});
const readoutText = computed(() =>
  stroke.value.length && props.brush
    ? readout(stroke.value, brushName(props.brush.id))
    : null,
);

/** The lock, or Shift held for just this stroke. */
function straightFor(e: PointerEvent): boolean {
  return props.straight || e.shiftKey;
}

function stamp(cells: Cell[], straight: boolean): Cell[] {
  return straight || props.shape === "freehand"
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
  // The right button belongs to the context menu, which puts the tool down.
  if (e.button > 0) return;
  if (props.measuring) {
    rulerDown(e);
    return;
  }
  if (props.arranging) {
    emit("select", null);
    return;
  }
  const cell = cellOf(e);
  if (!props.editable || !cell) return;
  svg.value?.setPointerCapture?.(e.pointerId);
  pointing.value = false;
  const tool = props.brush?.id;
  // A label or note under its own tool: a click picks it, a drag moves it.
  const own =
    tool === "label"
      ? labelAtCell(props.plan.labels, cell, props.zoom)
      : tool === "note"
        ? noteAt(props.plan.notes, cmOf(e), cmPerPx.value)
        : null;
  if (own) {
    dragged = {
      kind: tool as "label" | "note",
      id: own.id,
      from: cell,
      to: cell,
    };
    return;
  }
  const target = picking.value ? objectAt(e, cell) : null;
  pressed = target && { target, at: cell };
  if (!props.brush) return;
  if (tool === "label" || tool === "note" || tool === "socket") {
    if (target) return;
    if (tool === "label") emit("labelAt", cell);
    else if (tool === "note") emit("noteAt", cell);
    else emit("socketToggle", cell);
    return;
  }
  // The eraser on a socket takes just the socket, not the wall it sits on.
  const socket =
    tool === "eraser" && socketAt(props.plan.sockets, cmOf(e), cmPerPx.value);
  if (socket) {
    emit("socketToggle", socket);
    return;
  }
  start = last = cell;
  stroke.value = stamp([cell], straightFor(e));
  emit("preview", readoutText.value);
}

function move(e: PointerEvent): void {
  const cell = cellOf(e);
  setHovered(cell);
  emit("hover", cell);
  const r = ruler.value;
  if (props.measuring && r && !r.done) {
    ruler.value = { ...r, b: rulerPoint(e, r.a) };
    return;
  }
  if (pieceDrag) {
    const at = cmOf(e);
    const { id, from } = pieceDrag;
    const spot = {
      x_cm: snap(at.x - pieceDrag.grabX),
      y_cm: snap(at.y - pieceDrag.grabY),
      rotation: from.rotation,
    };
    const piece = props.placed.find((p) => p.piece.id === id)?.piece;
    // Alt places it freely, off any wall.
    const { x_cm, y_cm } =
      piece && !e.altKey ? snapToWalls(piece, spot, props.plan) : spot;
    dragPos.value = { id, x: x_cm, y: y_cm };
    return;
  }
  if (!cell) {
    pointing.value = false;
    return;
  }
  if (dragged) {
    dragged.to = cell;
    return;
  }
  if (pressed && (cell.col !== pressed.at.col || cell.row !== pressed.at.row))
    pressed = null;
  if (!start || !last) {
    pointing.value = picking.value && !pressed && objectAt(e, cell) !== null;
    return;
  }
  const straight = straightFor(e);
  if (straight) {
    stroke.value = stamp(lineCells(start, straightEnd(start, cell)), straight);
  } else if (props.shape === "rectangle") {
    stroke.value = rectCells(start, cell);
  } else if (cell.col !== last.col || cell.row !== last.row) {
    stroke.value = uniqueCells([
      ...stroke.value,
      ...stamp(lineCells(last, cell).slice(1), straight),
    ]);
  }
  last = cell;
  emit("preview", readoutText.value);
}

function up(): void {
  if (rulerPress) {
    rulerUp();
    return;
  }
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
    const { kind, id, from, to } = dragged;
    dragged = null;
    if (from.col === to.col && from.row === to.row) {
      const target = { kind, id };
      emit("pick", target, menuAt(target));
    } else if (kind === "note") emit("noteMove", id, to);
    else emit("labelMove", id, to);
    return;
  }
  if (pressed) emit("pick", pressed.target, menuAt(pressed.target));
  else if (stroke.value.length) emit("stroke", uniqueCells(stroke.value));
  cancel();
}

function cancel(): void {
  rulerPress = false;
  start = last = null;
  pressed = null;
  dragged = null;
  pieceDrag = null;
  dragPos.value = null;
  stroke.value = [];
  emit("preview", null);
}
</script>

<style scoped lang="scss">
.plan-canvas__door-handle,
.plan-canvas__door-hit {
  cursor: pointer;
}
.plan-canvas__door-handle:focus {
  outline: none;
}
.plan-canvas__door-handle:focus-visible circle:last-child {
  stroke: #1d4ed8;
  stroke-width: 2px;
  vector-effect: non-scaling-stroke;
}
.plan-canvas {
  display: block;
  background: #ffffff;
  box-shadow:
    0 1px 3px rgba(0, 0, 0, 0.18),
    0 8px 24px rgba(0, 0, 0, 0.08);
  touch-action: none;
  user-select: none;
}
// Nothing to drag, so a finger scrolls and pinches the page instead.
.plan-canvas--browse {
  touch-action: pan-x pan-y pinch-zoom;
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
.plan-canvas__note rect {
  fill: #fff8dc;
  stroke: #c9b16a;
  stroke-width: 1px;
}
.plan-canvas__note text {
  fill: #3d3626;
  font-family: var(--fp-sans);
  font-weight: 500;
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
