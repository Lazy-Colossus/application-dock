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

  it("renders the word's notes (attributed, 🔒 on private), or nothing when none", () => {
    const bare = mount(StudyCard, { props: { word: word() } });
    expect(bare.find('[data-testid="study-notes"]').exists()).toBe(false);

    const withNotes = mount(StudyCard, {
      props: {
        word: word(),
        users: [
          { id: "dani", name: "Dani" },
          { id: "jake", name: "Jake" },
        ],
        activeUser: "dani",
        notes: [
          {
            id: "n1",
            word_id: "genki_3-L1-0001",
            author: "jake",
            text: "gate hook",
            visibility: "shared",
            created_at: "2026-01-01T00:00:00Z",
          },
          {
            id: "n2",
            word_id: "genki_3-L1-0001",
            author: "dani",
            text: "my private hook",
            visibility: "private",
            created_at: "2026-01-02T00:00:00Z",
          },
        ],
      },
      global: { stubs: { "q-icon": { template: "<i />" } } },
    });
    const notes = withNotes.find('[data-testid="study-notes"]');
    expect(notes.text()).toContain("gate hook");
    expect(notes.text()).toContain("Jake");
    expect(notes.text()).toContain("You"); // own note
    expect(notes.find(".study-card__note-lock").exists()).toBe(true);
  });
});
