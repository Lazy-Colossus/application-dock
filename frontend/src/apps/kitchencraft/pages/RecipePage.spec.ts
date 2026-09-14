import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, push, routeParams } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
  routeParams: { value: { id: "r-00000001" } as Record<string, string> },
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: putMock, del: delMock },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: routeParams.value }),
}));

import RecipePage from "./RecipePage.vue";
import { recipe, resetRecipeFixture } from "@/apps/kitchencraft/recipe.fixture";
import type { Recipe } from "@/apps/kitchencraft/types";

const MESSY_BODY = `Pumpkin Dal

- 1 small pumpkin
* 200g red lentils
• 2 tsp cumin
– a thumb of ginger

1. Soften the ONION.


2. Simmer 40 min.

Print Recipe`;

beforeEach(() => {
  setActivePinia(createPinia());
  resetRecipeFixture();
  vi.clearAllMocks();
});

async function mountPage(over: Partial<Recipe> = {}) {
  const subject = recipe(over);
  routeParams.value = { id: subject.id };
  getMock.mockResolvedValueOnce(subject);
  const wrapper = mount(RecipePage, { attachTo: document.body });
  await flushPromises();
  return { wrapper, subject };
}

describe("the reading view", () => {
  it("shows the name and the body", async () => {
    const { wrapper } = await mountPage({
      name: "Pumpkin dal",
      body: "Simmer.",
    });
    expect(wrapper.find('[data-testid="recipe-name"]').text()).toBe(
      "Pumpkin dal",
    );
    expect(wrapper.find('[data-testid="recipe-body"]').text()).toBe("Simmer.");
  });

  it("reads the body back exactly as pasted", async () => {
    const { wrapper } = await mountPage({ body: MESSY_BODY });
    const rendered = wrapper.find('[data-testid="recipe-body"]');

    // Character for character: mixed bullets, the shouted ONION, the blank run
    // and the site's boilerplate all survive.
    expect(rendered.text()).toBe(MESSY_BODY);
    expect(rendered.element.textContent).toContain("- 1 small pumpkin");
    expect(rendered.element.textContent).toContain("* 200g red lentils");
    expect(rendered.element.textContent).toContain("• 2 tsp cumin");
    expect(rendered.element.textContent).toContain("– a thumb of ginger");
    expect(rendered.element.textContent).toContain("Soften the ONION.");
    expect(rendered.element.textContent).toContain("\n\n\n");
    expect(rendered.element.textContent).toContain("Print Recipe");
  });

  it("renders the body as text, with no markdown pass", async () => {
    // `- item` must stay a hyphen and a space, not become a list.
    const { wrapper } = await mountPage({
      body: "- one\n- two\n\n**not bold**",
    });
    const html = wrapper.find('[data-testid="recipe-body"]').html();
    expect(html).not.toContain("<ul");
    expect(html).not.toContain("<li");
    expect(html).not.toContain("<strong");
    expect(wrapper.find('[data-testid="recipe-body"]').text()).toContain(
      "**not bold**",
    );
  });

  it("preserves whitespace rather than collapsing it", async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.find('[data-testid="recipe-body"]').classes()).toContain(
      "kc-read__body",
    );
  });

  it("sets the body in the recipe type role, the app's hero", async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.find('[data-testid="recipe-body"]').classes()).toContain(
      "kc-recipe",
    );
  });
});

describe("the absence rule", () => {
  it("shows a name and a body and nothing else for a bare recipe", async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.find('[data-testid="recipe-meta"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="recipe-ingredients"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="recipe-tags"]').exists()).toBe(false);
  });

  it("renders no label for a section with nothing in it", async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).not.toContain("Ingredients");
    expect(wrapper.text()).not.toContain("Tags");
  });

  it("never renders a dash, an unknown or an empty labelled slot", async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).not.toMatch(/unknown|not set|—|n\/a/i);
  });

  it("shows only the fields that have values", async () => {
    const { wrapper } = await mountPage({ meal_type: "dinner" });
    expect(wrapper.find('[data-testid="recipe-meta"]').text()).toBe("dinner");
  });

  it("joins every present field into the one quiet line", async () => {
    const { wrapper } = await mountPage({
      meal_type: "dinner",
      total_time_minutes: 40,
      servings: 4,
      source: "Nan's book",
    });
    expect(wrapper.find('[data-testid="recipe-meta"]').text()).toBe(
      "dinner · 40 min · serves 4 · Nan's book",
    );
  });

  it("never counts how much structure a recipe has or invites more", async () => {
    const { wrapper } = await mountPage({ meal_type: "dinner" });
    expect(wrapper.text()).not.toMatch(
      /of \d|add a|why not|complete|finish|\d+%/i,
    );
  });
});

