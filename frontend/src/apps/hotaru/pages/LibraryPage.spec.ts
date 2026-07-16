import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, patchMock, delMock, push, replace } =
  vi.hoisted(() => ({
    getMock: vi.fn(),
    postMock: vi.fn(),
    putMock: vi.fn(),
    patchMock: vi.fn(),
    delMock: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: postMock,
    put: putMock,
    patch: patchMock,
    del: delMock,
  },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push, replace }) }));

import LibraryPage from "./LibraryPage.vue";
import type { Word } from "@/apps/hotaru/types";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

function word(
  id: string,
  source: string,
  lesson: string,
  meaning: string,
  visibility = "shared",
): Word {
  return {
    id,
    source,
    reading: "よみ",
    kanji: null,
    romaji: "yomi",
    meaning,
    pos: "noun",
    lesson,
    visibility: visibility as Word["visibility"],
    drill_caps: ["r2m", "m2r"],
  };
}

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-dialog": { template: "<div><slot /></div>" },
  "q-icon": { template: "<i />" },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\" />",
    emits: ["click"],
  },
};

const WORDS = [
  word("g1", "genki_3", "G", "thanks"),
  word("l1a", "genki_3", "L1", "university"),
  word("cs", "dani", "", "my shared word", "shared"),
  word("cp", "dani", "", "my private word", "private"),
];

// A topic grouping the "thanks" word; toggle to [] to test the empty state.
let topics: { id: string; name: string; word_ids: string[] }[] = [
  { id: "t1", name: "Greetings", word_ids: ["g1"] },
];

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.setItem("hotaru.activeUser", "dani");
  topics = [{ id: "t1", name: "Greetings", word_ids: ["g1"] }];
  // Route each GET: users, topics, else words.
  getMock.mockReset();
  getMock.mockImplementation((path: string) => {
    if (path.startsWith("/hotaru/users")) return Promise.resolve(USERS);
    if (path.startsWith("/hotaru/topics")) return Promise.resolve(topics);
    if (path.startsWith("/hotaru/practice/familiarity"))
      return Promise.resolve({ g1: 4 });
    if (path.includes("/notes")) return Promise.resolve([]); // word notes
    return Promise.resolve(WORDS);
  });
  delMock.mockReset().mockResolvedValue(undefined);
  postMock.mockReset().mockResolvedValue({});
  putMock.mockReset().mockResolvedValue({});
  patchMock.mockReset().mockResolvedValue({});
  push.mockReset();
});

