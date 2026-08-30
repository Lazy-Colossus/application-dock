import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import GridCell from "./GridCell.vue";
import type { CellValue, Column, ColumnType } from "@/apps/listies/types";

function column(type: ColumnType): Column {
  return { id: "c-1", name: "Col", type, order: 0 };
}

function mountCell(value: CellValue, type: ColumnType) {
  return mount(GridCell, { props: { value, column: column(type) } });
}

describe("GridCell", () => {
  it("renders text as written", () => {
    expect(mountCell("Tent", "text").text()).toBe("Tent");
  });

  it("renders a date in the compact display form", () => {
    expect(mountCell("2026-09-02", "date").text()).toBe("02 Sep 26");
  });

  it("shows a dash for an empty cell", () => {
    expect(mountCell(null, "text").text()).toBe("—");
  });

  it("marks an empty cell so it can be muted", () => {
    expect(mountCell(null, "text").classes()).toContain("grid-cell--empty");
  });

  it("does not treat zero as empty", () => {
    const wrapper = mountCell(0, "number");
    expect(wrapper.text()).toBe("0");
    expect(wrapper.classes()).not.toContain("grid-cell--empty");
  });

  it("right-aligns numbers and only numbers", () => {
    expect(mountCell(12, "number").classes()).toContain("grid-cell--number");
    expect(mountCell("12", "text").classes()).not.toContain(
      "grid-cell--number",
    );
  });
});
