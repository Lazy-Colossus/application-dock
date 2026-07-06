import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import WordRow from "./WordRow.vue";
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

describe("WordRow", () => {
  it("shows kanji as primary with the reading beneath, plus the meaning", () => {
    const wrapper = mount(WordRow, { props: { word: word() } });
    expect(wrapper.text()).toContain("大学");
    expect(wrapper.text()).toContain("だいがく");
    expect(wrapper.text()).toContain("university");
  });

  it("falls back to the reading as primary for kana-only words", () => {
    const wrapper = mount(WordRow, {
      props: {
        word: word({
          kanji: null,
          reading: "ありがとう",
          meaning: "Thank you.",
        }),
      },
    });
    expect(wrapper.find(".word-row__primary").text()).toBe("ありがとう");
    // No separate reading line when there is no kanji.
    expect(wrapper.find(".word-row__reading").exists()).toBe(false);
  });

  it("hides romaji by default and reveals it per-row on toggle", async () => {
    const wrapper = mount(WordRow, { props: { word: word() } });
    expect(wrapper.find('[data-testid="romaji"]').exists()).toBe(false);

    await wrapper.find('[data-testid="romaji-toggle"]').trigger("click");
    expect(wrapper.find('[data-testid="romaji"]').text()).toBe("daigaku");

    await wrapper.find('[data-testid="romaji-toggle"]').trigger("click");
    expect(wrapper.find('[data-testid="romaji"]').exists()).toBe(false);
  });
});
