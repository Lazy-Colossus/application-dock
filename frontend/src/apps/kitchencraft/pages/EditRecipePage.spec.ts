import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, push, routeParams } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  push: vi.fn(),
  routeParams: { value: { id: "r-00000001" } as Record<string, string> },
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: putMock, del: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: routeParams.value }),
}));

import EditRecipePage from "./EditRecipePage.vue";
import { recipe, resetRecipeFixture } from "@/apps/kitchencraft/recipe.fixture";
import type { Recipe } from "@/apps/kitchencraft/types";

const VOCABULARY = {
  tags: ["batch cooking", "cheap"],
  ingredient_categories: ["chicken", "chickpeas", "cheese", "onion"],
};

beforeEach(() => {
  setActivePinia(createPinia());
  resetRecipeFixture();
  vi.clearAllMocks();
});

async function mountPage(over: Partial<Recipe> = {}) {
  const subject = recipe(over);
  routeParams.value = { id: subject.id };
  // The page fetches the vocabulary, then the recipe.
  getMock.mockResolvedValueOnce(VOCABULARY).mockResolvedValueOnce(subject);
  const wrapper = mount(EditRecipePage, { attachTo: document.body });
  await flushPromises();
  return { wrapper, subject };
}

type Wrapper = Awaited<ReturnType<typeof mountPage>>["wrapper"];

async function save(wrapper: Wrapper) {
  await wrapper.find("form").trigger("submit");
  await flushPromises();
}

function sent(): Record<string, unknown> {
  return putMock.mock.calls[0][1] as Record<string, unknown>;
}

describe("the form", () => {
  it("pre-fills every field from the recipe", async () => {
    const { wrapper } = await mountPage({
      name: "Pumpkin dal",
      body: "Simmer.",
      meal_type: "dinner",
      total_time_minutes: 45,
      servings: 4,
      source: "Nan's book",
    });

    expect(
      (wrapper.find('[data-testid="name"]').element as HTMLInputElement).value,
    ).toBe("Pumpkin dal");
    expect(
      (wrapper.find('[data-testid="body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("Simmer.");
    expect(
      (wrapper.find('[data-testid="time"]').element as HTMLInputElement).value,
    ).toBe("45");
    expect(
      (wrapper.find('[data-testid="servings"]').element as HTMLInputElement)
        .value,
    ).toBe("4");
    expect(
      (wrapper.find('[data-testid="source"]').element as HTMLInputElement)
        .value,
    ).toBe("Nan's book");
    expect(wrapper.find('[data-testid="meal-dinner"]').classes()).toContain(
      "kc-chip--on",
    );
  });

  it("is the one surface that shows every field, filled or not", async () => {
    // The single exception to the absence rule — this is where they get set.
    const { wrapper } = await mountPage();
    for (const id of ["name", "body", "time", "servings", "source"]) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists()).toBe(true);
    }
    expect(wrapper.find('[data-testid="meal-breakfast"]').exists()).toBe(true);
  });

  it("offers the six PRD meal types, verbatim and in order", async () => {
    const { wrapper } = await mountPage();
    const labels = wrapper
      .findAll('[data-testid^="meal-"]')
      .map((c) => c.text());
    expect(labels).toEqual([
      "breakfast",
      "lunch",
      "dinner",
      "snack",
      "dessert",
      "other",
    ]);
  });

  it("keeps Tags and Ingredients as two separate inputs", async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.find('[data-testid="tags-input"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ingredients-input"]').exists()).toBe(
      true,
    );
  });
});

describe("setting and clearing the optional fields", () => {
  it("sets each field independently", async () => {
    const { wrapper } = await mountPage();
    putMock.mockResolvedValueOnce(recipe());

    await wrapper.find('[data-testid="meal-dinner"]').trigger("click");
    await wrapper.find('[data-testid="time"]').setValue("45");
    await wrapper.find('[data-testid="servings"]').setValue("4");
    await wrapper.find('[data-testid="source"]').setValue("a magazine");
    await save(wrapper);

    expect(sent()).toMatchObject({
      meal_type: "dinner",
      total_time_minutes: 45,
      servings: 4,
      source: "a magazine",
    });
  });

  it("clears one field without disturbing the others", async () => {
    const { wrapper } = await mountPage({
      meal_type: "dinner",
      total_time_minutes: 45,
      servings: 4,
      source: "Nan's book",
    });
    putMock.mockResolvedValueOnce(recipe());

    await wrapper.find('[data-testid="time"]').setValue("");
    await save(wrapper);

    expect(sent()).toMatchObject({
      total_time_minutes: null,
      meal_type: "dinner",
      servings: 4,
      source: "Nan's book",
    });
  });

  it("clears the meal type by tapping the selected chip again", async () => {
    const { wrapper } = await mountPage({ meal_type: "dinner" });
    putMock.mockResolvedValueOnce(recipe());

    await wrapper.find('[data-testid="meal-dinner"]').trigger("click");
    expect(wrapper.find('[data-testid="meal-dinner"]').classes()).not.toContain(
      "kc-chip--on",
    );

    await save(wrapper);
    expect(sent().meal_type).toBeNull();
  });

  it("selects one meal type at a time", async () => {
    const { wrapper } = await mountPage({ meal_type: "dinner" });
    await wrapper.find('[data-testid="meal-lunch"]').trigger("click");
    expect(wrapper.find('[data-testid="meal-dinner"]').classes()).not.toContain(
      "kc-chip--on",
    );
    expect(wrapper.find('[data-testid="meal-lunch"]').classes()).toContain(
      "kc-chip--on",
    );
  });

  it("clears a blanked source to absent, not to an empty string", async () => {
    const { wrapper } = await mountPage({ source: "Nan's book" });
    putMock.mockResolvedValueOnce(recipe());
    await wrapper.find('[data-testid="source"]').setValue("   ");
    await save(wrapper);
    expect(sent().source).toBeNull();
  });

  it("announces the selected state of every chip", async () => {
    // Colour is never the sole signal for active state (UX-DR17).
    const { wrapper } = await mountPage({ meal_type: "dinner" });
    expect(
      wrapper.find('[data-testid="meal-dinner"]').attributes("aria-pressed"),
    ).toBe("true");
    expect(
      wrapper.find('[data-testid="meal-lunch"]').attributes("aria-pressed"),
    ).toBe("false");
  });
});

