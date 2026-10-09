import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ResourceGrid from "./ResourceGrid.vue";
import { emptyGrid } from "../resources";

describe("ResourceGrid", () => {
  it("renders 5 rows by 3 tiers with Slovak names", () => {
    const wrapper = mount(ResourceGrid, {
      props: { grid: emptyGrid(), mode: "readonly" },
    });
    expect(wrapper.findAll("tbody tr")).toHaveLength(5);
    expect(wrapper.findAll("thead th")).toHaveLength(4);
    expect(wrapper.text()).toContain("Podivná flóra");
    expect(wrapper.text()).toContain("Veľmi vzácny");
  });

  it("emits cell-tap in edit mode only", async () => {
    const edit = mount(ResourceGrid, {
      props: { grid: emptyGrid(), mode: "edit" },
    });
    await edit.get("[data-testid=cell-minerals-rare]").trigger("click");
    expect(edit.emitted("cell-tap")).toEqual([["minerals", "rare"]]);

    const ro = mount(ResourceGrid, {
      props: { grid: emptyGrid(), mode: "readonly" },
    });
    await ro.get("[data-testid=cell-minerals-rare]").trigger("click");
    expect(ro.emitted("cell-tap")).toBeUndefined();
  });

  it("shows signed, coloured values in diff mode", () => {
    const grid = emptyGrid();
    grid.minerals.rare = -3;
    grid.minerals.basic = 2;
    const wrapper = mount(ResourceGrid, { props: { grid, mode: "diff" } });
    const short = wrapper.get("[data-testid=cell-minerals-rare]");
    const spare = wrapper.get("[data-testid=cell-minerals-basic]");
    const even = wrapper.get("[data-testid=cell-minerals-very_rare]");
    expect([short.text(), spare.text(), even.text()]).toEqual([
      "-3",
      "+2",
      "0",
    ]);
    expect(short.classes()).toContain("grid__cell--short");
    expect(spare.classes()).toContain("grid__cell--spare");
    expect(even.classes()).toContain("grid__cell--even");
  });
});
