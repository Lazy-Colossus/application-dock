import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import GradeButtons from "./GradeButtons.vue";

describe("GradeButtons", () => {
  it("emits the matching grade for each button", async () => {
    const wrapper = mount(GradeButtons);
    await wrapper.find('[data-testid="grade-incorrect"]').trigger("click");
    await wrapper.find('[data-testid="grade-close"]').trigger("click");
    await wrapper.find('[data-testid="grade-correct"]').trigger("click");
    expect(wrapper.emitted("grade")).toEqual([
      ["incorrect"],
      ["close"],
      ["correct"],
    ]);
  });
});
