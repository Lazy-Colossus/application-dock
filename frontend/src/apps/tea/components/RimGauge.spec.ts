import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RimGauge from "./RimGauge.vue";
import { circumferenceOf, RIM } from "../gauge";

function rim(props: Partial<InstanceType<typeof RimGauge>["$props"]> = {}) {
  return mount(RimGauge, {
    props: {
      proportion: 0.38,
      thresholdFraction: null,
      low: false,
      empty: false,
      color: "#B8832F",
      value: 38,
      caption: "of 100g",
      ...props,
    },
  });
}

describe("RimGauge", () => {
  it("shows the remaining grams", () => {
    expect(rim().get('[data-testid="rim-value"]').text()).toBe("38");
  });

  it("shows the caption", () => {
    expect(rim().get('[data-testid="rim-caption"]').text()).toBe("of 100g");
  });

  it("draws the fill to the proportion", () => {
    const C = circumferenceOf(RIM.shelf.radius);
    const fill = rim({ proportion: 0.5 }).get('[data-testid="rim-fill"]');
    expect(fill.attributes("stroke-dasharray")).toBe(`${C * 0.5} ${C - C * 0.5}`);
  });

  it("paints the fill in the class's liquor", () => {
    expect(rim({ color: "#6B8A63" }).get('[data-testid="rim-fill"]').attributes("stroke")).toBe(
      "#6B8A63",
    );
  });

  it("draws no fill at all when the amount bought is unknown", () => {
    const wrapper = rim({ proportion: null });
    expect(wrapper.find('[data-testid="rim-fill"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="rim-track"]').exists()).toBe(true);
  });

  it("omits the caption when there is nothing to compare against", () => {
    expect(rim({ proportion: null, caption: null }).find('[data-testid="rim-caption"]').exists()).toBe(
      false,
    );
  });

  it("dashes the fill when the tea is low", () => {
    const solid = rim({ low: false }).get('[data-testid="rim-fill"]').attributes("stroke-dasharray");
    const dashed = rim({ low: true }).get('[data-testid="rim-fill"]').attributes("stroke-dasharray");
    expect(dashed).not.toBe(solid);
    expect(dashed?.split(" ").length).toBeGreaterThan(2);
  });

  it("draws the threshold tick at its angle", () => {
    const tick = rim({ thresholdFraction: 0.25 }).get('[data-testid="rim-tick"]');
    expect(tick.attributes("transform")).toContain("rotate(90");
  });

  it("draws no tick when no threshold is set", () => {
    expect(rim({ thresholdFraction: null }).find('[data-testid="rim-tick"]').exists()).toBe(false);
  });

  it("marks an empty tea and draws nothing on its rim", () => {
    const wrapper = rim({ empty: true, proportion: 0, value: 0 });
    expect(wrapper.get('[data-testid="rim"]').classes()).toContain("rim--empty");
    expect(wrapper.find('[data-testid="rim-fill"]').exists()).toBe(false);
  });

  it("uses the larger geometry on a tea's page", () => {
    const wrapper = rim({ size: "page" });
    expect(wrapper.get("svg").attributes("width")).toBe(String(RIM.page.box));
  });
});