describe("validation at the field, not at save", () => {
  it("rejects a non-numeric time on the keystroke", async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="time"]').setValue("4o");

    expect(wrapper.find('[data-testid="time-error"]').text()).toBe(
      "Minutes only.",
    );
    // And it did not wait for a save to say so.
    expect(putMock).not.toHaveBeenCalled();
  });

  it("rejects a non-numeric servings on the keystroke", async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="servings"]').setValue("4o");
    expect(wrapper.find('[data-testid="servings-error"]').text()).toBe(
      "A whole number of servings.",
    );
  });

  it("rejects zero and negatives the same way", async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="time"]').setValue("0");
    expect(wrapper.find('[data-testid="time-error"]').text()).toBe(
      "Minutes only.",
    );

    await wrapper.find('[data-testid="time"]').setValue("-40");
    expect(wrapper.find('[data-testid="time-error"]').text()).toBe(
      "Minutes only.",
    );
  });

  it("treats empty as always valid", async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="time"]').setValue("");
    await wrapper.find('[data-testid="servings"]').setValue("");
    expect(wrapper.find('[data-testid="time-error"]').text()).toBe("");
    expect(wrapper.find('[data-testid="servings-error"]').text()).toBe("");
    expect(
      wrapper.find('[data-testid="save"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("keeps what the user typed rather than silently rewriting it", async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="time"]').setValue("4o");
    expect(
      (wrapper.find('[data-testid="time"]').element as HTMLInputElement).value,
    ).toBe("4o");
  });

  it("blocks the save while a field error stands, and frees it once fixed", async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="time"]').setValue("4o");
    expect(
      wrapper.find('[data-testid="save"]').attributes("disabled"),
    ).toBeDefined();

    await wrapper.find('[data-testid="time"]').setValue("40");
    expect(wrapper.find('[data-testid="time-error"]').text()).toBe("");
    expect(
      wrapper.find('[data-testid="save"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("names the empty field on a rejected save", async () => {
    const { wrapper } = await mountPage();
    await wrapper.find('[data-testid="name"]').setValue("   ");
    await save(wrapper);

    expect(wrapper.find('[data-testid="name-error"]').text()).toBe(
      "Give it a name.",
    );
    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("tags and ingredients", () => {
  it("offers tags only in the Tags input", async () => {
    const { wrapper } = await mountPage();
    const input = wrapper.find('[data-testid="tags-input"]');
    await input.trigger("focus");
    await input.setValue("bat");

    const options = wrapper
      .findAll('[data-testid="tags-option"]')
      .map((o) => o.text());
    expect(options).toEqual(["batch cooking"]);
    // No ingredient has ever appeared here.
    expect(options).not.toContain("chicken");
  });

  it("offers ingredient categories only in the Ingredients input", async () => {
    const { wrapper } = await mountPage();
    const input = wrapper.find('[data-testid="ingredients-input"]');
    await input.trigger("focus");
    await input.setValue("chi");

    const options = wrapper
      .findAll('[data-testid="ingredients-option"]')
      .map((o) => o.text());
    expect(options).toEqual(["chicken", "chickpeas"]);
    expect(options).not.toContain("batch cooking");
  });

  it("sends the tags and ingredients as chosen", async () => {
    const { wrapper } = await mountPage();
    putMock.mockResolvedValueOnce(recipe());

    const tags = wrapper.find('[data-testid="tags-input"]');
    await tags.trigger("focus");
    await tags.setValue("cheap");
    await tags.trigger("keydown", { key: "Enter" });

    const ingredients = wrapper.find('[data-testid="ingredients-input"]');
    await ingredients.trigger("focus");
    await ingredients.setValue("chickpeas");
    await ingredients.trigger("keydown", { key: "Enter" });
    await flushPromises();
    await wrapper
      .find('[data-testid="specific-input"]')
      .setValue("dried chickpeas");
    await wrapper.find('[data-testid="add-ingredient"]').trigger("click");

    await save(wrapper);

    expect(sent().tags).toEqual(["cheap"]);
    expect(sent().ingredients).toEqual([
      { category: "chickpeas", specific: "dried chickpeas" },
    ]);
  });

  it("offers a coined category immediately, for the rest of the edit", async () => {
    const { wrapper } = await mountPage();
    const input = wrapper.find('[data-testid="ingredients-input"]');
    await input.trigger("focus");
    await input.setValue("harissa");
    await wrapper.find('[data-testid="ingredients-coin"]').trigger("mousedown");
    await flushPromises();
    await wrapper.find('[data-testid="cancel-ingredient"]').trigger("click");

    // Coined once, it is now an ordinary existing category — no second coin row.
    const again = wrapper.find('[data-testid="ingredients-input"]');
    await again.trigger("focus");
    await again.setValue("harissa");
    expect(wrapper.find('[data-testid="ingredients-coin"]').exists()).toBe(
      false,
    );
    expect(
      wrapper
        .findAll('[data-testid="ingredients-option"]')
        .map((o) => o.text()),
    ).toEqual(["harissa"]);
  });

  it("does not reach the server just for coining a category", async () => {
    const { wrapper } = await mountPage();
    const input = wrapper.find('[data-testid="ingredients-input"]');
    await input.trigger("focus");
    await input.setValue("harissa");
    await wrapper.find('[data-testid="ingredients-coin"]').trigger("mousedown");
    await flushPromises();

    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("saving", () => {
  it("sends the body unchanged when only another field was edited", async () => {
    const body = "- one\n\n\n- two\n\nPrint Recipe";
    const { wrapper } = await mountPage({ body });
    putMock.mockResolvedValueOnce(recipe());

    await wrapper.find('[data-testid="meal-dinner"]').trigger("click");
    await save(wrapper);

    expect(sent().body).toBe(body);
  });

  it("returns to the reading view", async () => {
    const { wrapper, subject } = await mountPage();
    putMock.mockResolvedValueOnce(recipe());
    await save(wrapper);
    expect(push).toHaveBeenCalledWith(`/kitchencraft/r/${subject.id}`);
  });

  it("stays on the form and surfaces the message when the save is rejected", async () => {
    const { wrapper } = await mountPage({ name: "Pumpkin dal" });
    putMock.mockRejectedValueOnce(new Error("422: servings must be positive"));
    await save(wrapper);

    expect(push).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="error"]').text()).toContain(
      "servings must be positive",
    );
    // Nothing on the form was cleared.
    expect(
      (wrapper.find('[data-testid="name"]').element as HTMLInputElement).value,
    ).toBe("Pumpkin dal");
  });

  it("returns to the reading view on Cancel without saving", async () => {
    const { wrapper, subject } = await mountPage();
    await wrapper.find('[data-testid="cancel"]').trigger("click");
    expect(putMock).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith(`/kitchencraft/r/${subject.id}`);
  });
});

describe("voice and tone", () => {
  it("never implies the recipe is unfinished", async () => {
    const { wrapper } = await mountPage();
    expect(wrapper.text()).not.toMatch(
      /!|required|incomplete|missing|finish|why not/i,
    );
  });
});

describe("the rating field", () => {
  it("loads the recipe's current rating", async () => {
    const { wrapper } = await mountPage({ rating: 3 });
    const filled = wrapper
      .findAll('[data-testid^="edit-rating-"] svg')
      .filter((s) => s.attributes("fill") === "currentColor");
    expect(filled).toHaveLength(3);
  });

  it("sends the rating on save", async () => {
    const { wrapper } = await mountPage({ rating: null });
    putMock.mockResolvedValueOnce(recipe({ rating: 4 }));

    await wrapper.find('[data-testid="edit-rating-4"]').trigger("click");
    await save(wrapper);

    expect(sent().rating).toBe(4);
  });

  it("sends an explicit null to clear it", async () => {
    const { wrapper } = await mountPage({ rating: 2 });
    putMock.mockResolvedValueOnce(recipe({ rating: null }));

    await wrapper.find('[data-testid="edit-rating-2"]').trigger("click");
    await save(wrapper);

    // An explicit null is how a field is cleared; an absent key would leave it.
    expect(sent()).toHaveProperty("rating", null);
  });

  it("leaves the rating alone when the edit is about something else", async () => {
    const { wrapper } = await mountPage({ rating: 5 });
    putMock.mockResolvedValueOnce(recipe({ rating: 5 }));

    await wrapper.find('[data-testid="name"]').setValue("Renamed");
    await save(wrapper);

    expect(sent().rating).toBe(5);
  });

  it("never blocks a save", async () => {
    // No optional field may stand between a paste and a saved recipe (FR-3).
    const { wrapper } = await mountPage({ rating: null });
    putMock.mockResolvedValueOnce(recipe());

    await save(wrapper);

    expect(putMock).toHaveBeenCalled();
    expect(sent().rating).toBeNull();
  });
});
