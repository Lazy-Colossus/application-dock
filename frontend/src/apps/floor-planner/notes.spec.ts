import { describe, it, expect } from "vitest";
import { noteAt, noteBox } from "./notes";
import type { PlanNote } from "./types";

const across: PlanNote = {
  id: "n1",
  text: "Pipe",
  col: 2,
  row: 2,
  vertical: false,
};
// Square (2,2)'s centre, where the note is anchored, in cm.
const centre = { x: 12.5, y: 12.5 };

describe("noteBox", () => {
  it("grows with the text and starts just before the anchor", () => {
    expect(noteBox("Pipe")).toEqual({ x: -6, y: -9, w: 36, h: 18 });
    expect(noteBox("Pipework").w).toBeGreaterThan(noteBox("Pipe").w);
  });
});

describe("noteAt", () => {
  // 2 cm per screen px, so the 36 px box reaches 60 cm past the anchor.
  const cmPerPx = 2;

  it("finds a horizontal note along its text, not above it", () => {
    expect(noteAt([across], { x: centre.x + 50, y: centre.y }, cmPerPx)).toBe(
      across,
    );
    expect(
      noteAt([across], { x: centre.x, y: centre.y - 50 }, cmPerPx),
    ).toBeNull();
  });

  it("finds a vertical note up its text, not beside it", () => {
    const up = { ...across, vertical: true };
    expect(noteAt([up], { x: centre.x, y: centre.y - 50 }, cmPerPx)).toBe(up);
    expect(noteAt([up], { x: centre.x + 50, y: centre.y }, cmPerPx)).toBeNull();
  });

  it("picks the note drawn on top", () => {
    const over = { ...across, id: "n2" };
    expect(noteAt([across, over], centre, cmPerPx)?.id).toBe("n2");
  });
});
