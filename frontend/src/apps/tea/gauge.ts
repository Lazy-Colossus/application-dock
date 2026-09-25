// The rim gauge's geometry, kept out of the component so it can be tested
// without a DOM. See DESIGN.md, "The rim gauge".

export interface RimSize {
  box: number;
  radius: number;
  stroke: number;
}

export const RIM: Record<"shelf" | "page", RimSize> = {
  // 44px is also the touch minimum: on the shelf the gauge IS the tap target.
  shelf: { box: 44, radius: 17, stroke: 2.5 },
  page: { box: 86, radius: 35, stroke: 4 },
};

export function circumferenceOf(radius: number): number {
  return 2 * Math.PI * radius;
}

const DASH = 4;
const GAP = 4.4;

/**
 * The `stroke-dasharray` that draws `arc` of `circumference`.
 *
 * Solid is one dash and one gap. Dashed — a tea under its low threshold —
 * repeats 4-on 4.4-off across the arc, then swallows the remainder into the
 * final gap so the pattern sums to exactly the circumference. That matters:
 * SVG cycles the pattern around the whole circle, so a pattern that doesn't
 * sum to the circumference would wrap and draw dashes into the empty part.
 */
export function dashPattern(
  arc: number,
  circumference: number,
  dashed: boolean,
): string {
  if (arc <= 0) return `0 ${circumference}`;
  if (!dashed) return `${arc} ${circumference - arc}`;

  const segments: number[] = [];
  let remaining = arc;
  while (remaining > 0.01) {
    const dash = Math.min(DASH, remaining);
    segments.push(dash, GAP);
    remaining -= dash + GAP;
  }

  const sum = segments.reduce((total, value) => total + value, 0);
  segments[segments.length - 1] += circumference - sum;
  return segments.join(" ");
}