describe("ingredients and tags", () => {
  it("lists ingredients one per line, in the order entered", async () => {
    const { wrapper } = await mountPage({
      ingredients: [
        { amount: "200", unit: "g", text: "feta" },
        { amount: null, unit: null, text: "harissa" },
      ],
    });
    const rows = wrapper.findAll('[data-testid="recipe-ingredients"] li');
    expect(rows).toHaveLength(2);
    // Two columns, so they are read as a pair rather than one run-on string —
    // the space between them is layout, not text.
    expect(
      rows.map((r) => [
        r.find(".kc-ingredient__measure").text(),
        r.find(".kc-ingredient__name").text(),
      ]),
    ).toEqual([
      ["200 g", "feta"],
      ["", "harissa"],
    ]);
  });

  it("puts the amount and unit in their own column, so quantities line up", async () => {
    const { wrapper } = await mountPage({
      ingredients: [
        { amount: "200", unit: "g", text: "feta" },
        { amount: "8", unit: null, text: "olives" },
        { amount: null, unit: null, text: "harissa" },
      ],
    });
    const measures = wrapper
      .findAll(".kc-ingredient__measure")
      .map((m) => m.text());
    expect(measures).toEqual(["200 g", "8", ""]);
  });

  it("shows an ingredient with neither as just its name", async () => {
    // The absence rule, inside one line — no gap, no placeholder.
    const { wrapper } = await mountPage({
      ingredients: [{ amount: null, unit: null, text: "garlic" }],
    });
    const row = wrapper.find('[data-testid="recipe-ingredients"] li');
    expect(row.find(".kc-ingredient__measure").text()).toBe("");
    expect(row.find(".kc-ingredient__name").text()).toBe("garlic");
  });

  it("never gives a displaying chip the selected fill", async () => {
    // A chip merely displaying a value is not pressable, so never moss.
    const { wrapper } = await mountPage({
      tags: ["cheap"],
      ingredients: [{ amount: null, unit: null, text: "onion" }],
    });
    for (const chip of wrapper.findAll(".kc-chip")) {
      expect(chip.classes()).not.toContain("kc-chip--on");
      expect(chip.classes()).not.toContain("kc-chip--control");
    }
  });

  it("shows the tags section only when there are tags", async () => {
    const { wrapper } = await mountPage({ tags: ["cheap", "batch cooking"] });
    expect(
      wrapper
        .findAll('[data-testid="recipe-tags"] .kc-chip')
        .map((c) => c.text()),
    ).toEqual(["cheap", "batch cooking"]);
  });
});

