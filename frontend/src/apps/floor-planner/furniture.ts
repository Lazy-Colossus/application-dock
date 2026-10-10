import type { Colour, Furniture, Shape } from "./types";

// Limits mirrored from backend/app/schemas/floor_planner.py.
export const NAME_MAX = 40;
export const NOTE_MAX = 200;
export const SIDE_CM_MAX = 1000;
/** A drawn piece is painted in squares this size, up to CUSTOM_MAX on each side (4 m). */
export const PIECE_CELL_CM = 10;
export const CUSTOM_MAX = 40;

/** In palette order: light to dark within each family, so the swatches read as a range. */
export const COLOURS: { id: Colour; name: string; hex: string }[] = [
  { id: "white", name: "White", hex: "#f4f3ef" },
  { id: "beige", name: "Beige", hex: "#d9c8a5" },
  { id: "tan", name: "Tan", hex: "#c09a6b" },
  { id: "brown", name: "Brown", hex: "#6d4a2c" },
  { id: "yellow", name: "Yellow", hex: "#e0b84a" },
  { id: "orange", name: "Orange", hex: "#d9822b" },
  { id: "red", name: "Red", hex: "#b8423a" },
  { id: "pink", name: "Pink", hex: "#d98fa3" },
  { id: "purple", name: "Purple", hex: "#7a5a9a" },
  { id: "blue", name: "Blue", hex: "#4f74a8" },
  { id: "navy", name: "Navy", hex: "#2e3f66" },
  { id: "teal", name: "Teal", hex: "#3f8784" },
  { id: "green", name: "Green", hex: "#5f8a55" },
  { id: "olive", name: "Olive", hex: "#7c7a3f" },
  { id: "grey", name: "Grey", hex: "#868c94" },
  { id: "charcoal", name: "Charcoal", hex: "#4a4e55" },
  { id: "black", name: "Black", hex: "#2a2a2a" },
];

export const EMPTY_SQUARE = ".";
/** One character per colour in a drawn piece's `cells`; mirrored from the backend schema. */
export const COLOUR_CHARS: Record<Colour, string> = {
  white: "w",
  black: "k",
  grey: "g",
  beige: "e",
  brown: "b",
  red: "r",
  orange: "o",
  yellow: "y",
  green: "n",
  blue: "u",
  purple: "p",
  tan: "t",
  pink: "i",
  navy: "a",
  teal: "l",
  olive: "v",
  charcoal: "c",
};
const COLOUR_OF = new Map(
  Object.entries(COLOUR_CHARS).map(([c, ch]) => [ch, c as Colour]),
);

const painted = (ch: string | undefined): boolean =>
  ch !== undefined && ch !== EMPTY_SQUARE;

