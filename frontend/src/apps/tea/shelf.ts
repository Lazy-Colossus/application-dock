// The shelf's rules as pure functions: grouping, ordering, the low test and the
// gauge's maths. Components render these; they never re-derive them.

import type { Tea, TeaClass } from "./types";
import { CLASS_ORDER } from "./tokens";

export interface ShelfSectionData {
  classId: TeaClass;
  teas: Tea[];
}

/**
 * How much of the rim to draw, 0..1, or null when it cannot be known.
 *
 * A `grams_purchased` of 0 or null both mean "not recorded" — never a
 * denominator. The rim then draws as an unbroken track rather than implying a
 * full vessel.
 */
export function proportionOf(tea: Tea): number | null {
  const bought = tea.grams_purchased;
  if (bought === null || bought <= 0) return null;
  return Math.min(1, Math.max(0, tea.grams_remaining / bought));
}

/** Where the threshold tick sits on the rim, 0..1, or null if it cannot. */
export function thresholdFractionOf(tea: Tea): number | null {
  const bought = tea.grams_purchased;
  const threshold = tea.low_threshold_grams;
  if (threshold === null || bought === null || bought <= 0) return null;
  return Math.min(1, Math.max(0, threshold / bought));
}

/**
 * At or below the threshold, with leaf still left.
 *
 * An empty tea is not "low": empty has its own, quieter treatment, and a tea
 * that is gone no longer needs restocking urgency.
 */
export function isLow(tea: Tea): boolean {
  if (tea.low_threshold_grams === null) return false;
  if (tea.grams_remaining <= 0) return false;
  return tea.grams_remaining <= tea.low_threshold_grams;
}

/** Derived for display only, never stored (FR-17). */
export function pricePerGram(tea: Tea): number | null {
  const bought = tea.grams_purchased;
  if (tea.price_paid === null || bought === null || bought <= 0) return null;
  return tea.price_paid / bought;
}

/** Name A–Z, with empties sunk to the end of their own section (FR-11). */
export function sortSection(teas: Tea[]): Tea[] {
  return [...teas].sort((a, b) => {
    const aEmpty = a.grams_remaining <= 0;
    const bEmpty = b.grams_remaining <= 0;
    if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

/** Sections in the classification's order, empty classes omitted (FR-10). */
export function groupByClass(teas: Tea[]): ShelfSectionData[] {
  const buckets = new Map<TeaClass, Tea[]>();

  for (const tea of teas) {
    // A class_id the client doesn't recognise means the server is ahead of
    // this build. Bucket the tea rather than dropping it off the shelf.
    const classId: TeaClass = CLASS_ORDER.includes(tea.class_id)
      ? tea.class_id
      : "other";
    const bucket = buckets.get(classId);
    if (bucket) bucket.push(tea);
    else buckets.set(classId, [tea]);
  }

  return CLASS_ORDER.filter((classId) => buckets.has(classId)).map((classId) => ({
    classId,
    teas: sortSection(buckets.get(classId) ?? []),
  }));
}

/**
 * The `<img>` src for a tea's photo, or null when there is none to show.
 *
 * A pasted external URL is used as-is. Our own served route
 * (`/api/tea/teas/{id}/image`) needs the bearer token as a `?token=` query
 * param instead — an `<img>` tag cannot send an `Authorization` header — so
 * without a token there is nothing valid to point it at.
 */
export function imageSrc(imageUrl: string | null, token: string | null): string | null {
  if (!imageUrl) return null;
  if (!imageUrl.startsWith("/api/")) return imageUrl;
  return token ? `${imageUrl}?token=${encodeURIComponent(token)}` : null;
}

/** Which section owns its leaves: the one whose centre is nearest `mid`. */
export function nearestSectionIndex(centers: number[], mid: number): number {
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  centers.forEach((center, index) => {
    const distance = Math.abs(center - mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  });
  return best;
}
