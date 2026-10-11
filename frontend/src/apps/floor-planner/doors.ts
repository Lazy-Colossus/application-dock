import { EMPTY } from "./codes";
import { CELL_CM, codeAt, type Cell, type PlanGrid } from "./grid";
import type { DoorSetting } from "./types";

export const DOOR_CODES: ReadonlySet<string> = new Set(["dr", "fd"]);

export interface Door {
  /** "col,row" of the anchor, its first square in reading order. */
  key: string;
  code: string;
  /** Bounding box in squares. */
  col: number;
  row: number;
  cols: number;
  rows: number;
  /** "h" sits in a horizontal wall and swings up or down; "v" in a vertical wall, left or right. */
  dir: "h" | "v";
  setting: DoorSetting;
}

type Point = [number, number];

export interface Leaf {
  pivot: Point;
  open: Point;
  shut: Point;
  len: number;
  /** SVG arc sweep flag for the arc from `open` to `shut`. */
  sweep: 0 | 1;
}

export interface DoorShape {
  /** The opening in the wall, in cm. */
  gap: { x: number; y: number; w: number; h: number };
  widthCm: number;
  leaves: Leaf[];
}

export const keyOf = (c: Cell): string => `${c.col},${c.row}`;

const isWall = (code: string) => code !== EMPTY && !DOOR_CODES.has(code);

/** Each 4-connected group of one door code; scanning in reading order makes the first square the anchor. */
export function findDoors(plan: PlanGrid): Door[] {
  const seen = new Set<string>();
  const doors: Door[] = [];
  for (let row = 0; row < plan.rows; row++) {
    for (let col = 0; col < plan.cols; col++) {
      const code = codeAt(plan.feature, { col, row });
      if (!DOOR_CODES.has(code) || seen.has(keyOf({ col, row }))) continue;
      const cells: Cell[] = [];
      const queue: Cell[] = [{ col, row }];
      seen.add(keyOf({ col, row }));
      while (queue.length) {
        const c = queue.pop()!;
        cells.push(c);
        for (const n of [
          { col: c.col + 1, row: c.row },
          { col: c.col - 1, row: c.row },
          { col: c.col, row: c.row + 1 },
          { col: c.col, row: c.row - 1 },
        ]) {
          if (
            n.col < 0 ||
            n.row < 0 ||
            n.col >= plan.cols ||
            n.row >= plan.rows ||
            seen.has(keyOf(n)) ||
            codeAt(plan.feature, n) !== code
          )
            continue;
          seen.add(keyOf(n));
          queue.push(n);
        }
      }
      const c0 = Math.min(...cells.map((c) => c.col));
      const r0 = Math.min(...cells.map((c) => c.row));
      const cols = Math.max(...cells.map((c) => c.col)) - c0 + 1;
      const rows = Math.max(...cells.map((c) => c.row)) - r0 + 1;
      const door = {
        key: keyOf({ col, row }),
        code,
        col: c0,
        row: r0,
        cols,
        rows,
        dir: direction(plan, c0, r0, cols, rows),
      };
      const saved = plan.doors.find((d) => d.col === col && d.row === row);
      doors.push({
        ...door,
        setting: saved ?? defaultSetting(plan, door, { col, row }),
      });
    }
  }
  return doors;
}

/** The longer side is the wall's direction; a square door follows the wall beside it. */
function direction(
  plan: PlanGrid,
  col: number,
  row: number,
  cols: number,
  rows: number,
): "h" | "v" {
  if (cols !== rows) return cols > rows ? "h" : "v";
  const wallAt = (c: number, r: number) =>
    isWall(codeAt(plan.feature, { col: c, row: r }));
  if (wallAt(col - 1, row) || wallAt(col + cols, row)) return "h";
  if (wallAt(col, row - 1) || wallAt(col, row + rows)) return "v";
  return "h";
}

export type Side =
  | { kind: "room"; name: string }
  | { kind: "outside" }
  | { kind: "unnamed" };

/** What lies on each side of the door: side 0 above or left, side 1 below or right. */
export function doorSides(
  plan: PlanGrid,
  door: Pick<Door, "col" | "row" | "cols" | "rows" | "dir">,
): [Side, Side] {
  const midCol = door.col + Math.floor(door.cols / 2);
  const midRow = door.row + Math.floor(door.rows / 2);
  const starts: [Cell, Cell] =
    door.dir === "h"
      ? [
          { col: midCol, row: door.row - 1 },
          { col: midCol, row: door.row + door.rows },
        ]
      : [
          { col: door.col - 1, row: midRow },
          { col: door.col + door.cols, row: midRow },
        ];
  return [sideFrom(plan, starts[0]), sideFrom(plan, starts[1])];
}

