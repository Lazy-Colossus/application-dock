import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import AlmanacPage from "./AlmanacPage.vue";
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
  return mount(AlmanacPage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("AlmanacPage", () => {
  it("lists every entry the initial load returns", async () => {
    getMock.mockResolvedValue([
      entry(),
      entry({
        catalogue_node_id: "green.japanese.sencha",
        country: "Japan",
        name: "Sencha",
      }),
    ]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.findAll('[data-testid="almanac-row"]')).toHaveLength(2);
    expect(wrapper.get('[data-testid="almanac-count"]').text()).toBe("2 teas");
  });

  it("shows the empty state when nothing matches", async () => {
    getMock.mockResolvedValue([]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-empty"]').text()).toContain(
      "No teas match",
    );
  });

  it("offers every country seen in the initial load as a filter option", async () => {
    getMock.mockResolvedValue([
      entry(),
      entry({ catalogue_node_id: "x", country: "Japan" }),
    ]);
    const wrapper = render();
    await flushPromises();

    const options = wrapper
      .findAll('[data-testid="almanac-country"] option')
      .map((o) => o.text());
    expect(options).toEqual(["All countries", "China", "Japan"]);
  });

  it("refetches with the country filter when it changes", async () => {
    getMock.mockResolvedValue([entry()]);
    const wrapper = render();
    await flushPromises();
    getMock.mockClear();
    getMock.mockResolvedValue([entry()]);

    await wrapper.get('[data-testid="almanac-country"]').setValue("China");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac?country=China");
  });

  it("refetches with the search text when it changes", async () => {
    getMock.mockResolvedValue([entry()]);
    const wrapper = render();
    await flushPromises();
    getMock.mockClear();
    getMock.mockResolvedValue([entry()]);

    await wrapper.get('[data-testid="almanac-search"]').setValue("longjing");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac?q=longjing");
  });

  it("opens the entry's detail page when a row is tapped", async () => {
    getMock.mockResolvedValue([entry()]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="almanac-row"]').trigger("click");

    expect(push).toHaveBeenCalledWith({
      name: "tea-almanac-entry",
      params: { catalogueNodeId: "green.longjing" },
    });
  });

  it("surfaces an error and hides the empty state", async () => {
    getMock.mockRejectedValue(
      Object.assign(new Error("no"), { detail: "Couldn't load." }),
    );
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-error"]').text()).toContain(
      "Couldn't load",
    );
    expect(wrapper.find('[data-testid="almanac-empty"]').exists()).toBe(false);
  });
});
