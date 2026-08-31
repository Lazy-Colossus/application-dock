import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { componentAt } from "@/test-utils";

import SheetGrid from "./SheetGrid.vue";
import type { Tab } from "@/apps/listies/types";

const STUBS = {
  "q-btn": {
    // Keeps the slot: the column header menu lives inside a button.
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
    props: [
      "label",
      "disable",
      "icon",
      "flat",
      "dense",
      "round",
      "color",
      "noCaps",
      "unelevated",
      "size",
    ],
    emits: ["click"],
  },
  // Honours v-model so a closed popup really is absent from the DOM.
  "q-menu": {
    template:
      '<div v-if="modelValue !== false" :data-testid="$attrs[\'data-testid\']"><slot /></div>',
    // Typed, so a valueless attribute casts to `true` the way Quasar's own
    // boolean props do, instead of arriving as an empty string.
    props: {
      modelValue: { type: null, default: undefined },
      anchor: { type: null, default: undefined },
      self: { type: null, default: undefined },
      contextMenu: Boolean,
      noParentEvent: Boolean,
    },
    emits: ["update:modelValue"],
  },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "dense", "outlined", "autofocus", "placeholder"],
    emits: ["update:modelValue"],
  },
  "q-select": {
    template:
      '<select :data-testid="$attrs[\'data-testid\']" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option></select>',
    props: [
      "modelValue",
      "options",
      "dense",
      "outlined",
      "emitValue",
      "mapOptions",
    ],
    emits: ["update:modelValue"],
  },
  PlaceCell: {
    name: "PlaceCell",
    template: "<div />",
    props: ["value", "enabled", "near"],
    emits: ["select", "clear", "cancel"],
  },
  // The menu has its own spec; here we only care that the grid wires it up.
  ColumnHeaderMenu: {
    name: "ColumnHeaderMenu",
    template: "<div />",
    props: ["column", "rows", "canMoveLeft", "canMoveRight", "canDelete"],
    emits: ["rename", "retype", "move", "delete"],
  },
};

function tab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "tb-1",
    name: "Packing",
    order: 0,
    columns: [
      { id: "c-1", name: "Item", type: "text", order: 0 },
      { id: "c-2", name: "Qty", type: "number", order: 1 },
      { id: "c-3", name: "Due", type: "date", order: 2 },
    ],
    rows: [
      {
        id: "r-1",
        order: 0,
        cells: { "c-1": "Tent", "c-2": 1, "c-3": "2026-09-02" },
        created_at: "t",
        updated_at: "t",
      },
      {
        id: "r-2",
        order: 1,
        cells: { "c-1": "Stove" },
        created_at: "t",
        updated_at: "t",
      },
    ],
    ...overrides,
  };
}

function mountGrid(t: Tab = tab()) {
  return mount(SheetGrid, { props: { tab: t }, global: { stubs: STUBS } });
}

