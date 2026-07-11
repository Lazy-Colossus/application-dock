import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, delMock, push, replace } = vi.hoisted(() => ({
  getMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: delMock },
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
    return Promise.resolve(WORDS);
  });
  delMock.mockReset().mockResolvedValue(undefined);
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
});
