import { computed, ref, type Ref } from "vue";
import { tagUsage } from "@/apps/kitchencraft/format";
import type { MealType, Recipe } from "@/apps/kitchencraft/types";

/**
 * Search, filters, counts and the zero-result explanation for the collection.
 *
 * Everything here runs over the already-loaded collection, so results update
 * on the keystroke with no round trip, no spinner and no debounce message
 * (NFR-6).
 *
 * Three behaviours in here are requirements rather than choices:
 *
 * - **Search and filters combine, never replace** (FR-11). Clearing the search
 *   leaves every filter as it was, and vice versa; they are independent inputs
 *   to one predicate.
 * - **AND semantics.** Selecting two tags returns recipes
 *   carrying *both*, regardless of what else those recipes need.
 * - **Nothing here implies completeness** (UX-DR11). `countLabel` says recipes
 *   *call for* what was selected. There is no match ratio, no percentage and no
 *   sort by how close a recipe is to cookable — deliberately, because the PRD's
 *   counter-metric is the user ceasing to trust the filter.
 */

export interface Filters {
  search: string;
  // Single-valued on purpose: a recipe has exactly one meal type, so ANDing two
  // selections could only ever return nothing. Tapping another replaces it;
  // tapping the selected one clears it.
  mealType: MealType | null;
  tags: string[];
  favouritesOnly: boolean;
}

export interface FilterReason {
  /** Which control this line clears. */
  kind: "search" | "mealType" | "tag" | "favourites";
  value: string;
  /** How many recipes this one filter matches on its own. */
  count: number;
  /** "chickpeas — 7 on its own" */
  label: string;
}

export function emptyFilters(): Filters {
  return {
    search: "",
    mealType: null,
    tags: [],
    favouritesOnly: false,
  };
}

function matchesSearch(recipe: Recipe, query: string): boolean {
  // Case-insensitive, partial-word, over names AND bodies — so a recipe whose
  // body mentions paprika is found by `paprika` even with no paprika tag.
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return (
    recipe.name.toLowerCase().includes(needle) ||
    recipe.body.toLowerCase().includes(needle)
  );
}

function hasAllTags(recipe: Recipe, tags: string[]): boolean {
  const held = new Set(recipe.tags.map((t) => t.toLowerCase()));
  return tags.every((tag) => held.has(tag.toLowerCase()));
}

export function useCollectionFilters(recipes: Ref<Recipe[]>) {
  const filters = ref<Filters>(emptyFilters());

  const activeCount = computed(() => {
    const f = filters.value;
    return (
      (f.search.trim() ? 1 : 0) +
      (f.mealType ? 1 : 0) +
      f.tags.length +
      (f.favouritesOnly ? 1 : 0)
    );
  });

  const anyActive = computed(() => activeCount.value > 0);

  const results = computed(() =>
    recipes.value.filter((recipe) => {
      const f = filters.value;
      if (f.favouritesOnly && !recipe.favourite) return false;
      if (f.mealType && recipe.meal_type !== f.mealType) return false;
      if (!hasAllTags(recipe, f.tags)) return false;
      return matchesSearch(recipe, f.search);
    }),
  );

  /** Tags that appear anywhere in the collection, most-used first. */
  const tagsInUse = computed(() => {
    const counts = tagUsage(recipes.value);
    return [...counts.keys()]
      .sort(
        (a, b) =>
          (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b),
      )
      .map(
        (key) =>
          recipes.value
            .flatMap((r) => r.tags)
            .find((t) => t.toLowerCase() === key) ?? key,
      );
  });

  const countLabel = computed<string | null>(() => {
    if (!anyActive.value) return null;
    const f = filters.value;
    const n = results.value.length;
    const total = recipes.value.length;

    // Favourites on its own gets its own reading, because "7 of 42 recipes"
    // says nothing a user asking for their favourites wanted to know.
    if (f.favouritesOnly && activeCount.value === 1) {
      return `${n} ${n === 1 ? "favourite" : "favourites"}`;
    }

    const noun = total === 1 ? "recipe" : "recipes";
    return `${n} of ${total} ${noun}`;
  });

  /**
   * Why nothing matched: each active filter with the count it would return on
   * its own, so the zero-result state explains itself instead of only offering
   * the exit (UX-DR12).
   */
  const reasons = computed<FilterReason[]>(() => {
    const f = filters.value;
    const all = recipes.value;
    const out: FilterReason[] = [];

    const line = (
      kind: FilterReason["kind"],
      value: string,
      count: number,
    ): FilterReason => ({
      kind,
      value,
      count,
      label: `${value} — ${count} on its own`,
    });

    if (f.search.trim()) {
      const count = all.filter((r) => matchesSearch(r, f.search)).length;
      out.push(line("search", f.search.trim(), count));
    }
    if (f.mealType) {
      const mealType = f.mealType;
      out.push(
        line(
          "mealType",
          mealType,
          all.filter((r) => r.meal_type === mealType).length,
        ),
      );
    }
    for (const tag of f.tags) {
      out.push(
        line("tag", tag, all.filter((r) => hasAllTags(r, [tag])).length),
      );
    }
    if (f.favouritesOnly) {
      out.push(
        line("favourites", "favourites", all.filter((r) => r.favourite).length),
      );
    }
    return out;
  });

  /** Clear exactly one control. Nothing here clears anything else. */
  function clearOne(reason: FilterReason): void {
    const f = filters.value;
    if (reason.kind === "search") filters.value = { ...f, search: "" };
    else if (reason.kind === "mealType")
      filters.value = { ...f, mealType: null };
    else if (reason.kind === "favourites")
      filters.value = { ...f, favouritesOnly: false };
    else if (reason.kind === "tag") {
      filters.value = { ...f, tags: f.tags.filter((t) => t !== reason.value) };
    } else {
      filters.value = {
        ...f,
      };
    }
  }

  function clearAll(): void {
    filters.value = emptyFilters();
  }

  return {
    filters,
    results,
    anyActive,
    activeCount,
    countLabel,
    reasons,
    tagsInUse,
    clearOne,
    clearAll,
  };
}
