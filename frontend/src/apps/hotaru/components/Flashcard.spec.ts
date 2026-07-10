import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Flashcard from "./Flashcard.vue";
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

describe("Flashcard", () => {
  it("shows the Japanese prompt and hides the answer until revealed", () => {
    const wrapper = mount(Flashcard, {
      props: { word: word(), revealed: false },
    });
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe("大学");
    expect(wrapper.find('[data-testid="card-answer"]').exists()).toBe(false);
  });

  it("reveals the reading and meaning when revealed", () => {
    const wrapper = mount(Flashcard, {
      props: { word: word(), revealed: true },
    });
    const answer = wrapper.find('[data-testid="card-answer"]');
    expect(answer.exists()).toBe(true);
    expect(answer.text()).toContain("だいがく");
    expect(answer.text()).toContain("university");
  });

  it("prompts with the reading for a kana-only word", () => {
    const wrapper = mount(Flashcard, {
      props: {
        word: word({ kanji: null, reading: "ありがとう", meaning: "thanks" }),
        revealed: false,
      },
    });
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe(
      "ありがとう",
    );
  });

  it("shows lesson + part-of-speech pills only on the reveal side", () => {
    const hidden = mount(Flashcard, {
      props: { word: word(), revealed: false },
    });
    expect(hidden.find('[data-testid="card-pills"]').exists()).toBe(false);
    const shown = mount(Flashcard, {
      props: { word: word(), revealed: true },
    });
    const pills = shown.find('[data-testid="card-pills"]');
    expect(pills.text()).toContain("L1");
    expect(pills.text()).toContain("noun");
  });

  it("shows furigana above a kanji headword when showReading is on", () => {
    const wrapper = mount(Flashcard, {
      props: { word: word(), revealed: false, showReading: true },
    });
    // The kana reading is visible on the prompt even before reveal.
    expect(wrapper.find('[data-testid="card-furigana"]').text()).toBe(
      "だいがく",
    );
    expect(wrapper.find('[data-testid="card-answer"]').exists()).toBe(false);
  });
});
