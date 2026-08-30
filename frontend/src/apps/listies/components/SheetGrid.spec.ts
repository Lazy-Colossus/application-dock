import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import SheetGrid from "./SheetGrid.vue";
import type { Tab } from "@/apps/listies/types";

const STUBS = {
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click', $event)\">{{ label }}</button>",
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
    ],
    emits: ["click"],
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

  it("renders each row's cells against the right columns", () => {
    const cells = mountGrid().find('[data-testid="row-r-1"]').findAll("td");
    expect(cells.map((c) => c.text())).toEqual(["Tent", "1", "02 Sep 26"]);
  });

  it("shows a dash where a row has no value for a column", () => {
    const cells = mountGrid().find('[data-testid="row-r-2"]').findAll("td");
    expect(cells.map((c) => c.text())).toEqual(["Stove", "—", "—"]);
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
