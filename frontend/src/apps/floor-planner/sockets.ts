import { CELL_CM, type Cell } from "./grid";
import type { Socket } from "./types";

/** The socket symbol's diameter on screen, kept constant across zoom levels like label text. */
export const SOCKET_PX = 12;

/** Adds a socket on the square, or removes the one already there. */
export function toggleSocket(sockets: Socket[], cell: Cell): Socket[] {
  const kept = sockets.filter((s) => s.col !== cell.col || s.row !== cell.row);
  return kept.length < sockets.length
    ? kept
    : [...sockets, { col: cell.col, row: cell.row }];
}

/**
 * The socket whose symbol covers a plan point, if any. Symbols are wider than a 5 cm square,
 * so a click on one means that socket, not a new one on the square beside it.
 */
export function socketAt(
  sockets: Socket[],
  at: { x: number; y: number },
  cmPerPx: number,
): Socket | null {
  const reach = (SOCKET_PX / 2) * cmPerPx;
  return (
    sockets.find(
      (s) =>
        Math.hypot(
          (s.col + 0.5) * CELL_CM - at.x,
          (s.row + 0.5) * CELL_CM - at.y,
        ) <= reach,
    ) ?? null
  );
}
