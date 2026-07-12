import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FireflyLayer from "./FireflyLayer.vue";

describe("FireflyLayer", () => {
  it("renders a decorative layer of fireflies", () => {
    const wrapper = mount(FireflyLayer);
    const layer = wrapper.find('[data-testid="firefly-layer"]');
    expect(layer.exists()).toBe(true);
    // Decorative — hidden from the accessibility tree.
    expect(layer.attributes("aria-hidden")).toBe("true");
    expect(wrapper.findAll(".firefly").length).toBeGreaterThan(0);
  });

  it("gives each firefly its own randomised drift/pulse variables", () => {
    const wrapper = mount(FireflyLayer);
    const style = wrapper.find(".firefly").attributes("style") ?? "";
    expect(style).toContain("--dur");
    expect(style).toContain("--dx");
    expect(style).toContain("--pulse");
  });
});
