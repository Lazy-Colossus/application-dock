import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StarRating from "./StarRating.vue";

describe("StarRating", () => {
  it("sets a rating, and clears it when the same star is tapped again", async () => {
    const wrapper = mount(StarRating, {
      props: { modelValue: 3, label: "Smoothness", testid: "s" },
    });
    expect(wrapper.findAll(".stars__star--on")).toHaveLength(3);
    await wrapper.get("[data-testid=s-4]").trigger("click");
    expect(wrapper.emitted("update:modelValue")![0]).toEqual([4]);
    await wrapper.get("[data-testid=s-3]").trigger("click");
    expect(wrapper.emitted("update:modelValue")![1]).toEqual([null]);
  });

  it("names each star for a screen reader", () => {
    const wrapper = mount(StarRating, { props: { modelValue: null, label: "Throat", testid: "t" } });
    expect(wrapper.get("[data-testid=t-2]").attributes("aria-label")).toBe("2 of 5");
    expect(wrapper.get("[role=group]").attributes("aria-label")).toBe("Throat");
  });
});
