import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import TabBar from "./TabBar.vue";
import type { Tab } from "@/apps/listies/types";

const STUBS = {
  "q-menu": {
    template: "<div :data-testid=\"$attrs['data-testid']\"><slot /></div>",
  },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template:
      "<div :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></div>",
    props: ["clickable", "disable"],
    emits: ["click"],
  },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "dense", "outlined", "autofocus"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
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
      "outline",
      "size",
    ],
    emits: ["click"],
  },
};

const tabs = (): Tab[] => [
  { id: "tb-2", name: "Flights", order: 1, columns: [], rows: [] },
  { id: "tb-1", name: "Packing", order: 0, columns: [], rows: [] },
];

function mountBar(activeTabId = "tb-1", list: Tab[] = tabs()) {
  return mount(TabBar, {
    props: { tabs: list, activeTabId },
    global: { stubs: STUBS },
  });
}

describe("TabBar", () => {
  it("shows a chip per tab, in tab order rather than array order", () => {
    const chips = mountBar()
      .findAll('[data-testid^="tab-chip-"]')
      .map((c) => c.attributes("data-testid"));

    expect(chips).toEqual(["tab-chip-tb-1", "tab-chip-tb-2"]);
  });

  it("names each tab", () => {
    expect(mountBar().find('[data-testid="tab-chip-tb-1"]').text()).toContain(
      "Packing",
    );
  });

  it("marks the active tab as filled and the rest as outlined", () => {
    const wrapper = mountBar("tb-2");

    expect(
      wrapper.findComponent('[data-testid="tab-chip-tb-2"]').props("outline"),
    ).toBe(false);
    expect(
      wrapper.findComponent('[data-testid="tab-chip-tb-1"]').props("outline"),
    ).toBe(true);
  });

  it("asks to switch when another tab is chosen", async () => {
    const wrapper = mountBar();

    await wrapper.find('[data-testid="tab-chip-tb-2"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([["tb-2"]]);
  });

  it("does not re-emit for the tab already showing", async () => {
    const wrapper = mountBar();

    await wrapper.find('[data-testid="tab-chip-tb-1"]').trigger("click");

    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("offers a control for adding a tab", async () => {
    const wrapper = mountBar();

    await wrapper.find('[data-testid="add-tab"]').trigger("click");

    expect(wrapper.emitted("add")).toHaveLength(1);
  });
});

describe("TabBar — rename and delete (Story 3.3)", () => {
  const three = (): Tab[] => [
    { id: "tb-1", name: "Packing", order: 0, columns: [], rows: [] },
    { id: "tb-2", name: "Flights", order: 1, columns: [], rows: [] },
  ];

  const withMenu = (list: Tab[] = three(), activeTabId = "tb-1") =>
    mount(TabBar, {
      props: { tabs: list, activeTabId },
      global: {
        stubs: { ...STUBS, "q-menu": { template: "<div><slot /></div>" } },
      },
    });

  it("offers a menu on each tab chip", () => {
    // `tab-menu-tb-` and not `tab-menu-`: the latter also matches the caret
    // button's `tab-menu-btn-*`.
    expect(withMenu().findAll('[data-testid^="tab-menu-tb-"]')).toHaveLength(2);
  });

  it("renames a tab", async () => {
    const wrapper = withMenu();

    await wrapper.find('[data-testid="tab-rename-tb-2"]').trigger("click");
    await wrapper.find('[data-testid="tab-rename-input"]').setValue("Trains");
    await wrapper.find('[data-testid="tab-rename-save"]').trigger("click");

    expect(wrapper.emitted("rename")).toEqual([
      [{ tabId: "tb-2", name: "Trains" }],
    ]);
  });

  it("cannot save a blank tab name", async () => {
    const wrapper = withMenu();
    await wrapper.find('[data-testid="tab-rename-tb-1"]').trigger("click");

    await wrapper.find('[data-testid="tab-rename-input"]').setValue("   ");

    expect(
      wrapper.find('[data-testid="tab-rename-save"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("asks for confirmation before deleting, naming the cost", async () => {
    const withRows = three();
    withRows[1]!.rows = [
      { id: "r-1", order: 0, cells: {}, created_at: "t", updated_at: "t" },
      { id: "r-2", order: 1, cells: {}, created_at: "t", updated_at: "t" },
    ];
    const wrapper = withMenu(withRows);

    await wrapper.find('[data-testid="tab-delete-tb-2"]').trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
    expect(wrapper.text()).toContain("Flights");
    expect(wrapper.text()).toContain("2");
  });

  it("deletes once confirmed", async () => {
    const wrapper = withMenu();
    await wrapper.find('[data-testid="tab-delete-tb-2"]').trigger("click");

    await wrapper.find('[data-testid="tab-delete-confirm"]').trigger("click");

    expect(wrapper.emitted("delete")).toEqual([["tb-2"]]);
  });

  it("does not offer delete when the sheet has only one tab", () => {
    const single = [three()[0]!];
    const wrapper = withMenu(single);

    expect(wrapper.find('[data-testid="tab-delete-tb-1"]').exists()).toBe(
      false,
    );
  });

  it("still offers rename for the only tab", () => {
    const wrapper = withMenu([three()[0]!]);
    expect(wrapper.find('[data-testid="tab-rename-tb-1"]').exists()).toBe(true);
  });
});

describe("TabBar — the tab menu is discoverable (UI fix 4)", () => {
  const two = (): Tab[] => [
    { id: "tb-1", name: "Packing", order: 0, columns: [], rows: [] },
    { id: "tb-2", name: "Flights", order: 1, columns: [], rows: [] },
  ];

  const bar = (list: Tab[] = two(), activeTabId = "tb-1") =>
    mount(TabBar, {
      props: { tabs: list, activeTabId },
      global: { stubs: STUBS },
    });

  it("shows a visible control that opens the menu", () => {
    const wrapper = bar();

    // Right-click is not a discoverable affordance — there must be something
    // to click.
    expect(wrapper.find('[data-testid="tab-menu-btn-tb-1"]').exists()).toBe(
      true,
    );
  });

  it("does not hide the menu behind a right-click", () => {
    const menu = bar().findComponent('[data-testid="tab-menu-tb-1"]');
    expect(menu.props("contextMenu")).toBeFalsy();
  });

  it("opening the menu does not switch tabs", async () => {
    const wrapper = bar();

    await wrapper.find('[data-testid="tab-menu-btn-tb-2"]').trigger("click");

    expect(wrapper.emitted("select")).toBeUndefined();
  });

  it("still switches tabs when the chip itself is clicked", async () => {
    const wrapper = bar();

    await wrapper.find('[data-testid="tab-chip-tb-2"]').trigger("click");

    expect(wrapper.emitted("select")).toEqual([["tb-2"]]);
  });
});

describe("TabBar — tab colour", () => {
  const coloured = (): Tab[] => [
    {
      id: "tb-1",
      name: "Packing",
      order: 0,
      color: "#ffcc00",
      columns: [],
      rows: [],
    },
    {
      id: "tb-2",
      name: "Flights",
      order: 1,
      color: null,
      columns: [],
      rows: [],
    },
  ];

  const bar = (list: Tab[] = coloured(), activeTabId = "tb-1") =>
    mount(TabBar, {
      props: { tabs: list, activeTabId },
      global: {
        stubs: { ...STUBS, "q-menu": { template: "<div><slot /></div>" } },
      },
    });

  it("tints a chip that has a colour", () => {
    const chip = bar().findComponent('[data-testid="tab-chip-tb-1"]');
    expect(chip.attributes("style")).toContain("#ffcc00");
  });

  it("leaves an uncoloured chip to the default styling", () => {
    const chip = bar().findComponent('[data-testid="tab-chip-tb-2"]');
    expect(chip.attributes("style") ?? "").not.toContain("#");
  });

  it("offers a swatch per preset colour", async () => {
    const wrapper = bar();

    await wrapper.find('[data-testid="tab-colour-tb-1"]').trigger("click");

    expect(
      wrapper.findAll('[data-testid^="tab-swatch-"]').length,
    ).toBeGreaterThan(2);
  });

  it("picks a colour", async () => {
    const wrapper = bar();
    await wrapper.find('[data-testid="tab-colour-tb-1"]').trigger("click");

    await wrapper.findAll('[data-testid^="tab-swatch-"]')[0]!.trigger("click");

    const emitted = wrapper.emitted("recolour")![0]![0] as {
      tabId: string;
      color: string | null;
    };
    expect(emitted.tabId).toBe("tb-1");
    expect(emitted.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("clears a colour", async () => {
    const wrapper = bar();
    await wrapper.find('[data-testid="tab-colour-tb-1"]').trigger("click");

    await wrapper.find('[data-testid="tab-swatch-none"]').trigger("click");

    expect(wrapper.emitted("recolour")).toEqual([
      [{ tabId: "tb-1", color: null }],
    ]);
  });
});
