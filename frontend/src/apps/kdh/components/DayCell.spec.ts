import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import DayCell from "./DayCell.vue";
import type { Invitee } from "@/apps/kdh/types";

const ROSTER: Invitee[] = [
  { id: "a", name: "Dani", color: "#E9A6A0", order: 0, removed_at: null },
  { id: "b", name: "Jake", color: "#A9C8E8", order: 1, removed_at: null },
  { id: "c", name: "Tom", color: "#B9DCC2", order: 2, removed_at: null },
  { id: "d", name: "Ash", color: "#EBD3A0", order: 3, removed_at: null },
  { id: "e", name: "Kit", color: "#D3B2E8", order: 4, removed_at: null },
  { id: "f", name: "Rae", color: "#A8D8D8", order: 5, removed_at: null },
];

const STUBS = {
  // Rendered inline so its contents can be inspected; in the app Quasar
  // teleports this to the body.
  "q-tooltip": { template: '<div class="tip"><slot /></div>' },
};

function mountCell(props: Partial<Record<string, unknown>> = {}) {
  return mount(DayCell, {
    global: { stubs: STUBS },
    props: {
      date: "2026-09-14",
      votes: {},
      activeTotal: 6,
      invitees: ROSTER,
      chosen: false,
      past: false,
      today: false,
      ...props,
    },
  });
}

