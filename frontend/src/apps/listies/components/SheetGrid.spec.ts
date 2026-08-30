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
