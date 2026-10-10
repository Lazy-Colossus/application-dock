import { COLOURS, NAME_MAX, SIDE_CM_MAX, type PieceDraft } from "./furniture";
import type { Colour, Shape } from "./types";

export type ParsedLine =
  | { line: number; text: string; ok: true; piece: PieceDraft }
  | { line: number; text: string; ok: false; reason: string };

const LISTED_SHAPES: Shape[] = ["rectangle", "round", "oval", "egg"];
const SIZE = /^(\d+)\s*[x×]\s*(\d+)$/i;

function parseLine(text: string): { piece: PieceDraft } | { reason: string } {
  const parts = text.split(";").map((p) => p.trim());
  if (parts.length === 5 && parts[4] === "") parts.pop();
  if (parts.length > 5)
    return { reason: "too many parts — a note can't contain ';'" };
  if (parts.length < 4 || parts.slice(0, 4).some((p) => p === "")) {
    return { reason: "needs name; shape; size; colour" };
  }
  const [name, shapeText, sizeText, colourText, note = ""] = parts;
  if (name.length > NAME_MAX)
    return { reason: `name is longer than ${NAME_MAX} characters` };

  const shape = shapeText.toLowerCase();
  if (shape === "custom")
    return { reason: "custom shapes are painted — add it with Add a piece" };
  if (!LISTED_SHAPES.includes(shape as Shape)) {
    return {
      reason: `unknown shape '${shapeText}' — use rectangle, round, oval or egg`,
    };
  }

  let width: number;
  let depth: number;
  if (shape === "round") {
    if (!/^\d+$/.test(sizeText)) {
      return { reason: "a round piece takes one size, its diameter, e.g. 110" };
    }
    width = depth = Number(sizeText);
  } else {
    const m = SIZE.exec(sizeText);
    if (!m) return { reason: "size should be W x D in cm, e.g. 220 x 95" };
    width = Number(m[1]);
    depth = Number(m[2]);
  }
  if ([width, depth].some((v) => v < 1 || v > SIDE_CM_MAX)) {
    return { reason: `sizes must be 1–${SIDE_CM_MAX} cm` };
  }

  const colour = COLOURS.find((c) => c.id === colourText.toLowerCase())?.id;
  if (!colour) return { reason: `unknown colour '${colourText}'` };

  return {
    piece: {
      name,
      colour: colour as Colour,
      note,
      shape: shape as Shape,
      width_cm: width,
      depth_cm: depth,
      cells: null,
    },
  };
}

/** FU-4: one piece per line, `name; shape; size; colour[; note]`. Blank lines are skipped. */
export function parseFurnitureList(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const result = parseLine(line);
    out.push(
      "piece" in result
        ? { line: i + 1, text: line, ok: true, piece: result.piece }
        : { line: i + 1, text: line, ok: false, reason: result.reason },
    );
  });
  return out;
}
