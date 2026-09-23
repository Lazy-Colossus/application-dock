import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RatingStars from "@/apps/kitchencraft/components/RatingStars.vue";

function mountStars(modelValue: number | null = null) {
  return mount(RatingStars, { props: { modelValue } });
}

function fills(wrapper: ReturnType<typeof mountStars>): string[] {
  return wrapper.findAll("svg").map((s) => s.attributes("fill") ?? "");
}

describe("setting a rating", () => {
  it("emits the star that was tapped", async () => {
    const wrapper = mountStars(null);
    await wrapper.find('[data-testid="rating-3"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[3]]);
  });

  it("emits every value from one to five", async () => {
    for (const star of [1, 2, 3, 4, 5]) {
      const wrapper = mountStars(null);
      await wrapper.find(`[data-testid="rating-${star}"]`).trigger("click");
      expect(wrapper.emitted("update:modelValue")).toEqual([[star]]);
    }
  });

  it("moves an existing rating to the newly tapped star", async () => {
    const wrapper = mountStars(2);
    await wrapper.find('[data-testid="rating-5"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[5]]);
  });
});

describe("clearing a rating", () => {
  it("clears when the star holding the value is tapped again", async () => {
    const wrapper = mountStars(3);
    await wrapper.find('[data-testid="rating-3"]').trigger("click");
    // The only way back to unrated.
    expect(wrapper.emitted("update:modelValue")).toEqual([[null]]);
  });

  it("does not clear when a different star is tapped", async () => {
    const wrapper = mountStars(3);
    await wrapper.find('[data-testid="rating-2"]').trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[2]]);
  });
});

describe("how the rating reads", () => {
  it("fills every star up to the value and outlines the rest", () => {
    expect(fills(mountStars(3))).toEqual([
      "currentColor",
      "currentColor",
      "currentColor",
      "none",
      "none",
    ]);
  });

  it("renders five outlined stars when unrated, and no count", () => {
    const wrapper = mountStars(null);
    expect(fills(wrapper)).toEqual(["none", "none", "none", "none", "none"]);
    // The absence rule: nothing stands in for the missing value (NFR-8).
    expect(wrapper.text()).toBe("");
  });

  it("fills all five at the top of the range", () => {
    expect(fills(mountStars(5))).toEqual(Array(5).fill("currentColor"));
  });

  it("changes SHAPE, not just colour", () => {
    // Filled versus outlined — legible with colour off entirely (UX-DR17).
    const strokes = mountStars(2)
      .findAll("svg")
      .map((s) => s.attributes("stroke-width"));
    expect(strokes).toEqual(["0", "0", "1.5", "1.5", "1.5"]);
  });

  it("carries the mark in ink, never in moss", () => {
    // Moss means "pressable" across the dock; a rating is status.
    expect(mountStars(4).html()).not.toMatch(/kc-chip/);
  });
});

describe("announcing the rating", () => {
  it("names the value on the group", () => {
    expect(mountStars(3).find(".kc-rating").attributes("aria-label")).toBe(
      "Rated 3 of 5",
    );
  });

  it("says so plainly when there is no rating", () => {
    expect(mountStars(null).find(".kc-rating").attributes("aria-label")).toBe(
      "Not rated",
    );
  });

  it("is a radiogroup — one value, not five toggles", () => {
    const wrapper = mountStars(3);
    expect(wrapper.find(".kc-rating").attributes("role")).toBe("radiogroup");
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(5);
  });

  it("checks only the star holding the value", () => {
    const checked = mountStars(3)
      .findAll('[role="radio"]')
      .map((r) => r.attributes("aria-checked"));
    expect(checked).toEqual(["false", "false", "true", "false", "false"]);
  });

  it("announces the clear action on the star that would clear it", () => {
    const wrapper = mountStars(3);
    expect(
      wrapper.find('[data-testid="rating-3"]').attributes("aria-label"),
    ).toBe("Clear rating");
    expect(
      wrapper.find('[data-testid="rating-4"]').attributes("aria-label"),
    ).toBe("Rate 4 of 5");
  });
});
