// Two-character square codes, mirrored by SURFACE_CODES / FEATURE_CODES in
// backend/app/schemas/floor_planner.py. Display order is the order below.

export const EMPTY = "..";

export type Layer = "surface" | "feature";

export type BrushId =
  | "wall"
  | "window"
  | "door"
  | "front_door"
  | "tile"
  | "wood"
  | "carpet"
  | "balcony"
  | "eraser"
  | "label";

export interface Swatch {
  code: string;
  name: string;
  colour: string;
}

export interface Brush {
  id: BrushId;
  /** Which layer a stroke writes; the eraser clears both; the label tool paints nothing. */
  layer: Layer | "both" | null;
  code: string;
}

export type FloorTexture = "tiles" | "planks";

export interface FloorFamily {
  id: Extract<BrushId, "tile" | "wood" | "carpet" | "balcony">;
  label: string;
  texture?: FloorTexture;
  swatches: Swatch[];
  defaultCode: string;
}

export interface StructureBrush {
  id: Extract<BrushId, "wall" | "window" | "door" | "front_door">;
  label: string;
  code: string;
  colour: string;
}

export const BALCONY_PATTERN = "fp-balcony";

export const FLOORS: FloorFamily[] = [
  {
    id: "tile",
    label: "Tile",
    texture: "tiles",
    defaultCode: "t0",
    swatches: [
      { code: "t0", name: "White", colour: "#f4f3ee" },
      { code: "t1", name: "Grey", colour: "#cfcdc6" },
      { code: "t2", name: "Beige", colour: "#e2d6bd" },
      { code: "t3", name: "Black", colour: "#2a2a2a" },
    ],
  },
  {
    id: "wood",
    label: "Wood",
    texture: "planks",
    defaultCode: "w1",
    swatches: [
      { code: "w0", name: "Light", colour: "#ead3b0" },
      { code: "w1", name: "Medium", colour: "#cfa577" },
      { code: "w2", name: "Dark", colour: "#9a6b43" },
    ],
  },
  {
    id: "carpet",
    label: "Carpet",
    defaultCode: "c0",
    swatches: [
      { code: "c0", name: "Grey", colour: "#8e939b" },
      { code: "c1", name: "Beige", colour: "#d8c9a8" },
      { code: "c2", name: "Blue", colour: "#5b7fae" },
      { code: "c3", name: "Green", colour: "#6f9467" },
    ],
  },
  {
    id: "balcony",
    label: "Balcony",
    defaultCode: "b0",
    swatches: [{ code: "b0", name: "Balcony", colour: "#c4cfb8" }],
  },
];

export const STRUCTURE: StructureBrush[] = [
  { id: "wall", label: "Wall", code: "wl", colour: "#2f2f2f" },
  { id: "window", label: "Window", code: "wn", colour: "#8cc4e6" },
  { id: "door", label: "Door", code: "dr", colour: "#e3a548" },
  { id: "front_door", label: "Front door", code: "fd", colour: "#9c3b25" },
];

export const ERASER: Brush = { id: "eraser", layer: "both", code: EMPTY };
export const LABEL_TOOL: Brush = { id: "label", layer: null, code: EMPTY };

export function floorBrush(
  family: FloorFamily,
  code = family.defaultCode,
): Brush {
  return { id: family.id, layer: "surface", code };
}

export function structureBrush(s: StructureBrush): Brush {
  return { id: s.id, layer: "feature", code: s.code };
}

export const DEFAULT_BRUSH: Brush = floorBrush(FLOORS[0]);

const FILLS = new Map<string, string>([
  ...FLOORS.flatMap((f) =>
    f.swatches.map((s) => [s.code, s.colour] as [string, string]),
  ),
  ...STRUCTURE.map((s) => [s.code, s.colour] as [string, string]),
]);

export interface TexturedSwatch {
  code: string;
  texture: FloorTexture;
  colour: string;
  seam: string;
  /** Wood only: the boards and joints of one `BOARD_REPEAT`. */
  boards?: BoardLayout;
}

/** Grout and board joints, kept faint so walls and furniture stay the strongest marks. */
function seamFor(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luma < 0.4 ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.1)";
}

/** Wood repeats every 6 × 2 m: big enough that the repeat is hard to spot. */
export const BOARD_REPEAT = { w: 600, h: 200 };
const BOARD_CM = 20;
const BOARD_MIN = 90;
const BOARD_MAX = 210;
/** How far each board's tone may drift from the floor colour, towards white or black. */
const BOARD_TONE = 0.025;

