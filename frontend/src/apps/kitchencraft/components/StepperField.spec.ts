import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StepperField from "@/apps/kitchencraft/components/StepperField.vue";

function mountStepper(modelValue: string) {
  return mount(StepperField, {
    props: { modelValue, id: "s", testid: "servings", noun: "servings" },
  });
}

function emitted(wrapper: ReturnType<typeof mountStepper>): string[] {
  return (wrapper.emitted("update:modelValue") ?? []).map(
    (e) => e[0] as string,
  );
}

describe("stepping", () => {
  it("adds one", async () => {
    const wrapper = mountStepper("4");
    await wrapper.find('[data-testid="servings-up"]').trigger("click");
    expect(emitted(wrapper)).toEqual(["5"]);
  });

  it("takes one away", async () => {
    const wrapper = mountStepper("4");
    await wrapper.find('[data-testid="servings-down"]').trigger("click");
    expect(emitted(wrapper)).toEqual(["3"]);
  });

  it("starts at one from empty", async () => {
    const wrapper = mountStepper("");
    await wrapper.find('[data-testid="servings-up"]').trigger("click");
    expect(emitted(wrapper)).toEqual(["1"]);
  });

  it("starts at one from something that isn't a number", async () => {
    const wrapper = mountStepper("a few");
    await wrapper.find('[data-testid="servings-up"]').trigger("click");
    expect(emitted(wrapper)).toEqual(["1"]);
  });

  it("never goes below one", () => {
    const button = mountStepper("1").find('[data-testid="servings-down"]');
    expect(button.attributes("disabled")).toBeDefined();
  });

  it("has nothing to take away from while empty", () => {
    const button = mountStepper("").find('[data-testid="servings-down"]');
    expect(button.attributes("disabled")).toBeDefined();
  });
});

describe("typing", () => {
  it("passes what was typed through untouched", async () => {
    const wrapper = mountStepper("");
    await wrapper.find('[data-testid="servings"]').setValue("12");
    expect(emitted(wrapper)).toEqual(["12"]);
  });

  it("names both buttons by what they do", () => {
    const wrapper = mountStepper("2");
    expect(
      wrapper.find('[data-testid="servings-up"]').attributes("aria-label"),
    ).toBe("More servings");
    expect(
      wrapper.find('[data-testid="servings-down"]').attributes("aria-label"),
    ).toBe("Fewer servings");
  });
});
