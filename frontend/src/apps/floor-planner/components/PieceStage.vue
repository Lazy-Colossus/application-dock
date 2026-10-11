<template>
  <div class="piece-stage" data-testid="piece-stage">
    <template v-if="draft">
      <div
        v-if="editable"
        class="piece-stage__tools"
        role="toolbar"
        aria-label="Drawing tools"
      >
        <div class="piece-stage__palette" role="group" aria-label="Paint">
          <button
            v-for="c in COLOURS"
            :key="c.id"
            type="button"
            class="piece-stage__swatch"
            :class="{ 'piece-stage__swatch--on': paint === COLOUR_CHARS[c.id] }"
            :style="{ background: c.hex }"
            :aria-label="c.name"
            :aria-pressed="paint === COLOUR_CHARS[c.id]"
            :title="c.name"
            :data-testid="`paint-${c.id}`"
            @click="paint = COLOUR_CHARS[c.id]"
          />
          <button
            type="button"
            class="piece-stage__swatch piece-stage__swatch--eraser"
            :class="{ 'piece-stage__swatch--on': paint === EMPTY_SQUARE }"
            aria-label="Eraser"
            :aria-pressed="paint === EMPTY_SQUARE"
            title="Eraser"
            data-testid="paint-eraser"
            @click="paint = EMPTY_SQUARE"
          />
        </div>
        <div class="piece-stage__segment" role="group" aria-label="Tool">
          <button
            v-for="t in TOOLS"
            :key="t.id"
            type="button"
            :class="{ 'piece-stage__segment--on': tool === t.id }"
            :aria-pressed="tool === t.id"
            :data-testid="`tool-${t.id}`"
            @click="tool = t.id"
          >
            {{ t.label }}
          </button>
        </div>
        <div
          v-if="tool === 'freehand'"
          class="piece-stage__segment"
          role="group"
          aria-label="Brush size"
        >
          <button
            v-for="s in BRUSH_SIZES"
            :key="s"
            type="button"
            class="fp-mono"
            :class="{ 'piece-stage__segment--on': size === s }"
            :aria-pressed="size === s"
            :title="`${s * PIECE_CELL_CM} cm brush`"
            :data-testid="`stage-size-${s}`"
            @click="size = s"
          >
            {{ s * PIECE_CELL_CM }}
          </button>
        </div>
        <button
          type="button"
          class="fp-button"
          :disabled="history.length === 0"
          data-testid="stage-undo"
          @click="undo"
        >
          Undo
        </button>
      </div>

      <svg
        v-if="editable"
        ref="svgEl"
        class="piece-stage__grid"
        :width="side"
        :height="side"
        :style="gridLines"
        data-testid="piece-grid"
        @pointerdown="down"
        @pointermove="move"
        @pointerup="up"
        @pointercancel="up"
      >
        <g v-if="draft.shape === 'custom' || stroke">
          <path
            v-for="f in customFills(grid, pxPerCm)"
            :key="f.colour"
            :d="f.d"
            :fill="f.hex"
          />
          <path
            :d="customEdges(grid, pxPerCm)"
            fill="none"
            stroke="rgba(0,0,0,.4)"
          />
        </g>
        <g v-else-if="typedOk" :transform="typedAt">
          <path
            :d="outline(draft, pxPerCm)"
            :fill="colourHex(draft.colour)"
            stroke="rgba(0,0,0,.4)"
          />
        </g>
        <rect
          v-if="rectPreview"
          v-bind="rectPreview"
          :fill="paint === EMPTY_SQUARE ? '#ffffff' : paintHex"
          fill-opacity="0.7"
          stroke="var(--fp-accent)"
          stroke-dasharray="4 3"
          data-testid="rect-preview"
        />
      </svg>
      <FurnitureShape
        v-else-if="typedOk"
        :piece="draft"
        :scale="pxPerCm"
        :max-px="side"
      />

      <span class="fp-mono piece-stage__size" data-testid="piece-preview">
        {{ sizeText }}
      </span>
      <span class="piece-stage__hint">{{ hint }}</span>
    </template>
    <p v-else class="piece-stage__empty">No piece selected.</p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import FurnitureShape from "./FurnitureShape.vue";
