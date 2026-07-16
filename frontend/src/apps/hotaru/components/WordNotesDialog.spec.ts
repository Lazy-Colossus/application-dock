import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import WordNotesDialog from "./WordNotesDialog.vue";
import type { HotaruUser, Note, Word } from "@/apps/hotaru/types";

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
    created_at: `2026-01-0${id.slice(-1)}T00:00:00Z`,
  };
}

const STUBS = {
  "q-dialog": { template: "<div><slot /></div>" },
  "q-icon": { template: "<i />" },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: ["label", "flat", "noCaps", "unelevated", "disable"],
    emits: ["click"],
  },
};

function mountDialog(notes: Note[], activeUser?: string) {
  return mount(WordNotesDialog, {
    props: { word: word(), notes, users: USERS, modelValue: true, activeUser },
    global: { stubs: STUBS },
  });
}

describe("WordNotesDialog", () => {
  it("lists notes attributed to their author, newest first, 🔒 on private", () => {
    const wrapper = mountDialog([
      note("n1", "shared tip", "shared", "jake"),
      note("n2", "my private", "private", "dani"),
    ]);
    const items = wrapper.findAll('[data-testid="note-item"]');
    expect(items).toHaveLength(2);
    // Newest first (n2 before n1).
    expect(items[0].text()).toContain("my private");
    expect(items[0].text()).toContain("Dani");
    expect(items[0].find('[data-testid="note-private"]').exists()).toBe(true);
    // The shared note is attributed to Jake and has no lock.
    expect(items[1].text()).toContain("Jake");
    expect(items[1].find('[data-testid="note-private"]').exists()).toBe(false);
  });

  it("shows an empty hint when there are no notes", () => {
    const wrapper = mountDialog([]);
    expect(wrapper.find('[data-testid="note-item"]').exists()).toBe(false);
    expect(wrapper.text()).toContain("No notes yet");
  });

  it("adds a shared note by default", async () => {
    const wrapper = mountDialog([]);
    await wrapper.find('[data-testid="note-text-input"]').setValue("new tip");
    await wrapper.find('[data-testid="note-add"]').trigger("click");
    expect(wrapper.emitted("add")?.[0]).toEqual(["new tip", "shared"]);
  });

  it("adds a private note when Private is chosen", async () => {
    const wrapper = mountDialog([]);
    await wrapper.find('[data-testid="note-text-input"]').setValue("secret");
    await wrapper.find('[data-testid="note-vis-private"]').trigger("click");
    await wrapper.find('[data-testid="note-add"]').trigger("click");
    expect(wrapper.emitted("add")?.[0]).toEqual(["secret", "private"]);
  });

  it("attributes the active user's own note to 'You'", () => {
    const wrapper = mountDialog(
      [note("n1", "my hook", "private", "dani")],
      "dani",
    );
    expect(wrapper.find('[data-testid="note-author"]').text()).toBe("You");
  });

  it("shows the author name for a partner's note", () => {
    const wrapper = mountDialog([note("n1", "gate", "shared", "jake")], "dani");
    expect(wrapper.find('[data-testid="note-author"]').text()).toBe("Jake");
  });

  it("shows a flip control only on the active user's own notes", () => {
    const wrapper = mountDialog(
      [
        note("n1", "mine", "shared", "dani"),
        note("n2", "jake's", "shared", "jake"),
      ],
      "dani",
    );
    const items = wrapper.findAll('[data-testid="note-item"]');
    // Newest first: n2 (Jake's — no flip), then n1 (mine — flip present).
    expect(items[0].find('[data-testid="note-flip"]').exists()).toBe(false);
    expect(items[1].find('[data-testid="note-flip"]').exists()).toBe(true);
  });

  it("emits flip with the opposite visibility when the control is clicked", async () => {
    const wrapper = mountDialog([note("n1", "mine", "shared", "dani")], "dani");
    await wrapper.find('[data-testid="note-flip"]').trigger("click");
    expect(wrapper.emitted("flip")?.[0]).toEqual(["n1", "private"]);
  });

  it("renders a timestamp on each note", () => {
    const wrapper = mountDialog([note("n1", "gate", "shared", "jake")]);
    const time = wrapper.find('[data-testid="note-time"]');
    expect(time.exists()).toBe(true);
    expect(time.text().length).toBeGreaterThan(0);
  });

  it("puts many notes in a scroll container", () => {
    const many = Array.from({ length: 20 }, (_, i) =>
      note(`n${i}`, `note ${i}`, "shared", "jake"),
    );
    const wrapper = mountDialog(many);
    expect(wrapper.find('[data-testid="notes-list"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="note-item"]')).toHaveLength(20);
  });

  it("hides the character count until near the limit, then shows it", async () => {
    const wrapper = mountDialog([]);
    const input = wrapper.find('[data-testid="note-text-input"]');
    await input.setValue("hello");
    // Quiet well below the cap — no running tally.
    expect(wrapper.find('[data-testid="note-count"]').exists()).toBe(false);
    // Appears in the last stretch (within 40 of the 300 cap).
    await input.setValue("x".repeat(270));
    expect(wrapper.find('[data-testid="note-count"]').text()).toBe("270/300");
    expect(wrapper.find('[data-testid="note-error"]').exists()).toBe(false);
  });

  it("errors and blocks Add once over the 300-char limit", async () => {
    const wrapper = mountDialog([]);
    await wrapper
      .find('[data-testid="note-text-input"]')
      .setValue("x".repeat(301));
    expect(wrapper.find('[data-testid="note-error"]').exists()).toBe(true);
    expect(
      wrapper.find('[data-testid="note-add"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.find('[data-testid="note-add"]').trigger("click");
    expect(wrapper.emitted("add")).toBeUndefined();
  });

  it("accepts exactly 300 chars", async () => {
    const wrapper = mountDialog([]);
    await wrapper
      .find('[data-testid="note-text-input"]')
      .setValue("x".repeat(300));
    expect(wrapper.find('[data-testid="note-error"]').exists()).toBe(false);
    await wrapper.find('[data-testid="note-add"]').trigger("click");
    expect(wrapper.emitted("add")?.[0]?.[0]).toBe("x".repeat(300));
  });

  it("counts trimmed length — trailing whitespace does not trip the limit", async () => {
    const wrapper = mountDialog([]);
    // 300 real chars + trailing spaces: trimmed is 300 (accepted), not over.
    await wrapper
      .find('[data-testid="note-text-input"]')
      .setValue("x".repeat(300) + "     ");
    expect(wrapper.find('[data-testid="note-count"]').text()).toBe("300/300");
    expect(wrapper.find('[data-testid="note-error"]').exists()).toBe(false);
    expect(
      wrapper.find('[data-testid="note-add"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("clears an unsent draft when the word changes", async () => {
    const wrapper = mountDialog([]);
    const input = wrapper.find('[data-testid="note-text-input"]');
    await input.setValue("half-written tip");
    await wrapper.find('[data-testid="note-vis-private"]').trigger("click");
    // Open the dialog for a different word (LibraryPage swaps the prop).
    await wrapper.setProps({
      word: { ...word(), id: "w2", kanji: "犬", reading: "いぬ" },
    });
    expect((input.element as HTMLTextAreaElement).value).toBe("");
    // And visibility reset to the shared default.
    await input.setValue("new");
    await wrapper.find('[data-testid="note-add"]').trigger("click");
    expect(wrapper.emitted("add")?.at(-1)).toEqual(["new", "shared"]);
  });
});
