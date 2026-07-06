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

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.setItem("hotaru.activeUser", "dani");
  // First call = users (from userStore.loadUsers), second = words.
  getMock.mockReset();
  getMock.mockImplementation((path: string) =>
    path.startsWith("/hotaru/users")
      ? Promise.resolve(USERS)
      : Promise.resolve(WORDS),
  );
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

  it("the ＋ FAB routes to add-word", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="add-word-fab"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/hotaru/add-word");
  });

  it("shows edit/delete affordances for Custom words but not textbook words", async () => {
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    // Textbook section (default) → no delete affordance.
    expect(wrapper.find('[data-testid="delete-word"]').exists()).toBe(false);
    // Custom → Shared → editable.
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-shared"]').trigger("click");
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
    await wrapper.find('[data-testid="edit-word"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/hotaru/words/cs/edit");
  });

  it("delete asks for confirmation and calls the API on confirm", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="section-__custom__"]').trigger("click");
    await wrapper.find('[data-testid="sub-shared"]').trigger("click");
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
    await wrapper.find('[data-testid="delete-word"]').trigger("click");
    await flushPromises();
    expect(delMock).not.toHaveBeenCalled();
    confirm.mockRestore();
  });
});
