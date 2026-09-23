import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import CapturePage from "./CapturePage.vue";
import { recipe, resetRecipeFixture } from "@/apps/kitchencraft/recipe.fixture";

// A paste straight off a recipe site: mixed bullets, blank lines, inconsistent
// capitals, and the site's own boilerplate at the end.
const MESSY_PASTE = `- 1 small pumpkin
* 200g red lentils
• 2 tsp cumin

1. Soften the ONION.


2. Simmer 40 min.

Print Recipe`;

beforeEach(() => {
  setActivePinia(createPinia());
  resetRecipeFixture();
  vi.clearAllMocks();
  getMock.mockResolvedValue({
    tags: ["batch cooking"],
    ingredients: ["feta"],
    units: ["g"],
  });
});

function mountPage() {
  return mount(CapturePage, { attachTo: document.body });
}

describe("opening", () => {
  it("opens on New Recipe as the name, focused and selected", () => {
    // Typing replaces it outright; a paste-and-save that never touches it
    // still has a name.
    const wrapper = mountPage();
    const input = wrapper.find('[data-testid="name"]')
      .element as HTMLInputElement;
    expect(input.value).toBe("New Recipe");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe("New Recipe".length);
  });

  it("holds the name in the bar, as the screen's heading", () => {
    const wrapper = mountPage();
    expect(wrapper.find('.kc-bar [data-testid="name"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain("Add a recipe");
  });

  it("saves on Enter in the name, though it sits outside the form", () => {
    const wrapper = mountPage();
    expect(wrapper.find('[data-testid="name"]').attributes("form")).toBe(
      wrapper.find("form").attributes("id"),
    );
  });

  it("names both fields for everyone rather than leaning on placeholders", () => {
    const wrapper = mountPage();
    expect(wrapper.find('label[for="capture-body"]').text()).toBe(
      "Recipe text",
    );
    expect(wrapper.find('[data-testid="name"]').attributes("aria-label")).toBe(
      "Recipe name",
    );
    expect(
      wrapper.find('[data-testid="body"]').attributes("placeholder"),
    ).toBeUndefined();
    expect(
      wrapper.find('[data-testid="name"]').attributes("placeholder"),
    ).toBeUndefined();
  });
});

describe("saving", () => {
  it("saves from a name and a body alone", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();

    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Pumpkin dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/kitchencraft/recipes", {
      name: "Pumpkin dal",
      body: "Simmer.",
      servings: 1,
    });
  });

  it("sends nothing the cook didn't fill beyond the default serving", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(Object.keys(postMock.mock.calls[0][1])).toEqual([
      "name",
      "body",
      "servings",
    ]);
  });

  it("sends the paste unaltered — no bullet, case or blank-line tidying", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue(MESSY_PASTE);
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock.mock.calls[0][1].body).toBe(MESSY_PASTE);
  });

  it("returns to the collection, where the new recipe is at the top", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(push).toHaveBeenCalledWith("/kitchencraft");
  });

  it("offers exactly one primary action for the form", () => {
    // The tags field carries its own Add button; the form's actions are the
    // row at the foot.
    const wrapper = mountPage();
    const primaries = wrapper.findAll(
      ".kc-actions .kc-btn:not(.kc-btn--quiet):not(.kc-btn--danger)",
    );
    expect(primaries).toHaveLength(1);
    expect(primaries[0].text()).toBe("Save");
  });
});

describe("rejection", () => {
  it("names the missing name and keeps the paste on screen", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="name"]').setValue("");
    await wrapper.find('[data-testid="body"]').setValue(MESSY_PASTE);
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[data-testid="name-error"]').text()).toBe(
      "Give it a name.",
    );
    expect(postMock).not.toHaveBeenCalled();
    // Nothing about the failure risks the paste.
    expect(
      (wrapper.find('[data-testid="body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe(MESSY_PASTE);
  });

  it("names the missing body", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[data-testid="body-error"]').text()).toBe(
      "Paste or type the recipe text.",
    );
    expect(wrapper.find('[data-testid="name-error"]').text()).toBe("");
  });

  it("names both when both are empty", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="name"]').setValue("");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[data-testid="name-error"]').text()).toBe(
      "Give it a name.",
    );
    expect(wrapper.find('[data-testid="body-error"]').text()).toBe(
      "Paste or type the recipe text.",
    );
  });

  it("rejects whitespace-only input", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("  \n \n ");
    await wrapper.find('[data-testid="name"]').setValue("   ");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock).not.toHaveBeenCalled();
  });

  it("associates each error with its field and announces it", () => {
    const wrapper = mountPage();
    expect(
      wrapper.find('[data-testid="body"]').attributes("aria-describedby"),
    ).toBe("capture-body-error");
    expect(
      wrapper.find('[data-testid="name-error"]').attributes("aria-live"),
    ).toBe("polite");
  });

  it("clears the error once the field is filled and re-saved", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="name"]').setValue("");
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[data-testid="name-error"]').text()).toBe(
      "Give it a name.",
    );

    postMock.mockResolvedValueOnce(recipe());
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[data-testid="name-error"]').text()).toBe("");
  });
});