export interface Board {
  x: number;
  y: number;
  w: number;
  fill: string;
}

export interface BoardLayout {
  boards: Board[];
  /** Board ends, one short line each. */
  joints: string;
  /** The long edges between rows of boards. */
  rows: string;
}

/** A small seeded generator, so a floor looks the same on every render and for everyone. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Mixes a hex colour towards white (amount > 0) or black (amount < 0). */
function tint(hex: string, amount: number): string {
  const to = amount < 0 ? 0 : 255;
  const k = Math.abs(amount);
  return (
    "#" +
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16))
      .map((v) =>
        Math.round(v + (to - v) * k)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

/**
 * Rows of 20 cm boards, each 90–210 cm long with a slightly different tone. Each row wraps
 * around the repeat's width, so the pattern tiles without a seam.
 */
export function boardLayout(colour: string, seed: number): BoardLayout {
  const rand = seeded(seed);
  const { w: width, h: height } = BOARD_REPEAT;
  const boards: Board[] = [];
  const joints: string[] = [];
  const rows: string[] = [];
  const n = (v: number) => +v.toFixed(1);
  for (let y = 0; y < height; y += BOARD_CM) {
    rows.push(`M 0 ${y} H ${width}`);
    let start = rand() * width;
    let remaining = width;
    while (remaining > 0) {
      // Every board, the last in the row included, stays within BOARD_MIN–BOARD_MAX.
      const len =
        remaining <= BOARD_MAX
          ? remaining
          : Math.min(
              BOARD_MIN + rand() * (BOARD_MAX - BOARD_MIN),
              remaining - BOARD_MIN,
            );
      const fill = tint(colour, (rand() - 0.5) * 2 * BOARD_TONE);
      const x = start % width;
      joints.push(`M ${n(x)} ${y} v ${BOARD_CM}`);
      const first = Math.min(len, width - x);
      boards.push({ x: n(x), y, w: n(first), fill });
      if (first < len) boards.push({ x: 0, y, w: n(len - first), fill });
      start += len;
      remaining -= len;
    }
  }
  return { boards, joints: joints.join(" "), rows: rows.join(" ") };
}

/** One SVG pattern per textured colour, defined by the canvas as `fp-<code>`. */
export const TEXTURED: TexturedSwatch[] = FLOORS.flatMap((f) =>
  f.texture
    ? f.swatches.map((s, i) => ({
        code: s.code,
        texture: f.texture!,
        colour: s.colour,
        seam: seamFor(s.colour),
        ...(f.texture === "planks"
          ? { boards: boardLayout(s.colour, 101 + i) }
          : {}),
      }))
    : [],
);
const TEXTURED_BY_CODE = new Map(TEXTURED.map((t) => [t.code, t]));

/** The SVG fill for a code; the balcony and textured floors are patterns defined by the canvas. */
export function fillFor(code: string): string {
  if (code === "b0") return `url(#${BALCONY_PATTERN})`;
  if (TEXTURED_BY_CODE.has(code)) return `url(#fp-${code})`;
  return FILLS.get(code) ?? "transparent";
}

/** The CSS background for a brush swatch, mimicking the canvas pattern at swatch size. */
export function swatchBackground(code: string): string {
  if (code === "b0")
    return "repeating-linear-gradient(45deg, #cbd5c0 0 4px, #aebb9f 4px 6px)";
  const t = TEXTURED_BY_CODE.get(code);
  if (!t) return fillFor(code);
  const lines = (deg: number, gap: number) =>
    `repeating-linear-gradient(${deg}deg, ${t.seam} 0 1px, transparent 1px ${gap}px)`;
  return t.texture === "tiles"
    ? `${lines(0, 10)}, ${lines(90, 10)}, ${t.colour}`
    : `${lines(0, 5)}, ${t.colour}`;
}

const NAMES = new Map<BrushId, string>([
  ...FLOORS.map((f) => [f.id, f.label] as [BrushId, string]),
  ...STRUCTURE.map((s) => [s.id, s.label] as [BrushId, string]),
  ["eraser", "Eraser"],
  ["label", "Label"],
]);

export function brushName(id: BrushId): string {
  return NAMES.get(id) ?? id;
}