describe("edit and delete", () => {
  it("routes to the edit screen", async () => {
    const { wrapper, subject } = await mountPage();
    await wrapper.find('[data-testid="edit"]').trigger("click");
    expect(push).toHaveBeenCalledWith(`/kitchencraft/r/${subject.id}/edit`);
  });

  it("requires a confirmation before deleting", async () => {
    const { wrapper } = await mountPage({ name: "Pumpkin dal" });
    expect(wrapper.find('[data-testid="confirm-backdrop"]').exists()).toBe(
      false,
    );

    await wrapper.find('[data-testid="delete"]').trigger("click");
    const confirm = wrapper.find('[data-testid="confirm-backdrop"]');
    expect(confirm.text()).toContain("Delete Pumpkin dal?");
    expect(confirm.text()).toContain("This can't be undone.");
    expect(delMock).not.toHaveBeenCalled();
  });

  it("deletes on confirming and leaves the collection", async () => {
    const { wrapper, subject } = await mountPage();
    delMock.mockResolvedValueOnce(undefined);

    await wrapper.find('[data-testid="delete"]').trigger("click");
    await wrapper.find('[data-testid="delete-confirm"]').trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith(`/kitchencraft/recipes/${subject.id}`);
    expect(push).toHaveBeenCalledWith("/kitchencraft");
  });

  it("keeps the recipe when the confirmation is cancelled", async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="delete"]').trigger("click");
    await wrapper.find('[data-testid="delete-cancel"]').trigger("click");

    expect(wrapper.find('[data-testid="confirm-backdrop"]').exists()).toBe(
      false,
    );
    expect(delMock).not.toHaveBeenCalled();
  });

  it("puts the destructive verb on the danger button and never on the quiet one", async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="delete"]').trigger("click");
    expect(wrapper.find('[data-testid="delete-confirm"]').classes()).toContain(
      "kc-btn--danger",
    );
    expect(wrapper.find('[data-testid="delete-cancel"]').text()).toBe("Cancel");
  });

  it("offers no undo action and no trash to restore from", async () => {
    // The copy says "This can't be undone"; what must not exist is a control
    // that undoes or restores. The confirmation is the only safety net.
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="delete"]').trigger("click");
    // Labelled actions only: the rating stars are icon-only buttons and carry
    // no text, so they are not actions in this sense.
    const actions = wrapper
      .findAll("button")
      .map((b) => b.text())
      .filter(Boolean);
    expect(actions).toEqual([
      "Edit",
      "Add to shopping list",
      "Delete",
      "Delete",
      "Cancel",
    ]);
    expect(actions.join(" ")).not.toMatch(/undo|restore|trash|bin\b/i);
  });
});

describe("an unknown id", () => {
  it("says the recipe is not here rather than rendering an empty frame", async () => {
    routeParams.value = { id: "r-nope" };
    getMock.mockRejectedValueOnce(new Error("404: Recipe not found"));
    const wrapper = mount(RecipePage);
    await flushPromises();

    expect(wrapper.find('[data-testid="missing"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="recipe-body"]').exists()).toBe(false);
  });
});

describe("the rating on the reading view", () => {
  it("shows the recipe's rating", async () => {
    const { wrapper } = await mountPage({ rating: 4 });
    const filled = wrapper
      .findAll('[data-testid^="recipe-rating-"] svg')
      .filter((s) => s.attributes("fill") === "currentColor");
    expect(filled).toHaveLength(4);
  });

  it("offers the control on an unrated recipe rather than hiding it", async () => {
    // A control, not a value — absence is five outlined stars, not a gap.
    const { wrapper } = await mountPage({ rating: null });
    expect(wrapper.find('[data-testid="recipe-rating"]').exists()).toBe(true);
  });

  it("sets a rating from the reading view", async () => {
    const { wrapper, subject } = await mountPage();
    putMock.mockResolvedValueOnce({ ...subject, rating: 5 });

    await wrapper.find('[data-testid="recipe-rating-5"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      `/kitchencraft/recipes/${subject.id}`,
      { rating: 5 },
    );
  });

  it("clears a rating by tapping the star that holds it", async () => {
    const { wrapper, subject } = await mountPage({ rating: 3 });
    putMock.mockResolvedValueOnce({ ...subject, rating: null });

    await wrapper.find('[data-testid="recipe-rating-3"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      `/kitchencraft/recipes/${subject.id}`,
      { rating: null },
    );
  });

  it("renders the meta line beside the rating, and omits it when empty", async () => {
    const { wrapper } = await mountPage({ rating: 2 });
    // The absence rule still applies to the meta line itself.
    expect(wrapper.find('[data-testid="recipe-meta"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="recipe-rating"]').exists()).toBe(true);
  });
});

describe("the shopping list is reachable from here", () => {
  it("shows the shopping-list button (FR-14: every screen, without exception)", async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.find('[data-testid="open-shopping"]').exists()).toBe(true);
  });
});
