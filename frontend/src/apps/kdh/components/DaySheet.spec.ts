import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import DaySheet from "./DaySheet.vue";
import type { Invitee } from "@/apps/kdh/types";

const ROSTER: Invitee[] = [
  { id: "inv-1", name: "Dani", color: "#E9A6A0", order: 0, removed_at: null },
  { id: "inv-2", name: "Jake", color: "#A9C8E8", order: 1, removed_at: null },
  { id: "inv-3", name: "Kit", color: "#B9DCC2", order: 2, removed_at: null },
];

const STUBS = {
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :class="$attrs.class" @click="$emit(\'click\')">{{ $attrs.label }}<slot /></button>',
    emits: ["click"],
  },
};

function mountSheet(props: Partial<Record<string, unknown>> = {}) {
  return mount(DaySheet, {
    props: {
      date: "2026-09-14",
      invitees: ROSTER,
      votes: {},
      claimedId: "inv-1",
      past: false,
      ...props,
    },
    global: { stubs: STUBS },
  });
}

describe("DaySheet", () => {
  it("names the date in full", () => {
    expect(mountSheet().find('[data-testid="sheet-date"]').text()).toContain(
      "September",
    );
  });

  it("says so plainly when nobody has picked the day", () => {
    expect(mountSheet().find('[data-testid="sheet-empty"]').exists()).toBe(
      true,
    );
  });

  it("lists only the people on the day, in roster order", () => {
    const wrapper = mountSheet({ votes: { "inv-3": "yes", "inv-1": "yes" } });
    const rows = wrapper.findAll('[data-testid^="sheet-row-"]');

    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain("Dani");
    expect(rows[1].text()).toContain("Kit");
    expect(wrapper.find('[data-testid="sheet-row-inv-2"]').exists()).toBe(
      false,
    );
  });

  it("sets an if-needed person apart by style, not by their colour", () => {
    const wrapper = mountSheet({
      votes: { "inv-1": "yes", "inv-2": "if_needed" },
    });

    const tentative = wrapper.find('[data-testid="sheet-row-inv-2"]');
    expect(tentative.classes()).toContain("tentative");
    expect(tentative.text()).toContain("if needed");
    // Their own colour is untouched — it still means "Jake".
    expect(tentative.find(".kdh-dot").attributes("style")).toContain("#A9C8E8");

    expect(
      wrapper.find('[data-testid="sheet-row-inv-1"]').classes(),
    ).not.toContain("tentative");
  });

  it("still shows someone since removed, on a day they answered", () => {
    const wrapper = mountSheet({
      past: true,
      claimedId: null,
      invitees: [
        ...ROSTER,
        {
          id: "inv-gone",
          name: "Departed",
          color: "#EBD3A0",
          order: 3,
          removed_at: "2026-08-20T18:00:00Z",
        },
      ],
      votes: { "inv-gone": "yes" },
    });

    expect(wrapper.find('[data-testid="sheet-row-inv-gone"]').text()).toContain(
      "Departed",
    );
  });

  it("marks which row is you", () => {
    const wrapper = mountSheet({ votes: { "inv-1": "yes" } });
    expect(wrapper.find('[data-testid="sheet-row-inv-1"]').text()).toContain(
      "you",
    );
  });

  it("offers the three states explicitly and shows your current answer", () => {
    const wrapper = mountSheet({ votes: { "inv-1": "if_needed" } });

    expect(wrapper.find('[data-testid="set-yes"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="set-none"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="set-if_needed"]').classes()).toContain(
      "kdh-chosen-state",
    );
  });

  it("emits the state that was picked", async () => {
    const wrapper = mountSheet();
    await wrapper.find('[data-testid="set-if_needed"]').trigger("click");
    expect(wrapper.emitted("set")?.[0]).toEqual(["if_needed"]);
  });

  it("offers no controls on a past day", () => {
    const wrapper = mountSheet({ past: true, votes: { "inv-1": "yes" } });
    expect(wrapper.find('[data-testid="set-yes"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sheet-past"]').exists()).toBe(true);
  });

  it("offers no controls to someone who has not claimed a name", () => {
    const wrapper = mountSheet({ claimedId: null });
    expect(wrapper.find('[data-testid="set-yes"]').exists()).toBe(false);
  });

  it("closes", async () => {
    const wrapper = mountSheet();
    await wrapper.find('[data-testid="sheet-close"]').trigger("click");
    expect(wrapper.emitted("close")).toBeTruthy();
  });
});
