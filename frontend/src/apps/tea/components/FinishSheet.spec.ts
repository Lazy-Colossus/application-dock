import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FinishSheet from "./FinishSheet.vue";

const sheet = (overrides: Record<string, unknown> = {}) =>
  mount(FinishSheet, {
    props: {
      teaName: "Tieguanyin",
      gramsRemaining: 42,
      leafGrams: 5,
      saving: false,
      error: null,
      ...overrides,
    },
  });

describe("FinishSheet", () => {
  it("previews the grams that will come off", () => {
    expect(sheet().get("[data-testid=finish-preview]").text()).toBe(
      "−5 g from Tieguanyin (42 g → 37 g)",
    );
  });

  it("says grams stay put when no leaf is recorded", async () => {
    const wrapper = sheet();
    await wrapper.get("[data-testid=finish-grams]").setValue("");
    expect(wrapper.get("[data-testid=finish-preview]").text()).toContain("stay as they are");
  });

  it("emits the rating and grams; tapping the chosen star again clears it", async () => {
    const wrapper = sheet();
    await wrapper.get("[data-testid=finish-star-4]").trigger("click");
    await wrapper.get("[data-testid=finish-save]").trigger("click");
    expect(wrapper.emitted("save")![0][0]).toEqual({ rating: 4, leafGrams: 5 });

    await wrapper.get("[data-testid=finish-star-4]").trigger("click");
    await wrapper.get("[data-testid=finish-save]").trigger("click");
    expect(wrapper.emitted("save")![1][0]).toEqual({ rating: null, leafGrams: 5 });
  });

  it("shows the error and disables save while saving", () => {
    const wrapper = sheet({ error: "HTTP 500", saving: true });
    expect(wrapper.get("[data-testid=finish-error]").text()).toBe("HTTP 500");
    expect(wrapper.get("[data-testid=finish-save]").attributes("disabled")).toBeDefined();
  });
});
