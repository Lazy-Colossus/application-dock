// Pure rules for the Session Timer: targets, the cup's fill, its colours.
// No Vue, no stores — unit-tested without mounting anything.

import type { BrewingCurve, TeaClass } from "./types";

export const GENERIC_STEEPS = [10, 15, 20, 25];
export const STEP_SECONDS = 5;

// The dashed target line sits this far up the cup, leaving room above it for an
// over-steep to be visible before the liquor reaches the rim.
export const TARGET_LEVEL = 0.85;

// Hitting stop on the exact second is near impossible, so a stop this soon
// after the target logs the target itself.
export const GRACE_SECONDS = 3;

/** The share (1 → 0) of the grace window still to run, or null outside it. */
export function graceLeft(elapsed: number, target: number): number | null {
  const into = elapsed - target;
  return into >= 0 && into < GRACE_SECONDS ? 1 - into / GRACE_SECONDS : null;
}

/** The seconds a stop at `elapsed` records. */
export function loggedSeconds(elapsed: number, target: number): number {
  return graceLeft(elapsed, target) !== null ? target : Math.max(0, Math.round(elapsed));
}

/** The clock holds at the target through the grace window, then jumps on. */
export function shownSeconds(elapsed: number, target: number): number {
  return graceLeft(elapsed, target) !== null ? target : elapsed;
}

// Brighter than the shelf's `CLASS_TOKENS.liquor`: the shelf mutes liquor into a
// palette, the cup shows it as it looks poured (chosen in the design session,
// see the Session Timer spec).
export const CUP_LIQUOR: Record<TeaClass, string> = {
  green: "#d6cf86",
  yellow: "#e3c65e",
  white: "#ead9a4",
  oolong: "#d49a3f",
  red: "#a8492a",
  dark: "#5e2e17",
  other: "#bdb56a",
};

export function genericCurve(label = "generic gongfu"): BrewingCurve {
  return {
    leaf_grams: null,
    water_temp_c: null,
    steep_seconds: [...GENERIC_STEEPS],
    source: "generic",
    source_label: label,
  };
}

/** The suggested seconds for infusion `infusionNumber` (1-based). */
export function targetFor(steeps: number[], infusionNumber: number): number {
  const list = steeps.length > 0 ? steeps : GENERIC_STEEPS;
  if (infusionNumber <= list.length) return list[infusionNumber - 1];
  return list[list.length - 1] + STEP_SECONDS * (infusionNumber - list.length);
}

export function fillLevel(elapsedSeconds: number, targetSeconds: number): number {
  if (targetSeconds <= 0) return 0;
  const ratio = elapsedSeconds / targetSeconds;
  if (ratio <= 1) return ratio * TARGET_LEVEL;
  // Past the target the liquor climbs the last stretch over one more target's
  // length, then stops at the rim.
  return Math.min(1, TARGET_LEVEL + (ratio - 1) * (1 - TARGET_LEVEL));
}

export function overSteep(elapsedSeconds: number, targetSeconds: number): number {
  if (targetSeconds <= 0) return 0;
  return Math.min(1, Math.max(0, elapsedSeconds / targetSeconds - 1));
}

/** Mix `hex` toward black; `amount` 1 is the darkest an over-steep gets. */
export function darken(hex: string, amount: number): string {
  const keep = 1 - 0.45 * Math.min(1, Math.max(0, amount));
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `#${channels
    .map((c) => Math.round(c * keep).toString(16).padStart(2, "0"))
    .join("")}`;
}

export function formatElapsed(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

// getRandomValues rather than randomUUID: randomUUID only exists in secure
// contexts, and the dock may be reached over plain http on the LAN.
export function newSessionId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `s-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
