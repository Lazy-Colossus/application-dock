// Pure display and ordering helpers for KitchenCraft. No I/O, no state — the
// pages and the filter composable share these so the collection row, the
// reading view and the counts can never disagree about how a value reads.

import type { Ingredient, Recipe } from "@/apps/kitchencraft/types";

/**
 * A total time as a cook says it: "40 min", "1 hr", "1 hr 30 min".
 *
 * Returns `null` for an absent time, so callers apply the absence rule by
 * testing one value rather than remembering to check the field first.
 */
export function formatTime(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  if (rest === 0) return `${hours} hr`;
  return `${hours} hr ${rest} min`;
}

/**
 * What a collection row's second line says — or `null` when there is nothing
 * to say.
 *
 * The absence rule lives here: a recipe with no meal type and no time yields
 * `null`, and the row renders as a genuine one-line row rather than a two-line
 * row with an empty second line.
 */
export function metaLine(recipe: Recipe): string | null {
  const parts = [
    recipe.meal_type,
    formatTime(recipe.total_time_minutes),
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * How an ingredient reads as one line: `200 g feta`, `2 cloves garlic`, `garlic`.
 *
 * Each part appears only if it has a value, so an ingredient with no amount and
 * no unit is just its name — the absence rule, applied inside a single line.
 */
export function ingredientLabel(ingredient: Ingredient): string {
  return [ingredient.amount, ingredient.unit, ingredient.text]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

/**
 * Favourites first, creation date descending within each group.
 *
 * The server sorts too; this exists so toggling a favourite can re-order the
 * loaded list in place — the row jumps to the favourites group without a
 * refetch and without moving the scroll position (FR-13).
 */
export function sortRecipes(recipes: Recipe[]): Recipe[] {
  return [...recipes].sort((a, b) => {
    if (a.favourite !== b.favourite) return a.favourite ? -1 : 1;
    return a.created_at < b.created_at
      ? 1
      : a.created_at > b.created_at
        ? -1
        : 0;
  });
}

/**
 * Order a namespace most-used first, keeping the vocabulary's own order as the
 * tiebreak.
 *
 * The PRD does not order suggestions; putting the values this cook reaches for
 * most at the top is the assumption the experience spine makes. The tiebreak
 * matters for ingredients: it keeps the unused half of the shipped seed in its
 * shipped grouping rather than shuffling it alphabetically.
 */
export function orderByUsage(
  values: string[],
  counts: Map<string, number>,
): string[] {
  return values
    .map((value, index) => ({
      value,
      index,
      uses: counts.get(value.toLowerCase()) ?? 0,
    }))
    .sort((a, b) => b.uses - a.uses || a.index - b.index)
    .map((entry) => entry.value);
}

/** How many recipes carry each tag, keyed case-insensitively. */
export function tagUsage(recipes: Recipe[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    for (const tag of recipe.tags) {
      const key = tag.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return counts;
}

/**
 * How many recipes call for each ingredient, keyed case-insensitively.
 *
 * Counted once per recipe even when a recipe lists the same ingredient twice
 * with different amounts — `100 g butter` plus `20 g butter` is one recipe that
 * calls for butter, not two.
 */
export function ingredientUsage(recipes: Recipe[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const recipe of recipes) {
    const seen = new Set(recipe.ingredients.map((i) => i.text.toLowerCase()));
    for (const key of seen) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Why a typed whole number is not one yet, or `""` when it is fine.
 *
 * Empty is always valid: an absent time is a legitimate recipe, not an
 * incomplete one.
 */
export function numberError(text: string, message: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  if (!/^\d+$/.test(trimmed)) return message;
  return Number(trimmed) < 1 ? message : "";
}

/** A validated number field's text as the value to send: blank is `null`. */
export function toNumber(text: string): number | null {
  const trimmed = text.trim();
  return trimmed ? Number(trimmed) : null;
}
