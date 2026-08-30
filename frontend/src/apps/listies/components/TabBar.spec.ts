import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import TabBar from "./TabBar.vue";
import type { Tab } from "@/apps/listies/types";

const STUBS = {
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
