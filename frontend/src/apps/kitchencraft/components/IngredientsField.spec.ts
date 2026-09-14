import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import IngredientsField from "@/apps/kitchencraft/components/IngredientsField.vue";
import type { Ingredient } from "@/apps/kitchencraft/types";

const UNITS = ["g", "kg", "ml", "tbsp", "tsp", "clove"];
const SUGGESTIONS = ["feta", "smoked paprika"];

function mountField(modelValue: Ingredient[] = []) {
  return mount(IngredientsField, {
    props: { modelValue, suggestions: SUGGESTIONS, units: UNITS },
    attachTo: document.body,
  });
}

type Wrapper = ReturnType<typeof mountField>;

async function enter(
  wrapper: Wrapper,
  text: string,
  amount = "",
  unit = "",
): Promise<void> {
  if (amount) {
    await wrapper.find('[data-testid="ingredient-amount"]').setValue(amount);
  }
  if (unit)
    await wrapper.find('[data-testid="ingredient-unit"]').setValue(unit);
  await wrapper.find('[data-testid="ingredient-text"]').setValue(text);
  await wrapper.find('[data-testid="add-ingredient"]').trigger("click");
}

function added(wrapper: Wrapper): Ingredient[] {
  const events = wrapper.emitted("update:modelValue");
  return (events?.[events.length - 1]?.[0] ?? []) as Ingredient[];
}

describe("adding an ingredient", () => {
  it("takes an amount, a unit and a name", async () => {
    const wrapper = mountField();
    await enter(wrapper, "feta", "200", "g");
    expect(added(wrapper)).toEqual([
      { amount: "200", unit: "g", text: "feta" },
    ]);
  });

  it("accepts a name on its own — nothing else is required", async () => {
    // FR-3's rule reaches here: no optional field may block a save.
    const wrapper = mountField();
    await enter(wrapper, "garlic");
    expect(added(wrapper)).toEqual([
      { amount: null, unit: null, text: "garlic" },
    ]);
  });

  it("accepts an amount with no unit", async () => {
    const wrapper = mountField();
    await enter(wrapper, "onions", "2");
    expect(added(wrapper)).toEqual([
      { amount: "2", unit: null, text: "onions" },
    ]);
  });

  it("accepts a unit with no amount", async () => {
    const wrapper = mountField();
    await enter(wrapper, "salt", "", "pinch");
    expect(added(wrapper)).toEqual([
      { amount: null, unit: "pinch", text: "salt" },
    ]);
  });

  it("keeps an amount as free text and never parses it", async () => {
    const wrapper = mountField();
    await enter(wrapper, "onion", "1/2");
    expect(added(wrapper)[0].amount).toBe("1/2");
  });

  it("trims each part", async () => {
    const wrapper = mountField();
    await enter(wrapper, "  feta  ", "  200  ", "  g  ");
    expect(added(wrapper)).toEqual([
      { amount: "200", unit: "g", text: "feta" },
    ]);
  });

  it("stores a blank amount or unit as absent, never as an empty string", async () => {
    const wrapper = mountField();
    await enter(wrapper, "garlic", "   ", "   ");
    expect(added(wrapper)[0]).toEqual({
      amount: null,
      unit: null,
      text: "garlic",
    });
  });

  it("refuses to add without a name", async () => {
    const wrapper = mountField();
    await wrapper.find('[data-testid="ingredient-amount"]').setValue("200");
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

  it("commits on enter from any of the three fields", async () => {
    for (const field of ["amount", "unit", "text"]) {
      const wrapper = mountField();
      await wrapper.find('[data-testid="ingredient-text"]').setValue("garlic");
      await wrapper
        .find(`[data-testid="ingredient-${field}"]`)
        .trigger("keydown.enter");
      expect(added(wrapper)).toHaveLength(1);
    }
  });

  it("clears all three fields so the next one can be typed straight away", async () => {
    const wrapper = mountField();
    await enter(wrapper, "feta", "200", "g");

    for (const field of ["amount", "unit", "text"]) {
      const input = wrapper.find<HTMLInputElement>(
        `[data-testid="ingredient-${field}"]`,
      );
      expect(input.element.value).toBe("");
    }
  });

  it("appends after what is already there", async () => {
    const wrapper = mountField([{ amount: null, unit: null, text: "garlic" }]);
    await enter(wrapper, "feta", "200", "g");
    expect(added(wrapper).map((i) => i.text)).toEqual(["garlic", "feta"]);
  });
});

describe("duplicates", () => {
  it("allows the same ingredient twice with different amounts", async () => {
    // 100g butter for the pastry, 20g for the pan.
    const wrapper = mountField([{ amount: "100", unit: "g", text: "butter" }]);
    await enter(wrapper, "butter", "20", "g");
    expect(added(wrapper)).toHaveLength(2);
  });

  it("drops an exact repeat, whatever its casing", async () => {
    const wrapper = mountField([{ amount: "200", unit: "g", text: "feta" }]);
    await enter(wrapper, "Feta", "200", "g");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });
});

describe("what it shows", () => {
  it("lists ingredients one per line, in entry order", () => {
    const wrapper = mountField([
      { amount: "200", unit: "g", text: "feta" },
      { amount: null, unit: null, text: "garlic" },
    ]);
    const rows = wrapper.findAll('[data-testid="ingredient-rows"] li');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("200 g");
    expect(rows[0].text()).toContain("feta");
    expect(rows[1].text()).toContain("garlic");
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
  it("offers the shipped units through a datalist, without closing the field", () => {
    const wrapper = mountField();
    const options = wrapper
      .findAll("#kc-units option")
      .map((o) => o.attributes("value"));
    expect(options).toEqual(UNITS);
    // A datalist suggests and still accepts anything typed — which is exactly
    // "fixed list plus free text".
    expect(
      wrapper.find('[data-testid="ingredient-unit"]').attributes("list"),
    ).toBe("kc-units");
  });

  it("accepts a unit that is not in the list", async () => {
    const wrapper = mountField();
    await enter(wrapper, "lentils", "2", "fistfuls");
    expect(added(wrapper)[0].unit).toBe("fistfuls");
  });

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
