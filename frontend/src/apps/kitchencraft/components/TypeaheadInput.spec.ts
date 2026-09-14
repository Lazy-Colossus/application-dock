import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TypeaheadInput from "@/apps/kitchencraft/components/TypeaheadInput.vue";

const CATEGORIES = ["chicken", "chickpeas", "cheese", "onion", "harissa"];

function mountField(
  props: Partial<InstanceType<typeof TypeaheadInput>["$props"]> = {},
) {
  return mount(TypeaheadInput, {
    props: {
      label: "Ingredients",
      inputId: "ingredients",
      suggestions: CATEGORIES,
      ...props,
    },
    attachTo: document.body,
  });
}

async function type(wrapper: ReturnType<typeof mountField>, value: string) {
  const input = wrapper.find('[data-testid="ingredients-input"]');
  await input.trigger("focus");
  await input.setValue(value);
  return input;
}

function optionText(wrapper: ReturnType<typeof mountField>): string[] {
  return wrapper
    .findAll('[data-testid="ingredients-option"]')
    .map((o) => o.text());
}

describe("suggesting from its own namespace", () => {
  it("offers the namespace on focus with nothing typed, up to the cap", async () => {
    const wrapper = mountField();
    await wrapper.find('[data-testid="ingredients-input"]').trigger("focus");
    // Five values, under the preview cap, so all of them show.
    expect(optionText(wrapper)).toEqual(CATEGORIES);
  });

  it("matches on any part of the value, case-insensitively", async () => {
    const wrapper = mountField();
    await type(wrapper, "chi");
    // The spine's own example: `chi` offers chicken AND chickpeas.
    expect(optionText(wrapper)).toEqual(["chicken", "chickpeas"]);
  });

  it("matches a substring in the middle of a value", async () => {
    const wrapper = mountField();
    await type(wrapper, "eas");
    expect(optionText(wrapper)).toEqual(["chickpeas"]);
  });

  it("matches regardless of the typed casing", async () => {
    const wrapper = mountField();
    await type(wrapper, "CHEE");
    expect(optionText(wrapper)).toEqual(["cheese"]);
  });

  it("offers only what it was given — a tag can never appear here", async () => {
    // The namespace wall is the prop: the Tags field passes a different list and
    // the two share nothing else (FR-8).
    const wrapper = mountField({ suggestions: ["batch cooking"] });
    await type(wrapper, "chi");
    expect(optionText(wrapper)).toEqual([]);
  });

  it("stops offering values already chosen", async () => {
    const wrapper = mountField({ exclude: ["chicken"] });
    await type(wrapper, "chi");
    expect(optionText(wrapper)).toEqual(["chickpeas"]);
  });

  it("shows no panel at all before the field is focused", () => {
    const wrapper = mountField();
    expect(wrapper.find(".kc-typeahead__panel").exists()).toBe(false);
  });
});

describe("the new-category row", () => {
  it("is not offered at all when coining is off (Tags)", async () => {
    const wrapper = mountField({ allowCoin: false });
    await type(wrapper, "harissaX");
    expect(wrapper.find('[data-testid="ingredients-coin"]').exists()).toBe(
      false,
    );
  });

  it("is offered for a value that matches nothing (Ingredients)", async () => {
    const wrapper = mountField({ allowCoin: true });
    await type(wrapper, "sumac");
    const coin = wrapper.find('[data-testid="ingredients-coin"]');
    expect(coin.exists()).toBe(true);
    expect(coin.text()).toBe('Add "sumac" — new category');
  });

  it("is NOT offered when the typed value already names a category", async () => {
    // There is nothing to coin.
    const wrapper = mountField({ allowCoin: true });
    await type(wrapper, "harissa");
    expect(wrapper.find('[data-testid="ingredients-coin"]').exists()).toBe(
      false,
    );
  });

  it("is not offered for a value differing only in casing", async () => {
    const wrapper = mountField({ allowCoin: true });
    await type(wrapper, "Harissa");
    expect(wrapper.find('[data-testid="ingredients-coin"]').exists()).toBe(
      false,
    );
  });

  it("ranks below every existing match", async () => {
    const wrapper = mountField({ allowCoin: true });
    await type(wrapper, "chi");
    const rows = wrapper.findAll(".kc-typeahead__row");
    expect(rows.map((r) => r.text())).toEqual([
      "chicken",
      "chickpeas",
      'Add "chi" — new category',
    ]);
  });

  it("is distinct by rule and icon, not by colour alone", async () => {
    // Position, rule, icon and wording — so it survives any contrast setting.
    const wrapper = mountField({ allowCoin: true });
    await type(wrapper, "sumac");
    const coin = wrapper.find('[data-testid="ingredients-coin"]');
    expect(coin.classes()).toContain("kc-new-category");
    expect(coin.find("svg").exists()).toBe(true);
  });

  it("reports the commit as new, so the parent can widen the vocabulary", async () => {
    const wrapper = mountField({ allowCoin: true });
    await type(wrapper, "sumac");
    await wrapper.find('[data-testid="ingredients-coin"]').trigger("mousedown");
    expect(wrapper.emitted("commit")).toEqual([["sumac", true]]);
  });

  it("is not gated behind a confirmation", async () => {
    const wrapper = mountField({ allowCoin: true });
    await type(wrapper, "sumac");
    await wrapper.find('[data-testid="ingredients-coin"]').trigger("mousedown");
    // One action: the commit lands straight away.
    expect(wrapper.emitted("commit")).toHaveLength(1);
  });
});