describe("a failed save", () => {
  it("says nothing has been lost and keeps both fields", async () => {
    postMock.mockRejectedValueOnce(new Error("Network error"));
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue(MESSY_PASTE);
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[data-testid="save-failed"]').text()).toBe(
      "Couldn't save — nothing has been lost, try again.",
    );
    expect(
      (wrapper.find('[data-testid="body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe(MESSY_PASTE);
    expect(
      (wrapper.find('[data-testid="name"]').element as HTMLInputElement).value,
    ).toBe("Dal");
    expect(push).not.toHaveBeenCalled();
  });

  it("re-enables the button so the retry is one tap", async () => {
    postMock.mockRejectedValueOnce(new Error("Network error"));
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(
      wrapper.find('[data-testid="save"]').attributes("disabled"),
    ).toBeUndefined();
  });
});

describe("cancelling", () => {
  it("returns to the collection", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="cancel"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/kitchencraft");
  });
});

describe("tags and ingredients", () => {
  it("offers both fields on the capture screen", () => {
    const wrapper = mountPage();
    expect(wrapper.find('[data-testid="tags-open"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ingredient-text"]').exists()).toBe(true);
  });

  it("suggests tags from the vocabulary", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="tags-open"]').trigger("click");
    const input = wrapper.find('[data-testid="tags-input"]');
    await input.trigger("focus");
    await input.setValue("bat");

    expect(
      wrapper.findAll('[data-testid="tags-option"]').map((o) => o.text()),
    ).toEqual(["batch cooking"]);
  });

  it("sends the tags and ingredients with the recipe", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Dal");

    await wrapper.find('[data-testid="tags-open"]').trigger("click");
    const tags = wrapper.find('[data-testid="tags-input"]');
    await tags.trigger("focus");
    await tags.setValue("cheap");
    await tags.trigger("keydown", { key: "Enter" });

    await wrapper.find('[data-testid="ingredient-amount"]').setValue("200 g");
    await wrapper.find('[data-testid="ingredient-text"]').setValue("lentils");
    await wrapper.find('[data-testid="add-ingredient"]').trigger("click");

    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/kitchencraft/recipes", {
      name: "Dal",
      body: "Simmer.",
      servings: 1,
      tags: ["cheap"],
      ingredients: [{ amount: "200 g", unit: null, text: "lentils" }],
    });
  });
});

describe("meal type and servings", () => {
  async function fill(wrapper: ReturnType<typeof mountPage>) {
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Dal");
  }

  it("sends the chosen meal type and servings", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();
    await fill(wrapper);
    await wrapper.find('[data-testid="meal-dinner"]').trigger("click");
    await wrapper.find('[data-testid="servings"]').setValue("4");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/kitchencraft/recipes", {
      name: "Dal",
      body: "Simmer.",
      meal_type: "dinner",
      servings: 4,
    });
  });

  it("starts servings at one", () => {
    const wrapper = mountPage();
    expect(
      (wrapper.find('[data-testid="servings"]').element as HTMLInputElement)
        .value,
    ).toBe("1");
  });

  it("leaves servings off when the cook clears the field", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();
    await fill(wrapper);
    await wrapper.find('[data-testid="servings"]').setValue("");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(postMock.mock.calls[0][1]).not.toHaveProperty("servings");
  });

  it("clears the meal type when the chosen chip is tapped again", async () => {
    const wrapper = mountPage();
    const chip = wrapper.find('[data-testid="meal-dinner"]');
    await chip.trigger("click");
    expect(chip.attributes("aria-pressed")).toBe("true");
    await chip.trigger("click");
    expect(chip.attributes("aria-pressed")).toBe("false");
  });

  it("names a servings value that is not a whole number and holds the save", async () => {
    const wrapper = mountPage();
    await fill(wrapper);
    await wrapper.find('[data-testid="servings"]').setValue("a few");

    expect(wrapper.find('[data-testid="servings-error"]').text()).toBe(
      "A whole number of servings.",
    );
    expect(
      wrapper.find('[data-testid="save"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(postMock).not.toHaveBeenCalled();
  });
});

describe("the shopping list is reachable from here", () => {
  it("shows the shopping-list button (FR-14: every screen, without exception)", async () => {
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="open-shopping"]').exists()).toBe(true);
  });
});
