import { describe, it, expect, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import RecipeRow from "@/apps/kitchencraft/components/RecipeRow.vue";
import { recipe, resetRecipeFixture } from "@/apps/kitchencraft/recipe.fixture";
import type { Recipe } from "@/apps/kitchencraft/types";

beforeEach(resetRecipeFixture);

function mountRow(over: Partial<Recipe> = {}) {
  const subject = recipe(over);
  return { wrapper: mount(RecipeRow, { props: { recipe: subject } }), subject };
}

describe("what the row shows", () => {
  it("always shows the name", () => {
    const { wrapper } = mountRow({ name: "Pumpkin dal" });
    expect(wrapper.text()).toContain("Pumpkin dal");
  });

  it("is a genuine one-line row with no meal type and no time", () => {
    // The absence rule: not a two-line row with an empty second line.
    const { wrapper } = mountRow();
    expect(wrapper.find('[data-testid="row-meta"]').exists()).toBe(false);
  });

  it("shows meal type and time on a second line when present", () => {
    const { wrapper } = mountRow({
      meal_type: "dinner",
      total_time_minutes: 40,
    });
    expect(wrapper.find('[data-testid="row-meta"]').text()).toBe(
      "dinner · 40 min",
    );
  });

  it("shows just the meal type when there is no time", () => {
    const { wrapper } = mountRow({ meal_type: "breakfast" });
    expect(wrapper.find('[data-testid="row-meta"]').text()).toBe("breakfast");
  });

  it("has no chevron, no card and no fill", () => {
    const { wrapper } = mountRow();
    expect(wrapper.html()).not.toContain("chevron");
    expect(wrapper.find(".kc-row").classes()).not.toContain("kc-chip--on");
  });
});

describe("the favourites glyph", () => {
  it("toggles the favourite without opening the recipe", async () => {
    const { wrapper, subject } = mountRow();
    await wrapper
      .find(`[data-testid="favourite-${subject.id}"]`)
      .trigger("click");

    expect(wrapper.emitted("toggle-favourite")).toHaveLength(1);
    // Crucially, no `open` — tapping the heart must not navigate.
    expect(wrapper.emitted("open")).toBeUndefined();
  });

  it("opens the recipe when the rest of the row is tapped", async () => {
    const { wrapper, subject } = mountRow();
    await wrapper.find(`[data-testid="row-${subject.id}"]`).trigger("click");

    expect(wrapper.emitted("open")).toHaveLength(1);
    expect(wrapper.emitted("toggle-favourite")).toBeUndefined();
  });

  it("announces its state in words as well as in shape", () => {
    // Colour is never the sole signal (UX-DR17).
    const off = mountRow({ favourite: false }).wrapper.find(".kc-heart");
    expect(off.attributes("aria-label")).toBe("Favourite, off");
    expect(off.attributes("aria-pressed")).toBe("false");

    const on = mountRow({ favourite: true }).wrapper.find(".kc-heart");
    expect(on.attributes("aria-label")).toBe("Favourite, on");
    expect(on.attributes("aria-pressed")).toBe("true");
  });

  it("changes SHAPE between states, not just colour", () => {
    // Filled heart versus outlined — legible with colour off entirely.
    const off = mountRow({ favourite: false }).wrapper.find(".kc-heart svg");
    const on = mountRow({ favourite: true }).wrapper.find(".kc-heart svg");
    expect(off.attributes("fill")).toBe("none");
    expect(on.attributes("fill")).toBe("currentColor");
  });

  it("carries the mark as a glyph, never as a filled control", () => {
    // Originally "never in moss": moss meant "pressable" across the dock and a
    // status mark could not wear it. The Notebook theme has no moss, and its
    // burgundy is both the marking pen and the interactive colour — so the
    // colour clause is gone and the shape clause above is the whole guard.
    // What still has to hold is that the mark is a glyph and not a chip fill.
    const { wrapper } = mountRow({ favourite: true });
    expect(wrapper.find(".kc-heart").exists()).toBe(true);
    expect(wrapper.html()).not.toMatch(/kc-chip/);
  });
});

describe("the rating on the row", () => {
  it("renders the recipe's rating", () => {
    const { wrapper, subject } = mountRow({ rating: 4 });
    const filled = wrapper
      .findAll(`[data-testid^="rating-${subject.id}-"] svg`)
      .filter((s) => s.attributes("fill") === "currentColor");
    expect(filled).toHaveLength(4);
  });

  it("emits rate without opening the recipe", async () => {
    const { wrapper, subject } = mountRow();
    await wrapper
      .find(`[data-testid="rating-${subject.id}-3"]`)
      .trigger("click");

    expect(wrapper.emitted("rate")).toEqual([[3]]);
    // The whole point of the separate target: the row must not navigate.
    expect(wrapper.emitted("open")).toBeUndefined();
  });

  it("emits null when the current rating is tapped again", async () => {
    const { wrapper, subject } = mountRow({ rating: 3 });
    await wrapper
      .find(`[data-testid="rating-${subject.id}-3"]`)
      .trigger("click");
    expect(wrapper.emitted("rate")).toEqual([[null]]);
  });

  it("does not touch the favourite", async () => {
    const { wrapper, subject } = mountRow({ favourite: true });
    await wrapper
      .find(`[data-testid="rating-${subject.id}-5"]`)
      .trigger("click");
    expect(wrapper.emitted("toggle-favourite")).toBeUndefined();
  });

  it("keeps the heart and the stars as separate targets", async () => {
    const { wrapper, subject } = mountRow();
    await wrapper
      .find(`[data-testid="favourite-${subject.id}"]`)
      .trigger("click");

    expect(wrapper.emitted("toggle-favourite")).toHaveLength(1);
    expect(wrapper.emitted("rate")).toBeUndefined();
    expect(wrapper.emitted("open")).toBeUndefined();
  });

  it("still opens from the name", async () => {
    const { wrapper, subject } = mountRow({ rating: 2 });
    await wrapper.find(`[data-testid="row-${subject.id}"]`).trigger("click");
    expect(wrapper.emitted("open")).toHaveLength(1);
  });

  it("shows the rating control even on an unrated recipe", () => {
    // It is a control, not a value — so absence means five outlined stars,
    // never a hidden control the user cannot find.
    const { wrapper, subject } = mountRow({ rating: null });
    expect(wrapper.find(`[data-testid="rating-${subject.id}"]`).exists()).toBe(
      true,
    );
  });
});

describe("how the two lines are laid out", () => {
  it("puts the name and the rating on the same line", async () => {
    const { wrapper, subject } = mountRow({ name: "Beef ragu", rating: 4 });
    const line = wrapper.find(".kc-row__line");

    expect(line.find(`[data-testid="row-${subject.id}"]`).exists()).toBe(true);
    expect(line.find(`[data-testid="rating-${subject.id}"]`).exists()).toBe(
      true,
    );
  });

  it("keeps the rating OUT of the name's button, so stars never navigate", async () => {
    const { wrapper, subject } = mountRow({ rating: 3 });
    const open = wrapper.find(`[data-testid="row-${subject.id}"]`);
    // Siblings, not nested: this is what makes "a star does not open the
    // recipe" structural rather than a handler that remembers to stop.
    expect(open.find(`[data-testid="rating-${subject.id}"]`).exists()).toBe(
      false,
    );
  });

  it("keeps meal type and time on the second line, below both", async () => {
    const { wrapper } = mountRow({
      meal_type: "dinner",
      total_time_minutes: 40,
    });
    const meta = wrapper.find('[data-testid="row-meta"]');
    expect(meta.text()).toBe("dinner · 40 min");
    // Below the name/rating line, not inside it.
    expect(
      wrapper.find(".kc-row__line [data-testid='row-meta']").exists(),
    ).toBe(false);
  });

  it("still shows the rating when there is no second line at all", async () => {
    const { wrapper, subject } = mountRow({ rating: 2 });
    expect(wrapper.find('[data-testid="row-meta"]').exists()).toBe(false);
    expect(wrapper.find(`[data-testid="rating-${subject.id}"]`).exists()).toBe(
      true,
    );
  });
});