/** A room is the floor reachable without crossing a wall, window or door; its label names it. */
function sideFrom(plan: PlanGrid, start: Cell): Side {
  const floor = (c: Cell) =>
    c.col >= 0 &&
    c.row >= 0 &&
    c.col < plan.cols &&
    c.row < plan.rows &&
    codeAt(plan.feature, c) === EMPTY &&
    codeAt(plan.surface, c) !== EMPTY;
  if (!floor(start)) return { kind: "outside" };
  const labelled = new Map(plan.labels.map((l) => [keyOf(l), l.text]));
  const seen = new Set([keyOf(start)]);
  const queue = [start];
  while (queue.length) {
    const c = queue.pop()!;
    const name = labelled.get(keyOf(c));
    if (name) return { kind: "room", name };
    for (const n of [
      { col: c.col + 1, row: c.row },
      { col: c.col - 1, row: c.row },
      { col: c.col, row: c.row + 1 },
      { col: c.col, row: c.row - 1 },
    ]) {
      if (!seen.has(keyOf(n)) && floor(n)) {
        seen.add(keyOf(n));
        queue.push(n);
      }
    }
  }
  return { kind: "unnamed" };
}

/** A front door opens into the flat; any other door starts opening up or left. */
function defaultSetting(
  plan: PlanGrid,
  door: Pick<Door, "code" | "col" | "row" | "cols" | "rows" | "dir">,
  anchor: Cell,
): DoorSetting {
  let into: 0 | 1 = 0;
  if (door.code === "fd") {
    const [a, b] = doorSides(plan, door);
    if (a.kind === "outside" && b.kind !== "outside") into = 1;
  }
  return { ...anchor, into, hinge: 0, double: false };
}

/** The names the setup panel offers for side 0 and side 1. */
export function sideNames(plan: PlanGrid, door: Door): [string, string] {
  const sides = doorSides(plan, door);
  const outside = sides.map((s) => s.kind === "outside");
  if (door.code === "fd" && outside[0] !== outside[1]) {
    return outside[0]
      ? ["Outwards", "Into the flat"]
      : ["Into the flat", "Outwards"];
  }
  // An unlabelled side is "Inside" when the other side really is outside.
  const fallback: [string, string] = ["Inside", "Outside"];
  const named = sides.map((side, i) => {
    if (side.kind === "room") return side.name;
    if (side.kind === "outside") return "Outside";
    return sides[1 - i].kind === "outside" ? "Inside" : fallback[i];
  });
  // One open space on both sides gives the same name twice; the fallback tells them apart.
  return named[0] === named[1] ? fallback : [named[0], named[1]];
}

/** The opening, and each leaf swung open and shut, in plan cm. */
export function doorShape(door: Door): DoorShape {
  const { into, hinge, double } = door.setting;
  const sign = into === 0 ? -1 : 1;
  const x0 = door.col * CELL_CM;
  const y0 = door.row * CELL_CM;
  const x1 = (door.col + door.cols) * CELL_CM;
  const y1 = (door.row + door.rows) * CELL_CM;
  const gap = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  const horizontal = door.dir === "h";
  const [a, b] = horizontal ? [x0, x1] : [y0, y1];
  const face = horizontal ? (into === 0 ? y0 : y1) : into === 0 ? x0 : x1;

  /** A leaf hinged at `h` along the wall, closing towards `o`. */
  const leaf = (h: number, o: number): Leaf => {
    const len = Math.abs(o - h);
    const at = (along: number, out: number): Point =>
      horizontal ? [along, out] : [out, along];
    // The arc runs from the open leaf back to the wall; which way round depends on the corner.
    const sweep = h < o === (horizontal ? sign < 0 : sign > 0) ? 1 : 0;
    return {
      pivot: at(h, face),
      open: at(h, face + sign * len),
      shut: at(o, face),
      len,
      sweep,
    };
  };
  const mid = (a + b) / 2;
  const leaves = double
    ? [leaf(a, mid), leaf(b, mid)]
    : [hinge === 0 ? leaf(a, b) : leaf(b, a)];
  return { gap, widthCm: b - a, leaves };
}

/** Settings only for doors that still exist, so painting a door away drops its setup. */
export function liveDoorSettings(plan: PlanGrid): DoorSetting[] {
  const anchors = new Set(findDoors(plan).map((d) => d.key));
  return plan.doors.filter((d) => anchors.has(keyOf(d)));
}

export function setDoor(plan: PlanGrid, setting: DoorSetting): PlanGrid {
  return {
    ...plan,
    doors: [
      ...plan.doors.filter(
        (d) => d.col !== setting.col || d.row !== setting.row,
      ),
      setting,
    ],
  };
}
