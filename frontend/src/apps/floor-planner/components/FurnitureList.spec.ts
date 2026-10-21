import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import FurnitureList from "./FurnitureList.vue";
import type { Furniture } from "../types";

const sofa: Furniture = {
  id: "f_1",
  name: "Sofa",
  colour: "grey",
  note: "",
  shape: "rectangle",
  width_cm: 220,
  depth_cm: 95,
  cells: null,
};
const table: Furniture = {
  ...sofa,
  id: "f_2",
  name: "Table",
  shape: "round",
  width_cm: 80,
  depth_cm: 80,
};

describe("FurnitureList", () => {
  it("lists pieces with their sizes and marks the selected one", () => {
    const wrapper = mount(FurnitureList, {
      props: { pieces: [sofa, table], selectedId: "f_2" },
    });
    expect(wrapper.text()).toContain("Furniture · 2");
    expect(wrapper.get("[data-testid=piece-f_1]").text()).toContain(
      "220 × 95 cm",
    );
    expect(wrapper.get("[data-testid=piece-f_2]").text()).toContain("⌀ 80 cm");
    expect(
      wrapper.get("[data-testid=piece-f_2]").attributes("aria-pressed"),
    ).toBe("true");
  });

  it("emits select and add", async () => {
    const wrapper = mount(FurnitureList, {
      props: { pieces: [sofa], selectedId: null },
    });
    await wrapper.get("[data-testid=piece-f_1]").trigger("click");
    await wrapper.get("[data-testid=piece-add]").trigger("click");
    expect(wrapper.emitted("select")?.[0]).toEqual(["f_1"]);
    expect(wrapper.emitted("add")).toHaveLength(1);
  });

  it("explains the empty state", () => {
    const wrapper = mount(FurnitureList, {
      props: { pieces: [], selectedId: null },
    });
    expect(wrapper.text()).toContain("Nothing yet");
  });

  it("emits a move when a row is dropped on another", async () => {
    const wrapper = mount(FurnitureList, {
      props: { pieces: [sofa, table], selectedId: null },
    });
    await wrapper.get("[data-testid=piece-row-f_2]").trigger("dragstart");
    await wrapper.get("[data-testid=piece-row-f_1]").trigger("dragover");
    expect(wrapper.get("[data-testid=piece-row-f_1]").classes()).toContain(
      "furniture-list__item--before",
    );
    await wrapper.get("[data-testid=piece-row-f_1]").trigger("drop");
    expect(wrapper.emitted("move")).toEqual([["f_2", "f_1", false]]);
  });

  it("ignores drags that didn't start in the list", async () => {
    const wrapper = mount(FurnitureList, {
      props: { pieces: [sofa, table], selectedId: null },
    });
    await wrapper.get("[data-testid=piece-row-f_1]").trigger("dragover");
    await wrapper.get("[data-testid=piece-row-f_1]").trigger("drop");
    expect(wrapper.emitted("move")).toBeUndefined();
  });
});