import {
  canDraw,
  pad,
  padOffset,
  paintSquares,
  squaresFor,
  toDrawn,
  trim,
  withCells,
} from "../customShape";
import {
  COLOURS,
  COLOUR_CHARS,
  CUSTOM_MAX,
  EMPTY_SQUARE,
  PIECE_CELL_CM,
  colourHex,
  customEdges,
  customFills,
  draftProblem,
  fitScale,
  outline,
  sizeLabel,
  type PieceDraft,
} from "../furniture";
import {
  BRUSH_SIZES,
  lineCells,
  rectCells,
  stampCells,
  type BrushSize,
  type Cell,
} from "../grid";

/** Screen px per 10 cm square at 100 % zoom: 4 m fits in 560 px. */
const SQUARE_PX = 14;
const HISTORY_MAX = 50;
const TOOLS = [
  { id: "freehand", label: "Freehand" },
  { id: "rectangle", label: "Rectangle" },
] as const;
type Tool = (typeof TOOLS)[number]["id"];

const props = defineProps<{ draft: PieceDraft | null; zoom: number }>();
const emit = defineEmits<{ "update:draft": [draft: PieceDraft] }>();

const squarePx = computed(() => SQUARE_PX * props.zoom);
const pxPerCm = computed(() => squarePx.value / PIECE_CELL_CM);
const side = computed(() => CUSTOM_MAX * squarePx.value);

const paint = ref(COLOUR_CHARS[props.draft?.colour ?? "grey"]);
const paintHex = computed(() =>
  colourHex(
    COLOURS.find((c) => COLOUR_CHARS[c.id] === paint.value)?.id ?? "grey",
  ),
);
const tool = ref<Tool>("freehand");
const size = ref<BrushSize>(1);
const history = ref<PieceDraft[]>([]);

const editable = computed(() => props.draft !== null && canDraw(props.draft));
/** A typed shape whose sizes are valid, even with the name still blank. */
const typedOk = computed(
  () =>
    props.draft !== null &&
    props.draft.shape !== "custom" &&
    draftProblem({ ...props.draft, name: "x", note: "" }) === null,
);
/** Where `toDrawn` will put the squares, so the first stroke doesn't shift the shape. */
const typedAt = computed(() => {
  if (!props.draft) return "";
  const { cols, rows } = squaresFor(props.draft.width_cm, props.draft.depth_cm);
  const { left, top } = padOffset(cols, rows, CUSTOM_MAX);
  return `translate(${left * squarePx.value} ${top * squarePx.value})`;
});

const sizeText = computed(() => {
  const d = props.draft;
  if (!d) return "";
  if (d.shape === "custom" && !d.cells?.length) return "Nothing painted yet";
  if (editable.value || !typedOk.value) return sizeLabel(d);
  const shown = fitScale(d, pxPerCm.value, side.value) / pxPerCm.value;
  return `${sizeLabel(d)} · shown at ${Math.round(shown * 100)} %`;
});
const hint = computed(() => {
  if (!editable.value) return "Pieces over 4 m can't be drawn on.";
  return props.draft?.shape === "custom"
    ? "1 square = 10 cm"
    : "1 square = 10 cm · painting turns the shape into squares";
});

// 10 cm squares, with a darker line every 50 cm.
const gridLines = computed(() => {
  const s = `${squarePx.value}px`;
  const m = `${squarePx.value * 5}px`;
  return {
    backgroundSize: `${m} ${m}, ${m} ${m}, ${s} ${s}, ${s} ${s}`,
  };
});

const grid = ref(pad(props.draft?.cells ?? [], CUSTOM_MAX));
const svgEl = ref<SVGSVGElement | null>(null);
let strokeBase: string[] = [];
const stroke = ref<{ start: Cell; last: Cell } | null>(null);

watch(
  () => props.draft?.cells,
  (cells) => {
    if (!stroke.value && trim(grid.value).join() !== (cells ?? []).join()) {
      grid.value = pad(cells ?? [], CUSTOM_MAX);
    }
  },
);