describe("SheetGrid", () => {
  it("renders a header per column, in column order", () => {
    const headers = mountGrid()
      .findAll('[data-testid^="header-name-"]')
      .map((h) => h.text());

    expect(headers).toEqual(["Item", "Qty", "Due"]);
  });

  it("orders headers by the column order field, not array position", () => {
    const shuffled = tab({
      columns: [
        { id: "c-2", name: "Qty", type: "number", order: 1 },
        { id: "c-1", name: "Item", type: "text", order: 0 },
      ],
      rows: [],
    });

    const headers = mountGrid(shuffled)
      .findAll('[data-testid^="header-name-"]')
      .map((h) => h.text());

    expect(headers).toEqual(["Item", "Qty"]);
  });

  it("shows a type glyph in each header", () => {
    expect(mountGrid().find('[data-testid="header-c-2"]').text()).toContain(
      "#",
    );
  });

  it("renders one row per row, in row order", () => {
    const rows = mountGrid().findAll('[data-testid^="row-"]');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.attributes("data-testid")).toBe("row-r-1");
    expect(rows[1]!.attributes("data-testid")).toBe("row-r-2");
  });

  it("orders rows by the order field, not array position", () => {
    const shuffled = tab({
      rows: [
        { id: "r-b", order: 1, cells: {}, created_at: "t", updated_at: "t" },
        { id: "r-a", order: 0, cells: {}, created_at: "t", updated_at: "t" },
      ],
    });

    const rows = mountGrid(shuffled).findAll('[data-testid^="row-"]');

    expect(rows.map((r) => r.attributes("data-testid"))).toEqual([
      "row-r-a",
      "row-r-b",
    ]);
  });

  // Scoped to GridCell: a row also carries a trailing actions cell (Story 2.4).
  const dataCells = (w: ReturnType<typeof mountGrid>, rowTestId: string) =>
    w
      .find(`[data-testid="${rowTestId}"]`)
      .findAllComponents({ name: "GridCell" })
      .map((c: { text: () => string }) => c.text());

  it("renders each row's cells against the right columns", () => {
    expect(dataCells(mountGrid(), "row-r-1")).toEqual([
      "Tent",
      "1",
      "02 Sep 26",
    ]);
  });

  it("shows a dash where a row has no value for a column", () => {
    expect(dataCells(mountGrid(), "row-r-2")).toEqual(["Stove", "—", "—"]);
  });

  it("stripes alternate rows", () => {
    const rows = mountGrid().findAll('[data-testid^="row-"]');
    expect(rows[0]!.classes()).not.toContain("sheet-grid__row--striped");
    expect(rows[1]!.classes()).toContain("sheet-grid__row--striped");
  });

  it("offers an add-row control", async () => {
    const wrapper = mountGrid();

    await wrapper.find('[data-testid="add-row"]').trigger("click");

    expect(wrapper.emitted("add-row")).toHaveLength(1);
  });

  it("shows an inviting empty state, with headers still visible, when there are no rows", () => {
    const wrapper = mountGrid(tab({ rows: [] }));

    expect(wrapper.find('[data-testid="grid-empty"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid^="header-name-"]')).toHaveLength(3);
  });
});

describe("SheetGrid — editing (Story 2.2)", () => {
  it("makes its cells editable", () => {
    const cell = mountGrid().findComponent({ name: "GridCell" });
    expect(cell.props("editable")).toBe(true);
  });

  it("reports which row and column a commit belongs to", async () => {
    const wrapper = mountGrid();

    await wrapper
      .find('[data-testid="row-r-1"]')
      .findAllComponents({ name: "GridCell" })[1]!
      .vm.$emit("commit", 4);

    expect(wrapper.emitted("commit-cell")).toEqual([
      [{ rowId: "r-1", columnId: "c-2", value: 4 }],
    ]);
  });
});

