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

describe("GridCell — editing (Stories 2.2, 2.3)", () => {
  // Editing is parent-controlled: the grid owns which cell is being edited so
  // the keyboard can move it (Story 2.3). The cell asks; the grid decides.
  function cell(
    value: CellValue,
    type: ColumnType,
    props: { editable?: boolean; editing?: boolean; focused?: boolean } = {},
  ) {
    return mount(GridCell, {
      props: { value, column: column(type), editable: true, ...props },
    });
  }

  function editor(value: CellValue, type: ColumnType) {
    return cell(value, type, { editing: true });
  }

  it("asks to edit when clicked", async () => {
    const wrapper = cell("Tent", "text");
    await wrapper.trigger("click");
    expect(wrapper.emitted("begin-edit")).toHaveLength(1);
  });

  it("does not ask to edit when it is not editable", async () => {
    const wrapper = cell("Tent", "text", { editable: false });
    await wrapper.trigger("click");
    expect(wrapper.emitted("begin-edit")).toBeUndefined();
  });

  it("shows an editor pre-filled with the current value", () => {
    const input = editor("Tent", "text").find("input");
    expect((input.element as HTMLInputElement).value).toBe("Tent");
  });

  // A native number input silently blanks anything it cannot parse, which
  // would turn a typo into a cleared cell. A text input with a numeric keypad
  // keeps the entry so we can explain what is wrong (AC 4).
  it("edits a number as validated text with a numeric keypad", () => {
    const input = editor(12, "number").find("input");
    expect(input.attributes("type")).toBe("text");
    expect(input.attributes("inputmode")).toBe("decimal");
  });

  it("uses the native picker for a date", () => {
    expect(editor("2026-09-02", "date").find("input").attributes("type")).toBe(
      "date",
    );
  });

  it("edits a date in ISO form, not the display form", () => {
    const input = editor("2026-09-02", "date").find("input");
    expect((input.element as HTMLInputElement).value).toBe("2026-09-02");
  });

  it("commits the parsed value on blur", async () => {
    const wrapper = editor("Tent", "text");

    await wrapper.find("input").setValue("Stove");
    await wrapper.find("input").trigger("blur");

    expect(wrapper.emitted("commit")).toEqual([["Stove"]]);
  });

  it("commits a number as a number, not as a string", async () => {
    const wrapper = editor(1, "number");

    await wrapper.find("input").setValue("42");
    await wrapper.find("input").trigger("blur");

    expect(wrapper.emitted("commit")).toEqual([[42]]);
  });

  it("commits an emptied cell as null", async () => {
    const wrapper = editor("Tent", "text");

    await wrapper.find("input").setValue("");
    await wrapper.find("input").trigger("blur");

    expect(wrapper.emitted("commit")).toEqual([[null]]);
  });

  it("emits nothing when the value did not change", async () => {
    const wrapper = editor("Tent", "text");

    await wrapper.find("input").trigger("blur");

    expect(wrapper.emitted("commit")).toBeUndefined();
  });

  it("asks to leave edit mode once a commit succeeds", async () => {
    const wrapper = editor("Tent", "text");

    await wrapper.find("input").setValue("Stove");
    await wrapper.find("input").trigger("blur");

    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("refuses to commit a value that does not fit the column, and says why", async () => {
    const wrapper = editor(1, "number");

    await wrapper.find("input").setValue("abc");
    await wrapper.find("input").trigger("blur");

    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(wrapper.classes()).toContain("grid-cell--invalid");
    expect(wrapper.text()).toContain("Enter a number");
  });

  it("stays in edit mode while the entry is invalid, so it is not lost", async () => {
    const wrapper = editor(1, "number");

    await wrapper.find("input").setValue("abc");
    await wrapper.find("input").trigger("blur");

    expect(wrapper.emitted("end-edit")).toBeUndefined();
  });

  it("reverts on Escape without committing", async () => {
    const wrapper = editor("Tent", "text");

    await wrapper.find("input").setValue("Stove");
    await wrapper.find("input").trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("clears an invalid state when Escape reverts", async () => {
    const wrapper = editor(1, "number");
    await wrapper.find("input").setValue("abc");
    await wrapper.find("input").trigger("blur");

    await wrapper.find("input").trigger("keydown", { key: "Escape" });

    expect(wrapper.classes()).not.toContain("grid-cell--invalid");
  });

  it("shows the value again once the parent closes the editor", async () => {
    const wrapper = editor("Tent", "text");

    await wrapper.setProps({ editing: false, value: "Stove" });

    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.text()).toBe("Stove");
  });

  it("marks the focused cell so it can show an accent ring", () => {
    expect(cell("Tent", "text", { focused: true }).classes()).toContain(
      "grid-cell--focused",
    );
    expect(cell("Tent", "text").classes()).not.toContain("grid-cell--focused");
  });
});