const rectPreview = computed(() => {
  const s = stroke.value;
  if (!s || tool.value !== "rectangle") return null;
  const px = squarePx.value;
  return {
    x: Math.min(s.start.col, s.last.col) * px,
    y: Math.min(s.start.row, s.last.row) * px,
    width: (Math.abs(s.start.col - s.last.col) + 1) * px,
    height: (Math.abs(s.start.row - s.last.row) + 1) * px,
  };
});

function cellOf(e: PointerEvent): Cell {
  const rect = svgEl.value?.getBoundingClientRect() ?? { left: 0, top: 0 };
  const clamp = (v: number) => Math.min(CUSTOM_MAX - 1, Math.max(0, v));
  return {
    col: clamp(Math.floor((e.clientX - rect.left) / squarePx.value)),
    row: clamp(Math.floor((e.clientY - rect.top) / squarePx.value)),
  };
}

function brush(cells: Cell[]): void {
  grid.value = paintSquares(
    grid.value,
    stampCells(cells, size.value, CUSTOM_MAX, CUSTOM_MAX),
    paint.value,
  );
}

function down(e: PointerEvent): void {
  const d = props.draft;
  if (!d || e.button > 0) return;
  svgEl.value?.setPointerCapture?.(e.pointerId);
  const cell = cellOf(e);
  if (d.shape !== "custom")
    grid.value = pad(toDrawn(d).cells ?? [], CUSTOM_MAX);
  strokeBase = grid.value;
  stroke.value = { start: cell, last: cell };
  if (tool.value === "freehand") brush([cell]);
}

function move(e: PointerEvent): void {
  const s = stroke.value;
  if (!s) return;
  const cell = cellOf(e);
  if (tool.value === "freehand") brush(lineCells(s.last, cell));
  s.last = cell;
}

function up(): void {
  const s = stroke.value;
  const d = props.draft;
  if (!s || !d) return;
  if (tool.value === "rectangle") {
    grid.value = paintSquares(
      strokeBase,
      rectCells(s.start, s.last),
      paint.value,
    );
  }
  stroke.value = null;
  history.value = [...history.value.slice(-(HISTORY_MAX - 1)), d];
  emit("update:draft", withCells({ ...d, shape: "custom" }, grid.value));
}

function undo(): void {
  const previous = history.value[history.value.length - 1];
  if (!previous) return;
  history.value = history.value.slice(0, -1);
  emit("update:draft", previous);
}
</script>

<style scoped lang="scss">
.piece-stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.piece-stage__tools {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background: var(--fp-chrome);
}
.piece-stage__palette {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px;
}
.piece-stage__swatch {
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid rgba(0, 0, 0, 0.3);
  border-radius: 50%;
  cursor: pointer;
}
.piece-stage__swatch--eraser {
  background:
    linear-gradient(
      135deg,
      transparent 45%,
      var(--fp-warn-ink) 45% 55%,
      transparent 55%
    ),
    var(--fp-chrome);
}
.piece-stage__swatch--on {
  outline: 2px solid var(--fp-accent);
  outline-offset: 2px;
}
.piece-stage__segment {
  display: flex;
  gap: 2px;
  padding: 3px;
  border-radius: 8px;
  background: #f1efea;
}
.piece-stage__segment button {
  height: 30px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #3d3b36;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}
.piece-stage__segment .piece-stage__segment--on {
  background: var(--fp-chrome);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  color: var(--fp-ink);
  font-weight: 600;
}
.piece-stage__grid {
  display: block;
  border: 1px solid var(--fp-control-line);
  background-color: #fbfbf9;
  background-image:
    linear-gradient(to right, rgba(0, 0, 0, 0.16) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.16) 1px, transparent 1px),
    linear-gradient(to right, rgba(0, 0, 0, 0.06) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(0, 0, 0, 0.06) 1px, transparent 1px);
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}
.piece-stage__size {
  font-size: 15px;
}
.piece-stage__hint,
.piece-stage__empty {
  margin: 0;
  font-size: 12px;
  color: var(--fp-muted);
}
.piece-stage__empty {
  margin-top: 120px;
  font-size: 13px;
}
</style>
