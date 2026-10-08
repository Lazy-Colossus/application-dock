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

export interface FloorFamily {
  id: Extract<BrushId, "tile" | "wood" | "carpet" | "balcony">;
  label: string;
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
    defaultCode: "w1",
    swatches: [
      { code: "w0", name: "Light", colour: "#d6ae80" },
      { code: "w1", name: "Medium", colour: "#a8743f" },
      { code: "w2", name: "Dark", colour: "#6b4426" },
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

/** The SVG fill for a code; the balcony is a hatch pattern defined by the canvas. */
export function fillFor(code: string): string {
  if (code === "b0") return `url(#${BALCONY_PATTERN})`;
  return FILLS.get(code) ?? "transparent";
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
