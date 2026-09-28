import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises, RouterLinkStub } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push } = vi.hoisted(() => ({ getMock: vi.fn(), push: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: vi.fn(), del: vi.fn(), upload: vi.fn(), post: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: {}, query: {} }),
}));

import JournalPage from "./JournalPage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import type { JournalEntry } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" }, RouterLink: RouterLinkStub };

function entry(id: string, overrides: Partial<JournalEntry> = {}): JournalEntry {
  return {
    id,
    tea_id: "t-1",
    away_tea_name: "",
    away_class_id: null,
    status: "finalised",
    started_at: "2026-09-28T18:00:00Z",
    leaf_grams: 5,
    water_temp_c: null,
    rating: 4,
    curve_source: "generic",
    curve_source_label: "",
    infusions: [{ number: 1, target_seconds: 10, actual_seconds: 11 }],
    teaware_id: null,
    timed: true,
    cha_xi: null,
    brewed_by: "jakub",
    vessel_volume_ml: null,
    updated_at: "2026-09-28T18:30:00Z",
    finished_at: "2026-09-28T18:30:00Z",
    image_url: null,
    tea_name: "Tieguanyin",
    class_id: "oolong",
    tea_image_url: null,
    ...overrides,
  };
}

async function render(entries: JournalEntry[]) {
  getMock.mockResolvedValue(entries);
  const wrapper = mount(JournalPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  sessionStorage.clear();
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.username = "jakub";
  // imageSrc needs a token to build a photo URL at all.
  auth.token = "a-token";
  getMock.mockReset();
  push.mockReset();
});

describe("JournalPage", () => {
  it("lists sittings under month headings, newest first", async () => {
    const wrapper = await render([
      entry("s-1"),
      entry("s-2", { started_at: "2026-08-20T18:00:00Z" }),
    ]);
    expect(wrapper.findAll("[data-testid=journal-month]").map((h) => h.text())).toEqual([
      "September 2026",
      "August 2026",
    ]);
  });

  it("gives a photo sitting the big card and nudges your plain ones toward cha xi", async () => {
    const wrapper = await render([
      entry("s-1", { image_url: "/api/tea/sessions/s-1/image" }),
      entry("s-2"),
      entry("s-3", { brewed_by: "eva" }),
    ]);
    const card = (id: string) => wrapper.get(`[data-testid=journal-card-${id}]`);
    expect(card("s-1").classes()).toContain("jcard--photo");
    expect(card("s-2").classes()).toContain("jcard--compact");
    expect(card("s-2").find("[data-testid=journal-card-hint]").exists()).toBe(true);
    expect(card("s-3").find("[data-testid=journal-card-hint]").exists()).toBe(false);
    expect(card("s-3").text()).toContain("eva");
  });

  it("narrows to sittings with cha xi, and remembers it", async () => {
    const wrapper = await render([
      entry("s-1", { cha_xi: { moods: ["calm"], guests: "", notes: "" } }),
      entry("s-2"),
    ]);
    await wrapper.get("[data-testid=journal-chaxi-only]").trigger("click");
    expect(wrapper.find("[data-testid=journal-card-s-2]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=journal-card-s-1]").exists()).toBe(true);
    expect(sessionStorage.getItem("tea-journal:chaxi-only")).toBe("1");
  });

  it("says so when the Journal is empty, and starts a new entry", async () => {
    const wrapper = await render([]);
    expect(wrapper.find("[data-testid=journal-empty]").exists()).toBe(true);
    await wrapper.get("[data-testid=journal-new]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-journal-new" });
  });

  it("names an away sitting as away", async () => {
    const wrapper = await render([
      entry("s-1", {
        tea_id: null,
        timed: false,
        away_tea_name: "Dancong",
        tea_name: "Dancong",
        infusions: [],
      }),
    ]);
    expect(wrapper.get("[data-testid=journal-card-s-1]").text()).toContain("away");
  });
});
