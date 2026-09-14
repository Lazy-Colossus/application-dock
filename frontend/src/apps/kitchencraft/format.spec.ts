import { describe, it, expect, beforeEach } from "vitest";
import {
  categoryUsage,
  formatTime,
  ingredientLabel,
  metaLine,
  orderByUsage,
  sortRecipes,
  tagUsage,
} from "@/apps/kitchencraft/format";
import { recipe, resetRecipeFixture } from "@/apps/kitchencraft/recipe.fixture";

beforeEach(resetRecipeFixture);

describe("formatTime", () => {
  it("reads a sub-hour time in minutes", () => {
    expect(formatTime(40)).toBe("40 min");
  });

  it("reads a whole number of hours without a stray 0 min", () => {
    expect(formatTime(180)).toBe("3 hr");
  });

  it("reads a mixed time as hours and minutes", () => {
    expect(formatTime(90)).toBe("1 hr 30 min");
  });

  it("returns null for an absent time, so callers render it as absent", () => {
    expect(formatTime(null)).toBeNull();
  });
});

describe("metaLine — the absence rule", () => {
  it("is null when there is no meal type and no time", () => {
    // This is what makes a bare recipe a genuine one-line row rather than a
    // two-line row with an empty second line.
    expect(metaLine(recipe())).toBeNull();
  });

  it("carries the meal type alone when there is no time", () => {
    expect(metaLine(recipe({ meal_type: "dinner" }))).toBe("dinner");
  });

  it("carries the time alone when there is no meal type", () => {
    expect(metaLine(recipe({ total_time_minutes: 15 }))).toBe("15 min");
  });

  it("joins both when both are present", () => {
    expect(
      metaLine(recipe({ meal_type: "dinner", total_time_minutes: 40 })),
    ).toBe("dinner · 40 min");
  });

  it("never emits a dash, an unknown or an empty separator", () => {
    for (const line of [
      metaLine(recipe()),
      metaLine(recipe({ meal_type: "lunch" })),
      metaLine(recipe({ total_time_minutes: 5 })),
    ]) {
      expect(line ?? "").not.toMatch(/unknown|—|·\s*$|^\s*·/i);
    }
  });
});

describe("ingredientLabel", () => {
  it("shows the specific where there is one", () => {
    expect(ingredientLabel({ category: "cheese", specific: "feta" })).toBe(
      "feta",
    );
  });

  it("shows the bare category where there is no specific", () => {
    expect(ingredientLabel({ category: "harissa", specific: null })).toBe(
      "harissa",
    );
  });

  it("never stacks the two into one string", () => {
    const label = ingredientLabel({ category: "cheese", specific: "feta" });
    expect(label).not.toContain("cheese");
  });
});

describe("sortRecipes", () => {
  it("puts favourites above everything", () => {
    const old = recipe({ name: "old", favourite: true });
    const recent = recipe({ name: "recent" });
    expect(sortRecipes([recent, old]).map((r) => r.name)).toEqual([
      "old",
      "recent",
    ]);
  });

  it("sorts creation date descending within each group", () => {
    const a = recipe({ name: "a" });
    const b = recipe({ name: "b" });
    const c = recipe({ name: "c", favourite: true });
    const d = recipe({ name: "d", favourite: true });
    expect(sortRecipes([a, b, c, d]).map((r) => r.name)).toEqual([
      "d",
      "c",
      "b",
      "a",
    ]);
  });

  it("does not mutate the array it was given", () => {
    const list = [
      recipe({ name: "a" }),
      recipe({ name: "b", favourite: true }),
    ];
    sortRecipes(list);
    expect(list.map((r) => r.name)).toEqual(["a", "b"]);
  });
});

describe("usage counting", () => {
  it("counts tags case-insensitively", () => {
    const counts = tagUsage([
      recipe({ tags: ["Cheap"] }),
      recipe({ tags: ["cheap"] }),
    ]);
    expect(counts.get("cheap")).toBe(2);
  });

  it("counts a category once per recipe even with two specifics", () => {
    // `cheese → feta` plus `cheese → cheddar` is one recipe that calls for
    // cheese, not two.
    const counts = categoryUsage([
      recipe({
        ingredients: [
          { category: "cheese", specific: "feta" },
          { category: "cheese", specific: "cheddar" },
        ],
      }),
    ]);
    expect(counts.get("cheese")).toBe(1);
  });
});

describe("orderByUsage", () => {
  it("puts the most-used values first", () => {
    const counts = new Map([
      ["onion", 9],
      ["chicken", 3],
    ]);
    expect(orderByUsage(["chicken", "cheese", "onion"], counts)).toEqual([
      "onion",
      "chicken",
      "cheese",
    ]);
  });

  it("keeps the vocabulary's own order as the tiebreak", () => {
    // The unused half of the shipped seed stays in its shipped grouping rather
    // than getting shuffled.
    expect(orderByUsage(["salt", "pepper", "cumin"], new Map())).toEqual([
      "salt",
      "pepper",
      "cumin",
    ]);
  });
});
