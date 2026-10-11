import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import BulkAddDialog from "./BulkAddDialog.vue";

describe("BulkAddDialog", () => {
  it("previews every line and adds only the good ones", async () => {
    const wrapper = mount(BulkAddDialog);
    expect(
      wrapper.get("[data-testid=bulk-add]").attributes("disabled"),
    ).toBeDefined();
    await wrapper
      .get("[data-testid=bulk-text]")
      .setValue(
        [
          "Sofa; rectangle; 220 x 95; grey",
          "Wardrobe; square; 200 x 60; brown",
          "",
          "Coffee table; round; 80; brown",
        ].join("\n"),
      );
    expect(wrapper.get("[data-testid=bulk-line-1]").text()).toContain("✓ OK");
    expect(wrapper.get("[data-testid=bulk-line-2]").text()).toContain(
      "unknown shape 'square'",
    );
    expect(wrapper.get("[data-testid=bulk-line-4]").text()).toContain(
      "⌀ 80 cm",
    );
    expect(wrapper.get("[data-testid=bulk-skipped]").text()).toBe(
      "1 line will be skipped",
    );
    expect(wrapper.get("[data-testid=bulk-add]").text()).toBe("Add 2 pieces");
    await wrapper.get("[data-testid=bulk-add]").trigger("click");
    const added = wrapper.emitted("add")?.[0][0] as { name: string }[];
    expect(added.map((p) => p.name)).toEqual(["Sofa", "Coffee table"]);
  });
});
