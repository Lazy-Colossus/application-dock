/** Where a day sits on the coverage ramp, and whether it got there honestly. */
export interface WashStep {
  /** 0 (nobody) to 6 (everyone), indexing `--kdh-wash-*`. */
  step: number;
  /**
   * Full coverage that leans on at least one "if needed". Same step as an
   * all-free day — equally loud — but marked, so an admin can see what they are
   * about to ask of people.
   */
  provisional: boolean;
}

const STEPS = 6;

/**
 * Scale a day's coverage against the number of *active* invitees.
 *
 * Relative, not absolute: five of six is near the top, five of ten is not. The
 * ramp has a fixed number of steps because it is a colour scale, so a group
 * larger than six shares steps — which is exactly why the count stays in the
 * cell (NFR-6).
 */
export function washFor(
  free: number,
  ifNeeded: number,
  activeTotal: number,
): WashStep {
  const coverage = free + ifNeeded;
  if (activeTotal <= 0 || coverage <= 0) {
    return { step: 0, provisional: false };
  }

  const full = coverage >= activeTotal;
  if (full) {
    return { step: STEPS, provisional: ifNeeded > 0 };
  }

  // The top step is reserved for full coverage, so anything short of it scales
  // into 1..STEPS-1. Scaling across the whole ramp instead would round "one
  // person short" up into the top step for any group larger than the ramp —
  // 7-of-8 and 8-of-8 would look identical, which is exactly the distinction
  // FR-14 exists to make. Ceil keeps a single person from rounding away to
  // nobody.
  return {
    step: Math.max(1, Math.ceil((coverage / activeTotal) * (STEPS - 1))),
    provisional: false,
  };
}
