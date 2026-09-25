import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: putMock, del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import CabinetPage from "./CabinetPage.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import type { Tea, CatalogueNode } from "../types";

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
};

function tea(id: string, overrides: Partial<Tea> = {}): Tea {
  return {
    id,
    name: id,
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

const NODE: CatalogueNode = {
  id: "oolong",
  parent_id: null,
  name: "Oolong",
  name_zh: "烏龍",
  source: "seed",
  default_origin: "",
};

/** Resolves `/tea/teas` and `/tea/catalogue` from one mock, by path. */
function mockApi(teas: Tea[], nodes: CatalogueNode[] = [NODE]) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teas") return Promise.resolve(teas);
    if (path === "/tea/catalogue") return Promise.resolve(nodes);
    return Promise.resolve([]);
  });
}

/** Leaves the teas fetch pending forever, to inspect the mid-load state. */
function mockApiPending() {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/catalogue") return Promise.resolve([NODE]);
    return new Promise(() => {});
  });
}

function mockApiError(detail: string) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/catalogue") return Promise.resolve([NODE]);
    return Promise.reject(new Error(detail));
  });
}

function render() {
  return mount(CabinetPage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("CabinetPage", () => {
  it("invites you to add the first tea when the cabinet is empty", async () => {
    mockApi([]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="cabinet-empty"]').text()).toContain(
      "Nothing on the shelf yet",
    );
  });

  it("shows no empty state while still loading", async () => {
    mockApiPending();
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="cabinet-empty"]').exists()).toBe(false);
  });

  it("renders a section per class that has teas", async () => {
    mockApi([tea("a"), tea("b", { class_id: "green" })]);
    const wrapper = render();
    await flushPromises();

    const names = wrapper
      .findAll('[data-testid="section-name"]')
      .map((n) => n.text());
    expect(names).toEqual(["Green", "Oolong"]);
  });

  it("counts the teas in the header", async () => {
    mockApi([tea("a"), tea("b")]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="cabinet-count"]').text()).toBe("2 teas");
  });

  it("says one tea in the singular", async () => {
    mockApi([tea("a")]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="cabinet-count"]').text()).toBe("1 tea");
  });

  it("surfaces an error with what to do next, and hides the empty state", async () => {
    mockApiError(
      "Couldn't load your cabinet. Check your connection and try again.",
    );
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="cabinet-error"]').text()).toContain(
      "Couldn't load",
    );
    expect(wrapper.find('[data-testid="cabinet-empty"]').exists()).toBe(false);
  });

  it("does not render stale teas under the error banner when a later load fails", async () => {
    mockApi([tea("a")]);
    const wrapper = render();
    await flushPromises();
    expect(wrapper.findAll('[data-testid="section-name"]')).toHaveLength(1);

    mockApiError(
      "Couldn't load your cabinet. Check your connection and try again.",
    );
    await useTeaCabinetStore().fetchTeas();
    await flushPromises();

    expect(wrapper.get('[data-testid="cabinet-error"]').text()).toContain(
      "Couldn't load",
    );
    expect(wrapper.findAll('[data-testid="section-name"]')).toHaveLength(0);
  });

  it("loads the shelf and the catalogue on mount", async () => {
    mockApi([]);
    render();
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/teas");
    expect(getMock).toHaveBeenCalledWith("/tea/catalogue");
  });

  it("opens the grams sheet for the tapped rim, and saving commits it and closes it", async () => {
    mockApi([tea("a", { grams_remaining: 38 })]);
    putMock.mockResolvedValue(tea("a", { grams_remaining: 37 }));
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="row-rim"]').trigger("click");
    expect(wrapper.get('[data-testid="grams-value"]').text()).toContain("38");

    await wrapper.get('[data-testid="grams-minus"]').trigger("click");
    await wrapper.get('[data-testid="grams-save"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/tea/teas/a",
      expect.objectContaining({ grams_remaining: 37 }),
    );
    expect(wrapper.find('[data-testid="grams-sheet"]').exists()).toBe(false);
  });

  it("closes the sheet on cancel without writing anything", async () => {
    mockApi([tea("a")]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="row-rim"]').trigger("click");
    await wrapper.get('[data-testid="grams-cancel"]').trigger("click");

    expect(wrapper.find('[data-testid="grams-sheet"]').exists()).toBe(false);
    expect(putMock).not.toHaveBeenCalled();
  });

  it("opens the almanac from the header link", async () => {
    mockApi([]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="cabinet-almanac-link"]').trigger("click");

    expect(push).toHaveBeenCalledWith({ name: "tea-almanac" });
  });
});
