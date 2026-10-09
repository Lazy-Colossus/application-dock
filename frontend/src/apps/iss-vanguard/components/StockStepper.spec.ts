import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StockStepper from "./StockStepper.vue";

const props = {
  resource: "minerals",
  tier: "rare",
  count: 2,
  busy: false,
} as const;

describe("StockStepper", () => {
  it("names the cell, shows the count and emits steps", async () => {
    const wrapper = mount(StockStepper, { props });
    expect(wrapper.text()).toContain("Minerály · Vzácny");
    expect(wrapper.get("[data-testid=stepper-count]").text()).toBe("2");
    await wrapper.get("[data-testid=stepper-plus]").trigger("click");
    await wrapper.get("[data-testid=stepper-minus]").trigger("click");
    await wrapper.get("[data-testid=stepper-close]").trigger("click");
    expect(wrapper.emitted("step")).toEqual([[1], [-1]]);
    expect(wrapper.emitted("close")).toHaveLength(1);
  });

  it("disables minus at zero and both while busy", () => {
    const zero = mount(StockStepper, { props: { ...props, count: 0 } });
    expect(
      zero.get("[data-testid=stepper-minus]").attributes("disabled"),
    ).toBeDefined();
    expect(
      zero.get("[data-testid=stepper-plus]").attributes("disabled"),
    ).toBeUndefined();
    const busy = mount(StockStepper, { props: { ...props, busy: true } });
    expect(
      busy.get("[data-testid=stepper-plus]").attributes("disabled"),
    ).toBeDefined();
  });
});