describe("SheetGrid — keyboard and the ghost row (Story 2.3)", () => {
  const cellsOf = (w: ReturnType<typeof mountGrid>, rowTestId: string) =>
    w
      .find(`[data-testid="${rowTestId}"]`)
      .findAllComponents({ name: "GridCell" });

  async function focusAndEdit(
    wrapper: ReturnType<typeof mountGrid>,
    rowTestId: string,
    columnIndex: number,
  ) {
    const cell = cellsOf(wrapper, rowTestId)[columnIndex]!;
    await cell.trigger("click");
    return cell;
  }

  it("always renders one trailing ghost row after the real rows", () => {
    expect(mountGrid().findAll('[data-testid="ghost-row"]')).toHaveLength(1);
  });

  it("keeps exactly one ghost row when the tab is empty", () => {
    expect(
      mountGrid(tab({ rows: [] })).findAll('[data-testid="ghost-row"]'),
    ).toHaveLength(1);
  });

  it("opens the editor on the clicked cell", async () => {
    const wrapper = mountGrid();

    const cell = await focusAndEdit(wrapper, "row-r-1", 0);

    expect(cell.props("editing")).toBe(true);
    expect(cell.props("focused")).toBe(true);
  });

  it("moves right on Tab", async () => {
    const wrapper = mountGrid();
    await focusAndEdit(wrapper, "row-r-1", 0);

    await wrapper
      .find('[data-testid="grid-body"]')
      .trigger("keydown", { key: "Tab" });

    expect(cellsOf(wrapper, "row-r-1")[1]!.props("focused")).toBe(true);
  });

  it("wraps from the last column onto the next row on Tab", async () => {
    const wrapper = mountGrid();
    await focusAndEdit(wrapper, "row-r-1", 2);

    await wrapper
      .find('[data-testid="grid-body"]')
      .trigger("keydown", { key: "Tab" });

    expect(cellsOf(wrapper, "row-r-2")[0]!.props("focused")).toBe(true);
  });

  it("wraps backwards on Shift-Tab", async () => {
    const wrapper = mountGrid();
    await focusAndEdit(wrapper, "row-r-2", 0);

    await wrapper
      .find('[data-testid="grid-body"]')
      .trigger("keydown", { key: "Tab", shiftKey: true });

    expect(cellsOf(wrapper, "row-r-1")[2]!.props("focused")).toBe(true);
  });

  it("moves down on Enter, staying in the same column", async () => {
    const wrapper = mountGrid();
    await focusAndEdit(wrapper, "row-r-1", 1);

    await wrapper
      .find('[data-testid="grid-body"]')
      .trigger("keydown", { key: "Enter" });

    expect(cellsOf(wrapper, "row-r-2")[1]!.props("focused")).toBe(true);
  });

  it("reaches the ghost row from the last real row", async () => {
    const wrapper = mountGrid();
    await focusAndEdit(wrapper, "row-r-2", 0);

    await wrapper
      .find('[data-testid="grid-body"]')
      .trigger("keydown", { key: "Enter" });

    expect(cellsOf(wrapper, "ghost-row")[0]!.props("focused")).toBe(true);
  });

  it("moves between cells with the arrow keys when not editing", async () => {
    const wrapper = mountGrid();
    await focusAndEdit(wrapper, "row-r-1", 0);
    await wrapper
      .find('[data-testid="grid-body"]')
      .trigger("keydown", { key: "Escape" });

    await wrapper
      .find('[data-testid="grid-body"]')
      .trigger("keydown", { key: "ArrowRight" });

    expect(cellsOf(wrapper, "row-r-1")[1]!.props("focused")).toBe(true);
  });

  it("does not move on arrow keys while editing — they belong to the text", async () => {
    const wrapper = mountGrid();
    await focusAndEdit(wrapper, "row-r-1", 0);

    await wrapper
      .find('[data-testid="grid-body"]')
      .trigger("keydown", { key: "ArrowRight" });

    expect(cellsOf(wrapper, "row-r-1")[0]!.props("focused")).toBe(true);
  });

  it("leaves edit mode but keeps focus on Escape", async () => {
    const wrapper = mountGrid();
    const cell = await focusAndEdit(wrapper, "row-r-1", 0);

    await cell.vm.$emit("end-edit");

    expect(cellsOf(wrapper, "row-r-1")[0]!.props("editing")).toBe(false);
    expect(cellsOf(wrapper, "row-r-1")[0]!.props("focused")).toBe(true);
  });

  it("creates a real row when a ghost cell is committed", async () => {
    const wrapper = mountGrid();

    await cellsOf(wrapper, "ghost-row")[1]!.vm.$emit("commit", 4);

    expect(wrapper.emitted("add-row")).toEqual([[{ "c-2": 4 }]]);
    expect(wrapper.emitted("commit-cell")).toBeUndefined();
  });

  it("creates nothing when the ghost row is only passed through", async () => {
    const wrapper = mountGrid();
    await focusAndEdit(wrapper, "ghost-row", 0);

    await wrapper
      .find('[data-testid="grid-body"]')
      .trigger("keydown", { key: "Tab" });

    expect(wrapper.emitted("add-row")).toBeUndefined();
  });

  it("does not create a second row while the first is still in flight", async () => {
    const wrapper = mountGrid();

    await cellsOf(wrapper, "ghost-row")[0]!.vm.$emit("commit", "Mat");
    await cellsOf(wrapper, "ghost-row")[1]!.vm.$emit("commit", 9);

    expect(wrapper.emitted("add-row")).toHaveLength(1);
  });

  it("accepts a new ghost entry once the row has arrived", async () => {
    const wrapper = mountGrid();
    await cellsOf(wrapper, "ghost-row")[0]!.vm.$emit("commit", "Mat");

    const grown = tab();
    grown.rows = [
      ...grown.rows,
      {
        id: "r-3",
        order: 2,
        cells: { "c-1": "Mat" },
        created_at: "t",
        updated_at: "t",
      },
    ];
    await wrapper.setProps({ tab: grown });

    await cellsOf(wrapper, "ghost-row")[0]!.vm.$emit("commit", "Pillow");

    expect(wrapper.emitted("add-row")).toHaveLength(2);
  });
});

