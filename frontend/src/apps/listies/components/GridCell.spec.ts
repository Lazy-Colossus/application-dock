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

describe("GridCell — editing (Story 2.2)", () => {
  function editable(value: CellValue, type: ColumnType) {
    return mount(GridCell, {
      props: { value, column: column(type), editable: true },
    });
  }

  async function startEditing(wrapper: ReturnType<typeof editable>) {
    await wrapper.trigger("click");
    return wrapper.find("input");
  }

  it("does not open an editor when the cell is not editable", async () => {
    const wrapper = mountCell("Tent", "text");
    await wrapper.trigger("click");
    expect(wrapper.find("input").exists()).toBe(false);
  });

  it("opens an editor in place, pre-filled with the current value", async () => {
    const input = await startEditing(editable("Tent", "text"));
    expect((input.element as HTMLInputElement).value).toBe("Tent");
  });

  // A native number input silently blanks anything it cannot parse, which
  // would turn a typo into a cleared cell. A text input with a numeric keypad
  // keeps the entry so we can explain what is wrong (AC 4).
  it("edits a number as validated text with a numeric keypad", async () => {
    const input = await startEditing(editable(12, "number"));
    expect(input.attributes("type")).toBe("text");
    expect(input.attributes("inputmode")).toBe("decimal");
  });

  it("uses a date input for a date column", async () => {
    const input = await startEditing(editable("2026-09-02", "date"));
    expect(input.attributes("type")).toBe("date");
  });

  it("edits a date in ISO form, not the display form", async () => {
    const input = await startEditing(editable("2026-09-02", "date"));
    expect((input.element as HTMLInputElement).value).toBe("2026-09-02");
  });

  it("commits the parsed value on blur", async () => {
    const wrapper = editable("Tent", "text");
    const input = await startEditing(wrapper);

    await input.setValue("Stove");
    await input.trigger("blur");

    expect(wrapper.emitted("commit")).toEqual([["Stove"]]);
  });

  it("commits a number as a number, not as a string", async () => {
    const wrapper = editable(1, "number");
    const input = await startEditing(wrapper);

    await input.setValue("42");
    await input.trigger("blur");

    expect(wrapper.emitted("commit")).toEqual([[42]]);
  });

  it("commits an emptied cell as null", async () => {
    const wrapper = editable("Tent", "text");
    const input = await startEditing(wrapper);

    await input.setValue("");
    await input.trigger("blur");

    expect(wrapper.emitted("commit")).toEqual([[null]]);
  });

  it("emits nothing when the value did not change", async () => {
    const wrapper = editable("Tent", "text");
    const input = await startEditing(wrapper);

    await input.trigger("blur");

    expect(wrapper.emitted("commit")).toBeUndefined();
  });

  it("refuses to commit a value that does not fit the column, and says why", async () => {
    const wrapper = editable(1, "number");
    const input = await startEditing(wrapper);

    await input.setValue("abc");
    await input.trigger("blur");

    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(wrapper.classes()).toContain("grid-cell--invalid");
    expect(wrapper.text()).toContain("Enter a number");
  });

  it("keeps the editor open while the entry is invalid", async () => {
    const wrapper = editable(1, "number");
    const input = await startEditing(wrapper);

    await input.setValue("abc");
    await input.trigger("blur");

    expect(wrapper.find("input").exists()).toBe(true);
  });

  it("reverts and closes on Escape without committing", async () => {
    const wrapper = editable("Tent", "text");
    const input = await startEditing(wrapper);

    await input.setValue("Stove");
    await input.trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.text()).toContain("Tent");
  });

  it("clears an invalid state when Escape reverts", async () => {
    const wrapper = editable(1, "number");
    const input = await startEditing(wrapper);

    await input.setValue("abc");
    await input.trigger("blur");
    await wrapper.find("input").trigger("keydown", { key: "Escape" });

    expect(wrapper.classes()).not.toContain("grid-cell--invalid");
  });

  it("commits and closes on Enter", async () => {
    const wrapper = editable("Tent", "text");
    const input = await startEditing(wrapper);

    await input.setValue("Stove");
    await input.trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("commit")).toEqual([["Stove"]]);
    expect(wrapper.find("input").exists()).toBe(false);
  });

  it("shows the new value optimistically once the parent updates it", async () => {
    const wrapper = editable("Tent", "text");
    const input = await startEditing(wrapper);
    await input.setValue("Stove");
    await input.trigger("blur");

    await wrapper.setProps({ value: "Stove" });

    expect(wrapper.text()).toBe("Stove");
  });
});