/** The most painted colour, as the server works it out; a tie goes to the first painted. */
export function mainColour(cells: string[], fallback: Colour): Colour {
  const counts = new Map<string, number>();
  for (const ch of cells.join("")) {
    if (painted(ch)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  }
  let best: string | null = null;
  for (const [ch, n] of counts)
    if (best === null || n > counts.get(best)!) best = ch;
  return (best !== null ? COLOUR_OF.get(best) : undefined) ?? fallback;
}

export const SHAPES: { id: Shape; label: string }[] = [
  { id: "rectangle", label: "Rectangle" },
  { id: "round", label: "Round" },
  { id: "oval", label: "Oval" },
  { id: "egg", label: "Egg" },
  { id: "custom", label: "Custom" },
];

export const BLANK_DRAFT: PieceDraft = {
  name: "",
  colour: "grey",
  note: "",
  shape: "rectangle",
  width_cm: 100,
  depth_cm: 60,
  cells: null,
};

export function draftOf(p: Furniture): PieceDraft {
  const { name, colour, note, shape, width_cm, depth_cm, cells } = p;
  return { name, colour, note, shape, width_cm, depth_cm, cells };
}

/** A piece as the client sends it; the server assigns the id. */
export interface PieceDraft {
  name: string;
  colour: Colour;
  note: string;
  shape: Shape;
  width_cm: number;
  depth_cm: number;
  cells: string[] | null;
}

type Sized = Pick<Furniture, "shape" | "width_cm" | "depth_cm" | "cells">;

export function colourHex(c: Colour): string {
  return COLOURS.find((x) => x.id === c)?.hex ?? "#868c94";
}

export function sizeLabel(p: Sized): string {
  return p.shape === "round"
    ? `⌀ ${p.width_cm} cm`
    : `${p.width_cm} × ${p.depth_cm} cm`;
}

/** "Sofa" → "Sofa copy", cut short so it stays within the name limit. */
export function copyName(name: string): string {
  const suffix = " copy";
  return `${name.trim().slice(0, NAME_MAX - suffix.length)}${suffix}`;
}

/** The same rules the server applies, so the form only enables Save for pieces it will accept. */
export function draftProblem(d: PieceDraft): string | null {
  const name = d.name.trim();
  if (!name || name.length > NAME_MAX)
    return `Name needs 1–${NAME_MAX} characters`;
  if (d.note.trim().length > NOTE_MAX)
    return `Note is longer than ${NOTE_MAX} characters`;
  if (d.shape === "custom") {
    return d.cells && [...d.cells.join("")].some(painted)
      ? null
      : "Paint at least one square";
  }
  const ok = (n: number) => Number.isInteger(n) && n >= 1 && n <= SIDE_CM_MAX;
  if (!ok(d.width_cm) || !ok(d.depth_cm))
    return `Sizes must be 1–${SIDE_CM_MAX} cm`;
  if (d.shape === "round" && d.width_cm !== d.depth_cm)
    return "A round piece has one diameter";
  return null;
}

/** An SVG path for the piece inside a box of width × depth at `scale` px per cm. */
export function outline(p: Sized, scale: number): string {
  const w = p.width_cm * scale;
  const d = p.depth_cm * scale;
  const n = (v: number) => +v.toFixed(2);
  switch (p.shape) {
    case "rectangle":
      return `M 0 0 H ${n(w)} V ${n(d)} H 0 Z`;
    case "round":
    case "oval":
      return (
        `M 0 ${n(d / 2)} A ${n(w / 2)} ${n(d / 2)} 0 1 0 ${n(w)} ${n(d / 2)} ` +
        `A ${n(w / 2)} ${n(d / 2)} 0 1 0 0 ${n(d / 2)} Z`
      );
    case "egg":
      // Widest at 42 % of the depth, so the wider end is at the top before rotation.
      return [
        `M ${n(w / 2)} 0`,
        `C ${n(0.82 * w)} 0 ${n(w)} ${n(0.2 * d)} ${n(w)} ${n(0.42 * d)}`,
        `C ${n(w)} ${n(0.72 * d)} ${n(0.72 * w)} ${n(d)} ${n(w / 2)} ${n(d)}`,
        `C ${n(0.28 * w)} ${n(d)} 0 ${n(0.72 * d)} 0 ${n(0.42 * d)}`,
        `C 0 ${n(0.2 * d)} ${n(0.18 * w)} 0 ${n(w / 2)} 0 Z`,
      ].join(" ");
    case "custom":
      return squares(p.cells ?? [], scale, painted);
  }
}

function squares(
  cells: string[],
  scale: number,
  keep: (ch: string) => boolean,
): string {
  const s = +(PIECE_CELL_CM * scale).toFixed(2);
  const n = (v: number) => +v.toFixed(2);
  const parts: string[] = [];
  cells.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      if (keep(ch))
        parts.push(`M ${n(c * s)} ${n(r * s)} h ${s} v ${s} h ${-s} Z`);
    }),
  );
  return parts.join(" ");
}

/** One path per colour of a drawn piece, in the order the colours are first painted. */
export function customFills(
  cells: string[],
  scale: number,
): { colour: Colour; hex: string; d: string }[] {
  const chars = [...new Set(cells.join(""))].filter(
    (ch) => painted(ch) && COLOUR_OF.has(ch),
  );
  return chars.map((ch) => {
    const colour = COLOUR_OF.get(ch)!;
    return {
      colour,
      hex: colourHex(colour),
      d: squares(cells, scale, (x) => x === ch),
    };
  });
}

/** The px-per-cm that fits the piece's longer side into `maxPx`, never larger than `scale`. */
export function fitScale(p: Sized, scale: number, maxPx: number): number {
  const longest = Math.max(p.width_cm, p.depth_cm, 1);
  return Math.min(scale, maxPx / longest);
}

/** For a custom shape, only the edges between a painted square and an unpainted one. */
export function customEdges(cells: string[], scale: number): string {
  const s = +(PIECE_CELL_CM * scale).toFixed(2);
  const on = (r: number, c: number) => painted(cells[r]?.[c]);
  const parts: string[] = [];
  cells.forEach((row, r) =>
    [...row].forEach((_, c) => {
      if (!on(r, c)) return;
      const x = +(c * s).toFixed(2);
      const y = +(r * s).toFixed(2);
      if (!on(r - 1, c)) parts.push(`M ${x} ${y} h ${s}`);
      if (!on(r + 1, c)) parts.push(`M ${x} ${+(y + s).toFixed(2)} h ${s}`);
      if (!on(r, c - 1)) parts.push(`M ${x} ${y} v ${s}`);
      if (!on(r, c + 1)) parts.push(`M ${+(x + s).toFixed(2)} ${y} v ${s}`);
    }),
  );
  return parts.join(" ");
}

/** The drag-and-drop data type a tray card carries onto the plan. */
export const PIECE_DRAG_TYPE = "application/x-fp-piece";
