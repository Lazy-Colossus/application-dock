import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import IngredientsField from "@/apps/kitchencraft/components/IngredientsField.vue";
import type { Ingredient } from "@/apps/kitchencraft/types";

const SUGGESTIONS = ["feta", "smoked paprika"];

function mountField(modelValue: Ingredient[] = []) {
  return mount(IngredientsField, {
    props: { modelValue, suggestions: SUGGESTIONS },
    attachTo: document.body,
  });
}

type Wrapper = ReturnType<typeof mountField>;

async function enter(
  wrapper: Wrapper,
  text: string,
  amount = "",
): Promise<void> {
  if (amount) {
    await wrapper.find('[data-testid="ingredient-amount"]').setValue(amount);
  }
  await wrapper.find('[data-testid="ingredient-text"]').setValue(text);
  await wrapper.find('[data-testid="add-ingredient"]').trigger("click");
}

function added(wrapper: Wrapper): Ingredient[] {
  const events = wrapper.emitted("update:modelValue");
  return (events?.[events.length - 1]?.[0] ?? []) as Ingredient[];
}

describe("adding an ingredient", () => {
  it("takes the unit as part of the amount", async () => {
    const wrapper = mountField();
    await enter(wrapper, "feta", "200 g");
    expect(added(wrapper)).toEqual([
      { amount: "200 g", unit: null, text: "feta" },
    ]);
  });

  it("has no separate unit field", () => {
    const wrapper = mountField();
    expect(wrapper.find('[data-testid="ingredient-unit"]').exists()).toBe(
      false,
    );
    // A numeric keypad would leave no way to type the unit on a phone.
    expect(
      wrapper.find('[data-testid="ingredient-amount"]').attributes("inputmode"),
    ).toBeUndefined();
  });

  it("accepts a name on its own — nothing else is required", async () => {
    // FR-3's rule reaches here: no optional field may block a save.
    const wrapper = mountField();
    await enter(wrapper, "garlic");
    expect(added(wrapper)).toEqual([
      { amount: null, unit: null, text: "garlic" },
    ]);
  });

  it("keeps an amount as free text and never parses it", async () => {
    const wrapper = mountField();
    await enter(wrapper, "salt", "a pinch of");
    expect(added(wrapper)[0].amount).toBe("a pinch of");
  });

  it("trims each part", async () => {
    const wrapper = mountField();
    await enter(wrapper, "  feta  ", "  200 g  ");
    expect(added(wrapper)).toEqual([
      { amount: "200 g", unit: null, text: "feta" },
    ]);
  });

  it("stores a blank amount as absent, never as an empty string", async () => {
    const wrapper = mountField();
    await enter(wrapper, "garlic", "   ");
    expect(added(wrapper)[0]).toEqual({
      amount: null,
      unit: null,
      text: "garlic",
    });
  });

  it("refuses to add without a name", async () => {
    const wrapper = mountField();
    await wrapper.find('[data-testid="ingredient-amount"]').setValue("200 g");
    await wrapper.find('[data-testid="add-ingredient"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("disables the add button until there is a name", async () => {
    const wrapper = mountField();
    const button = wrapper.find('[data-testid="add-ingredient"]');
    expect(button.attributes("disabled")).toBeDefined();

    await wrapper.find('[data-testid="ingredient-text"]').setValue("garlic");
    expect(
      wrapper.find('[data-testid="add-ingredient"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("commits on enter from either field", async () => {
    for (const field of ["amount", "text"]) {
      const wrapper = mountField();
      await wrapper.find('[data-testid="ingredient-text"]').setValue("garlic");
      await wrapper
        .find(`[data-testid="ingredient-${field}"]`)
        .trigger("keydown.enter");
      expect(added(wrapper)).toHaveLength(1);
    }
  });

  it("clears both fields so the next one can be typed straight away", async () => {
    const wrapper = mountField();
    await enter(wrapper, "feta", "200 g");

    for (const field of ["amount", "text"]) {
      const input = wrapper.find<HTMLInputElement>(
        `[data-testid="ingredient-${field}"]`,
      );
      expect(input.element.value).toBe("");
    }
  });

  it("appends after what is already there", async () => {
    const wrapper = mountField([{ amount: null, unit: null, text: "garlic" }]);
    await enter(wrapper, "feta", "200 g");
    expect(added(wrapper).map((i) => i.text)).toEqual(["garlic", "feta"]);
  });
});

describe("duplicates", () => {
  it("allows the same ingredient twice with different amounts", async () => {
    // 100g butter for the pastry, 20g for the pan.
    const wrapper = mountField([
      { amount: "100 g", unit: null, text: "butter" },
    ]);
    await enter(wrapper, "butter", "20 g");
    expect(added(wrapper)).toHaveLength(2);
  });

  it("drops an exact repeat, whatever its casing", async () => {
    const wrapper = mountField([{ amount: "200 g", unit: null, text: "feta" }]);
    await enter(wrapper, "Feta", "200 G");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("treats an older entry with a separate unit as the same amount", async () => {
    const wrapper = mountField([{ amount: "200", unit: "g", text: "feta" }]);
    await enter(wrapper, "feta", "200 g");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});

describe("what it shows", () => {
  it("lists ingredients one per line, in entry order", () => {
    const wrapper = mountField([
      { amount: "200 g", unit: null, text: "feta" },
      { amount: null, unit: null, text: "garlic" },
    ]);
    const rows = wrapper.findAll('[data-testid="ingredient-rows"] li');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("200 g");
    expect(rows[0].text()).toContain("feta");
    expect(rows[1].text()).toContain("garlic");
  });

  it("still shows the unit on an ingredient saved with one", () => {
    const wrapper = mountField([{ amount: "200", unit: "g", text: "feta" }]);
    expect(wrapper.find('[data-testid="ingredient-rows"] li').text()).toContain(
      "200 g",
    );
  });

  it("shows no list at all when there are none", () => {
    expect(mountField().find('[data-testid="ingredient-rows"]').exists()).toBe(
      false,
    );
  });

  it("removes one by index, leaving the rest", async () => {
    const wrapper = mountField([
      { amount: null, unit: null, text: "garlic" },
      { amount: null, unit: null, text: "feta" },
    ]);
    await wrapper.find('[data-testid="remove-ingredient-0"]').trigger("click");
    expect(added(wrapper).map((i) => i.text)).toEqual(["feta"]);
  });
});

describe("suggestions", () => {
  it("offers the user's own previous ingredients", () => {
    const options = mountField()
      .findAll("#kc-ingredient-suggestions option")
      .map((o) => o.attributes("value"));
    expect(options).toEqual(SUGGESTIONS);
  });

  it("offers no coining ceremony — there is no shared vocabulary to protect", () => {
    const wrapper = mountField();
    expect(wrapper.text()).not.toMatch(/new category|new ingredient/i);
  });
});
