import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AlmanacRail from "./AlmanacRail.vue";
import type { AlmanacChapter } from "../almanac";

function chapter(overrides: Partial<AlmanacChapter>): AlmanacChapter {
  return {
    key: "green",
    label: "Green",
    labelZh: "綠茶",
    classId: "green",
    count: 1,
    groups: [],
    ...overrides,
  };
}

const CLASS_CHAPTERS = [
  chapter({}),
  chapter({
    key: "oolong",
    label: "Oolong",
    labelZh: "烏龍",
    classId: "oolong",
  }),
];
const PLACE_CHAPTERS = [
  chapter({ key: "China", label: "China", labelZh: "", classId: null }),
  chapter({ key: "Japan", label: "Japan", labelZh: "", classId: null }),
];

describe("AlmanacRail", () => {
  it("shows a class chapter by its first character, named in full for screen readers", () => {
    const wrapper = mount(AlmanacRail, {
      props: { chapters: CLASS_CHAPTERS, active: 0 },
    });
    const chips = wrapper.findAll('[data-testid="almanac-chip"]');
    expect(chips.map((c) => c.text())).toEqual(["綠", "烏"]);
    expect(chips[1].attributes("aria-label")).toBe("Oolong");
  });

  it("shows a country chapter by its name", () => {
    const wrapper = mount(AlmanacRail, {
      props: { chapters: PLACE_CHAPTERS, active: 0 },
    });
    expect(
      wrapper.findAll('[data-testid="almanac-chip"]').map((c) => c.text()),
    ).toEqual(["China", "Japan"]);
  });

  it("marks only the active chapter as current", () => {
    const wrapper = mount(AlmanacRail, {
      props: { chapters: PLACE_CHAPTERS, active: 1 },
    });
    const chips = wrapper.findAll('[data-testid="almanac-chip"]');
    expect(chips[0].attributes("aria-current")).toBeUndefined();
    expect(chips[1].attributes("aria-current")).toBe("true");
  });

  it("asks to jump to a chapter when its chip is tapped", async () => {
    const wrapper = mount(AlmanacRail, {
      props: { chapters: PLACE_CHAPTERS, active: 0 },
    });
    await wrapper.findAll('[data-testid="almanac-chip"]')[1].trigger("click");
    expect(wrapper.emitted("jump")).toEqual([[1]]);
  });
});
