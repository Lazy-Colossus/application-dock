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

let queue: { word: Word; notes?: Note[] }[] = [];

const OVERVIEW = {
  scope: "lesson:L2",
  word_count: 5,
  familiarity: [3, 2, 0, 0, 0],
};

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-icon": { template: "<i />" },
  // Renders its body only when open, so we can assert the mid-drill dialog
  // opens/closes (WordNotesDialog itself is the real child under test).
  "q-dialog": {
    props: ["modelValue"],
    template: "<div v-if='modelValue'><slot /></div>",
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: ["label", "unelevated", "noCaps", "flat", "disable"],
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
  getMock.mockImplementation((path: string) => {
    if (path.startsWith("/hotaru/users")) return Promise.resolve(USERS);
    if (path.startsWith("/hotaru/practice/overview"))
      return Promise.resolve(OVERVIEW);
    return Promise.resolve(queue);
  });
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

  it("shows the card's notes (delivered with the queue) on reveal", async () => {
    queue = [
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
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    // Hidden before reveal (no answer spoiler).
    expect(wrapper.find('[data-testid="card-notes"]').exists()).toBe(false);
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    const notes = wrapper.find('[data-testid="card-notes"]');
    expect(notes.exists()).toBe(true);
    expect(notes.text()).toContain("looks like a gate");
    expect(notes.text()).toContain("Jake");
  });

  it("marks the note button when the current card has a note, clears it on advance", async () => {
    queue = [
      {
        word: word("g1", "大学", "だいがく", "university"),
        notes: [
          {
            id: "n1",
            word_id: "g1",
            author: "jake",
            text: "gate hook",
            visibility: "shared",
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
      },
      { word: word("g2", null, "ありがとう", "thanks") }, // no notes
    ];
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    // First card has a note → the button shows the "has note" state.
    expect(wrapper.find('[data-testid="drill-add-note"]').classes()).toContain(
      "drill-note--has",
    );
    // Advance to the note-less card → the indicator clears.
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    await wrapper.find('[data-testid="grade-correct"]').trigger("click");
    expect(
      wrapper.find('[data-testid="drill-add-note"]').classes(),
    ).not.toContain("drill-note--has");
  });

  it("attaches a note mid-drill without losing place (Story 3.4)", async () => {
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    // Dialog closed until the note affordance is used.
    expect(wrapper.find('[data-testid="notes-dialog"]').exists()).toBe(false);
    await wrapper.find('[data-testid="drill-add-note"]').trigger("click");
    expect(wrapper.find('[data-testid="notes-dialog"]').exists()).toBe(true);

    // The POST returns the created note.
    postMock.mockResolvedValueOnce({
      id: "n9",
      word_id: "g1",
      author: "dani",
      text: "gate hook",
      visibility: "shared",
      created_at: "2026-01-02T00:00:00Z",
    });
    await wrapper.find('[data-testid="note-text-input"]').setValue("gate hook");
    await wrapper.find('[data-testid="note-add"]').trigger("click");
    await flushPromises();

    // Persisted to the CURRENT word's notes endpoint, no drill advance.
    expect(postMock).toHaveBeenCalledWith("/hotaru/words/g1/notes?user=dani", {
      text: "gate hook",
      visibility: "shared",
    });
    expect(wrapper.find('[data-testid="drill-progress"]').text()).toContain(
      "1 / 2",
    );
    // No grade was recorded (place preserved).
    expect(
      postMock.mock.calls.some((c) =>
        String(c[0]).startsWith("/hotaru/practice/grades"),
      ),
    ).toBe(false);
    // The new note now shows on the card (on reveal, per 3.3).
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="card-notes"]').text()).toContain(
      "gate hook",
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
    // "Back to practice" returns to the picker carrying the scope, so it shows
    // the just-updated stats.
    await wrapper.find('[data-testid="drill-done-btn"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/hotaru/practice?scope=lesson%3AL2");
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

  it("EN→JP: requests the m2r queue and prompts with the English meaning", async () => {
    routeQuery.value = { scope: "lesson:L2", direction: "m2r" };
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/queue?scope=lesson%3AL2&user=dani&direction=m2r",
    );
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe(
      "university",
    );
  });

  it("flips direction per-session without refetching the queue", async () => {
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe("大学");
    await wrapper.find('[data-testid="direction-toggle"]').trigger("click");
    // Same card, now shown EN→JP (English prompt) — no second queue fetch.
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe(
      "university",
    );
    const queueCalls = getMock.mock.calls.filter((c) =>
      String(c[0]).startsWith("/hotaru/practice/queue"),
    );
    expect(queueCalls).toHaveLength(1);
  });

  it("typed mode: an exact reading match records Correct and advances", async () => {
    routeQuery.value = { scope: "lesson:L2", direction: "m2r", mode: "typed" };
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    // Typed UI replaces the Reveal button.
    expect(wrapper.find('[data-testid="reveal-btn"]').exists()).toBe(false);
    await wrapper.find('[data-testid="typed-input"]').setValue("だいがく");
    await wrapper.find('[data-testid="typed-submit"]').trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith("/hotaru/practice/grades?user=dani", [
      { word_id: "g1", grade: "correct" },
    ]);
    // Advanced to the next card's English prompt.
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe("thanks");
  });

  it("typed mode: a miss reveals the Japanese and self-grade records the choice", async () => {
    routeQuery.value = { scope: "lesson:L2", direction: "m2r", mode: "typed" };
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="typed-input"]').setValue("wrong");
    await wrapper.find('[data-testid="typed-submit"]').trigger("click");
    // The answer is revealed (Japanese) with the self-grade buttons.
    expect(wrapper.find('[data-testid="card-answer"]').text()).toContain(
      "大学",
    );
    await wrapper.find('[data-testid="grade-close"]').trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith("/hotaru/practice/grades?user=dani", [
      { word_id: "g1", grade: "close" },
    ]);
  });

  it("ends with a recap: practised count, remaining-in-scope, updated familiarity", async () => {
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    // Grade both cards to reach the end.
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    await wrapper.find('[data-testid="grade-correct"]').trigger("click");
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    await wrapper.find('[data-testid="grade-correct"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="drill-done"]').exists()).toBe(true);
    // Practised 2; scope has 5 → 3 remain.
    expect(wrapper.find('[data-testid="summary-practised"]').text()).toContain(
      "2",
    );
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/overview?scope=lesson%3AL2&user=dani",
    );
    expect(wrapper.find('[data-testid="summary-remaining"]').text()).toContain(
      "3",
    );
    // Updated familiarity distribution rendered (New = 3, Learning = 2).
    expect(wrapper.find('[data-testid="summary-tier-0"]').text()).toContain(
      "New",
    );
    expect(wrapper.find('[data-testid="summary-tier-0"]').text()).toContain(
      "3",
    );
    expect(wrapper.find('[data-testid="summary-tier-1"]').text()).toContain(
      "2",
    );
  });

  it("degrades gracefully when the summary stats fetch fails", async () => {
    queue = [{ word: word("g1", "猫", "ねこ", "cat") }];
    getMock.mockImplementation((path: string) => {
      if (path.startsWith("/hotaru/users")) return Promise.resolve(USERS);
      if (path.startsWith("/hotaru/practice/overview"))
        return Promise.reject(new Error("stats down"));
      return Promise.resolve(queue);
    });
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    await wrapper.find('[data-testid="grade-correct"]').trigger("click");
    await flushPromises();
    // Still shows the recap with the practised count — no page-level error.
    expect(wrapper.find('[data-testid="drill-done"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="summary-practised"]').text()).toContain(
      "1",
    );
    expect(wrapper.find('[data-testid="summary-remaining"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="drill-error"]').exists()).toBe(false);
  });

  it("Quick Practice: threads tiers/lessons filters from the query into the queue", async () => {
    routeQuery.value = {
      scope: "all",
      tiers: "0,1,2",
      lessons: "L2,L4",
      direction: "r2m",
      limit: "30",
    };
    mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/queue?scope=all&user=dani&direction=r2m&tiers=0,1,2&lessons=L2,L4&limit=30",
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
