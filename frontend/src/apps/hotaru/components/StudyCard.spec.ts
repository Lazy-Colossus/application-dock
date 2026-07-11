import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import StudyCard from "./StudyCard.vue";
import type { Word } from "@/apps/hotaru/types";

function word(overrides: Partial<Word> = {}): Word {
  return {
    id: "genki_3-L1-0001",
    source: "genki_3",
    reading: "だいがく",
    kanji: "大学",
    romaji: "daigaku",
    meaning: "university",
    pos: "noun",
    lesson: "L1",
    visibility: "shared",
    drill_caps: ["r2m", "m2r", "k2r"],
    ...overrides,
  };
}

describe("StudyCard", () => {
  it("shows every field at once for a kanji word (no reveal step)", () => {
    const wrapper = mount(StudyCard, { props: { word: word() } });
    expect(wrapper.find('[data-testid="study-headword"]').text()).toBe("大学");
    const text = wrapper.text();
    expect(text).toContain("だいがく"); // reading
    expect(text).toContain("daigaku"); // romaji
    expect(text).toContain("university"); // meaning
    const pills = wrapper.find('[data-testid="study-pills"]');
    expect(pills.text()).toContain("L1");
    expect(pills.text()).toContain("noun");
  });

  it("shows the kana headword and meaning for a kana-only word", () => {
    const wrapper = mount(StudyCard, {
      props: {
        word: word({ kanji: null, reading: "ありがとう", meaning: "thanks" }),
      },
    });
    const head = wrapper.find('[data-testid="study-headword"]');
    expect(head.text()).toBe("ありがとう");
    expect(head.classes()).toContain("study-card__jp--kana");
    expect(wrapper.text()).toContain("thanks");
  });
});
