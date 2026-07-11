import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, push, replace, routeQuery } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  routeQuery: { value: { scope: "lesson:L2" } as Record<string, string> },
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ query: routeQuery.value }),
}));

import DrillPage from "./DrillPage.vue";
import type { Word } from "@/apps/hotaru/types";

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

let queue: { word: Word }[] = [];

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
  queue = [
    { word: word("g1", "大学", "だいがく", "university") },
    { word: word("g2", null, "ありがとう", "thanks") },
  ];
  getMock.mockReset();
  getMock.mockImplementation((path: string) =>
    path.startsWith("/hotaru/users")
      ? Promise.resolve(USERS)
      : Promise.resolve(queue),
  );
  postMock.mockReset().mockResolvedValue({});
  push.mockReset();
  replace.mockReset();
});

describe("DrillPage", () => {
  it("loads the queue and shows the first card (prompt only)", async () => {
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/queue?scope=lesson%3AL2&user=dani&direction=r2m",
    );
    expect(wrapper.find('[data-testid="flashcard"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe("大学");
    expect(wrapper.find('[data-testid="card-answer"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="drill-progress"]').text()).toContain(
      "1 / 2",
    );
  });

  it("reveals then grades to advance to the next card", async () => {
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="card-answer"]').text()).toContain(
      "university",
    );
    // Grade buttons replace the plain "Next".
    expect(wrapper.find('[data-testid="next-btn"]').exists()).toBe(false);
    await wrapper.find('[data-testid="grade-correct"]').trigger("click");
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe(
      "ありがとう",
    );
    expect(wrapper.find('[data-testid="drill-progress"]').text()).toContain(
      "2 / 2",
    );
  });

  it("syncs each grade in the background mid-session", async () => {
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    // Grade the first of two cards — it syncs immediately, before the end.
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    await wrapper.find('[data-testid="grade-correct"]').trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith("/hotaru/practice/grades?user=dani", [
      { word_id: "g1", grade: "correct" },
    ]);
    // Still mid-session (second card showing), not the done state.
    expect(wrapper.find('[data-testid="flashcard"]').exists()).toBe(true);
  });

  it("reaches a clean end and flushes a grade batch", async () => {
    queue = [{ word: word("g1", "猫", "ねこ", "cat") }];
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    await wrapper.find('[data-testid="grade-close"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="drill-done"]').exists()).toBe(true);
    // The batch synced in the background to the grades endpoint.
    expect(postMock).toHaveBeenCalledWith("/hotaru/practice/grades?user=dani", [
      { word_id: "g1", grade: "close" },
    ]);
  });

  it("shows the scope label passed by the picker above the card", async () => {
    routeQuery.value = { scope: "topic:t1", label: "Food" };
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find('[data-testid="drill-scope"]').text()).toContain(
      "Food",
    );
  });

  it("toggles furigana on the prompt (kanji word only)", async () => {
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    // Off by default — no furigana on the (kanji) first card.
    expect(wrapper.find('[data-testid="card-furigana"]').exists()).toBe(false);
    await wrapper.find('[data-testid="reading-aid-toggle"]').trigger("click");
    expect(wrapper.find('[data-testid="card-furigana"]').text()).toBe(
      "だいがく",
    );
  });

  it("hides the aid on the prompt for a kana-only word", async () => {
    queue = [{ word: word("g1", null, "ありがとう", "thanks") }];
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    // Nothing to reveal — the kana is already the headword.
    expect(wrapper.find('[data-testid="reading-aid-toggle"]').exists()).toBe(
      false,
    );
  });

  it("toggles romaji on the reveal step", async () => {
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    // Romaji hidden by default on reveal.
    expect(wrapper.find('[data-testid="card-answer"]').text()).not.toContain(
      "romaji",
    );
    await wrapper.find('[data-testid="reading-aid-toggle"]').trigger("click");
    expect(wrapper.find('[data-testid="card-answer"]').text()).toContain(
      "romaji",
    );
  });

  it("shows the empty state when the scope has no words", async () => {
    queue = [];
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find('[data-testid="drill-empty"]').exists()).toBe(true);
  });

  it("redirects to identity when no active user is set", async () => {
    localStorage.clear();
    mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(replace).toHaveBeenCalledWith("/hotaru/identity");
  });

  it("redirects to the picker when no scope is given", async () => {
    routeQuery.value = {};
    mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(replace).toHaveBeenCalledWith("/hotaru/practice");
  });
});