describe("SheetGrid — deleting a row (Story 2.4)", () => {
  it("offers a delete control on each real row but not on the ghost row", () => {
    const wrapper = mountGrid();

    expect(wrapper.find('[data-testid="delete-row-r-1"]').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="ghost-row"]').find("button").exists(),
    ).toBe(false);
  });

  it("asks for confirmation before deleting anything", async () => {
    const wrapper = mountGrid();

    await wrapper.find('[data-testid="delete-row-r-1"]').trigger("click");

    expect(wrapper.emitted("delete-row")).toBeUndefined();
    expect(
      wrapper.find('[data-testid="delete-row-confirm-r-1"]').exists(),
    ).toBe(true);
  });

  it("deletes once confirmed", async () => {
    const wrapper = mountGrid();
    await wrapper.find('[data-testid="delete-row-r-1"]').trigger("click");

    await wrapper
      .find('[data-testid="delete-row-confirm-r-1"]')
      .trigger("click");

    expect(wrapper.emitted("delete-row")).toEqual([["r-1"]]);
  });

  it("emits nothing when the confirmation is dismissed", async () => {
    const wrapper = mountGrid();
    await wrapper.find('[data-testid="delete-row-r-1"]').trigger("click");

    await wrapper
      .find('[data-testid="delete-row-cancel-r-1"]')
      .trigger("click");

    expect(wrapper.emitted("delete-row")).toBeUndefined();
    expect(
      wrapper.find('[data-testid="delete-row-confirm-r-1"]').exists(),
    ).toBe(false);
  });

  it("only ever confirms one row at a time", async () => {
    const wrapper = mountGrid();
    await wrapper.find('[data-testid="delete-row-r-1"]').trigger("click");

    await wrapper.find('[data-testid="delete-row-r-2"]').trigger("click");

    expect(
      wrapper.find('[data-testid="delete-row-confirm-r-1"]').exists(),
    ).toBe(false);
    expect(
      wrapper.find('[data-testid="delete-row-confirm-r-2"]').exists(),
    ).toBe(true);
  });

  it("keeps focus inside the grid after the deleted row disappears", async () => {
    const wrapper = mountGrid();
    // Focus the last real row, then let it vanish.
    await wrapper
      .find('[data-testid="row-r-2"]')
      .findAllComponents({ name: "GridCell" })[0]!
      .trigger("click");

    const shrunk = tab();
    shrunk.rows = [shrunk.rows[0]!];
    await wrapper.setProps({ tab: shrunk });

    const focused = wrapper
      .findAllComponents({ name: "GridCell" })
      .filter((c) => c.props("focused"));
    expect(focused).toHaveLength(1);
  });
});