describe("committing", () => {
  it("commits an existing value as not-new", async () => {
    const wrapper = mountField({ allowCoin: true });
    await type(wrapper, "chi");
    await wrapper
      .findAll('[data-testid="ingredients-option"]')[0]
      .trigger("mousedown");
    expect(wrapper.emitted("commit")).toEqual([["chicken", false]]);
  });

  it("clears the query and keeps focus so a run can be typed", async () => {
    const wrapper = mountField();
    const input = await type(wrapper, "chi");
    await wrapper
      .findAll('[data-testid="ingredients-option"]')[0]
      .trigger("mousedown");
    expect((input.element as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(input.element);
  });

  it("resolves Enter on a fully-typed name to the existing casing", async () => {
    const wrapper = mountField({ allowCoin: true });
    const input = await type(wrapper, "HARISSA");
    await input.trigger("keydown", { key: "Enter" });
    // Never coins a duplicate under a different casing.
    expect(wrapper.emitted("commit")).toEqual([["harissa", false]]);
  });

  it("commits a genuinely new tag straight off Enter", async () => {
    // A free tag needs no ceremony (allowCoin is off for Tags).
    const wrapper = mountField({ allowCoin: false });
    const input = await type(wrapper, "weeknight");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("commit")).toEqual([["weeknight", false]]);
  });

  it("takes the coin row on Enter for an unmatched ingredient", async () => {
    const wrapper = mountField({ allowCoin: true });
    const input = await type(wrapper, "sumac");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("commit")).toEqual([["sumac", true]]);
  });

  it("does nothing on Enter with an empty query", async () => {
    const wrapper = mountField();
    const input = await type(wrapper, "   ");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("commit")).toBeUndefined();
  });
});

describe("keyboard navigation", () => {
  it("highlights with the arrow keys and commits the highlighted row", async () => {
    const wrapper = mountField();
    const input = await type(wrapper, "chi");
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("commit")).toEqual([["chickpeas", false]]);
  });

  it("reaches the last row with one press of Up", async () => {
    // With coining on, that last row is the new-category row at the foot.
    const wrapper = mountField({ allowCoin: true });
    const input = await type(wrapper, "chi");
    await input.trigger("keydown", { key: "ArrowUp" });
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("commit")).toEqual([["chi", true]]);
  });

  it("wraps around the end of the list", async () => {
    const wrapper = mountField();
    const input = await type(wrapper, "chi");
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "ArrowDown" });
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("commit")).toEqual([["chicken", false]]);
  });

  it("rings the highlighted row rather than filling it", async () => {
    // A fill would read as *selected* when it is only *highlighted*.
    const wrapper = mountField();
    const input = await type(wrapper, "chi");
    await input.trigger("keydown", { key: "ArrowDown" });
    const highlighted = wrapper.find(".kc-typeahead__row--highlight");
    expect(highlighted.text()).toBe("chicken");
    expect(highlighted.classes()).not.toContain("kc-chip--on");
    expect(highlighted.attributes("aria-selected")).toBe("true");
  });

  it("closes on escape", async () => {
    const wrapper = mountField();
    const input = await type(wrapper, "chi");
    await input.trigger("keydown", { key: "Escape" });
    expect(wrapper.find(".kc-typeahead__panel").exists()).toBe(false);
  });
});

describe("labels and roles", () => {
  it("has a real label, never a placeholder standing in for one", () => {
    const wrapper = mountField();
    expect(wrapper.find("label").attributes("for")).toBe("ingredients");
    expect(wrapper.find("input").attributes("placeholder")).toBeUndefined();
  });

  it("announces itself as a combobox with a list", async () => {
    const wrapper = mountField();
    const input = wrapper.find("input");
    expect(input.attributes("role")).toBe("combobox");
    expect(input.attributes("aria-expanded")).toBe("false");
    await input.trigger("focus");
    expect(wrapper.find("input").attributes("aria-expanded")).toBe("true");
  });

  it("shows no spinner — the namespace is already loaded", async () => {
    const wrapper = mountField();
    await type(wrapper, "chi");
    expect(wrapper.html()).not.toMatch(/spinner|loading/i);
  });
});

