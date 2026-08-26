import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PracticeDirectionScoring from "./PracticeDirectionScoring.vue";

describe("PracticeDirectionScoring", () => {
  it("emits direction changes", async () => {
    const wrapper = mount(PracticeDirectionScoring, {
      props: { direction: "r2m", mode: "self" },
    });
    await wrapper.find('[data-testid="dir-m2r"]').trigger("click");
    expect(wrapper.emitted("update:direction")?.at(-1)).toEqual(["m2r"]);
  });

  it("disables Typed under JP→EN and enables it under EN→JP", async () => {
    const wrapper = mount(PracticeDirectionScoring, {
      props: { direction: "r2m", mode: "self" },
    });
    expect(
      wrapper.find('[data-testid="mode-typed"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.setProps({ direction: "m2r" });
    expect(
      wrapper.find('[data-testid="mode-typed"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("forces self-grade when switching to JP→EN", async () => {
    const wrapper = mount(PracticeDirectionScoring, {
      props: { direction: "m2r", mode: "typed" },
    });
    await wrapper.find('[data-testid="dir-r2m"]').trigger("click");
    expect(wrapper.emitted("update:direction")?.at(-1)).toEqual(["r2m"]);
    expect(wrapper.emitted("update:mode")?.at(-1)).toEqual(["self"]);
  });
});
