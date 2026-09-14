import { describe, it, expect, beforeEach } from "vitest";
import { ref } from "vue";
import { useCollectionFilters } from "@/apps/kitchencraft/composables/useCollectionFilters";
import { recipe, resetRecipeFixture } from "@/apps/kitchencraft/recipe.fixture";
import type { Recipe } from "@/apps/kitchencraft/types";

beforeEach(resetRecipeFixture);

function setup(recipes: Recipe[]) {
  return useCollectionFilters(ref(recipes));
}

// A small, fixed collection the assertions below can be read against.
function collection() {
  return [
    recipe({
      name: "Lemon-oregano chicken thighs",
      body: "Chicken thighs, oregano, LEMON.",
      meal_type: "dinner",
      total_time_minutes: 40,
      favourite: true,
      tags: ["batch cooking"],
      ingredients: [
        { category: "chicken", specific: "chicken thighs" },
        { category: "lemon", specific: null },
      ],
    }),
    recipe({
      name: "Chicken and onion traybake",
      body: "Everything in a tin. Smoked paprika helps.",
      meal_type: "dinner",
      tags: ["cheap"],
      ingredients: [
        { category: "chicken", specific: null },
        { category: "onion", specific: null },
      ],
    }),
    recipe({
      name: "Onion soup",
      body: "Off the back of the packet.",
      meal_type: "lunch",
      ingredients: [{ category: "onion", specific: null }],
    }),
    recipe({
      name: "Feta bake",
      body: "Cheese, tomatoes, pasta.",
      meal_type: "dinner",
      ingredients: [{ category: "cheese", specific: "feta" }],
    }),
  ];
}

// -- Story 2.4: search -------------------------------------------------------

describe("search", () => {
  it("finds a word that appears only in the body, not in any tag", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, search: "paprika" };
    expect(results.value.map((r) => r.name)).toEqual([
      "Chicken and onion traybake",
    ]);
  });

  it("matches case-insensitively", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, search: "lemon" };
    // Matches the name of one and the shouted LEMON in its body.
    expect(results.value).toHaveLength(1);
  });

  it("matches partial words", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, search: "trayb" };
    expect(results.value.map((r) => r.name)).toEqual([
      "Chicken and onion traybake",
    ]);
  });

  it("searches names as well as bodies", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, search: "Feta bake" };
    expect(results.value.map((r) => r.name)).toEqual(["Feta bake"]);
  });

  it("ignores surrounding whitespace", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, search: "  soup  " };
    expect(results.value.map((r) => r.name)).toEqual(["Onion soup"]);
  });

  it("returns the whole collection for an empty query", () => {
    const { results } = setup(collection());
    expect(results.value).toHaveLength(4);
  });

  it("narrows WITHIN the filtered set rather than replacing it", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, mealType: "dinner", search: "onion" };
    // "Onion soup" matches the search but is lunch, so the filter still applies.
    expect(results.value.map((r) => r.name)).toEqual([
      "Chicken and onion traybake",
    ]);
  });

  it("leaves every filter untouched when the search is cleared", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, mealType: "lunch", search: "onion" };
    filters.value = { ...filters.value, search: "" };
    expect(filters.value.mealType).toBe("lunch");
    expect(results.value.map((r) => r.name)).toEqual(["Onion soup"]);
  });
});

// -- Story 2.5: filters ------------------------------------------------------

describe("filters", () => {
  it("ANDs two ingredient categories", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, ingredients: ["chicken", "onion"] };
    expect(results.value.map((r) => r.name)).toEqual([
      "Chicken and onion traybake",
    ]);
  });

  it("returns a recipe regardless of what ELSE it requires", () => {
    // The traybake also needs a tin and an oven; a two-category selection still
    // matches it. The filter matches ingredients, it does not check completeness.
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, ingredients: ["onion"] };
    expect(results.value).toHaveLength(2);
  });

  it("matches on category, never on the specific", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, ingredients: ["cheese"] };
    expect(results.value.map((r) => r.name)).toEqual(["Feta bake"]);
  });

  it("does not match when the search term is only in a specific", () => {
    // `feta` is the specific of a `cheese` tag, and the filter is on category.
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, ingredients: ["feta"] };
    expect(results.value).toHaveLength(0);
  });

  it("combines filters of different kinds", () => {
    const { filters, results } = setup(collection());
    filters.value = {
      ...filters.value,
      mealType: "dinner",
      ingredients: ["chicken"],
      tags: ["cheap"],
    };
    expect(results.value.map((r) => r.name)).toEqual([
      "Chicken and onion traybake",
    ]);
  });

  it("ANDs two tags", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, tags: ["cheap", "batch cooking"] };
    expect(results.value).toHaveLength(0);
  });

  it("matches tags case-insensitively", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, tags: ["CHEAP"] };
    expect(results.value).toHaveLength(1);
  });

  it("filters to favourites only", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, favouritesOnly: true };
    expect(results.value.map((r) => r.name)).toEqual([
      "Lemon-oregano chicken thighs",
    ]);
  });

  it("keeps favourites marked inside a filtered result", () => {
    const { filters, results } = setup(collection());
    filters.value = { ...filters.value, ingredients: ["chicken"] };
    expect(results.value.filter((r) => r.favourite)).toHaveLength(1);
  });

  it("clears exactly one control and nothing else", () => {
    const { filters, reasons, clearOne, results } = setup(collection());
    filters.value = {
      ...filters.value,
      mealType: "dinner",
      ingredients: ["chicken", "onion"],
      search: "nothing-matches-this",
    };
    expect(results.value).toHaveLength(0);

    const search = reasons.value.find((r) => r.kind === "search");
    clearOne(search!);

    expect(filters.value.search).toBe("");
    expect(filters.value.mealType).toBe("dinner");
    expect(filters.value.ingredients).toEqual(["chicken", "onion"]);
  });

  it("clears everything at once", () => {
    const { filters, clearAll, anyActive } = setup(collection());
    filters.value = { ...filters.value, mealType: "dinner", tags: ["cheap"] };
    clearAll();
    expect(anyActive.value).toBe(false);
  });
});

