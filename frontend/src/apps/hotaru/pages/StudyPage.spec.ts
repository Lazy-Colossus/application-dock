import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push, replace, routeQuery } = vi.hoisted(() => ({
  getMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  routeQuery: { value: { scope: "lesson:L2" } as Record<string, string> },
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ query: routeQuery.value }),
}));

import StudyPage from "./StudyPage.vue";
import type { Note, Word } from "@/apps/hotaru/types";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

function word(
  id: string,
  kanji: string | null,
  reading: string,
  meaning: string,
): Word {
  return {
    id,
    source: "genki_3",
    reading,
    kanji,
    romaji: "romaji",
    meaning,
    pos: "noun",
    lesson: "L2",
    visibility: "shared",
    drill_caps: ["r2m", "m2r"],
  };
}

type StudyItem = { word: Word; notes: Note[] };
let studyList: StudyItem[] = [];

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-icon": { template: "<i />" },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\">{{ label }}</button>",
    props: ["label", "unelevated", "noCaps"],
    emits: ["click"],
  },
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.setItem("hotaru.activeUser", "dani");
  routeQuery.value = { scope: "lesson:L2" };
  studyList = [
    { word: word("g1", "大学", "だいがく", "university"), notes: [] },
    { word: word("g2", null, "ありがとう", "thanks"), notes: [] },
  ];
  getMock.mockReset();
  getMock.mockImplementation((path: string) =>
    path.startsWith("/hotaru/users")
      ? Promise.resolve(USERS)
      : Promise.resolve(studyList),
  );
  push.mockReset();
  replace.mockReset();
});

describe("StudyPage", () => {
  it("loads the study list and shows the first full-info card", async () => {
    const wrapper = mount(StudyPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/study?scope=lesson%3AL2&user=dani",
    );
    expect(wrapper.find('[data-testid="study-card"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="study-headword"]').text()).toBe("大学");
    expect(wrapper.find('[data-testid="study-progress"]').text()).toContain(
      "1 / 2",
    );
  });

  it("advances through the words with Next word, then reaches a clean end", async () => {
    const wrapper = mount(StudyPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="next-word-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="study-headword"]').text()).toBe(
      "ありがとう",
    );
    // Advancing past the last card ends the session cleanly.
    await wrapper.find('[data-testid="next-word-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="study-done"]').exists()).toBe(true);
    await wrapper.find('[data-testid="study-done-btn"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/hotaru/library");
  });

  it("shows the current word's notes on the study card", async () => {
    studyList = [
      {
        word: word("g1", "大学", "だいがく", "university"),
        notes: [
          {
            id: "n1",
            word_id: "g1",
            author: "jake",
            text: "looks like a gate",
            visibility: "shared",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
    ];
    const wrapper = mount(StudyPage, { global: { stubs: STUBS } });
    await flushPromises();
    const notes = wrapper.find('[data-testid="study-notes"]');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toContain("looks like a gate");
    expect(notes.text()).toContain("Jake");
  });

  it("shows the empty state when the scope has no words", async () => {
    studyList = [];
    const wrapper = mount(StudyPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find('[data-testid="study-empty"]').exists()).toBe(true);
  });

  it("redirects to identity when no active user is set", async () => {
    localStorage.clear();
    mount(StudyPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(replace).toHaveBeenCalledWith("/hotaru/identity");
  });

  it("redirects to the picker when no scope is given", async () => {
    routeQuery.value = {};
    mount(StudyPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(replace).toHaveBeenCalledWith("/hotaru/practice");
  });
});
