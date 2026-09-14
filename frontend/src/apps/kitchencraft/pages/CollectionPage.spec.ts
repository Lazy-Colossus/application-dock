import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: putMock, del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import CollectionPage from "./CollectionPage.vue";
import { recipe, resetRecipeFixture } from "@/apps/kitchencraft/recipe.fixture";
import type { Recipe } from "@/apps/kitchencraft/types";

const VOCABULARY = {
  tags: ["batch cooking", "cheap"],
  ingredient_categories: ["chicken", "onion", "salt"],
};

beforeEach(() => {
  setActivePinia(createPinia());
  resetRecipeFixture();
  vi.clearAllMocks();
});

async function mountPage(recipes: Recipe[]) {
  // The page fetches the collection then the vocabulary, in that order.
  getMock.mockResolvedValueOnce(recipes).mockResolvedValueOnce(VOCABULARY);
  const wrapper = mount(CollectionPage, { attachTo: document.body });
  await flushPromises();
  return wrapper;
}

describe("the empty collection", () => {
  it("prompts for the first capture rather than showing a blank screen", async () => {
    const wrapper = await mountPage([]);
    const empty = wrapper.find('[data-testid="empty-collection"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain("No recipes yet.");
    expect(empty.text()).toContain(
      "Paste a name and the text and it's saved. Nothing else is required.",
    );
  });

  it("offers no search and no filter bar — there is nothing to search", async () => {
    const wrapper = await mountPage([]);
    expect(wrapper.find('[data-testid="search"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="count"]').exists()).toBe(false);
  });

  it("routes to capture from the empty state", async () => {
    const wrapper = await mountPage([]);
    await wrapper.find('[data-testid="add-recipe"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/kitchencraft/new");
  });

  it("shows no empty state before the first response lands", () => {
    getMock.mockReturnValue(new Promise(() => {}));
    const wrapper = mount(CollectionPage);
    expect(wrapper.find('[data-testid="empty-collection"]').exists()).toBe(
      false,
    );
  });
});

describe("the populated collection", () => {
  it("lists favourites above everything, newest first within each group", async () => {
    const wrapper = await mountPage([
      recipe({ name: "a" }),
      recipe({ name: "b" }),
      recipe({ name: "c", favourite: true }),
    ]);
    const names = wrapper.findAll(".kc-row .kc-body").map((n) => n.text());
    expect(names).toEqual(["c", "b", "a"]);
  });

  it("opens a recipe when its row is tapped", async () => {
    const only = recipe();
    const wrapper = await mountPage([only]);
    await wrapper.find(`[data-testid="row-${only.id}"]`).trigger("click");
    expect(push).toHaveBeenCalledWith(`/kitchencraft/r/${only.id}`);
  });

  it("toggles a favourite from the list without navigating", async () => {
    const only = recipe();
    const wrapper = await mountPage([only]);
    putMock.mockResolvedValueOnce({ ...only, favourite: true });

    await wrapper.find(`[data-testid="favourite-${only.id}"]`).trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(`/kitchencraft/recipes/${only.id}`, {
      favourite: true,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it("re-orders the row into the favourites group in place", async () => {
    const older = recipe({ name: "older" });
    const newer = recipe({ name: "newer" });
    const wrapper = await mountPage([older, newer]);
    expect(wrapper.findAll(".kc-row .kc-body").map((n) => n.text())).toEqual([
      "newer",
      "older",
    ]);

    putMock.mockResolvedValueOnce({ ...older, favourite: true });
    await wrapper
      .find(`[data-testid="favourite-${older.id}"]`)
      .trigger("click");
    await flushPromises();

    expect(wrapper.findAll(".kc-row .kc-body").map((n) => n.text())).toEqual([
      "older",
      "newer",
    ]);
  });
});

describe("search and filters on the page", () => {
  function collection() {
    return [
      recipe({
        name: "Chicken traybake",
        body: "Chicken, onion, smoked paprika.",
        meal_type: "dinner",
        tags: ["cheap"],
        ingredients: [
          { category: "chicken", specific: null },
          { category: "onion", specific: null },
        ],
      }),
      recipe({
        name: "Onion soup",
        body: "Off the packet.",
        meal_type: "lunch",
        ingredients: [{ category: "onion", specific: null }],
      }),
    ];
  }

  it("narrows the rows as the search is typed", async () => {
    const wrapper = await mountPage(collection());
    await wrapper.find('[data-testid="search"]').setValue("paprika");
    expect(wrapper.findAll(".kc-row")).toHaveLength(1);
  });

  it("shows the result count once a filter is active, and not before", async () => {
    const wrapper = await mountPage(collection());
    expect(wrapper.find('[data-testid="count"]').exists()).toBe(false);

    await wrapper.find('[data-testid="meal-dinner"]').trigger("click");
    expect(wrapper.find('[data-testid="count"]').text()).toBe("1 of 2 recipes");
  });

  it("words a pantry count as 'call for', never as what the user can make", async () => {
    const wrapper = await mountPage(collection());
    await wrapper.find('[data-testid="toggle-ingredients"]').trigger("click");
    await wrapper
      .find('[data-testid="ingredient-filter-onion"]')
      .trigger("click");

    const count = wrapper.find('[data-testid="count"]').text();
    expect(count).toBe("2 of 2 recipes call for onion");
    expect(count).not.toMatch(/can make|can cook/i);
  });

  it("offers the whole vocabulary behind an explicit disclosure", async () => {
    const wrapper = await mountPage(collection());
    await wrapper.find('[data-testid="toggle-ingredients"]').trigger("click");
    // Only what the collection calls for, to begin with.
    expect(
      wrapper.find('[data-testid="ingredient-filter-salt"]').exists(),
    ).toBe(false);

    await wrapper
      .find('[data-testid="toggle-all-categories"]')
      .trigger("click");
    expect(
      wrapper.find('[data-testid="ingredient-filter-salt"]').exists(),
    ).toBe(true);
  });

  it("never labels the pantry filter as a fridge or a pantry", async () => {
    // UX-DR11: the filter's own label is "Ingredients".
    const wrapper = await mountPage(collection());
    expect(wrapper.text()).not.toMatch(/fridge|pantry|cook tonight/i);
    expect(wrapper.find('[data-testid="toggle-ingredients"]').text()).toBe(
      "Ingredients",
    );
  });

  it("clears one filter without touching the others", async () => {
    const wrapper = await mountPage(collection());
    await wrapper.find('[data-testid="meal-dinner"]').trigger("click");
    await wrapper.find('[data-testid="search"]').setValue("onion");
    expect(wrapper.findAll(".kc-row")).toHaveLength(1);

    await wrapper.find('[data-testid="meal-dinner"]').trigger("click");
    expect(wrapper.findAll(".kc-row")).toHaveLength(2);
    expect(
      (wrapper.find('[data-testid="search"]').element as HTMLInputElement)
        .value,
    ).toBe("onion");
  });

  it("reaches a favourites-only view in one interaction", async () => {
    const list = collection();
    list[0].favourite = true;
    const wrapper = await mountPage(list);

    await wrapper.find('[data-testid="favourites-only"]').trigger("click");
    expect(wrapper.findAll(".kc-row")).toHaveLength(1);
    expect(wrapper.find('[data-testid="count"]').text()).toBe("1 favourite");
  });
});

describe("the zero-result state", () => {
  async function zeroResults() {
    const wrapper = await mountPage([
      recipe({ name: "Chicken traybake", meal_type: "dinner" }),
      recipe({ name: "Onion soup", meal_type: "lunch" }),
    ]);
    await wrapper.find('[data-testid="meal-dinner"]').trigger("click");
    await wrapper.find('[data-testid="search"]').setValue("crumble");
    return wrapper;
  }

  it("explains why nothing matched, filter by filter", async () => {
    const wrapper = await zeroResults();
    const zero = wrapper.find('[data-testid="zero-results"]');
    expect(zero.exists()).toBe(true);
    expect(zero.text()).toContain("Nothing matches all of these.");
    expect(zero.text()).toContain("crumble");
    expect(zero.text()).toContain("0 on its own");
    expect(zero.text()).toContain("dinner");
    expect(zero.text()).toContain("1 on its own");
  });

  it("clears just that one filter from its own line", async () => {
    const wrapper = await zeroResults();
    await wrapper.find('[data-testid="clear-search-crumble"]').trigger("click");

    expect(wrapper.find('[data-testid="zero-results"]').exists()).toBe(false);
    // The meal-type filter it did not name is still active.
    expect(wrapper.findAll(".kc-row")).toHaveLength(1);
  });

  it("also offers to clear everything", async () => {
    const wrapper = await zeroResults();
    await wrapper.find('[data-testid="clear-filters-zero"]').trigger("click");
    expect(wrapper.findAll(".kc-row")).toHaveLength(2);
  });
});

describe("the empty favourites view", () => {
  it("says so and offers no button, because the action is on the rows behind", async () => {
    const wrapper = await mountPage([recipe(), recipe()]);
    await wrapper.find('[data-testid="favourites-only"]').trigger("click");

    const empty = wrapper.find('[data-testid="empty-favourites"]');
    expect(empty.text()).toContain("No favourites yet.");
    expect(empty.text()).toContain("Tap the star on any recipe.");
    expect(empty.find("button").exists()).toBe(false);
    // Not the zero-result breakdown — this state has its own words.
    expect(wrapper.find('[data-testid="zero-results"]').exists()).toBe(false);
  });

  it("falls back to the zero-result breakdown when other filters are also on", async () => {
    const wrapper = await mountPage([recipe({ meal_type: "dinner" })]);
    await wrapper.find('[data-testid="favourites-only"]').trigger("click");
    await wrapper.find('[data-testid="meal-dinner"]').trigger("click");

    expect(wrapper.find('[data-testid="empty-favourites"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="zero-results"]').exists()).toBe(true);
  });
});

describe("voice and tone", () => {
  it("never nags, encourages or counts how much structure a recipe has", async () => {
    const wrapper = await mountPage([
      recipe({ name: "Bare" }),
      recipe({
        name: "Full",
        meal_type: "dinner",
        total_time_minutes: 40,
        tags: ["cheap"],
      }),
    ]);
    const text = wrapper.text();
    expect(text).not.toMatch(
      /!|😀|complete|finish|unfinished|missing|add a time|why not/i,
    );
  });

  it("surfaces a failed load in one line", async () => {
    getMock.mockRejectedValue(new Error("Network error"));
    const wrapper = mount(CollectionPage);
    await flushPromises();
    expect(wrapper.find('[data-testid="error"]').text()).toBe("Network error");
  });
});

describe("reaching capture from a populated collection", () => {
  it("puts the add button in the top bar, above the list", async () => {
    const wrapper = await mountPage([recipe({ name: "Dal" })]);
    const add = wrapper.find('[data-testid="add-recipe"]');
    expect(add.exists()).toBe(true);
    // In the bar, not in a footer the list pushes off the screen.
    expect(add.element.closest(".kc-bar")).not.toBeNull();
  });

  it("offers exactly one add button, never two", async () => {
    const wrapper = await mountPage([recipe({ name: "Dal" })]);
    expect(wrapper.findAll('[data-testid="add-recipe"]')).toHaveLength(1);
  });

  it("routes to capture from the bar", async () => {
    const wrapper = await mountPage([recipe({ name: "Dal" })]);
    await wrapper.find('[data-testid="add-recipe"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/kitchencraft/new");
  });

  it("keeps the bar button out of the empty state, which has its own", async () => {
    const wrapper = await mountPage([]);
    const add = wrapper.find('[data-testid="add-recipe"]');
    expect(add.element.closest(".kc-bar")).toBeNull();
    expect(wrapper.findAll('[data-testid="add-recipe"]')).toHaveLength(1);
  });
});

describe("rating from the collection", () => {
  it("sends the rating without re-ordering the list", async () => {
    const a = recipe({ name: "a" });
    const b = recipe({ name: "b" });
    const wrapper = await mountPage([a, b]);
    const before = wrapper.findAll(".kc-row .kc-body").map((n) => n.text());
    // A whole recipe, not a patch: the store replaces the row with what comes
    // back, and every derived count walks its tags and ingredients.
    putMock.mockResolvedValueOnce({ ...a, rating: 4 });

    await wrapper.find(`[data-testid="rating-${a.id}-4"]`).trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(`/kitchencraft/recipes/${a.id}`, {
      rating: 4,
    });
    // Favouriting re-orders; rating must not.
    expect(wrapper.findAll(".kc-row .kc-body").map((n) => n.text())).toEqual(
      before,
    );
  });

  it("does not navigate when a star is tapped", async () => {
    const only = recipe();
    const wrapper = await mountPage([only]);
    putMock.mockResolvedValueOnce({ ...only, rating: 3 });

    await wrapper.find(`[data-testid="rating-${only.id}-3"]`).trigger("click");
    await flushPromises();

    expect(push).not.toHaveBeenCalled();
  });

  it("reverts the stars and reports when the write fails", async () => {
    const only = recipe({ rating: 2 });
    const wrapper = await mountPage([only]);
    putMock.mockRejectedValueOnce(new Error("Offline"));

    await wrapper.find(`[data-testid="rating-${only.id}-5"]`).trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="error"]').text()).toBe("Offline");
    const filled = wrapper
      .findAll(`[data-testid^="rating-${only.id}-"] svg`)
      .filter((s) => s.attributes("fill") === "currentColor");
    expect(filled).toHaveLength(2);
  });
});

describe("the shopping list is reachable from here", () => {
  it("shows the shopping-list button (FR-14: every screen, without exception)", async () => {
    const wrapper = await mountPage([recipe()]);
    expect(wrapper.find('[data-testid="open-shopping"]').exists()).toBe(true);
  });
});