// -- Counts, and the wording that must never overpromise ---------------------

describe("countLabel", () => {
  it("is null when nothing is active, so the bar shows no count at rest", () => {
    expect(setup(collection()).countLabel.value).toBeNull();
  });

  it("reads 'N of M recipes' for a non-ingredient filter", () => {
    const { filters, countLabel } = setup(collection());
    filters.value = { ...filters.value, mealType: "dinner" };
    expect(countLabel.value).toBe("3 of 4 recipes");
  });

  it("reads 'call for' with the selected categories joined by +", () => {
    const { filters, countLabel } = setup(collection());
    filters.value = { ...filters.value, ingredients: ["chicken", "onion"] };
    expect(countLabel.value).toBe("1 of 4 recipes call for chicken + onion");
  });

  it("keeps the 'call for' wording when a meal type is also active", () => {
    const { filters, countLabel } = setup(collection());
    filters.value = {
      ...filters.value,
      ingredients: ["chicken"],
      mealType: "dinner",
    };
    expect(countLabel.value).toBe("2 of 4 recipes call for chicken");
  });

  it("reads favourites in its own words when it is the only filter", () => {
    const { filters, countLabel } = setup(collection());
    filters.value = { ...filters.value, favouritesOnly: true };
    expect(countLabel.value).toBe("1 favourite");
  });

  it("pluralises favourites", () => {
    const list = collection();
    list[1].favourite = true;
    const { filters, countLabel } = setup(list);
    filters.value = { ...filters.value, favouritesOnly: true };
    expect(countLabel.value).toBe("2 favourites");
  });

  it("never implies the user can cook what matched", () => {
    // UX-DR11: the PRD's counter-metric makes the wording the requirement.
    const { filters, countLabel } = setup(collection());
    filters.value = { ...filters.value, ingredients: ["chicken", "onion"] };
    const label = countLabel.value ?? "";
    expect(label).not.toMatch(/can make|can cook|you have|tonight|%|complete/i);
    expect(label).toMatch(/call for/);
  });
});

// -- UX-DR12: the zero-result state explains itself --------------------------

describe("reasons", () => {
  it("gives each active filter its own count", () => {
    const { filters, reasons } = setup(collection());
    filters.value = {
      ...filters.value,
      mealType: "dinner",
      ingredients: ["chicken", "cheese"],
    };
    expect(reasons.value.map((r) => r.label)).toEqual([
      "dinner — 3 on its own",
      "chicken — 2 on its own",
      "cheese — 1 on its own",
    ]);
  });

  it("counts each filter alone, not in combination", () => {
    const { filters, reasons } = setup(collection());
    filters.value = { ...filters.value, ingredients: ["chicken", "onion"] };
    // Together they match one recipe; on their own, two each.
    expect(reasons.value.map((r) => r.count)).toEqual([2, 2]);
  });

  it("includes the search term as its own clearable line", () => {
    const { filters, reasons } = setup(collection());
    filters.value = { ...filters.value, search: "paprika", mealType: "lunch" };
    expect(reasons.value.map((r) => r.kind)).toEqual(["search", "mealType"]);
    expect(reasons.value[0].label).toBe("paprika — 1 on its own");
  });

  it("is empty when nothing is active", () => {
    expect(setup(collection()).reasons.value).toEqual([]);
  });
});

// -- What the filter bar offers ----------------------------------------------

describe("what the bar offers", () => {
  it("lists only tags the collection actually carries, most-used first", () => {
    const list = collection();
    list[2].tags = ["cheap"];
    const { tagsInUse } = setup(list);
    expect(tagsInUse.value).toEqual(["cheap", "batch cooking"]);
  });

  it("lists only categories the collection actually calls for", () => {
    const { categoriesInUse } = setup(collection());
    // Most-used first: chicken and onion twice each, then the singles.
    expect(categoriesInUse.value.slice(0, 2).sort()).toEqual([
      "chicken",
      "onion",
    ]);
    expect(categoriesInUse.value).toHaveLength(4);
    expect(categoriesInUse.value).not.toContain("salt");
  });
});

describe("activeCount", () => {
  it("counts every individual selection", () => {
    const { filters, activeCount } = setup(collection());
    filters.value = {
      search: "x",
      mealType: "dinner",
      tags: ["a", "b"],
      ingredients: ["c"],
      favouritesOnly: true,
    };
    expect(activeCount.value).toBe(6);
  });

  it("does not count a whitespace-only search", () => {
    const { filters, activeCount } = setup(collection());
    filters.value = { ...filters.value, search: "   " };
    expect(activeCount.value).toBe(0);
  });
});
