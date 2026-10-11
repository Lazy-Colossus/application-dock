import { describe, it, expect } from "vitest";
import {
  doorShape,
  findDoors,
  liveDoorSettings,
  setDoor,
  sideNames,
} from "./doors";
import type { PlanGrid } from "./grid";
import type { DoorSetting, Label } from "./types";

const CODES: Record<string, string> = {
  "#": "wl",
  D: "dr",
  F: "fd",
  ".": "..",
};

/**
 * A hall and a room joined by a door, a front door at the bottom, and nothing outside.
 *   ########
 *   #..#...#
 *   #..D...#
 *   #..D...#
 *   #..#...#
 *   #FF#####
 *   ........
 */
function flat(labels: Label[] = [], doors: DoorSetting[] = []): PlanGrid {
  const rows = [
    "########",
    "#..#...#",
    "#..D...#",
    "#..D...#",
    "#..#...#",
    "#FF#####",
    "........",
  ];
  return {
    cols: 8,
    rows: rows.length,
    feature: rows.map((r) => [...r].map((ch) => CODES[ch]).join("")),
    // Floor only inside the walls; the bottom row is outside.
    surface: rows.map((r, i) =>
      [...r].map((ch) => (ch === "." && i < 6 ? "w1" : "..")).join(""),
    ),
    labels,
    doors,
  };
}

const named = [
  { id: "a", text: "Hall", col: 1, row: 1 },
  { id: "b", text: "Room", col: 5, row: 2 },
];

describe("findDoors", () => {
  it("finds each door, its direction and its anchor", () => {
    const [inner, front] = findDoors(flat());
    expect(inner).toMatchObject({
      key: "3,2",
      code: "dr",
      dir: "v",
      col: 3,
      row: 2,
      cols: 1,
      rows: 2,
    });
    expect(front).toMatchObject({ key: "1,5", code: "fd", dir: "h", cols: 2 });
  });

  it("opens a front door into the flat until set otherwise", () => {
    const front = findDoors(flat())[1];
    expect(front.setting).toEqual({
      col: 1,
      row: 5,
      into: 0,
      hinge: 0,
      double: false,
    });
    const saved = { col: 1, row: 5, into: 1, hinge: 1, double: true } as const;
    expect(findDoors(flat([], [saved]))[1].setting).toEqual(saved);
  });

  it("turns a one-square door to follow the wall beside it", () => {
    const plan = flat();
    // A single door square in the top wall, with wall to its left and right.
    plan.feature[0] = "wl" + "dr" + "wl".repeat(6);
    expect(findDoors(plan)[0]).toMatchObject({ key: "1,0", dir: "h" });
  });
});

describe("sideNames", () => {
  it("names the rooms on each side from their labels", () => {
    const plan = flat(named);
    expect(sideNames(plan, findDoors(plan)[0])).toEqual(["Hall", "Room"]);
  });

  it("says into the flat or outwards for a front door", () => {
    const plan = flat(named);
    expect(sideNames(plan, findDoors(plan)[1])).toEqual([
      "Into the flat",
      "Outwards",
    ]);
  });

  it("says inside and outside when a side has no label", () => {
    const plan = flat();
    expect(sideNames(plan, findDoors(plan)[0])).toEqual(["Inside", "Outside"]);
  });

  it("calls the unlabelled side inside when the other side is outdoors", () => {
    const plan = flat();
    // An ordinary door in the top wall: outdoors above it, the hall below.
    plan.feature[0] = "wl" + "dr".repeat(2) + "wl".repeat(5);
    const [top, , bottom] = findDoors(plan);
    expect(sideNames(plan, top)).toEqual(["Outside", "Inside"]);
    // The bottom door as an ordinary door: the hall above it, outdoors below.
    expect(sideNames(plan, { ...bottom, code: "dr" })).toEqual([
      "Inside",
      "Outside",
    ]);
  });
});

describe("doorShape", () => {
  const inner = (setting: Partial<DoorSetting>) => {
    const door = findDoors(flat())[0];
    return doorShape({ ...door, setting: { ...door.setting, ...setting } });
  };

  it("swings one leaf from its hinge into the chosen side", () => {
    // The door is squares (3,2)–(3,3): x 60–80 cm, y 40–80 cm.
    const shape = inner({ into: 1, hinge: 0 });
    expect(shape.gap).toEqual({ x: 60, y: 40, w: 20, h: 40 });
    expect(shape.widthCm).toBe(40);
    expect(shape.leaves).toEqual([
      { pivot: [80, 40], open: [120, 40], shut: [80, 80], len: 40, sweep: 1 },
    ]);
    const other = inner({ into: 0, hinge: 1 }).leaves[0];
    expect(other).toMatchObject({ pivot: [60, 80], open: [20, 80] });
  });

  it("splits a double door into two half leaves meeting in the middle", () => {
    const leaves = inner({ into: 1, double: true }).leaves;
    expect(leaves.map((l) => [l.pivot, l.shut, l.len])).toEqual([
      [[80, 40], [80, 60], 20],
      [[80, 80], [80, 60], 20],
    ]);
  });
});

describe("door settings", () => {
  const setting: DoorSetting = {
    col: 3,
    row: 2,
    into: 1,
    hinge: 1,
    double: false,
  };

  it("replaces a door's setting rather than adding a second", () => {
    const once = setDoor(flat(), setting);
    const twice = setDoor(once, { ...setting, double: true });
    expect(twice.doors).toEqual([{ ...setting, double: true }]);
  });

  it("keeps settings only for doors that still exist", () => {
    const plan = setDoor(flat(), setting);
    plan.doors.push({ ...setting, col: 5, row: 5 });
    expect(liveDoorSettings(plan)).toEqual([setting]);
  });
});
