import { CELL_CM } from "./grid";
import type { Colour, Furniture, Shape } from "./types";

// Limits mirrored from backend/app/schemas/floor_planner.py.
export const NAME_MAX = 40;
export const NOTE_MAX = 200;
export const SIDE_CM_MAX = 1000;
export const CUSTOM_MAX = 20;

export const COLOURS: { id: Colour; name: string; hex: string }[] = [
  { id: "white", name: "White", hex: "#f4f3ef" },
  { id: "black", name: "Black", hex: "#2a2a2a" },
  { id: "grey", name: "Grey", hex: "#868c94" },
  { id: "beige", name: "Beige", hex: "#d9c8a5" },
  { id: "brown", name: "Brown", hex: "#6d4a2c" },
  { id: "red", name: "Red", hex: "#b8423a" },
  { id: "orange", name: "Orange", hex: "#d9822b" },
  { id: "yellow", name: "Yellow", hex: "#e0b84a" },
  { id: "green", name: "Green", hex: "#5f8a55" },
  { id: "blue", name: "Blue", hex: "#4f74a8" },
  { id: "purple", name: "Purple", hex: "#7a5a9a" },
];

export const SHAPES: { id: Shape; label: string }[] = [
  { id: "rectangle", label: "Rectangle" },
  { id: "round", label: "Round" },
  { id: "oval", label: "Oval" },
  { id: "egg", label: "Egg" },
  { id: "custom", label: "Custom" },
];

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

/** The same rules the server applies, so the form only enables Save for pieces it will accept. */
export function draftProblem(d: PieceDraft): string | null {
  const name = d.name.trim();
  if (!name || name.length > NAME_MAX)
    return `Name needs 1–${NAME_MAX} characters`;
  if (d.note.trim().length > NOTE_MAX)
    return `Note is longer than ${NOTE_MAX} characters`;
  if (d.shape === "custom") {
    return d.cells && d.cells.some((r) => r.includes("#"))
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
    case "custom": {
      const s = n(CELL_CM * scale);
      const parts: string[] = [];
      (p.cells ?? []).forEach((row, r) =>
        [...row].forEach((ch, c) => {
          if (ch === "#")
            parts.push(`M ${n(c * s)} ${n(r * s)} h ${s} v ${s} h ${-s} Z`);
        }),
      );
      return parts.join(" ");
    }
  }
}

/** The px-per-cm that fits the piece's longer side into `maxPx`, never larger than `scale`. */
export function fitScale(p: Sized, scale: number, maxPx: number): number {
  const longest = Math.max(p.width_cm, p.depth_cm, 1);
  return Math.min(scale, maxPx / longest);
}