describe("DayCell", () => {
  it("shows the day of the month and the coverage count", () => {
    const wrapper = mountCell({ votes: { a: "yes", b: "if_needed" } });
    expect(wrapper.find(".d").text()).toBe("14");
    expect(wrapper.find('[data-testid="count"]').text()).toBe("2");
  });

  it("climbs the wash as more people join", () => {
    expect(mountCell().classes()).toContain("w0");
    expect(mountCell({ votes: { a: "yes" } }).classes()).toContain("w1");
    expect(
      mountCell({ votes: { a: "yes", b: "yes", c: "yes" } }).classes(),
    ).toContain("w3");
  });

  it("reaches the top step only at full coverage", () => {
    const five = { a: "yes", b: "yes", c: "yes", d: "yes", e: "yes" };
    expect(mountCell({ votes: five }).classes()).not.toContain("w6");
    expect(mountCell({ votes: { ...five, f: "yes" } }).classes()).toContain(
      "w6",
    );
  });

  it("marks full coverage that leans on an if-needed", () => {
    const wrapper = mountCell({
      votes: {
        a: "yes",
        b: "yes",
        c: "yes",
        d: "yes",
        e: "yes",
        f: "if_needed",
      },
    });
    expect(wrapper.classes()).toContain("w6");
    expect(wrapper.classes()).toContain("provisional");
  });

  it("does not mark an all-free day", () => {
    const wrapper = mountCell({
      votes: { a: "yes", b: "yes", c: "yes", d: "yes", e: "yes", f: "yes" },
    });
    expect(wrapper.classes()).not.toContain("provisional");
  });

  it("reserves the crown slot in every cell, so the dates stay aligned", () => {
    // The slot is what keeps a crowned day's number on the same line as its
    // neighbours; without it the crown would push the date down.
    expect(mountCell().find(".crown-slot").exists()).toBe(true);
    expect(mountCell({ chosen: true }).find(".crown-slot").exists()).toBe(true);
  });

  it("shows the chosen mark as a shape, at any wash step", () => {
    for (const votes of [{}, { a: "yes" }, { a: "yes", b: "yes", c: "yes" }]) {
      expect(mountCell({ chosen: true, votes }).find(".crown").exists()).toBe(
        true,
      );
    }
    expect(mountCell().find(".crown").exists()).toBe(false);
  });

  it("wears both marks at once when the chosen day is provisional", () => {
    // The two are composed in one box-shadow; if the classes ever stop
    // co-existing, one marking silently disappears.
    const wrapper = mountCell({
      chosen: true,
      votes: {
        a: "yes",
        b: "yes",
        c: "yes",
        d: "yes",
        e: "yes",
        f: "if_needed",
      },
    });
    expect(wrapper.classes()).toContain("chosen");
    expect(wrapper.classes()).toContain("provisional");
    expect(wrapper.find(".crown").exists()).toBe(true);
  });

  it("marks the cell itself as chosen, so the date can be styled", () => {
    // The gold and the bold live on `.chosen .d`; the diamond stays as the
    // signal that does not depend on colour at all.
    expect(mountCell({ chosen: true }).classes()).toContain("chosen");
    expect(mountCell().classes()).not.toContain("chosen");
  });

  it("dims a past day but still opens it", async () => {
    // Not votable, but readable: who came to the September session is worth
    // seeing, and an admin can still mark it chosen.
    const wrapper = mountCell({ past: true, votes: { a: "yes" } });
    expect(wrapper.classes()).toContain("past");
    expect(wrapper.attributes("disabled")).toBeUndefined();

    await wrapper.trigger("click");
    expect(wrapper.emitted("pick")?.[0]).toEqual(["2026-09-14"]);
  });

  it("keeps a past day's votes and its wash", () => {
    const wrapper = mountCell({ past: true, votes: { a: "yes", b: "yes" } });
    expect(wrapper.find('[data-testid="count"]').text()).toBe("2");
    expect(wrapper.classes()).toContain("w2");
  });

  it("marks today, which is not past", async () => {
    const wrapper = mountCell({ today: true });
    expect(wrapper.classes()).toContain("today");
    expect(wrapper.attributes("disabled")).toBeUndefined();

    await wrapper.trigger("click");
    expect(wrapper.emitted("pick")?.[0]).toEqual(["2026-09-14"]);
  });

  it("speaks the day without needing the colour", () => {
    expect(mountCell().attributes("aria-label")).toBe("14, nobody free");
    expect(
      mountCell({ votes: { a: "yes", b: "yes" } }).attributes("aria-label"),
    ).toBe("14, 2 of 6 free");
    expect(
      mountCell({
        chosen: true,
        votes: { a: "yes", b: "yes", c: "yes", d: "yes", e: "yes", f: "yes" },
      }).attributes("aria-label"),
    ).toBe("14, everyone free, chosen");
    expect(
      mountCell({
        votes: {
          a: "yes",
          b: "yes",
          c: "yes",
          d: "yes",
          e: "yes",
          f: "if_needed",
        },
      }).attributes("aria-label"),
    ).toBe("14, everyone, one only if needed");
  });

  it("lists who voted, in roster order, on hover over the count", () => {
    const wrapper = mountCell({ votes: { c: "yes", a: "yes" } });
    const tip = wrapper.find(".tip");

    expect(tip.exists()).toBe(true);
    const names = wrapper.findAll(".kdh-voter").map((r) => r.text());
    expect(names[0]).toContain("Dani");
    expect(names[1]).toContain("Tom");
    expect(tip.text()).not.toContain("Jake");
  });

  it("marks an if-needed voter in the hover list without recolouring them", () => {
    const wrapper = mountCell({ votes: { a: "yes", b: "if_needed" } });
    const rows = wrapper.findAll(".kdh-voter");

    expect(rows[1].text()).toContain("if needed");
    expect(rows[1].classes()).toContain("tentative");
    expect(rows[1].find(".kdh-voter-dot").attributes("style")).toContain(
      "#A9C8E8",
    );
    expect(rows[0].classes()).not.toContain("tentative");
  });

  it("shows no hover list on a day nobody picked", () => {
    expect(mountCell().find(".tip").exists()).toBe(false);
  });

  it("still lists someone since removed, on a past day they answered", () => {
    const wrapper = mountCell({
      past: true,
      votes: { g: "yes" },
      invitees: [
        ...ROSTER,
        {
          id: "g",
          name: "Departed",
          color: "#C9B8A0",
          order: 6,
          removed_at: "2026-08-20T18:00:00Z",
        },
      ],
    });
    expect(wrapper.find(".tip").text()).toContain("Departed");
  });

  it("gives the count a target of its own to point at", () => {
    // The number alone is a ~7px-wide thing to aim at; the tooltip hangs off
    // this element, not the digits.
    const wrapper = mountCell({ votes: { a: "yes" } });
    const area = wrapper.find('[data-testid="count-area"]');

    expect(area.exists()).toBe(true);
    expect(area.find('[data-testid="count"]').text()).toBe("1");
    expect(area.find(".tip").exists()).toBe(true);
  });

  it("lists the voters at the foot of the cell, in roster order", () => {
    // Rendered at every size and hidden by CSS on a phone, where a 44px cell
    // cannot hold a name — that is what the day sheet is for.
    const wrapper = mountCell({ votes: { c: "yes", a: "yes" } });
    const names = wrapper.findAll(".cell-name").map((n) => n.text());

    expect(names).toEqual(["Dani", "Tom"]);
  });

  it("trails off past the sixth name", () => {
    const wrapper = mountCell({
      votes: { a: "yes", b: "yes", c: "yes", d: "yes", e: "yes", f: "yes" },
      invitees: [
        ...ROSTER,
        { id: "g", name: "Zoe", color: "#C9B8A0", order: 6, removed_at: null },
      ],
    });
    // Exactly six on the day: all shown, nothing trailing.
    const names = wrapper.findAll(".cell-name").map((n) => n.text());
    expect(names).toHaveLength(6);
    expect(wrapper.find(".cell-name.more").exists()).toBe(false);

    const withMore = mountCell({
      activeTotal: 7,
      votes: {
        a: "yes",
        b: "yes",
        c: "yes",
        d: "yes",
        e: "yes",
        f: "yes",
        g: "yes",
      },
      invitees: [
        ...ROSTER,
        { id: "g", name: "Zoe", color: "#C9B8A0", order: 6, removed_at: null },
      ],
    });
    const shown = withMore.findAll(".cell-name").map((n) => n.text());
    expect(shown).toHaveLength(7);
    expect(shown[6]).toBe("…");
  });

  it("colours each name as its owner, and italicises an if-needed one", () => {
    const wrapper = mountCell({ votes: { a: "yes", b: "if_needed" } });
    const names = wrapper.findAll(".cell-name");

    expect(names[0].attributes("style")).toContain("#E9A6A0");
    expect(names[1].classes()).toContain("tentative");
    // Their colour is untouched — it still means "Jake".
    expect(names[1].attributes("style")).toContain("#A9C8E8");
  });

  it("renders no name list on a day nobody picked", () => {
    expect(mountCell().find('[data-testid="cell-names"]').exists()).toBe(false);
  });
});
