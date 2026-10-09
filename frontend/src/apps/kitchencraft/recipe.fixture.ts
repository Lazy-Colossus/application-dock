// Test-only recipe factory, shared by the KitchenCraft specs so each one states
// just the field it is about. Imported by `*.spec.ts` only, so it never reaches
// the app bundle.

import type { Recipe } from "@/apps/kitchencraft/types";

let counter = 0;

export function recipe(over: Partial<Recipe> = {}): Recipe {
  counter += 1;
  return {
    id: `r-${String(counter).padStart(8, "0")}`,
    name: `Recipe ${counter}`,
    body: "Simmer.",
    created_at: `2026-09-${String(counter).padStart(2, "0")}T18:40:00+00:00`,
    updated_at: `2026-09-${String(counter).padStart(2, "0")}T18:40:00+00:00`,
    favourite: false,
    rating: null,
    meal_type: null,
    total_time_minutes: null,
    servings: null,
    source: null,
    tags: [],
    ingredients: [],
    unconfirmed: [],
    ...over,
  };
}

/** Reset the id/date counter so a spec's expectations are order-independent. */
export function resetRecipeFixture(): void {
  counter = 0;
}
