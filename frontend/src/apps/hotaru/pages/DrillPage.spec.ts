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

  it("reveals then advances to the next card", async () => {
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="card-answer"]').text()).toContain(
      "university",
    );
    await wrapper.find('[data-testid="next-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="card-prompt"]').text()).toBe(
      "ありがとう",
    );
    expect(wrapper.find('[data-testid="drill-progress"]').text()).toContain(
      "2 / 2",
    );
  });

  it("reaches a clean end when the queue is exhausted", async () => {
    queue = [{ word: word("g1", "猫", "ねこ", "cat") }];
    const wrapper = mount(DrillPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="reveal-btn"]').trigger("click");
    await wrapper.find('[data-testid="next-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="drill-done"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="flashcard"]').exists()).toBe(false);
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
