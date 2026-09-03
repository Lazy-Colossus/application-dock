import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import DayCell from "./DayCell.vue";
import type { Invitee } from "@/apps/kdh/types";

const ROSTER: Invitee[] = [
  { id: "a", name: "Dani", order: 0, removed_at: null },
  { id: "b", name: "Jake", order: 1, removed_at: null },
  { id: "c", name: "Tom", order: 2, removed_at: null },
  { id: "d", name: "Ash", order: 3, removed_at: null },
  { id: "e", name: "Kit", order: 4, removed_at: null },
  { id: "f", name: "Rae", order: 5, removed_at: null },
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
      selected: false,
      claimedId: "inv-1",
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

  it("dims a past day and does not open it", () => {
    const wrapper = mountCell({ past: true, votes: { a: "yes" } });
    expect(wrapper.classes()).toContain("past");

    wrapper.trigger("click");
    expect(wrapper.emitted("pick")).toBeUndefined();
  });

  it("leaves a past day hoverable, so who was there can still be read", () => {
    // Deliberately NOT `disabled`: that suppresses pointer events on a
    // button's children, and would take the hover list with it.
    const wrapper = mountCell({ past: true, votes: { a: "yes", b: "yes" } });

    expect(wrapper.attributes("disabled")).toBeUndefined();
    expect(wrapper.find(".tip").exists()).toBe(true);
    expect(wrapper.find(".tip").text()).toContain("Dani");
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

  it("marks an if-needed voter in the hover list by style alone", () => {
    const wrapper = mountCell({ votes: { a: "yes", b: "if_needed" } });
    const rows = wrapper.findAll(".kdh-voter");

    expect(rows[1].text()).toContain("Jake");
    expect(rows[1].text()).toContain("if needed");
    expect(rows[1].classes()).toContain("tentative");
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

  it("lists the voters on one line at the foot of the cell, in roster order", () => {
    // Rendered at every size and hidden by CSS on a phone, where a 44px cell
    // cannot hold a name — that is what the day sheet is for.
    const wrapper = mountCell({ votes: { c: "yes", a: "yes" } });
    expect(wrapper.find('[data-testid="cell-names"]').text()).toBe("Dani, Tom");
  });

  it("trails off past the sixth name", () => {
    const seven = [
      ...ROSTER,
      { id: "g", name: "Zoe", order: 6, removed_at: null },
    ];

    const exactlySix = mountCell({
      votes: { a: "yes", b: "yes", c: "yes", d: "yes", e: "yes", f: "yes" },
      invitees: seven,
    });
    expect(exactlySix.find('[data-testid="cell-names"]').text()).toBe(
      "Dani, Jake, Tom, Ash, Kit, Rae",
    );

    const allSeven = mountCell({
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
      invitees: seven,
    });
    expect(allSeven.find('[data-testid="cell-names"]').text()).toBe(
      "Dani, Jake, Tom, Ash, Kit, Rae…",
    );
  });

  it("marks an if-needed voter by style, and gives nobody a colour", () => {
    const wrapper = mountCell({ votes: { a: "yes", b: "if_needed" } });
    const names = wrapper.find('[data-testid="cell-names"]');

    expect(names.text()).toBe("Dani, Jake");
    expect(names.findAll(".tentative").map((n) => n.text())).toEqual(["Jake"]);
    // No per-name colour on this line: six colours in a row is a smear, and the
    // colour still does its work in the sheet and the hover list.
    expect(names.html()).not.toContain("#A9C8E8");
  });

  it("renders no name list on a day nobody picked", () => {
    expect(mountCell().find('[data-testid="cell-names"]').exists()).toBe(false);
  });

  it("shows you your own answer, in the corner reserved for it", () => {
    const free = mountCell({ votes: { "inv-1": "yes", "inv-2": "yes" } });
    expect(free.find(".mine-mark").classes()).toContain("free");

    const maybe = mountCell({ votes: { "inv-1": "if_needed" } });
    expect(maybe.find(".mine-mark").classes()).toContain("maybe");
  });

  it("marks nothing when the answer is not yours", () => {
    // Someone else's vote is a group fact; it belongs to the count, not here.
    expect(
      mountCell({ votes: { "inv-2": "yes" } })
        .find(".mine-mark")
        .exists(),
    ).toBe(false);
    expect(
      mountCell({ claimedId: null, votes: { "inv-1": "yes" } })
        .find(".mine-mark")
        .exists(),
    ).toBe(false);
  });

  it("speaks your own answer too", () => {
    const label = (v: Record<string, string>) =>
      mountCell({ votes: v }).attributes("aria-label");

    expect(label({ "inv-1": "yes" })).toContain("you are free");
    expect(label({ "inv-1": "if_needed" })).toContain("you if needed");
    expect(label({ "inv-2": "yes" })).not.toContain("you");
  });
});
