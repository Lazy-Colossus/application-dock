import { CELL_CM } from "./grid";
import type { PlanNote } from "./types";

/** Note text height on screen, kept constant across zoom levels like label text. */
export const NOTE_PX = 10;
const PAD_PX = 6;
const HEIGHT_PX = 18;
/** About one character's advance at NOTE_PX. */
const CHAR_PX = NOTE_PX * 0.6;

/**
 * A note's box in screen px, unturned: it runs right from just before its square's centre.
 * A vertical note is the same box turned to read bottom to top.
 */
export function noteBox(text: string): {
  x: number;
  y: number;
  w: number;
  h: number;
} {
  return {
    x: -PAD_PX,
    y: -HEIGHT_PX / 2,
    w: text.length * CHAR_PX + 2 * PAD_PX,
    h: HEIGHT_PX,
  };
}

export const noteAnchor = (n: PlanNote): { x: number; y: number } => ({
  x: (n.col + 0.5) * CELL_CM,
  y: (n.row + 0.5) * CELL_CM,
});

/** The topmost note under a plan point; notes drawn later sit on top. */
export function noteAt(
  notes: PlanNote[],
  at: { x: number; y: number },
  cmPerPx: number,
): PlanNote | null {
  for (let i = notes.length - 1; i >= 0; i--) {
    const n = notes[i];
    const a = noteAnchor(n);
    const dx = (at.x - a.x) / cmPerPx;
    const dy = (at.y - a.y) / cmPerPx;
    // Undo the quarter turn, so the vertical box is tested as if it were horizontal.
    const [x, y] = n.vertical ? [-dy, dx] : [dx, dy];
    const b = noteBox(n.text);
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return n;
  }
  return null;
}