describe("LibraryPage (two-level)", () => {
  it("shows textbook + Custom sections and defaults to the textbook lesson", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find('[data-testid="section-genki_3"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="section-__custom__"]').exists()).toBe(
      true,
    );
    // Default: Genki → G → shows "thanks"
    expect(wrapper.text()).toContain("thanks");
  });

  it("loads familiarity and shows each word's tier on its row", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/familiarity?user=dani",
    );
    // Default view (Genki → G) shows g1, whose tier is 4 (Mastered).
    expect(
      wrapper.find('[data-testid="familiarity-icon"]').attributes("aria-label"),
    ).toBe("Mastered");
  });

  it("navigates section → subsection to Custom → Private", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-private"]').trigger("click");
    expect(wrapper.text()).toContain("my private word");
    expect(wrapper.text()).not.toContain("my shared word");
  });

  it("Custom words default to All — both shared and private shown", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    expect(wrapper.find('[data-testid="sub-all"]').exists()).toBe(true);
    // Default subsection is "All" → both custom words are listed.
    expect(wrapper.text()).toContain("my shared word");
    expect(wrapper.text()).toContain("my private word");
  });

  it("Custom → Shared shows only shared custom words", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-shared"]').trigger("click");
    expect(wrapper.text()).toContain("my shared word");
    expect(wrapper.text()).not.toContain("my private word");
  });

  it("remembers the section across a remount (e.g. after adding a word)", async () => {
    const first = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await first.find('[data-testid="section-__custom__"]').trigger("click");
    await first.find('[data-testid="sub-private"]').trigger("click");
    first.unmount();

    // Remount with the SAME pinia (as returning from the Add-word page would).
    const second = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(second.text()).toContain("my private word");
    expect(second.text()).not.toContain("thanks"); // did not reset to Genki
  });

  it("the ＋ FAB routes to add-word", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="add-word-fab"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/hotaru/add-word");
  });

  it("shows edit/delete in the row menu for Custom words but not textbook words", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    // Textbook section (default) → open the row menu → no delete.
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    expect(wrapper.find('[data-testid="delete-word"]').exists()).toBe(false);
    // Custom → Shared → open the row menu → editable.
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-shared"]').trigger("click");
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    expect(wrapper.find('[data-testid="delete-word"]').exists()).toBe(true);
  });

  it("marks private words with the lock in the Private subsection", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-private"]').trigger("click");
    expect(wrapper.find('[data-testid="private-mark"]').exists()).toBe(true);
    // Shared subsection shows no lock.
    await wrapper.find('[data-testid="sub-shared"]').trigger("click");
    expect(wrapper.find('[data-testid="private-mark"]').exists()).toBe(false);
  });

  it("edit routes to the edit page for that word", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-shared"]').trigger("click");
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="edit-word"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/hotaru/words/cs/edit");
  });

  it("delete asks for confirmation and calls the API on confirm", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-shared"]').trigger("click");
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="delete-word"]').trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalled();
    expect(delMock).toHaveBeenCalledWith("/hotaru/words/cs?user=dani");
    confirm.mockRestore();
  });

  it("delete does nothing when the confirmation is dismissed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-shared"]').trigger("click");
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="delete-word"]').trigger("click");
    await flushPromises();
    expect(delMock).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("opens the Notes dialog from a word's ⋮ menu, loads notes, and adds one", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="manage-notes"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="notes-dialog"]').exists()).toBe(true);
    expect(getMock).toHaveBeenCalledWith(
      expect.stringContaining("/notes?user=dani"),
    );
    // Add a note → posts to the word's notes endpoint.
    await wrapper.find('[data-testid="note-text-input"]').setValue("a tip");
    await wrapper.find('[data-testid="note-add"]').trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith(
      expect.stringContaining("/notes?user=dani"),
      { text: "a tip", visibility: "shared" },
    );
  });

  it("flips a note's visibility from the Notes dialog", async () => {
    getMock.mockImplementation((path: string) => {
      if (path.startsWith("/hotaru/users")) return Promise.resolve(USERS);
      if (path.startsWith("/hotaru/topics")) return Promise.resolve(topics);
      if (path.startsWith("/hotaru/practice/familiarity"))
        return Promise.resolve({ g1: 4 });
      if (path.includes("/notes"))
        return Promise.resolve([
          {
            id: "n1",
            word_id: "g1",
            author: "dani",
            text: "my tip",
            visibility: "shared",
            created_at: "2026-01-01T00:00:00Z",
          },
        ]);
      return Promise.resolve(WORDS);
    });
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="row-menu"]').trigger("click");
    await wrapper.find('[data-testid="manage-notes"]').trigger("click");
    await flushPromises();
    await wrapper.find('[data-testid="note-flip"]').trigger("click");
    await flushPromises();
    expect(patchMock).toHaveBeenCalledWith("/hotaru/notes/n1?user=dani", {
      visibility: "private",
    });
  });

  it("Topics section lists the selected topic's words", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__topics__"]').trigger("click");
    // Its subsection is the topic; default-selects the first topic (t1).
    expect(wrapper.find('[data-testid="sub-t1"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("thanks"); // g1 is in the topic
    expect(wrapper.text()).not.toContain("university"); // l1a is not
  });

  it("Topics section shows an empty hint when there are no topics", async () => {
    topics = [];
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__topics__"]').trigger("click");
    expect(wrapper.find('[data-testid="library-empty"]').text()).toContain(
      "No topics yet",
    );
  });

  // --- bulk actions (Story 1.9) ---------------------------------------------

  function openActions(wrapper: ReturnType<typeof mount>) {
    return wrapper.find('[data-testid="library-actions"]').trigger("click");
  }

  // Custom → Shared, enter select mode from the ⋮ menu, select the one word.
  async function enterCustomSelect(wrapper: ReturnType<typeof mount>) {
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-shared"]').trigger("click");
    await openActions(wrapper);
    await wrapper.find('[data-testid="action-select"]').trigger("click");
    await wrapper.find('[data-testid="word-row"]').trigger("click"); // select "cs"
  }

  it("enters select mode from the ⋮ menu: checkboxes appear, the FAB hides, count tracks", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find('[data-testid="add-word-fab"]').exists()).toBe(true);
    await openActions(wrapper);
    await wrapper.find('[data-testid="action-select"]').trigger("click");
    expect(wrapper.find('[data-testid="row-select"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-word-fab"]').exists()).toBe(false);
    await wrapper.find('[data-testid="word-row"]').trigger("click");
    // The count shows in the ⋮ menu.
    await openActions(wrapper);
    expect(wrapper.text()).toContain("1 selected");
  });

  it("bulk-deletes the selected custom words after one confirm", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await enterCustomSelect(wrapper);
    await openActions(wrapper);
    await wrapper.find('[data-testid="bulk-delete"]').trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(delMock).toHaveBeenCalledWith("/hotaru/words/cs?user=dani");
    expect(wrapper.find('[data-testid="bulk-result"]').text()).toContain(
      "Deleted 1",
    );
    confirm.mockRestore();
  });

  it("bulk-adds the selection to a picked topic", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await enterCustomSelect(wrapper);
    await openActions(wrapper);
    await wrapper.find('[data-testid="bulk-add-topic"]').trigger("click");
    await wrapper.find('[data-testid="bulk-topic-pick-t1"]').trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith(
      "/hotaru/topics/t1/words/cs?user=dani",
    );
    expect(wrapper.find('[data-testid="bulk-result"]').text()).toContain(
      "Added 1",
    );
  });

  it("bulk-changes the lesson via a prompt", async () => {
    const prompt = vi.spyOn(window, "prompt").mockReturnValue("L5");
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await enterCustomSelect(wrapper);
    await openActions(wrapper);
    await wrapper.find('[data-testid="bulk-change-lesson"]').trigger("click");
    await flushPromises();
    expect(putMock).toHaveBeenCalledWith(
      "/hotaru/words/cs?user=dani",
      expect.objectContaining({ lesson: "L5" }),
    );
    prompt.mockRestore();
  });

  it("clears the selection when the section changes", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await enterCustomSelect(wrapper);
    // Switch section → selection cleared (still in select mode, count 0).
    await wrapper.find('[data-testid="section-genki_3"]').trigger("click");
    await openActions(wrapper);
    expect(wrapper.text()).toContain("0 selected");
  });
});