describe("SheetGrid — column management (Story 2.5)", () => {
  it("puts a menu on every column header", () => {
    const wrapper = mountGrid();
    expect(
      wrapper.findAllComponents({ name: "ColumnHeaderMenu" }),
    ).toHaveLength(3);
  });

  it("tells each menu whether the column can move", () => {
    const menus = mountGrid().findAllComponents({ name: "ColumnHeaderMenu" });

    expect(menus[0]!.props("canMoveLeft")).toBe(false);
    expect(menus[0]!.props("canMoveRight")).toBe(true);
    expect(menus[2]!.props("canMoveRight")).toBe(false);
  });

  it("does not allow deleting the only column", () => {
    const single = tab({
      columns: [{ id: "c-1", name: "Item", type: "text", order: 0 }],
      rows: [],
    });

    expect(
      mountGrid(single)
        .findComponent({ name: "ColumnHeaderMenu" })
        .props("canDelete"),
    ).toBe(false);
  });

  it("forwards each column action with the column it belongs to", async () => {
    const wrapper = mountGrid();
    const menu = wrapper.findAllComponents({ name: "ColumnHeaderMenu" })[1]!;

    await menu.vm.$emit("rename", "Amount");
    await menu.vm.$emit("retype", "text");
    await menu.vm.$emit("move", 1);
    await menu.vm.$emit("delete");

    expect(wrapper.emitted("rename-column")).toEqual([
      [{ columnId: "c-2", name: "Amount" }],
    ]);
    expect(wrapper.emitted("retype-column")).toEqual([
      [{ columnId: "c-2", type: "text" }],
    ]);
    expect(wrapper.emitted("move-column")).toEqual([
      [{ columnId: "c-2", delta: 1 }],
    ]);
    expect(wrapper.emitted("delete-column")).toEqual([["c-2"]]);
  });

  it("adds a column from the header row", async () => {
    const wrapper = mountGrid();

    await wrapper.find('[data-testid="add-column"]').trigger("click");
    await wrapper.find('[data-testid="add-column-name"]').setValue("Notes");
    await wrapper.find('[data-testid="add-column-save"]').trigger("click");

    expect(wrapper.emitted("add-column")).toEqual([
      [{ name: "Notes", type: "text" }],
    ]);
  });

  it("will not add a column with a blank name", async () => {
    const wrapper = mountGrid();
    await wrapper.find('[data-testid="add-column"]').trigger("click");

    await wrapper.find('[data-testid="add-column-name"]').setValue("   ");
    await wrapper.find('[data-testid="add-column-save"]').trigger("click");

    expect(wrapper.emitted("add-column")).toBeUndefined();
  });
});

describe("SheetGrid — sorting (Story 2.6)", () => {
  const sortable = () =>
    tab({
      rows: [
        {
          id: "r-1",
          order: 0,
          cells: { "c-1": "Tent" },
          created_at: "t",
          updated_at: "t",
        },
        {
          id: "r-2",
          order: 1,
          cells: { "c-1": "Mat" },
          created_at: "t",
          updated_at: "t",
        },
        {
          id: "r-3",
          order: 2,
          cells: { "c-1": "Stove" },
          created_at: "t",
          updated_at: "t",
        },
      ],
    });

  const rowOrder = (w: ReturnType<typeof mountGrid>) =>
    w.findAll('[data-testid^="row-"]').map((r) => r.attributes("data-testid"));

  const clickHeader = (w: ReturnType<typeof mountGrid>, columnId: string) =>
    w.find(`[data-testid="header-name-${columnId}"]`).trigger("click");

  it("renders in stored order until a sort is asked for", () => {
    expect(rowOrder(mountGrid(sortable()))).toEqual([
      "row-r-1",
      "row-r-2",
      "row-r-3",
    ]);
  });

  it("sorts ascending on the first header click", async () => {
    const wrapper = mountGrid(sortable());

    await clickHeader(wrapper, "c-1");

    expect(rowOrder(wrapper)).toEqual(["row-r-2", "row-r-3", "row-r-1"]);
  });

  it("sorts descending on the second click", async () => {
    const wrapper = mountGrid(sortable());

    await clickHeader(wrapper, "c-1");
    await clickHeader(wrapper, "c-1");

    expect(rowOrder(wrapper)).toEqual(["row-r-1", "row-r-3", "row-r-2"]);
  });

  it("returns to stored order on the third click", async () => {
    const wrapper = mountGrid(sortable());

    await clickHeader(wrapper, "c-1");
    await clickHeader(wrapper, "c-1");
    await clickHeader(wrapper, "c-1");

    expect(rowOrder(wrapper)).toEqual(["row-r-1", "row-r-2", "row-r-3"]);
  });

  it("shows which way the sorted column is facing", async () => {
    const wrapper = mountGrid(sortable());

    await clickHeader(wrapper, "c-1");

    expect(wrapper.find('[data-testid="sort-indicator-c-1"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="sort-indicator-c-2"]').exists()).toBe(
      false,
    );
  });

  it("sorts by only one column at a time", async () => {
    const wrapper = mountGrid(sortable());
    await clickHeader(wrapper, "c-1");

    await clickHeader(wrapper, "c-2");

    expect(wrapper.find('[data-testid="sort-indicator-c-1"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="sort-indicator-c-2"]').exists()).toBe(
      true,
    );
  });

  it("does not reorder while a cell is edited — the row must not jump", async () => {
    const wrapper = mountGrid(sortable());
    await clickHeader(wrapper, "c-1");

    const edited = sortable();
    edited.rows[1]!.cells["c-1"] = "Zebra";
    await wrapper.setProps({ tab: edited });

    expect(rowOrder(wrapper)).toEqual(["row-r-2", "row-r-3", "row-r-1"]);
  });

  it("appends a new row at the end of the sorted view", async () => {
    const wrapper = mountGrid(sortable());
    await clickHeader(wrapper, "c-1");

    const grown = sortable();
    grown.rows.push({
      id: "r-4",
      order: 3,
      cells: { "c-1": "Axe" },
      created_at: "t",
      updated_at: "t",
    });
    await wrapper.setProps({ tab: grown });

    expect(rowOrder(wrapper)).toEqual([
      "row-r-2",
      "row-r-3",
      "row-r-1",
      "row-r-4",
    ]);
  });

  it("drops a deleted row from the view without re-sorting the rest", async () => {
    const wrapper = mountGrid(sortable());
    await clickHeader(wrapper, "c-1");

    const shrunk = sortable();
    shrunk.rows = shrunk.rows.filter((r) => r.id !== "r-3");
    shrunk.rows[0]!.cells["c-1"] = "Aaa";
    await wrapper.setProps({ tab: shrunk });

    expect(rowOrder(wrapper)).toEqual(["row-r-2", "row-r-1"]);
  });

  it("clears the sort when the tab changes", async () => {
    const wrapper = mountGrid(sortable());
    await clickHeader(wrapper, "c-1");

    const other = sortable();
    other.id = "tb-2";
    await wrapper.setProps({ tab: other });

    expect(wrapper.find('[data-testid="sort-indicator-c-1"]').exists()).toBe(
      false,
    );
    expect(rowOrder(wrapper)).toEqual(["row-r-1", "row-r-2", "row-r-3"]);
  });

  it("never writes anything when sorting", async () => {
    const wrapper = mountGrid(sortable());

    await clickHeader(wrapper, "c-1");

    expect(wrapper.emitted("commit-cell")).toBeUndefined();
    expect(wrapper.emitted("move-column")).toBeUndefined();
  });
});

