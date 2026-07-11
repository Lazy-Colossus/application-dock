import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FamiliarityIcon from "./FamiliarityIcon.vue";

describe("FamiliarityIcon", () => {
  it("carries the tier name as an aria-label (colour is never the sole signal)", () => {
    const wrapper = mount(FamiliarityIcon, { props: { tier: 0 } });
    const icon = wrapper.find('[data-testid="familiarity-icon"]');
    expect(icon.attributes("aria-label")).toBe("New");
    // Label is not shown by default — the glyph + aria-label carry the tier.
    expect(icon.find(".fam__label").exists()).toBe(false);
  });

  it("maps each tier to its label", () => {
    const labels = ["New", "Learning", "Familiar", "Strong", "Mastered"];
    labels.forEach((label, tier) => {
      const wrapper = mount(FamiliarityIcon, { props: { tier } });
      expect(
        wrapper
          .find('[data-testid="familiarity-icon"]')
          .attributes("aria-label"),
      ).toBe(label);
    });
  });

  it("applies the per-tier modifier class (colour + fill fraction)", () => {
    const wrapper = mount(FamiliarityIcon, { props: { tier: 3 } });
    expect(
      wrapper.find('[data-testid="familiarity-icon"]').classes(),
    ).toContain("fam--3");
  });

  it("shows the visible label when showLabel is set", () => {
    const wrapper = mount(FamiliarityIcon, {
      props: { tier: 2, showLabel: true },
    });
    expect(wrapper.find(".fam__label").text()).toBe("Familiar");
  });

  it("clamps an out-of-range tier to a valid one", () => {
    const high = mount(FamiliarityIcon, { props: { tier: 9 } });
    expect(
      high.find('[data-testid="familiarity-icon"]').attributes("aria-label"),
    ).toBe("Mastered");
    const low = mount(FamiliarityIcon, { props: { tier: -1 } });
    expect(
      low.find('[data-testid="familiarity-icon"]').attributes("aria-label"),
    ).toBe("New");
  });
});
