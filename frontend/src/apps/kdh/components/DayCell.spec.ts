import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import DayCell from "./DayCell.vue";

function mountCell(props: Partial<Record<string, unknown>> = {}) {
  return mount(DayCell, {
    props: {
      date: "2026-09-14",
      votes: {},
      activeTotal: 6,
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
    expect(wrapper.find(".n").text()).toBe("2");
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

  it("shows the chosen mark as a shape, at any wash step", () => {
    expect(mountCell({ chosen: true }).find(".chosen").exists()).toBe(true);
    expect(
      mountCell({ chosen: true, votes: { a: "yes" } })
        .find(".chosen")
        .exists(),
    ).toBe(true);
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
    expect(wrapper.find(".n").text()).toBe("2");
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
});
