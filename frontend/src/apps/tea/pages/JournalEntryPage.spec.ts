import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises, RouterLinkStub } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, delMock, push, replace } = vi.hoisted(() => ({
  getMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: vi.fn(), del: delMock, upload: vi.fn(), post: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ params: { id: "s-1" }, query: {} }),
}));

import JournalEntryPage from "./JournalEntryPage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import type { JournalEntry } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" }, RouterLink: RouterLinkStub };

const ENTRY: JournalEntry = {
  id: "s-1",
  tea_id: "t-1",
  away_tea_name: "",
  away_class_id: null,
  status: "finalised",
  started_at: "2026-09-28T18:00:00Z",
  leaf_grams: 5,
  water_temp_c: 95,
  rating: 4,
  curve_source: "generic",
  curve_source_label: "",
  infusions: [
    { number: 1, target_seconds: 20, actual_seconds: 21 },
    { number: 2, target_seconds: 25, actual_seconds: 25 },
  ],
  teaware_id: null,
  timed: true,
  cha_xi: { moods: ["calm", "social"], guests: "Eva", notes: "orchid\nstone" },
  tasting: null,
  brewed_by: "jakub",
  vessel_volume_ml: null,
  updated_at: "2026-09-28T18:30:00Z",
  finished_at: "2026-09-28T18:30:00Z",
  image_url: null,
  tea_name: "Dan Cong",
  class_id: "oolong",
  tea_image_url: null,
};

async function render(entry: JournalEntry | null = ENTRY) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/journal") return Promise.resolve(entry ? [entry] : []);
    return Promise.resolve([]);
  });
  const wrapper = mount(JournalEntryPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().username = "jakub";
  getMock.mockReset();
  delMock.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  replace.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("JournalEntryPage", () => {
  it("shows the whole sitting", async () => {
    const wrapper = await render();
    expect(wrapper.getComponent(RouterLinkStub).props("to")).toEqual({
      name: "tea-detail",
      params: { teaId: "t-1" },
    });
    expect(wrapper.get("[data-testid=journal-moods]").text()).toBe("calm · social");
    expect(wrapper.get("[data-testid=journal-guests]").text()).toContain("Eva");
    expect(wrapper.get("[data-testid=journal-notes]").text()).toContain("orchid");
    expect(wrapper.findAll("[data-testid=journal-timeline] li").map((li) => li.text())).toEqual([
      "21s / 20s",
      "25s / 25s",
    ]);
    expect(wrapper.get("[data-testid=journal-facts]").text()).toContain("95 °C");
  });

  it("lets only the brewer edit or delete", async () => {
    const wrapper = await render({ ...ENTRY, brewed_by: "eva" });
    expect(wrapper.find("[data-testid=journal-edit]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=journal-delete]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=journal-brewer]").text()).toContain("eva");
  });

  it("opens the edit form", async () => {
    const wrapper = await render();
    await wrapper.get("[data-testid=journal-edit]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-journal-edit", params: { id: "s-1" } });
  });

  it("names the grams a delete gives back, and goes to the Journal after", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = await render();
    await wrapper.get("[data-testid=journal-delete]").trigger("click");
    await flushPromises();
    expect(confirm).toHaveBeenCalledWith("Delete this sitting? 5 g goes back to Dan Cong.");
    expect(delMock).toHaveBeenCalledWith("/tea/sessions/s-1/journal");
    expect(replace).toHaveBeenCalledWith({ name: "tea-journal" });
  });

  it("keeps the sitting when the delete is cancelled", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const wrapper = await render();
    await wrapper.get("[data-testid=journal-delete]").trigger("click");
    expect(delMock).not.toHaveBeenCalled();
  });

  it("says so when the sitting is gone", async () => {
    const wrapper = await render(null);
    expect(wrapper.find("[data-testid=journal-missing]").exists()).toBe(true);
  });
});