describe("opening onto a preview, not the whole vocabulary", () => {
  // Longer than the six-row preview cap, so the cap is observable.
  const MANY = [
    "alpha",
    "bravo",
    "charlie",
    "delta",
    "echo",
    "foxtrot",
    "golf",
    "hotel",
    "india",
  ];

  it("caps the untouched field at six suggestions", async () => {
    const wrapper = mountField({ suggestions: MANY });
    await wrapper.find('[data-testid="ingredients-input"]').trigger("focus");
    expect(optionText(wrapper)).toEqual(MANY.slice(0, 6));
  });

  it("says how many more a search would reach", async () => {
    const wrapper = mountField({ suggestions: MANY });
    await wrapper.find('[data-testid="ingredients-input"]').trigger("focus");
    expect(wrapper.find('[data-testid="ingredients-hint"]').text()).toBe(
      "Type to search 3 more",
    );
  });

  it("lifts the cap on the first typed character", async () => {
    const wrapper = mountField({ suggestions: MANY });
    // Matches every value, so only the cap could hold the list to six.
    await type(wrapper, "o");
    expect(optionText(wrapper)).toEqual(MANY.filter((v) => v.includes("o")));
    expect(wrapper.find('[data-testid="ingredients-hint"]').exists()).toBe(
      false,
    );
  });

  it("offers no hint when the whole namespace already fits", async () => {
    const wrapper = mountField();
    await wrapper.find('[data-testid="ingredients-input"]').trigger("focus");
    expect(wrapper.find('[data-testid="ingredients-hint"]').exists()).toBe(
      false,
    );
  });

  it("counts only what it would actually offer, excluding taken values", async () => {
    const wrapper = mountField({
      suggestions: MANY,
      exclude: ["alpha", "bravo"],
    });
    await wrapper.find('[data-testid="ingredients-input"]').trigger("focus");
    // Seven available, six shown, so one is held back.
    expect(wrapper.find('[data-testid="ingredients-hint"]').text()).toBe(
      "Type to search 1 more",
    );
  });
});

describe("the add button", () => {
  it("commits the typed value, like Enter", async () => {
    const wrapper = mountField();
    await type(wrapper, "cheese");
    await wrapper.find('[data-testid="ingredients-add"]').trigger("click");
    expect(wrapper.emitted("commit")?.[0]).toEqual(["cheese", false]);
  });

  it("coins through the same explicit path Enter uses", async () => {
    const wrapper = mountField({ allowCoin: true });
    await type(wrapper, "sumac");
    await wrapper.find('[data-testid="ingredients-add"]').trigger("click");
    expect(wrapper.emitted("commit")?.[0]).toEqual(["sumac", true]);
  });

  it("is disabled with nothing typed, so it can never commit an empty value", async () => {
    const wrapper = mountField();
    await wrapper.find('[data-testid="ingredients-input"]').trigger("focus");
    const add = wrapper.find('[data-testid="ingredients-add"]');
    expect(add.attributes("disabled")).toBeDefined();
    await add.trigger("click");
    expect(wrapper.emitted("commit")).toBeUndefined();
  });

  it("clears the field so a run can be typed without re-tapping", async () => {
    const wrapper = mountField();
    await type(wrapper, "onion");
    await wrapper.find('[data-testid="ingredients-add"]').trigger("click");
    const input = wrapper.find<HTMLInputElement>(
      '[data-testid="ingredients-input"]',
    );
    expect(input.element.value).toBe("");
  });
});

describe("closing the panel without choosing", () => {
  it("closes when focus leaves the field", async () => {
    const wrapper = mountField();
    const input = wrapper.find('[data-testid="ingredients-input"]');
    await input.trigger("focus");
    expect(optionText(wrapper).length).toBeGreaterThan(0);

    await input.trigger("blur");
    expect(optionText(wrapper)).toEqual([]);
    // Leaving is not choosing.
    expect(wrapper.emitted("commit")).toBeUndefined();
  });

  it("closes on escape and keeps what was typed", async () => {
    const wrapper = mountField();
    const input = await type(wrapper, "chi");
    await input.trigger("keydown.esc");

    expect(optionText(wrapper)).toEqual([]);
    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(
      wrapper.find<HTMLInputElement>('[data-testid="ingredients-input"]')
        .element.value,
    ).toBe("chi");
  });

  it("reopens on focus after being dismissed", async () => {
    const wrapper = mountField();
    const input = wrapper.find('[data-testid="ingredients-input"]');
    await input.trigger("focus");
    await input.trigger("blur");
    await input.trigger("focus");
    expect(optionText(wrapper).length).toBeGreaterThan(0);
  });
});
