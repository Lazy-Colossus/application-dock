import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import MonthTally from "./MonthTally.vue";
import type { Invitee } from "@/apps/kalendariq/types";

const ROSTER: Invitee[] = [
  { id: "a", name: "Dani", order: 0, removed_at: null },
  { id: "b", name: "Jake", order: 1, removed_at: null },
  { id: "c", name: "Kit", order: 2, removed_at: null },
];

// Today is the 10th, so the 3rd is past and the 10th is still to come.
const SEPTEMBER = Array.from(
  { length: 30 },
  (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`,
);
const AUGUST = Array.from(
  { length: 31 },
  (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`,
);

function mountTally(props: Partial<Record<string, unknown>> = {}) {
  return mount(MonthTally, {
    props: {
      invitees: ROSTER,
      votes: {},
      dates: SEPTEMBER,
      serverToday: "2026-09-10",
      claimedId: "a",
      monthLabel: "September 2026",
      ...props,
    },
  });
}

describe("MonthTally", () => {
  it("names the month it is counting", () => {
    expect(mountTally().text()).toContain("September 2026");
  });

  it("says so plainly when the month is untouched", () => {
    expect(mountTally().find('[data-testid="tally-empty"]').exists()).toBe(
      true,
    );
  });

  it("leads with the total, and says how much of it is already past", () => {
    const wrapper = mountTally({
      votes: {
        "2026-09-03": { a: "yes", b: "yes" },
        "2026-09-08": { a: "if_needed" },
        "2026-09-10": { a: "yes" },
        "2026-09-21": { a: "yes", b: "if_needed" },
      },
    });

    // Today counts as current, so Dani's 10th and 21st are not in the bracket.
    const dani = wrapper.find('[data-testid="tally-a"]');
    expect(dani.find(".total").text()).toBe("4");
    expect(dani.find(".split").text()).toBe("(2 past)");

    const jake = wrapper.find('[data-testid="tally-b"]');
    expect(jake.find(".total").text()).toBe("2");
    expect(jake.find(".split").text()).toBe("(1 past)");
  });

  it("says nothing in brackets when none of it is past", () => {
    const ahead = mountTally({ votes: { "2026-09-21": { a: "yes" } } });
    const row = ahead.find('[data-testid="tally-a"]');

    expect(row.find(".total").text()).toBe("1");
    expect(row.find(".split").exists()).toBe(false);
  });

  it("drops the bracket entirely outside the current month", () => {
    // A month gone by is all past and a month ahead is none of it, so the
    // bracket would only ever restate the total or say nothing.
    const wrapper = mountTally({
      dates: AUGUST,
      monthLabel: "August 2026",
      votes: { "2026-08-04": { a: "yes" }, "2026-08-19": { a: "yes" } },
    });

    const row = wrapper.find('[data-testid="tally-a"]');
    expect(row.find(".total").text()).toBe("2");
    expect(row.find(".split").exists()).toBe(false);
  });

  it("draws each row against the busiest person", () => {
    const wrapper = mountTally({
      votes: {
        "2026-09-03": { a: "yes", b: "yes" },
        "2026-09-21": { a: "yes" },
        "2026-09-22": { a: "yes" },
      },
    });

    // Dani has 3 of a possible 3, so she fills the track and leaves no gap.
    const dani = wrapper.findAll('[data-testid="tally-a"] .seg');
    expect(dani.map((seg) => seg.attributes("style"))).toEqual([
      "flex-grow: 2;", // current
      "flex-grow: 1;", // past
      "flex-grow: 0;", // unfilled
    ]);

    // Jake has 1, so two thirds of his track is empty.
    const jake = wrapper.findAll('[data-testid="tally-b"] .seg');
    expect(jake.map((seg) => seg.attributes("style"))).toEqual([
      "flex-grow: 0;",
      "flex-grow: 1;",
      "flex-grow: 2;",
    ]);
  });

  it("gives someone who has said nothing an empty track, not a missing one", () => {
    const wrapper = mountTally({ votes: { "2026-09-21": { a: "yes" } } });
    expect(wrapper.find('[data-testid="tally-c"] .bar').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="tally-c"] .gap').attributes("style"),
    ).toBe("flex-grow: 1;");
  });

  it("surfaces the person who has said nothing", () => {
    const wrapper = mountTally({ votes: { "2026-09-21": { a: "yes" } } });
    const kit = wrapper.find('[data-testid="tally-c"]');

    expect(kit.text()).toContain("nothing yet");
    expect(kit.classes()).toContain("silent");
  });

  it("counts only the month on screen", () => {
    const wrapper = mountTally({
      votes: {
        "2026-08-30": { a: "yes" },
        "2026-10-02": { a: "yes" },
        "2026-09-21": { a: "yes" },
      },
    });

    expect(wrapper.find('[data-testid="tally-a"] .total').text()).toBe("1");
    expect(wrapper.find('[data-testid="tally-a"]').text()).not.toContain(
      "past",
    );
  });

  it("marks which row is you", () => {
    const wrapper = mountTally({ votes: { "2026-09-21": { a: "yes" } } });
    expect(wrapper.find('[data-testid="tally-a"]').text()).toContain("YOU");
    expect(wrapper.find('[data-testid="tally-b"]').text()).not.toContain("YOU");
  });

  it("lists someone who has left only where they voted this month", () => {
    const gone: Invitee = {
      id: "d",
      name: "Departed",
      order: 3,
      removed_at: "2026-08-20T18:00:00Z",
    };

    const silent = mountTally({
      invitees: [...ROSTER, gone],
      votes: { "2026-09-21": { a: "yes" } },
    });
    expect(silent.find('[data-testid="tally-d"]').exists()).toBe(false);

    const voted = mountTally({
      invitees: [...ROSTER, gone],
      votes: { "2026-09-03": { d: "yes" } },
    });
    const row = voted.find('[data-testid="tally-d"]');
    expect(row.text()).toContain("Departed");
    expect(row.text()).toContain("LEFT");
    expect(row.text()).toContain("1 past");
  });

  it("puts the busiest first and the silent last", () => {
    const rows = mountTally({
      votes: {
        "2026-09-03": { b: "yes", c: "yes" },
        "2026-09-21": { b: "yes" },
        "2026-09-22": { b: "yes" },
      },
    })
      .findAll('[data-testid^="tally-"]')
      .map((r) => r.text());

    expect(rows[0]).toContain("Jake"); // 3
    expect(rows[1]).toContain("Kit"); // 1
    expect(rows[2]).toContain("Dani"); // nothing
  });

  it("breaks a tie on roster order, so equal counts never shuffle", () => {
    const rows = mountTally({ votes: { "2026-09-21": { c: "yes", a: "yes" } } })
      .findAll('[data-testid^="tally-"]')
      .map((r) => r.text());

    expect(rows[0]).toContain("Dani"); // order 0
    expect(rows[1]).toContain("Kit"); // order 2, same count
  });

  it("puts every row in one shared grid, so the bars start at the same x", () => {
    // Layout is not computed here, so the structure is the assertion: when each
    // row was its own grid, a longer "11 (1 past)" sized that row's own columns
    // and pulled its bar out of line with the row above.
    const wrapper = mountTally({
      votes: { "2026-09-21": { a: "yes" }, "2026-09-03": { b: "yes" } },
    });

    const grids = wrapper.findAll(".rows");
    expect(grids).toHaveLength(1);
    expect(grids[0].findAll('[data-testid^="tally-"]')).toHaveLength(3);
  });
});
