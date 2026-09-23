import { describe, it, expect, beforeEach } from "vitest";
import {
  ingredientUsage,
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
      metaLine(recipe({ meal_type: "dessert" })),
      metaLine(recipe({ total_time_minutes: 5 })),
    ]) {
      expect(line ?? "").not.toMatch(/unknown|—|·\s*$|^\s*·/i);
    }
  });
});

describe("ingredientLabel", () => {
  it("reads as one line: amount, unit, ingredient", () => {
    expect(ingredientLabel({ amount: "200", unit: "g", text: "feta" })).toBe(
      "200 g feta",
    );
  });

  it("drops the unit where there is none", () => {
    expect(ingredientLabel({ amount: "2", unit: null, text: "onions" })).toBe(
      "2 onions",
    );
  });

  it("drops the amount where there is none", () => {
    expect(ingredientLabel({ amount: null, unit: "pinch", text: "salt" })).toBe(
      "pinch salt",
    );
  });

  it("is just the ingredient when it carries neither", () => {
    // The absence rule, applied inside one line — no gaps, no placeholders.
    expect(ingredientLabel({ amount: null, unit: null, text: "garlic" })).toBe(
      "garlic",
    );
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

  it("counts an ingredient once per recipe even when listed twice", () => {
    // 100g butter for the pastry plus 20g for the pan is one recipe that calls
    // for butter, not two.
    const counts = ingredientUsage([
      recipe({
        ingredients: [
          { amount: "100", unit: "g", text: "butter" },
          { amount: "20", unit: "g", text: "butter" },
        ],
      }),
    ]);
    expect(counts.get("butter")).toBe(1);
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