describe("SheetGrid — layout and column width (UI fixes 1 and 3)", () => {
  it("fills the space it is given rather than capping itself", () => {
    const wrapper = mountGrid();

    // The page owns the height now; a self-imposed cap would leave a gap under
    // the grid and float the tab bar in the middle of the screen.
    expect(wrapper.find(".sheet-grid").classes()).toContain("sheet-grid--fill");
    expect(wrapper.find(".sheet-grid__scroll").exists()).toBe(true);
  });

  it("opens the add-column form in a popup, not in the header cell", async () => {
    const wrapper = mountGrid();
    expect(wrapper.find('[data-testid="add-column-menu"]').exists()).toBe(
      false,
    );

    await wrapper.find('[data-testid="add-column"]').trigger("click");

    // The form lives in a menu so it has room regardless of column widths.
    const menu = wrapper.find('[data-testid="add-column-menu"]');
    expect(menu.exists()).toBe(true);
    expect(menu.find('[data-testid="add-column-name"]').exists()).toBe(true);
  });

  it("still refuses a blank column name from the popup", async () => {
    const wrapper = mountGrid();
    await wrapper.find('[data-testid="add-column"]').trigger("click");

    await wrapper.find('[data-testid="add-column-name"]').setValue("  ");
    await wrapper.find('[data-testid="add-column-save"]').trigger("click");

    expect(wrapper.emitted("add-column")).toBeUndefined();
  });
});

