import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push, replace } = vi.hoisted(() => ({
  getMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push, replace }) }));

import PracticeSetupPage from "./PracticeSetupPage.vue";
import type { Word } from "@/apps/hotaru/types";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

function word(id: string, lesson: string, source = "genki_3"): Word {
  return {
    id,
    source,
    reading: "よみ",
    kanji: null,
    romaji: "yomi",
    meaning: "meaning",
    pos: "noun",
    lesson,
    visibility: "shared",
    drill_caps: ["r2m", "m2r"],
  };
}

const WORDS = [
  word("g1", "L2"),
  word("c1", "", "dani"), // empty lesson — must NOT become a scope option
];
const TOPICS = [{ id: "t1", name: "Food", word_ids: ["g1"] }];
const OVERVIEW = {
  scope: "lesson:L2",
  word_count: 3,
  familiarity: [2, 1, 0, 0, 0],
};

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
  getMock.mockReset();
  getMock.mockImplementation((path: string) => {
    if (path.startsWith("/hotaru/users")) return Promise.resolve(USERS);
    if (path.startsWith("/hotaru/topics")) return Promise.resolve(TOPICS);
    if (path.startsWith("/hotaru/practice/overview"))
      return Promise.resolve(OVERVIEW);
    return Promise.resolve(WORDS);
  });
  push.mockReset();
  replace.mockReset();
});

describe("PracticeSetupPage", () => {
  it("lists lesson and topic scopes, excluding the empty lesson", async () => {
    const wrapper = mount(PracticeSetupPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.find('[data-testid="scope-lesson-L2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="scope-topic-t1"]').exists()).toBe(true);
    // The custom word's empty lesson is not offered as a scope.
    expect(wrapper.find('[data-testid="scope-lesson-"]').exists()).toBe(false);
  });

  it("loads and renders the overview when a scope is selected", async () => {
    const wrapper = mount(PracticeSetupPage, { global: { stubs: STUBS } });
    await flushPromises();
    await wrapper.find('[data-testid="scope-lesson-L2"]').trigger("click");
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/overview?scope=lesson%3AL2&user=dani",
    );
    expect(wrapper.find('[data-testid="overview-count"]').text()).toContain(
      "3",
    );
    // Familiarity buckets render label + count (New = 2, Learning = 1).
    expect(wrapper.find('[data-testid="tier-0"]').text()).toContain("New");
    expect(wrapper.find('[data-testid="tier-0"]').text()).toContain("2");
    expect(wrapper.find('[data-testid="tier-1"]').text()).toContain("1");
  });

  it("launches the drill for the selected scope via the CTA", async () => {
    const wrapper = mount(PracticeSetupPage, { global: { stubs: STUBS } });
    await flushPromises();
    // No CTA until a scope is chosen.
    expect(wrapper.find('[data-testid="start-drill"]').exists()).toBe(false);
    await wrapper.find('[data-testid="scope-lesson-L2"]').trigger("click");
    await flushPromises();
    await wrapper.find('[data-testid="start-drill"]').trigger("click");
    expect(push).toHaveBeenCalledWith(
      "/hotaru/drill?scope=lesson%3AL2&label=L2",
    );
  });

  it("redirects to identity when no active user is set", async () => {
    localStorage.clear();
    mount(PracticeSetupPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(replace).toHaveBeenCalledWith("/hotaru/identity");
  });
});
