import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import Flashcard from "./Flashcard.vue";
import type { HotaruUser, Note, Word } from "@/apps/hotaru/types";

const USERS: HotaruUser[] = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

function note(
  id: string,
  text: string,
  visibility = "shared",
  author = "jake",
): Note {
  return {
    id,
    word_id: "genki_3-L1-0001",
    author,
    text,
    visibility: visibility as Note["visibility"],
    created_at: "2026-01-01T00:00:00Z",
  };
}

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
    const prompt = wrapper.find('[data-testid="card-prompt"]');
    expect(prompt.text()).toBe("ありがとう");
    // Kana-only headwords render a step smaller (they run longer than kanji).
    expect(prompt.classes()).toContain("flashcard__jp--kana");
  });

  it("keeps a kanji headword at full size (no kana modifier)", () => {
    const wrapper = mount(Flashcard, {
      props: { word: word(), revealed: false },
    });
    expect(wrapper.find('[data-testid="card-prompt"]').classes()).not.toContain(
      "flashcard__jp--kana",
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

  it("EN→JP: prompts with the English meaning, hides the Japanese until reveal", () => {
    const wrapper = mount(Flashcard, {
      props: { word: word(), revealed: false, direction: "m2r" },
    });
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe(
      "university",
    );
    expect(wrapper.find('[data-testid="card-answer"]').exists()).toBe(false);
    // No furigana on an English prompt.
    expect(wrapper.find('[data-testid="card-furigana"]').exists()).toBe(false);
  });

  it("EN→JP: reveals the Japanese (headword + reading) to produce", () => {
    const wrapper = mount(Flashcard, {
      props: { word: word(), revealed: true, direction: "m2r" },
    });
    const answer = wrapper.find('[data-testid="card-answer"]');
    expect(answer.text()).toContain("大学");
    expect(answer.text()).toContain("だいがく");
    // The meaning is the prompt in this direction, not repeated in the answer.
    expect(answer.text()).not.toContain("university");
  });

  it("shows the typed answer under the reveal when submitted is provided", () => {
    const wrapper = mount(Flashcard, {
      props: {
        word: word(),
        revealed: true,
        direction: "m2r",
        submitted: "いぬう",
      },
    });
    const sub = wrapper.find('[data-testid="card-submitted"]');
    expect(sub.exists()).toBe(true);
    expect(sub.text()).toContain("you wrote");
    expect(sub.text()).toContain("いぬう");
  });

  it("shows an em-dash for an empty submission", () => {
    const wrapper = mount(Flashcard, {
      props: { word: word(), revealed: true, direction: "m2r", submitted: "" },
    });
    expect(wrapper.find('[data-testid="card-submitted"]').text()).toContain(
      "—",
    );
  });

  it("shows no submitted line when null (self-grade) or before reveal", () => {
    const selfGrade = mount(Flashcard, {
      props: { word: word(), revealed: true, direction: "m2r" }, // submitted defaults null
    });
    expect(selfGrade.find('[data-testid="card-submitted"]').exists()).toBe(
      false,
    );
    const hidden = mount(Flashcard, {
      props: {
        word: word(),
        revealed: false,
        direction: "m2r",
        submitted: "いぬ",
      },
    });
    expect(hidden.find('[data-testid="card-submitted"]').exists()).toBe(false);
  });

  it("shows notes only on reveal, never on the prompt (no answer spoiler)", () => {
    const props = {
      word: word(),
      notes: [note("n1", "looks like a gate", "shared", "jake")],
      users: USERS,
      activeUser: "dani",
    };
    const hidden = mount(Flashcard, { props: { ...props, revealed: false } });
    expect(hidden.find('[data-testid="card-notes"]').exists()).toBe(false);
    const shown = mount(Flashcard, { props: { ...props, revealed: true } });
    const notes = shown.find('[data-testid="card-notes"]');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toContain("looks like a gate");
    expect(notes.text()).toContain("Jake"); // partner's shared note, attributed
  });

  it("attributes my own note to 'You' and marks a private note with the lock", () => {
    const wrapper = mount(Flashcard, {
      props: {
        word: word(),
        revealed: true,
        notes: [note("n1", "my hook", "private", "dani")],
        users: USERS,
        activeUser: "dani",
      },
    });
    const card = wrapper.find('[data-testid="card-note"]');
    expect(card.text()).toContain("You");
    expect(card.find(".flashcard__note-lock").exists()).toBe(true);
  });

  it("renders no notes block when the card has none", () => {
    const wrapper = mount(Flashcard, {
      props: { word: word(), revealed: true, notes: [] },
    });
    expect(wrapper.find('[data-testid="card-notes"]').exists()).toBe(false);
  });
});
