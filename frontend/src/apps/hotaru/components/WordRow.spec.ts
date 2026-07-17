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

  const STUBS = { "q-icon": { template: "<i />" } };

  it("reveals romaji from the actions menu", async () => {
    const wrapper = mount(WordRow, {
      props: { word: word() },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="romaji"]').exists()).toBe(false);
    // Toggle lives behind the ⋮ menu now.
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="romaji-toggle"]').trigger("click");
    expect(wrapper.find('[data-testid="romaji"]').text()).toBe("daigaku");

    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="romaji-toggle"]').trigger("click");
    expect(wrapper.find('[data-testid="romaji"]').exists()).toBe(false);
  });

  it("keeps the menu closed by default (only ⋮ shows)", () => {
    const wrapper = mount(WordRow, {
      props: { word: word(), editable: true },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="row-menu"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-word"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="manage-topics"]').exists()).toBe(false);
  });

  it("hides edit/delete in the menu unless editable", async () => {
    const wrapper = mount(WordRow, {
      props: { word: word() },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    // Topics is available on every row; edit/delete only when editable.
    expect(wrapper.find('[data-testid="manage-topics"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="edit-word"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="delete-word"]').exists()).toBe(false);
  });

  it("emits edit and delete from the menu when editable", async () => {
    const w = word();
    const wrapper = mount(WordRow, {
      props: { word: w, editable: true },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="edit-word"]').trigger("click");
    // Choosing an action closes the menu — reopen for the next one.
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="delete-word"]').trigger("click");
    expect(wrapper.emitted("edit")?.[0]).toEqual([w]);
    expect(wrapper.emitted("delete")?.[0]).toEqual([w]);
  });

  it("shows a private mark for private words", () => {
    const wrapper = mount(WordRow, {
      props: { word: word({ visibility: "private" }) },
      global: { stubs: STUBS },
    });
    const mark = wrapper.find('[data-testid="private-mark"]');
    expect(mark.exists()).toBe(true);
    expect(mark.attributes("aria-label")).toBe("Private");
  });

  it("shows no mark for shared words (shared is the implicit default)", () => {
    const wrapper = mount(WordRow, {
      props: { word: word({ visibility: "shared" }) },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="private-mark"]').exists()).toBe(false);
  });

  it("shows the private mark independent of the editable prop", () => {
    const wrapper = mount(WordRow, {
      props: { word: word({ visibility: "private" }), editable: true },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="private-mark"]').exists()).toBe(true);
  });

  it("shows a familiarity indicator reflecting the tier prop", () => {
    const wrapper = mount(WordRow, {
      props: { word: word(), tier: 3 },
      global: { stubs: STUBS },
    });
    const icon = wrapper.find('[data-testid="familiarity-icon"]');
    expect(icon.exists()).toBe(true);
    expect(icon.attributes("aria-label")).toBe("Strong");
  });

  it("defaults to New when no tier is given (unreviewed word)", () => {
    const wrapper = mount(WordRow, {
      props: { word: word() },
      global: { stubs: STUBS },
    });
    expect(
      wrapper.find('[data-testid="familiarity-icon"]').attributes("aria-label"),
    ).toBe("New");
  });

  it("shows a checkbox and hides the ⋮ menu in select mode", () => {
    const wrapper = mount(WordRow, {
      props: { word: word(), selectable: true, editable: true },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="row-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="row-menu"]').exists()).toBe(false);
  });

  it("emits toggle-select with the word when the row is clicked in select mode", async () => {
    const w = word();
    const wrapper = mount(WordRow, {
      props: { word: w, selectable: true },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="word-row"]').trigger("click");
    expect(wrapper.emitted("toggle-select")?.[0]).toEqual([w]);
  });

  it("has no checkbox when not selectable", () => {
    const wrapper = mount(WordRow, {
      props: { word: word() },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="row-select"]').exists()).toBe(false);
  });

  it("emits notes from the menu (shown on every row)", async () => {
    const w = word();
    const wrapper = mount(WordRow, {
      props: { word: w },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="manage-notes"]').trigger("click");
    expect(wrapper.emitted("notes")?.[0]).toEqual([w]);
  });

  it("copies a readable form of the word to the clipboard from the menu", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    const wrapper = mount(WordRow, {
      props: { word: word() },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="copy-word"]').trigger("click");
    expect(writeText).toHaveBeenCalledWith("大学（だいがく）— university");
  });

  it("emits topics from the menu (shown on every row, even non-editable)", async () => {
    const w = word();
    const wrapper = mount(WordRow, {
      props: { word: w },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="manage-topics"]').trigger("click");
    expect(wrapper.emitted("topics")?.[0]).toEqual([w]);
  });

  it("shows a note cue only when the word has a note", () => {
    const without = mount(WordRow, {
      props: { word: word() },
      global: { stubs: STUBS },
    });
    expect(without.find('[data-testid="row-has-note"]').exists()).toBe(false);
    const withNote = mount(WordRow, {
      props: { word: word(), hasNote: true },
      global: { stubs: STUBS },
    });
    expect(withNote.find('[data-testid="row-has-note"]').exists()).toBe(true);
  });

  it("emits toggle-expand when the row body is tapped (normal mode)", async () => {
    const w = word();
    const wrapper = mount(WordRow, {
      props: { word: w },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="word-row"]').trigger("click");
    expect(wrapper.emitted("toggle-expand")?.[0]).toEqual([w]);
    // A disclosure chevron is present in normal mode.
    expect(wrapper.find('[data-testid="row-chevron"]').exists()).toBe(true);
  });

  it("marks the chevron open when expanded", () => {
    const wrapper = mount(WordRow, {
      props: { word: word(), expanded: true },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="row-chevron"]').classes()).toContain(
      "word-row__chevron--open",
    );
  });

  it("does NOT expand when the ⋮ menu is used (click.stop)", async () => {
    const wrapper = mount(WordRow, {
      props: { word: word() },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    expect(wrapper.emitted("toggle-expand")).toBeUndefined();
  });

  it("in select mode a tap selects (not expands) and shows no chevron", async () => {
    const w = word();
    const wrapper = mount(WordRow, {
      props: { word: w, selectable: true },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="word-row"]').trigger("click");
    expect(wrapper.emitted("toggle-select")?.[0]).toEqual([w]);
    expect(wrapper.emitted("toggle-expand")).toBeUndefined();
    expect(wrapper.find('[data-testid="row-chevron"]').exists()).toBe(false);
  });
});
