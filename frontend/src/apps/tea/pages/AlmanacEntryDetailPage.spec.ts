import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock },
}));
const back = vi.fn();
vi.mock("vue-router", () => ({
  useRouter: () => ({ back }),
  useRoute: () => ({ params: { catalogueNodeId: "green.longjing" } }),
}));

import AlmanacEntryDetailPage from "./AlmanacEntryDetailPage.vue";
import type { AlmanacEntryView } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function entry(overrides: Partial<AlmanacEntryView> = {}): AlmanacEntryView {
  return {
    catalogue_node_id: "green.longjing",
    country: "China",
    reading: "Lóngjǐng",
    summary: "A flat, pan-fired green tea from West Lake.",
    brewing: { leaf_grams: 3, water_temp_c: 80, steep_seconds: [30, 45, 60] },
    source: "seed",
    name: "Longjing",
    name_zh: "龍井",
    default_origin: "Xihu, Zhejiang",
    ...overrides,
  };
}

function render() {
  return mount(AlmanacEntryDetailPage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("AlmanacEntryDetailPage", () => {
  it("fetches and renders the entry when the store starts empty", async () => {
    getMock.mockResolvedValue(entry());
    const wrapper = render();
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac/green.longjing");
    expect(wrapper.get('[data-testid="almanac-entry-title"]').text()).toContain(
      "Longjing",
    );
    expect(wrapper.get('[data-testid="almanac-entry-country"]').text()).toBe(
      "China",
    );
    expect(wrapper.get('[data-testid="almanac-entry-grams"]').text()).toBe(
      "3g",
    );
    expect(wrapper.get('[data-testid="almanac-entry-temp"]').text()).toBe(
      "80°C",
    );
    expect(wrapper.get('[data-testid="almanac-entry-steeps"]').text()).toBe(
      "30s, 45s, 60s",
    );
  });

  it("shows 'Not recorded' for brewing fields the entry does not have", async () => {
    getMock.mockResolvedValue(
      entry({
        brewing: { leaf_grams: null, water_temp_c: null, steep_seconds: [] },
      }),
    );
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-entry-grams"]').text()).toBe(
      "Not recorded",
    );
    expect(wrapper.get('[data-testid="almanac-entry-temp"]').text()).toBe(
      "Not recorded",
    );
    expect(wrapper.get('[data-testid="almanac-entry-steeps"]').text()).toBe(
      "Not recorded",
    );
  });

  it("shows a missing message when no entry matches the route id", async () => {
    getMock.mockResolvedValue(
      entry({ catalogue_node_id: "green.japanese.sencha" }),
    );
    const wrapper = render();
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac/green.longjing");
    expect(
      wrapper.get('[data-testid="almanac-entry-missing"]').text(),
    ).toContain("No almanac entry");
  });

  it("shows the default_origin when the entry has one", async () => {
    getMock.mockResolvedValue(entry({ default_origin: "Xihu, Zhejiang" }));
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-entry-origin"]').text()).toBe(
      "Xihu, Zhejiang",
    );
  });

  it("fetches the entry directly when it is missing from an already-loaded (filtered) store", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/almanac/green.longjing")
        return Promise.resolve(entry());
      return Promise.resolve([
        entry({ catalogue_node_id: "green.japanese.sencha", country: "Japan" }),
      ]);
    });
    const wrapper = render();
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac/green.longjing");
    expect(wrapper.get('[data-testid="almanac-entry-title"]').text()).toContain(
      "Longjing",
    );
  });

  it("shows an error banner when fetching the entry fails", async () => {
    getMock.mockRejectedValue(
      Object.assign(new Error("no"), { detail: "Couldn't load that tea." }),
    );
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-entry-error"]').text()).toContain(
      "Couldn't load",
    );
    expect(wrapper.find('[data-testid="almanac-entry-missing"]').exists()).toBe(
      false,
    );
  });
});
