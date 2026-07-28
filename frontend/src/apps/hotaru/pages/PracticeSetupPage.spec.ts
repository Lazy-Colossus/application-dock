import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push, replace, routeQuery } = vi.hoisted(() => ({
  getMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  routeQuery: { value: {} as Record<string, string> },
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ query: routeQuery.value }),
}));

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

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\">{{ label }}</button>",
    props: ["label", "unelevated", "noCaps"],
    emits: ["click"],
  },
};

function mountPage() {
  return mount(PracticeSetupPage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  localStorage.setItem("hotaru.activeUser", "dani");
  getMock.mockReset();
  getMock.mockImplementation((path: string) => {
    if (path.startsWith("/hotaru/users")) return Promise.resolve(USERS);
    if (path.startsWith("/hotaru/topics")) return Promise.resolve(TOPICS);
    if (path.startsWith("/hotaru/practice/familiarity"))
      return Promise.resolve({});
    return Promise.resolve(WORDS);
  });
  routeQuery.value = {};
  push.mockReset();
  replace.mockReset();
});

describe("PracticeSetupPage", () => {
  // --- Ambient ramp + scopes ------------------------------------------------

  it("shows the library familiarity ramp with the word count", async () => {
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[data-testid="library-ramp"]').exists()).toBe(true);
    // Client-side count over the loaded words (g1 + c1 = 2), all unreviewed.
    expect(wrapper.find('[data-testid="overview-count"]').text()).toContain(
      "2",
    );
    expect(wrapper.find('[data-testid="overview-count"]').text()).toContain(
      "New",
    );
    // No scope selected → no practice CTA yet.
    expect(wrapper.find('[data-testid="start-drill"]').exists()).toBe(false);
  });

  it("lists lesson and topic scope rows, excluding the empty lesson", async () => {
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[data-testid="scope-lesson-L2"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="scope-topic-t1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="scope-lesson-"]').exists()).toBe(false);
  });

  // --- Accordion behaviour --------------------------------------------------

  it("has Quick Practice expanded by default; tapping the header collapses it", async () => {
    const wrapper = mountPage();
    await flushPromises();
    // Quick is the primary action — open on arrival with Start reachable.
    expect(wrapper.find('[data-testid="quick-body"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="start-quick"]').exists()).toBe(true);
    await wrapper.find('[data-testid="quick-toggle"]').trigger("click");
    expect(wrapper.find('[data-testid="quick-body"]').exists()).toBe(false);
  });

  it("keeps one region open at a time (opening a section closes Quick)", async () => {
    const wrapper = mountPage();
    await flushPromises();
    // Quick is open by default…
    expect(wrapper.find('[data-testid="quick-body"]').exists()).toBe(true);
    await wrapper.find('[data-testid="section-lessons"]').trigger("click");
    // …and collapses when the Lessons section opens.
    expect(wrapper.find('[data-testid="quick-body"]').exists()).toBe(false);
  });

  // --- Scope selection + launch ---------------------------------------------

  it("selecting a row opens its actions drawer and launches the drill", async () => {
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[data-testid="scope-actions"]').exists()).toBe(false);
    await wrapper.find('[data-testid="scope-lesson-L2"]').trigger("click");
    expect(wrapper.find('[data-testid="scope-actions"]').exists()).toBe(true);
    await wrapper.find('[data-testid="start-drill"]').trigger("click");
    // Defaults: JP→EN recognition, self-grade.
    expect(push).toHaveBeenCalledWith(
      "/hotaru/drill?scope=lesson%3AL2&label=L2&direction=r2m&mode=self",
    );
  });

  it("offers a Study CTA that routes to the browse flow", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="scope-lesson-L2"]').trigger("click");
    await wrapper.find('[data-testid="start-study"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/hotaru/study?scope=lesson%3AL2");
  });

  it("tapping the selected row again closes its drawer", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="scope-lesson-L2"]').trigger("click");
    expect(wrapper.find('[data-testid="scope-actions"]').exists()).toBe(true);
    await wrapper.find('[data-testid="scope-lesson-L2"]').trigger("click");
    expect(wrapper.find('[data-testid="scope-actions"]').exists()).toBe(false);
  });

  it("selects a topic scope and launches it", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="scope-topic-t1"]').trigger("click");
    await wrapper.find('[data-testid="start-drill"]').trigger("click");
    expect(push).toHaveBeenCalledWith(
      "/hotaru/drill?scope=topic%3At1&label=Food&direction=r2m&mode=self",
    );
  });

  it("offers direction & scoring in the drawer; Typed is EN→JP-only", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="scope-lesson-L2"]').trigger("click");
    expect(
      wrapper.find('[data-testid="mode-typed"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.find('[data-testid="dir-m2r"]').trigger("click");
    expect(
      wrapper.find('[data-testid="mode-typed"]').attributes("disabled"),
    ).toBeUndefined();
  });

  it("launches an EN→JP typed drill with the chosen options", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="scope-lesson-L2"]').trigger("click");
    await wrapper.find('[data-testid="dir-m2r"]').trigger("click");
    await wrapper.find('[data-testid="mode-typed"]').trigger("click");
    await wrapper.find('[data-testid="start-drill"]').trigger("click");
    expect(push).toHaveBeenCalledWith(
      "/hotaru/drill?scope=lesson%3AL2&label=L2&direction=m2r&mode=typed",
    );
  });

  it("resets scoring to self-grade when switching back to JP→EN", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="scope-lesson-L2"]').trigger("click");
    await wrapper.find('[data-testid="dir-m2r"]').trigger("click");
    await wrapper.find('[data-testid="mode-typed"]').trigger("click");
    await wrapper.find('[data-testid="dir-r2m"]').trigger("click");
    await wrapper.find('[data-testid="start-drill"]').trigger("click");
    expect(push).toHaveBeenCalledWith(
      "/hotaru/drill?scope=lesson%3AL2&label=L2&direction=r2m&mode=self",
    );
  });

  // --- Quick Practice (expanded by default) ---------------------------------

  it("shows Direction & Scoring in Quick Practice (Story 2.12)", async () => {
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[data-testid="dir-r2m"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="dir-m2r"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-self"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="mode-typed"]').exists()).toBe(true);
  });

  it("launches Quick Practice with the chosen direction & scoring", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="dir-m2r"]').trigger("click");
    await wrapper.find('[data-testid="mode-typed"]').trigger("click");
    await wrapper.find('[data-testid="start-quick"]').trigger("click");
    const url = String(push.mock.calls.at(-1)?.[0]);
    expect(url).toContain("scope=all");
    expect(url).toContain("direction=m2r");
    expect(url).toContain("mode=typed");
  });

  it("Quick Practice forces self-grade back on JP→EN", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="dir-m2r"]').trigger("click");
    await wrapper.find('[data-testid="mode-typed"]').trigger("click");
    await wrapper.find('[data-testid="dir-r2m"]').trigger("click");
    await wrapper.find('[data-testid="start-quick"]').trigger("click");
    const url = String(push.mock.calls.at(-1)?.[0]);
    expect(url).toContain("direction=r2m");
    expect(url).toContain("mode=self");
  });

  it("Quick count reflects the preset; an empty match shows 0 (magenta) and won't launch", async () => {
    const wrapper = mountPage();
    await flushPromises();
    // Default 'New' [0]; both mock words are unreviewed (tier 0) → 2.
    expect(wrapper.find('[data-testid="quick-count"]').text()).toContain("2");
    expect(wrapper.find('[data-testid="quick-count"]').classes()).not.toContain(
      "quick__count--empty",
    );
    // 'Mastered' [4] matches nothing → "0 words" in the magenta empty style…
    await wrapper.find('[data-testid="quick-fam-mastered"]').trigger("click");
    expect(wrapper.find('[data-testid="quick-count"]').text()).toContain("0");
    expect(wrapper.find('[data-testid="quick-count"]').classes()).toContain(
      "quick__count--empty",
    );
    // …and launching is a no-op (guarded).
    await wrapper.find('[data-testid="start-quick"]').trigger("click");
    expect(push).not.toHaveBeenCalled();
  });

  it("launches Quick Practice with the preset filters (default New, All words)", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="start-quick"]').trigger("click");
    expect(push).toHaveBeenCalledWith(
      "/hotaru/drill?scope=all&label=Quick%20practice&direction=r2m&mode=self&tiers=0&limit=0",
    );
  });

  it("the preview count reflects the words-per-session cap", async () => {
    const many = Array.from({ length: 8 }, (_, i) => word(`m${i}`, "L2"));
    getMock.mockImplementation((path: string) => {
      if (path.startsWith("/hotaru/users")) return Promise.resolve(USERS);
      if (path.startsWith("/hotaru/topics")) return Promise.resolve(TOPICS);
      if (path.startsWith("/hotaru/practice/familiarity"))
        return Promise.resolve({});
      return Promise.resolve(many);
    });
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.find('[data-testid="quick-count"]').text()).toContain("8");
    await wrapper.find('[data-testid="count-opt-5"]').trigger("click");
    expect(wrapper.find('[data-testid="quick-count"]').text()).toContain("5");
  });

  it("the words-per-session option sets the session limit", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.find('[data-testid="count-opt-30"]').trigger("click");
    await wrapper.find('[data-testid="start-quick"]').trigger("click");
    expect(push).toHaveBeenCalledWith(
      "/hotaru/drill?scope=all&label=Quick%20practice&direction=r2m&mode=self&tiers=0&limit=30",
    );
  });

  it("remembers the Quick Practice preset per user across a remount", async () => {
    const first = mountPage();
    await flushPromises();
    await first.find('[data-testid="quick-fam-all"]').trigger("click");
    first.unmount();
    const second = mountPage();
    await flushPromises();
    expect(second.find('[data-testid="quick-fam-all"]').classes()).toContain(
      "practice-chip--active",
    );
  });

  // --- Entry paths ----------------------------------------------------------

  it("auto-opens the scope drawer for a scope passed back from the drill", async () => {
    routeQuery.value = { scope: "lesson:L2" };
    const wrapper = mountPage();
    await flushPromises();
    // Returned from a drill → the scope's drawer is already open, no re-tap.
    expect(wrapper.find('[data-testid="scope-actions"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="start-drill"]').exists()).toBe(true);
  });

  it("keeps Quick Practice expanded when returning from a quick session (scope=all)", async () => {
    routeQuery.value = { scope: "all" };
    const wrapper = mountPage();
    await flushPromises();
    // A Quick session returns ?scope=all — not a lesson/topic row, so Quick
    // stays expanded rather than flipping open the Lessons section.
    expect(wrapper.find('[data-testid="quick-body"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="scope-actions"]').exists()).toBe(false);
  });

  it("redirects to identity when no active user is set", async () => {
    localStorage.clear();
    mountPage();
    await flushPromises();
    expect(replace).toHaveBeenCalledWith("/hotaru/identity");
  });
});
