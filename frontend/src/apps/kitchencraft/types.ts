// KitchenCraft — shared frontend types. Mirrors the backend schemas
// (snake_case fields, as served).

// Verbatim from PRD FR-4, in the PRD's order. Never re-worded, re-cased or
// re-ordered — the meal-type chips render this array as-is (UX-DR18).
export const MEAL_TYPES = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
  "dessert",
  "other",
] as const;

export type MealType = (typeof MEAL_TYPES)[number];

// How much of what. `text` is the only required part, so `garlic` is a complete
// ingredient and `2 tsp smoked paprika` is the same ingredient with the detail a
// cook needs at the shop. Amount is a string, never a number: `1/2`, `2-3` and
// `a few` are all things cooks write, and nothing here parses them.
//
// Replaced the two-level category + specific tag in schema v2, along with the
// shared vocabulary, the pantry filter and the coining ceremony.
export interface Ingredient {
  amount: string | null;
  unit: string | null;
  text: string;
}

export interface Recipe {
  id: string;
  name: string;
  body: string;
  created_at: string;
  updated_at: string;
  favourite: boolean;
  // 1-5, or null for unrated. Independent of `favourite` in both directions:
  // neither is derived from the other (Story 2.7).
  rating: number | null;
  meal_type: MealType | null;
  total_time_minutes: number | null;
  servings: number | null;
  source: string | null;
  tags: string[];
  ingredients: Ingredient[];
  // Provenance keys for values written by the offline enrichment pass and not
  // yet touched. Epic 4 populates this and renders the unconfirmed chip.
  unconfirmed: string[];
}

// One line on the shopping list. Ordinary free text — no quantity field and no
// link back to a recipe — so `chicken thighs` can become `2 packs chicken
// thighs` in place (FR-16). `ticked` is Story 3.2's, and lands here so the
// persisted shape settles once.
export interface ShoppingItem {
  id: string;
  text: string;
  ticked: boolean;
  created_at: string;
}

// A user's one and only list (FR-14). Items stay in the order added; nothing
// sorts them.
export interface ShoppingList {
  schema_version: number;
  items: ShoppingItem[];
}

// The two typeahead namespaces, kept strictly apart (FR-8). A tag never appears
// under Ingredients and vice versa.
export interface Vocabulary {
  tags: string[];
  // The user's own previously-typed ingredients — v2 has no shared vocabulary.
  ingredients: string[];
  // The shipped list plus anything this user has coined.
  units: string[];
}

// What capture sends. Only `name` and `body` are required, and nothing else may
// stand between a paste and a saved recipe (FR-3).
export interface RecipeDraft {
  name: string;
  body: string;
  rating?: number | null;
  meal_type?: MealType | null;
  total_time_minutes?: number | null;
  servings?: number | null;
  source?: string | null;
  tags?: string[];
  ingredients?: Ingredient[];
}

// A partial update. A key present with `null` clears that field; an absent key
// leaves it alone — which is what keeps an edit of the meal type from ever
// rewriting the body.
export type RecipeChanges = Partial<
  Pick<
    Recipe,
    | "name"
    | "body"
    | "favourite"
    | "rating"
    | "meal_type"
    | "total_time_minutes"
    | "servings"
    | "source"
    | "tags"
    | "ingredients"
  >
>;
