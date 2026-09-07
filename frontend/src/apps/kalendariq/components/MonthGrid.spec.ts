import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import MonthGrid from "./MonthGrid.vue";
import type { Invitee } from "@/apps/kalendariq/types";

const STUBS = {
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></button>",
    emits: ["click"],
  },
};

const ROSTER: Invitee[] = [
  { id: "a", name: "Dani", order: 0, removed_at: null },
  { id: "b", name: "Jake", order: 1, removed_at: null },
  { id: "c", name: "Tom", order: 2, removed_at: null },
  { id: "d", name: "Ash", order: 3, removed_at: null },
  { id: "e", name: "Kit", order: 4, removed_at: null },
  { id: "f", name: "Rae", order: 5, removed_at: null },
];

function mountGrid(props: Partial<Record<string, unknown>> = {}) {
  return mount(MonthGrid, {
    props: {
      votes: {},
      chosenDates: [],
      activeTotal: 6,
      invitees: ROSTER,
      claimedId: "a",
      serverToday: "2026-09-03",
      selectable: false,
      selectMode: false,
      selected: new Set<string>(),
      ...props,
    },
    global: { stubs: STUBS },
  });
}

describe("MonthGrid", () => {
  it("opens on the month containing the server's today", () => {
    expect(mountGrid().find('[data-testid="month-label"]').text()).toBe(
      "September 2026",
    );
  });

  it("renders every day of the month and no more", () => {
    const wrapper = mountGrid();
    expect(wrapper.findAll('[data-testid^="day-2026-09-"]')).toHaveLength(30);
    expect(wrapper.find('[data-testid="day-2026-09-31"]').exists()).toBe(false);
  });

  it("puts the 1st under the right weekday, Monday first", () => {
    // 1 September 2026 is a Tuesday, so one blank precedes it.
    const cells = mountGrid().find(".kalendariq-grid").element.children;
    expect(cells[0].tagName).toBe("DIV");
    expect(cells[1].getAttribute("data-testid")).toBe("day-2026-09-01");
  });

  it("moves a month at a time", async () => {
    const wrapper = mountGrid();
    await wrapper.find('[data-testid="next-month"]').trigger("click");
    expect(wrapper.find('[data-testid="month-label"]').text()).toBe(
      "October 2026",
    );

    await wrapper.find('[data-testid="prev-month"]').trigger("click");
    await wrapper.find('[data-testid="prev-month"]').trigger("click");
    expect(wrapper.find('[data-testid="month-label"]').text()).toBe(
      "August 2026",
    );
  });

  it("crosses a year boundary in both directions", async () => {
    const wrapper = mountGrid({ serverToday: "2026-12-15" });
    await wrapper.find('[data-testid="next-month"]').trigger("click");
    expect(wrapper.find('[data-testid="month-label"]').text()).toBe(
      "January 2027",
    );

    await wrapper.find('[data-testid="prev-month"]').trigger("click");
    await wrapper.find('[data-testid="prev-month"]').trigger("click");
    expect(wrapper.find('[data-testid="month-label"]').text()).toBe(
      "November 2026",
    );
  });

  it("handles a 28-day February and a leap one", async () => {
    const feb = mountGrid({ serverToday: "2026-02-10" });
    expect(feb.findAll('[data-testid^="day-2026-02-"]')).toHaveLength(28);

    const leap = mountGrid({ serverToday: "2028-02-10" });
    expect(leap.findAll('[data-testid^="day-2028-02-"]')).toHaveLength(29);
  });

  it("offers a way back only once you have wandered off", async () => {
    const wrapper = mountGrid();
    expect(wrapper.find('[data-testid="jump-today"]').exists()).toBe(false);

    await wrapper.find('[data-testid="next-month"]').trigger("click");
    expect(wrapper.find('[data-testid="jump-today"]').exists()).toBe(true);

    await wrapper.find('[data-testid="jump-today"]').trigger("click");
    expect(wrapper.find('[data-testid="month-label"]').text()).toBe(
      "September 2026",
    );
  });

  it("keeps the month arrows still when the Today button appears", async () => {
    // The bug this pins: Today used to render BETWEEN the arrows, so the click
    // that revealed it also shoved `next-month` sideways — and the second
    // click of a two-month jump landed on whatever slid under the pointer.
    // Structure is the fix, so structure is the test: the arrow cluster holds
    // the two chevrons and the label, and nothing else can appear inside it.
    const wrapper = mountGrid();
    const nav = () =>
      wrapper.find('[data-testid="prev-month"]').element.parentElement;
    const order = () =>
      Array.from(nav()?.children ?? []).map((el) =>
        el.getAttribute("data-testid"),
      );

    expect(order()).toEqual(["prev-month", "month-label", "next-month"]);

    await wrapper.find('[data-testid="next-month"]').trigger("click");
    expect(wrapper.find('[data-testid="jump-today"]').exists()).toBe(true);

    // Same three, in the same order: Today landed outside the cluster, so
    // neither chevron moved. Where it lands is the header grid's business.
    expect(order()).toEqual(["prev-month", "month-label", "next-month"]);
    expect(nav()?.querySelector('[data-testid="jump-today"]')).toBeNull();
  });

  it("emits the date that was picked", async () => {
    const wrapper = mountGrid();
    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    expect(wrapper.emitted("pick")?.[0]).toEqual(["2026-09-14"]);
  });

  it("never emits for a past day", async () => {
    const wrapper = mountGrid();
    await wrapper.find('[data-testid="day-2026-09-01"]').trigger("click");
    expect(wrapper.emitted("pick")).toBeUndefined();
  });

  it("still dims a past day", () => {
    const wrapper = mountGrid();
    expect(wrapper.find('[data-testid="day-2026-09-01"]').classes()).toContain(
      "past",
    );
    expect(
      wrapper.find('[data-testid="day-2026-09-14"]').classes(),
    ).not.toContain("past");
  });

  it("offers a labelled way into selecting, only to someone who can answer", () => {
    expect(mountGrid().find('[data-testid="select-toggle"]').exists()).toBe(
      false,
    );

    const claimed = mountGrid({ selectable: true });
    expect(claimed.find('[data-testid="select-toggle"]').text()).toContain(
      "Select Multiple",
    );
  });

  it("hides the way in once you are already selecting", () => {
    // Leaving is the Cancel on the selection bar; two exits from one mode is
    // one too many.
    const selecting = mountGrid({ selectable: true, selectMode: true });
    expect(selecting.find('[data-testid="select-toggle"]').exists()).toBe(
      false,
    );
  });
});
