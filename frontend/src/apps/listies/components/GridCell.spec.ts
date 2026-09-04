import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import GridCell from "./GridCell.vue";
import { formatCell } from "@/apps/listies/coerce";
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

  it("opens a popout calendar for a date, not a text box (Story 2.7)", () => {
    const wrapper = editor("2026-09-02", "date");
    expect(wrapper.findComponent({ name: "QDate" }).exists()).toBe(true);
    expect(wrapper.find("input").exists()).toBe(false);
  });

  it("opens the picker on the stored ISO date, not the display form", () => {
    const picker = editor("2026-09-02", "date").findComponent({
      name: "QDate",
    });
    expect(picker.props("modelValue")).toBe("2026-09-02");
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

describe("GridCell — type to edit a highlighted cell (Story 2.8)", () => {
  function cell(
    value: CellValue,
    type: ColumnType,
    props: { editable?: boolean; editing?: boolean; focused?: boolean } = {},
  ) {
    return mount(GridCell, {
      props: { value, column: column(type), editable: true, ...props },
    });
  }

  it("opens the editor holding just the typed character, replacing the value", async () => {
    const wrapper = cell("Tent", "text", { editing: false });

    (wrapper.vm as unknown as { seedDraft: (c: string) => void }).seedDraft(
      "a",
    );
    await wrapper.setProps({ editing: true });

    const input = wrapper.find("input");
    expect((input.element as HTMLInputElement).value).toBe("a");
  });

  it("focuses the input so typing continues into the cell, not just the first letter", async () => {
    const wrapper = mount(GridCell, {
      props: {
        value: "Tent",
        column: column("text"),
        editable: true,
        editing: false,
      },
      attachTo: document.body,
    });

    (wrapper.vm as unknown as { seedDraft: (c: string) => void }).seedDraft(
      "a",
    );
    await wrapper.setProps({ editing: true });
    await wrapper.vm.$nextTick();

    const input = wrapper.find("input").element as HTMLInputElement;
    expect(document.activeElement).toBe(input);

    wrapper.unmount();
  });

  it("puts the caret after the typed character rather than selecting all", async () => {
    const wrapper = cell("Tent", "text", { editing: false });

    (wrapper.vm as unknown as { seedDraft: (c: string) => void }).seedDraft(
      "a",
    );
    await wrapper.setProps({ editing: true });
    await wrapper.vm.$nextTick();

    const input = wrapper.find("input").element as HTMLInputElement;
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(1);
  });

  it("seeds a number cell as validated text so a typed digit is kept", async () => {
    const wrapper = cell(12, "number", { editing: false });

    (wrapper.vm as unknown as { seedDraft: (c: string) => void }).seedDraft(
      "7",
    );
    await wrapper.setProps({ editing: true });

    expect((wrapper.find("input").element as HTMLInputElement).value).toBe("7");
  });

  it("still opens a clicked cell pre-filled with its value — click is not seeded", async () => {
    const wrapper = cell("Tent", "text", { editing: false });

    // No seedDraft: entering edit the ordinary way keeps the existing value.
    await wrapper.setProps({ editing: true });

    expect((wrapper.find("input").element as HTMLInputElement).value).toBe(
      "Tent",
    );
  });

  it("ignores a seed on a date cell — the picker opens on its own value", async () => {
    const wrapper = cell("2026-09-02", "date", { editing: false });

    (wrapper.vm as unknown as { seedDraft: (c: string) => void }).seedDraft(
      "a",
    );
    await wrapper.setProps({ editing: true });

    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.findComponent({ name: "QDate" }).props("modelValue")).toBe(
      "2026-09-02",
    );
  });
});

describe("GridCell — place cells delegate to the place editor (Story 4.3)", () => {
  const PLACE = {
    place_id: "ChIJ_blue",
    name: "Blue Bottle",
    address: "Rua Nova 12, Lisboa",
    lat: 38.71,
    lng: -9.13,
  };

  const placeColumn = {
    id: "c-1",
    name: "Where",
    type: "place" as const,
    order: 0,
  };

  const STUBS = {
    PlaceCell: {
      name: "PlaceCell",
      template: "<div />",
      props: ["value", "enabled", "near", "initialQuery"],
      emits: ["select", "clear", "cancel"],
    },
  };

  function placeCell(
    props: { value?: CellValue; editing?: boolean; mapsEnabled?: boolean } = {},
  ) {
    return mount(GridCell, {
      props: {
        value: null,
        column: placeColumn,
        editable: true,
        editing: false,
        ...props,
      },
      global: { stubs: STUBS },
    });
  }

  it("shows the place name when not editing", () => {
    expect(placeCell({ value: PLACE }).text()).toContain("Blue Bottle");
  });

  it("shows the address as a second line", () => {
    expect(placeCell({ value: PLACE }).text()).toContain("Rua Nova 12, Lisboa");
  });

  it("shows a dash for an empty place cell", () => {
    expect(placeCell().text()).toBe("—");
  });

  it("opens the place editor rather than a text input", () => {
    const wrapper = placeCell({ editing: true });

    expect(wrapper.findComponent({ name: "PlaceCell" }).exists()).toBe(true);
    expect(wrapper.find("input").exists()).toBe(false);
  });

  it("hands a typed character to the place editor as its initial query (Story 2.8)", async () => {
    const wrapper = placeCell({ editing: false });

    (wrapper.vm as unknown as { seedDraft: (c: string) => void }).seedDraft(
      "t",
    );
    await wrapper.setProps({ editing: true });

    expect(
      wrapper.findComponent({ name: "PlaceCell" }).props("initialQuery"),
    ).toBe("t");
  });

  it("opens the place editor with no seed when clicked (not typed)", () => {
    const wrapper = placeCell({ editing: true });

    expect(
      wrapper.findComponent({ name: "PlaceCell" }).props("initialQuery"),
    ).toBeNull();
  });

  it("commits the place that was chosen", async () => {
    const wrapper = placeCell({ editing: true });

    await wrapper
      .findComponent({ name: "PlaceCell" })
      .vm.$emit("select", PLACE);

    expect(wrapper.emitted("commit")).toEqual([[PLACE]]);
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("commits null when the place is cleared", async () => {
    const wrapper = placeCell({ value: PLACE, editing: true });

    await wrapper.findComponent({ name: "PlaceCell" }).vm.$emit("clear");

    expect(wrapper.emitted("commit")).toEqual([[null]]);
  });

  it("leaves edit mode on cancel without committing", async () => {
    const wrapper = placeCell({ value: PLACE, editing: true });

    await wrapper.findComponent({ name: "PlaceCell" }).vm.$emit("cancel");

    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("moving away from a place cell just leaves it — there is no text to save", async () => {
    // The grid calls commit() before moving (Story 2.3). For a place cell that
    // must be a no-op, not a validation failure that traps the cursor.
    const wrapper = placeCell({ value: PLACE, editing: true });

    (wrapper.vm as unknown as { commit: () => void }).commit();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(wrapper.classes()).not.toContain("grid-cell--invalid");
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("passes the maps state and the column bias to the editor", () => {
    const wrapper = mount(GridCell, {
      props: {
        value: null,
        column: placeColumn,
        editable: true,
        editing: true,
        mapsEnabled: true,
        near: "38.7,-9.1",
      },
      global: { stubs: STUBS },
    });

    const editor = wrapper.findComponent({ name: "PlaceCell" });
    expect(editor.props("enabled")).toBe(true);
    expect(editor.props("near")).toBe("38.7,-9.1");
  });
});

describe("GridCell — date cells pick from a popout calendar (Story 2.7)", () => {
  function dateCell(value: CellValue, props: { editing?: boolean } = {}) {
    return mount(GridCell, {
      props: {
        value,
        column: column("date"),
        editable: true,
        editing: false,
        ...props,
      },
    });
  }

  function picker(wrapper: ReturnType<typeof dateCell>) {
    return wrapper.findComponent({ name: "QDate" });
  }

  it("opens the picker when the cell enters edit mode", async () => {
    const wrapper = dateCell(null);
    expect(picker(wrapper).exists()).toBe(false);

    await wrapper.setProps({ editing: true });

    expect(picker(wrapper).exists()).toBe(true);
  });

  it("defaults an empty cell's picker to no selection, so it lands on today", () => {
    // A null model makes q-date navigate to the current month (AC 2).
    expect(picker(dateCell(null, { editing: true })).props("modelValue")).toBe(
      null,
    );
  });

  it("emits the picked ISO string as a commit, then ends the edit", async () => {
    const wrapper = dateCell(null, { editing: true });

    await picker(wrapper).vm.$emit("update:modelValue", "2026-09-02");

    expect(wrapper.emitted("commit")).toEqual([["2026-09-02"]]);
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("emits the canonical ISO shape that formatCell renders compactly", async () => {
    const wrapper = dateCell(null, { editing: true });

    await picker(wrapper).vm.$emit("update:modelValue", "2026-09-02");
    const [committed] = wrapper.emitted("commit")![0] as [CellValue];

    // Round-trips through the display formatter (AC 8).
    expect(formatCell(committed, "date")).toBe("02 Sep 26");
  });

  it("commits null when the selection is cleared", async () => {
    const wrapper = dateCell("2026-09-02", { editing: true });

    await picker(wrapper).vm.$emit("update:modelValue", null);

    expect(wrapper.emitted("commit")).toEqual([[null]]);
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("ends the edit with no commit when the menu closes without a pick", async () => {
    const wrapper = dateCell("2026-09-02", { editing: true });

    await wrapper
      .findComponent({ name: "QMenu" })
      .vm.$emit("update:modelValue", false);

    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("moving away from a date cell just leaves it — there is nothing to save", async () => {
    // The grid commits the focused cell before moving (Story 2.3); for a date
    // cell that must be a no-op, not a validation failure that traps the cursor.
    const wrapper = dateCell("2026-09-02", { editing: true });

    (wrapper.vm as unknown as { commit: () => void }).commit();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(wrapper.classes()).not.toContain("grid-cell--invalid");
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });
});

describe("GridCell — group cells pick from a dropdown (Story 4.6)", () => {
  const groupColumn = {
    id: "c-1",
    name: "Bucket",
    type: "place_group" as const,
    order: 0,
  };
  const GROUPS = [
    { id: "g-1", name: "Must see", color: "#e5484d" },
    { id: "g-2", name: "Maybe", color: "#3e63dd" },
  ];

  function groupCell(
    props: { value?: CellValue; editing?: boolean } = {},
  ) {
    return mount(GridCell, {
      props: {
        value: null,
        column: groupColumn,
        editable: true,
        editing: false,
        groups: GROUPS,
        ...props,
      },
    });
  }

  it("shows the group's name when not editing", () => {
    expect(groupCell({ value: "g-1" }).text()).toContain("Must see");
  });

  it("shows a dash for an empty group cell", () => {
    expect(groupCell().text()).toBe("—");
  });

  it("shows a dash for a dangling id — it reads as ungrouped", () => {
    expect(groupCell({ value: "g-gone" }).text()).toBe("—");
  });

  it("opens a dropdown of groups rather than a text input", () => {
    const wrapper = groupCell({ editing: true });

    expect(wrapper.find('[data-testid="group-menu"]').exists()).toBe(true);
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.find('[data-testid="group-option-g-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="group-option-g-2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="group-option-none"]').exists()).toBe(
      true,
    );
  });

  it("commits the chosen group id, then ends the edit", async () => {
    const wrapper = groupCell({ editing: true });

    await wrapper.find('[data-testid="group-option-g-2"]').trigger("click");

    expect(wrapper.emitted("commit")).toEqual([["g-2"]]);
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("commits null when None is chosen on a filled cell", async () => {
    const wrapper = groupCell({ value: "g-1", editing: true });

    await wrapper.find('[data-testid="group-option-none"]').trigger("click");

    expect(wrapper.emitted("commit")).toEqual([[null]]);
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });

  it("moving away from a group cell just leaves it — there is nothing to save", async () => {
    const wrapper = groupCell({ value: "g-1", editing: true });

    (wrapper.vm as unknown as { commit: () => void }).commit();
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("commit")).toBeUndefined();
    expect(wrapper.classes()).not.toContain("grid-cell--invalid");
    expect(wrapper.emitted("end-edit")).toHaveLength(1);
  });
});
