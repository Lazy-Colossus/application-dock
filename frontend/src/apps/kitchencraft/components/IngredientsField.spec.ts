import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { flushPromises } from "@vue/test-utils";
import IngredientsField from "@/apps/kitchencraft/components/IngredientsField.vue";
import type { IngredientTag } from "@/apps/kitchencraft/types";

const CATEGORIES = ["chicken", "chickpeas", "cheese", "onion"];

function mountField(modelValue: IngredientTag[] = []) {
  return mount(IngredientsField, {
    props: { modelValue, suggestions: CATEGORIES },
    attachTo: document.body,
  });
}

async function pickCategory(
  wrapper: ReturnType<typeof mountField>,
  typed: string,
) {
  const input = wrapper.find('[data-testid="ingredients-input"]');
  await input.trigger("focus");
  await input.setValue(typed);
  await input.trigger("keydown", { key: "ArrowDown" });
  await input.trigger("keydown", { key: "Enter" });
  await flushPromises();
}

describe("chips", () => {
  it("shows the specific where there is one", () => {
    const wrapper = mountField([{ category: "cheese", specific: "feta" }]);
    const chip = wrapper.find('[data-testid="ingredient-chips"] .kc-chip');
    expect(chip.text()).toBe("feta");
  });

  it("shows the bare category where there is no specific", () => {
    const wrapper = mountField([{ category: "harissa", specific: null }]);
    expect(
      wrapper.find('[data-testid="ingredient-chips"] .kc-chip').text(),
    ).toBe("harissa");
  });

  it("never stacks the category and the specific as two ingredients", () => {
    const wrapper = mountField([{ category: "cheese", specific: "feta" }]);
    expect(
      wrapper.findAll('[data-testid="ingredient-chips"] .kc-chip'),
    ).toHaveLength(1);
  });

  it("keeps the category in the accessible name so the filter basis is not hidden", () => {
    const wrapper = mountField([{ category: "cheese", specific: "feta" }]);
    expect(
      wrapper
        .find('[data-testid="ingredient-chips"] .kc-chip')
        .attributes("title"),
    ).toBe("cheese");
  });

  it("renders nothing at all when there are no ingredients", () => {
    expect(mountField().find('[data-testid="ingredient-chips"]').exists()).toBe(
      false,
    );
  });

  it("removes one ingredient by position, keeping the other specific", async () => {
    const wrapper = mountField([
      { category: "cheese", specific: "feta" },
      { category: "cheese", specific: "cheddar" },
    ]);
    await wrapper.find('[data-testid="remove-ingredient-0"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([
      [[{ category: "cheese", specific: "cheddar" }]],
    ]);
  });
});

describe("the two-level add", () => {
  it("asks for the optional specific after a category is taken", async () => {
    const wrapper = mountField();
    await pickCategory(wrapper, "chickp");
    const pending = wrapper.find('[data-testid="pending-ingredient"]');
    expect(pending.exists()).toBe(true);
    expect(pending.text()).toContain("chickpeas");
    expect(wrapper.find('[data-testid="specific-input"]').exists()).toBe(true);
  });

  it("adds the category alone when the specific is left blank", async () => {
    // The category alone is already a complete ingredient tag.
    const wrapper = mountField();
    await pickCategory(wrapper, "onion");
    await wrapper.find('[data-testid="add-ingredient"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([
      [[{ category: "onion", specific: null }]],
    ]);
  });

  it("adds the category with the specific the cook typed", async () => {
    const wrapper = mountField();
    await pickCategory(wrapper, "chickpeas");
    await wrapper
      .find('[data-testid="specific-input"]')
      .setValue("dried chickpeas");
    await wrapper.find('[data-testid="add-ingredient"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([
      [[{ category: "chickpeas", specific: "dried chickpeas" }]],
    ]);
  });

  it("stores a whitespace-only specific as absent", async () => {
    const wrapper = mountField();
    await pickCategory(wrapper, "onion");
    await wrapper.find('[data-testid="specific-input"]').setValue("   ");
    await wrapper.find('[data-testid="add-ingredient"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([
      [[{ category: "onion", specific: null }]],
    ]);
  });

  it("commits on Enter in the specific field", async () => {
    const wrapper = mountField();
    await pickCategory(wrapper, "cheese");
    const specific = wrapper.find('[data-testid="specific-input"]');
    await specific.setValue("feta");
    await specific.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("update:modelValue")).toEqual([
      [[{ category: "cheese", specific: "feta" }]],
    ]);
  });

  it("returns to the category typeahead after adding", async () => {
    const wrapper = mountField();
    await pickCategory(wrapper, "onion");
    await wrapper.find('[data-testid="add-ingredient"]').trigger("click");
    expect(wrapper.find('[data-testid="pending-ingredient"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="ingredients-input"]').exists()).toBe(
      true,
    );
  });

  it("abandons the pending ingredient on Cancel without adding anything", async () => {
    const wrapper = mountField();
    await pickCategory(wrapper, "onion");
    await wrapper.find('[data-testid="cancel-ingredient"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.find('[data-testid="pending-ingredient"]').exists()).toBe(
      false,
    );
  });

  it("allows one category twice with two different specifics", async () => {
    const wrapper = mountField([{ category: "cheese", specific: "feta" }]);
    await pickCategory(wrapper, "cheese");
    await wrapper.find('[data-testid="specific-input"]').setValue("cheddar");
    await wrapper.find('[data-testid="add-ingredient"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([
      [
        [
          { category: "cheese", specific: "feta" },
          { category: "cheese", specific: "cheddar" },
        ],
      ],
    ]);
  });

  it("drops an exact duplicate", async () => {
    const wrapper = mountField([{ category: "cheese", specific: "feta" }]);
    await pickCategory(wrapper, "cheese");
    await wrapper.find('[data-testid="specific-input"]').setValue("Feta");
    await wrapper.find('[data-testid="add-ingredient"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});

describe("coining a category", () => {
  it("reports the new category so it can be offered for the rest of the edit", async () => {
    const wrapper = mountField();
    const input = wrapper.find('[data-testid="ingredients-input"]');
    await input.trigger("focus");
    await input.setValue("harissa");
    await wrapper.find('[data-testid="ingredients-coin"]').trigger("mousedown");
    await flushPromises();

    expect(wrapper.emitted("coin")).toEqual([["harissa"]]);
    // And it is selected in the same action.
    expect(wrapper.find('[data-testid="pending-ingredient"]').text()).toContain(
      "harissa",
    );
  });

  it("does not report a coin for an existing category", async () => {
    const wrapper = mountField();
    await pickCategory(wrapper, "onion");
    expect(wrapper.emitted("coin")).toBeUndefined();
  });
});

describe("labels", () => {
  it("is labelled Ingredients", () => {
    expect(mountField().find("label").text()).toBe("Ingredients");
  });

  it("marks the specific as optional in its label", async () => {
    const wrapper = mountField();
    await pickCategory(wrapper, "onion");
    expect(wrapper.find('label[for="ingredient-specific"]').text()).toBe(
      "Specific (optional)",
    );
  });
});
