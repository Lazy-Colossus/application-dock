import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

import LibraryPage from "./LibraryPage.vue";
import type { Word } from "@/apps/hotaru/types";

function word(id: string, lesson: string, meaning: string): Word {
  return {
    id,
    source: "genki_3",
    reading: "よみ",
    kanji: null,
    romaji: "yomi",
    meaning,
    pos: "noun",
    lesson,
    visibility: "shared",
    drill_caps: ["r2m", "m2r"],
  };
}

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  getMock.mockReset();
});

describe("LibraryPage", () => {
  it("renders a tab per lesson and the first lesson rows by default", async () => {
    getMock.mockResolvedValueOnce([
      word("a", "G", "thanks"),
      word("b", "L1", "university"),
      word("c", "L1", "teacher"),
    ]);
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find('[data-testid="lesson-G"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lesson-L1"]').exists()).toBe(true);
    // Default selection = first lesson (G) → shows its one word.
    expect(wrapper.findAll('[data-testid="word-row"]')).toHaveLength(1);
    expect(wrapper.text()).toContain("thanks");
  });

  it("switches the visible words when another lesson tab is chosen", async () => {
    getMock.mockResolvedValueOnce([
      word("a", "G", "thanks"),
      word("b", "L1", "university"),
      word("c", "L1", "teacher"),
    ]);
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="lesson-L1"]').trigger("click");
    expect(wrapper.findAll('[data-testid="word-row"]')).toHaveLength(2);
    expect(wrapper.text()).toContain("university");
    expect(wrapper.text()).toContain("teacher");
  });

  it("shows a calm empty state when there are no words", async () => {
    getMock.mockResolvedValueOnce([]);
    const wrapper = mount(LibraryPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find('[data-testid="library-empty"]').exists()).toBe(true);
  });
});
