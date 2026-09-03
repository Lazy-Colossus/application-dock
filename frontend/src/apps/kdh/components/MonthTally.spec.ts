import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import MonthTally from "./MonthTally.vue";
import type { Invitee } from "@/apps/kdh/types";

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

  it("splits each person's votes into still-to-come and past", () => {
    const wrapper = mountTally({
      votes: {
        "2026-09-03": { a: "yes", b: "yes" },
        "2026-09-08": { a: "if_needed" },
        "2026-09-10": { a: "yes" },
        "2026-09-21": { a: "yes", b: "if_needed" },
      },
    });

    // Today counts as still to come, so Dani has the 10th and the 21st.
    const dani = wrapper.find('[data-testid="tally-a"]').text();
    expect(dani).toContain("2 to come");
    expect(dani).toContain("2 past");

    const jake = wrapper.find('[data-testid="tally-b"]').text();
    expect(jake).toContain("1 to come");
    expect(jake).toContain("1 past");
  });

  it("drops the half of the split that is zero", () => {
    const wrapper = mountTally({ votes: { "2026-09-21": { a: "yes" } } });
    const dani = wrapper.find('[data-testid="tally-a"]').text();

    expect(dani).toContain("1 to come");
    expect(dani).not.toContain("0 past");
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

    expect(wrapper.find('[data-testid="tally-a"]').text()).toContain(
      "1 to come",
    );
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

  it("keeps the roster's order", () => {
    const names = mountTally({ votes: { "2026-09-21": { a: "yes" } } })
      .findAll('[data-testid^="tally-"]')
      .map((r) => r.text());
    expect(names[0]).toContain("Dani");
    expect(names[2]).toContain("Kit");
  });
});