describe("SheetGrid — the ready row follows you down (UI fix 2)", () => {
  const cellsOfRow = (w: ReturnType<typeof mountGrid>, testId: string) =>
    w.find(`[data-testid="${testId}"]`).findAllComponents({ name: "GridCell" });

  it("moves onto the new empty row once a ghost entry becomes real", async () => {
    const wrapper = mountGrid();
    // Focus the ghost row's first cell and type into it.
    await cellsOfRow(wrapper, "ghost-row")[0]!.trigger("click");
    await cellsOfRow(wrapper, "ghost-row")[0]!.vm.$emit("commit", "Mat");

    const grown = tab();
    grown.rows = [
      ...grown.rows,
      {
        id: "r-3",
        order: 2,
        cells: { "c-1": "Mat" },
        created_at: "t",
        updated_at: "t",
      },
    ];
    await wrapper.setProps({ tab: grown });

    // The row that was the ghost is now real; focus should be on the fresh
    // ghost beneath it, ready for the next entry.
    expect(cellsOfRow(wrapper, "ghost-row")[0]!.props("focused")).toBe(true);
    expect(cellsOfRow(wrapper, "row-r-3")[0]!.props("focused")).toBe(false);
  });

  it("keeps the same column when it follows down", async () => {
    const wrapper = mountGrid();
    await cellsOfRow(wrapper, "ghost-row")[1]!.trigger("click");
    await cellsOfRow(wrapper, "ghost-row")[1]!.vm.$emit("commit", 4);

    const grown = tab();
    grown.rows = [
      ...grown.rows,
      {
        id: "r-3",
        order: 2,
        cells: { "c-2": 4 },
        created_at: "t",
        updated_at: "t",
      },
    ];
    await wrapper.setProps({ tab: grown });

    expect(cellsOfRow(wrapper, "ghost-row")[1]!.props("focused")).toBe(true);
  });

  it("does not move focus when a row arrives from somewhere else", async () => {
    const wrapper = mountGrid();
    await cellsOfRow(wrapper, "row-r-1")[0]!.trigger("click");

    const grown = tab();
    grown.rows = [
      ...grown.rows,
      { id: "r-3", order: 2, cells: {}, created_at: "t", updated_at: "t" },
    ];
    await wrapper.setProps({ tab: grown });

    expect(cellsOfRow(wrapper, "row-r-1")[0]!.props("focused")).toBe(true);
  });
});

describe("SheetGrid — the add-column popup actually opens", () => {
  it("does not let Quasar toggle the menu behind our back", async () => {
    // A QMenu nested in a QBtn attaches its own click handler to that button.
    // With `v-model` as well, the two fight: our handler opens it, Quasar's
    // toggle immediately closes it, and the button appears dead.
    const wrapper = mountGrid();
    await wrapper.find('[data-testid="add-column"]').trigger("click");

    const menu = componentAt(wrapper, '[data-testid="add-column-menu"]');
    expect(menu.props("noParentEvent")).toBe(true);
  });
});

describe("SheetGrid — place cells (Story 4.3)", () => {
  const placeTab = () =>
    tab({
      columns: [
        { id: "c-1", name: "Cafe", type: "text", order: 0 },
        { id: "c-2", name: "Where", type: "place", order: 1 },
      ],
      rows: [
        { id: "r-1", order: 0, cells: {}, created_at: "t", updated_at: "t" },
      ],
    });

  const mountPlaceGrid = (props: Record<string, unknown> = {}) =>
    mount(SheetGrid, {
      props: { tab: placeTab(), ...props },
      global: { stubs: STUBS },
    });

  it("tells place cells whether maps are configured", () => {
    const cells = mountPlaceGrid({ mapsEnabled: true }).findAllComponents({
      name: "GridCell",
    });

    expect(cells.some((c) => c.props("mapsEnabled") === true)).toBe(true);
  });

  it("biases each place cell to the places already in its own column", () => {
    const wrapper = mountPlaceGrid({ placeCentroid: () => "38.7,-9.1" });

    const placeCells = wrapper
      .findAllComponents({ name: "GridCell" })
      .filter((c) => (c.props("column") as { type: string }).type === "place");

    expect(placeCells[0]!.props("near")).toBe("38.7,-9.1");
  });

  it("gives a text cell no bias — it has nothing to do with places", () => {
    const wrapper = mountPlaceGrid({ placeCentroid: () => "38.7,-9.1" });

    const textCell = wrapper
      .findAllComponents({ name: "GridCell" })
      .find((c) => (c.props("column") as { type: string }).type === "text");

    expect(textCell!.props("near")).toBeNull();
  });
});
