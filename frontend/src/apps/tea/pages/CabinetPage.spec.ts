import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import CabinetPage from "./CabinetPage.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaCabinetFiltersStore } from "../stores/useTeaCabinetFiltersStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Tea, CatalogueNode, Cabinet } from "../types";

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
    image_url: null,
    brewing: null,
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

/** An unshared cabinet — what the real `/tea/cabinet` returns for a lone user. */
const SOLO: Cabinet = {
  id: null,
  owner: "jakub",
  members: ["jakub"],
  is_owner: true,
};

/** Resolves `/tea/teas` and `/tea/catalogue` from one mock, by path. */
function mockApi(teas: Tea[], nodes: CatalogueNode[] = [NODE]) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teas") return Promise.resolve(teas);
    if (path === "/tea/catalogue") return Promise.resolve(nodes);
    if (path === "/tea/cabinet") return Promise.resolve(SOLO);
    return Promise.resolve([]);
  });
}

/** Leaves the teas fetch pending forever, to inspect the mid-load state. */
function mockApiPending() {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/catalogue") return Promise.resolve([NODE]);
    if (path === "/tea/cabinet") return Promise.resolve(SOLO);
    return new Promise(() => {});
  });
}

function mockApiError(detail: string) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/catalogue") return Promise.resolve([NODE]);
    if (path === "/tea/cabinet") return Promise.resolve(SOLO);
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

  it("opens a tea's page when its card is tapped", async () => {
    mockApi([tea("a")]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="card"]').trigger("click");

    expect(push).toHaveBeenCalledWith({
      name: "tea-detail",
      params: { teaId: "a" },
    });
  });

  it("opens the almanac from the header link", async () => {
    mockApi([]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="cabinet-almanac-link"]').trigger("click");

    expect(push).toHaveBeenCalledWith({ name: "tea-almanac" });
  });

  describe("filters", () => {
    it("hides teas with 0g left once empties are switched off, and counts what is shown", async () => {
      mockApi([tea("full"), tea("gone", { grams_remaining: 0 })]);
      const wrapper = render();
      await flushPromises();

      useTeaCabinetFiltersStore().showEmpty = false;
      await flushPromises();

      expect(wrapper.findAll('[data-testid="card"]')).toHaveLength(1);
      expect(wrapper.get('[data-testid="cabinet-count"]').text()).toBe(
        "1 of 2 teas",
      );
      expect(wrapper.get('[data-testid="cabinet-filters"]').text()).toBe(
        "Filters · 1",
      );
    });

    it("says nothing matches, not that the shelf is empty, and clears from there", async () => {
      mockApi([tea("a")]);
      const wrapper = render();
      await flushPromises();

      useTeaCabinetFiltersStore().query = "nothing like this";
      await flushPromises();

      expect(wrapper.find('[data-testid="cabinet-empty"]').exists()).toBe(
        false,
      );
      await wrapper
        .get('[data-testid="cabinet-clear-filters"]')
        .trigger("click");
      expect(wrapper.findAll('[data-testid="card"]')).toHaveLength(1);
    });

    it("filters by the country of the tea's almanac entry", async () => {
      const wuyi: CatalogueNode = {
        ...NODE,
        id: "oolong.wuyi",
        parent_id: "oolong",
      };
      getMock.mockImplementation((path: string) => {
        if (path === "/tea/teas")
          return Promise.resolve([
            tea("a", { catalogue_node_id: "oolong.wuyi" }),
            tea("b"),
          ]);
        if (path === "/tea/catalogue") return Promise.resolve([NODE, wuyi]);
        if (path === "/tea/cabinet") return Promise.resolve(SOLO);
        if (path === "/tea/almanac")
          return Promise.resolve([
            { catalogue_node_id: "oolong.wuyi", country: "China" },
          ]);
        return Promise.resolve([]);
      });
      const wrapper = render();
      await flushPromises();

      await wrapper.get('[data-testid="cabinet-filters"]').trigger("click");
      await wrapper
        .get('[data-testid="filter-country-China"]')
        .trigger("click");

      expect(
        wrapper.findAll('[data-testid="section-strip"] [data-testid="card"]'),
      ).toHaveLength(1);
      expect(wrapper.get('[data-testid="filters-done"]').text()).toBe(
        "Show 1 tea",
      );
    });
  });

  it("opens the timer from the Brew button", async () => {
    getMock.mockImplementation((path: string) =>
      Promise.resolve(path === "/tea/cabinet" ? SOLO : []),
    );
    const wrapper = render();
    await flushPromises();
    await wrapper.get("[data-testid=cabinet-brew]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-timer" });
  });

  it("says who the cabinet is shared with and opens the household sheet", async () => {
    useAuthStore().username = "jakub";
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/cabinet")
        return Promise.resolve({
          id: "c_1",
          owner: "jakub",
          members: ["jakub", "mia"],
          is_owner: true,
        });
      if (path === "/auth/users") return Promise.resolve({ usernames: [] });
      return Promise.resolve([]);
    });
    const wrapper = render();
    await flushPromises();
    expect(wrapper.get("[data-testid=cabinet-household]").text()).toContain(
      "with mia",
    );
    expect(
      wrapper.get("[data-testid=cabinet-household]").attributes("aria-label"),
    ).toContain("shared with mia");

    await wrapper.get("[data-testid=cabinet-household]").trigger("click");
    expect(wrapper.find("[data-testid=household-sheet]").exists()).toBe(true);
  });

  it("keeps the plain title when nobody shares the cabinet", async () => {
    mockApi([]);
    const wrapper = render();
    await flushPromises();
    expect(wrapper.get("[data-testid=cabinet-household]").text()).toBe(
      "Cabinet",
    );
  });
});
