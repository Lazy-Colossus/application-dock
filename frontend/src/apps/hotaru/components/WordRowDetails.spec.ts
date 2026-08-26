import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import WordRowDetails from "./WordRowDetails.vue";
import type { HotaruUser, Note, Topic, Word } from "@/apps/hotaru/types";

function word(): Word {
  return {
    id: "w1",
    source: "genki_3",
    reading: "だいがく",
    kanji: "大学",
    romaji: "daigaku",
    meaning: "university",
    pos: "noun",
    lesson: "L1",
    visibility: "shared",
    drill_caps: ["r2m", "m2r"],
  };
}

const USERS: HotaruUser[] = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

const TOPICS: Topic[] = [
  { id: "t1", name: "Food", word_ids: ["w1"] }, // assigned to w1
  { id: "t2", name: "Travel", word_ids: [] }, // not assigned
];

function note(
  id: string,
  text: string,
  visibility = "shared",
  author = "jake",
): Note {
  return {
    id,
    word_id: "w1",
    author,
    text,
    visibility: visibility as Note["visibility"],
    created_at: "2026-01-01T00:00:00Z",
  };
}

const STUBS = { "q-icon": { template: "<i />" } };

function mountDetails(notes: Note[] = [], activeUser = "dani") {
  return mount(WordRowDetails, {
    props: { word: word(), topics: TOPICS, notes, users: USERS, activeUser },
    global: { stubs: STUBS },
  });
}

describe("WordRowDetails", () => {
  it("shows only the word's assigned topics (display), not every topic", () => {
    const wrapper = mountDetails();
    expect(wrapper.find('[data-testid="row-topic-t1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-topic-t2"]').exists()).toBe(false);
  });

  it("has no inline text inputs — editing is via the dialogs", () => {
    const wrapper = mountDetails([note("n1", "tip")]);
    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.find("textarea").exists()).toBe(false);
  });

  it("the ＋Topic button emits manage-topics with the word", async () => {
    const wrapper = mountDetails();
    await wrapper.find('[data-testid="row-manage-topics"]').trigger("click");
    expect(wrapper.emitted("manage-topics")?.[0]?.[0]).toMatchObject({
      id: "w1",
    });
  });

  it("the ＋Note button emits manage-notes with the word", async () => {
    const wrapper = mountDetails();
    await wrapper.find('[data-testid="row-add-note"]').trigger("click");
    expect(wrapper.emitted("manage-notes")?.[0]?.[0]).toMatchObject({
      id: "w1",
    });
  });

  it("lists notes (display) with attribution, 'You', and 🔒 on private", () => {
    const wrapper = mountDetails([
      note("n1", "shared tip", "shared", "jake"),
      note("n2", "my hook", "private", "dani"),
    ]);
    const items = wrapper.findAll('[data-testid="row-note-item"]');
    // Newest first: n2 (mine, private) then n1 (Jake's shared).
    expect(items[0].text()).toContain("You");
    expect(items[0].find('[data-testid="row-note-private"]').exists()).toBe(
      true,
    );
    expect(items[1].text()).toContain("Jake");
    // No inline flip control in the panel (that lives in the notes dialog).
    expect(wrapper.find('[data-testid="row-note-flip"]').exists()).toBe(false);
  });

  it("shows calm empty hints when there are no topics or notes", () => {
    const wrapper = mount(WordRowDetails, {
      props: {
        word: word(),
        topics: [{ id: "t2", name: "Travel", word_ids: [] }],
        notes: [],
        users: USERS,
        activeUser: "dani",
      },
      global: { stubs: STUBS },
    });
    expect(wrapper.text()).toContain("Not in any topic yet.");
    expect(wrapper.text()).toContain("No notes yet.");
  });
});
