import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { useTeaAlmanacStore } from "../stores/useTeaAlmanacStore";
import type { AlmanacEntryView, CatalogueNode } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function node(id: string, parent_id: string | null): CatalogueNode {
  return {
    id,
    parent_id,
    name: id,
    name_zh: "",
    default_origin: "",
    source: "seed",
  };
}

const NODES = [
  node("green", null),
  node("green.longjing", "green"),
  node("green.japanese", "green"),
  node("green.japanese.sencha", "green.japanese"),
  node("oolong", null),
  node("oolong.tieguanyin", "oolong"),
];

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

const SENCHA = entry({
  catalogue_node_id: "green.japanese.sencha",
  country: "Japan",
  name: "Sencha",
  name_zh: "煎茶",
});
const TIEGUANYIN = entry({
  catalogue_node_id: "oolong.tieguanyin",
  name: "Tieguanyin",
  name_zh: "鐵觀音",
});

function serve(entries: AlmanacEntryView[] | Error) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/catalogue") return Promise.resolve(NODES);
    return entries instanceof Error
      ? Promise.reject(entries)
      : Promise.resolve(entries);
  });
}

function render() {
  return mount(AlmanacPage, { global: { stubs: STUBS } });
}

function texts(wrapper: ReturnType<typeof render>, testid: string): string[] {
  return wrapper.findAll(`[data-testid="${testid}"]`).map((el) => el.text());
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AlmanacPage", () => {
  it("reads as chapters of classes, each grouped by country", async () => {
    serve([SENCHA, TIEGUANYIN, entry()]);
    const wrapper = render();
    await flushPromises();

    expect(texts(wrapper, "almanac-chapter-name")).toEqual(["Green", "Oolong"]);
    expect(texts(wrapper, "almanac-group-name")).toEqual([
      "China",
      "Japan",
      "China",
    ]);
    expect(wrapper.findAll('[data-testid="almanac-row"]')).toHaveLength(3);
    expect(wrapper.get('[data-testid="almanac-count"]').text()).toBe("3 teas");
  });

  it("leaves the page title to the shell bar", async () => {
    serve([entry()]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.text()).not.toContain("Almanac");
  });

  it("regroups as an atlas of countries when switched to place", async () => {
    serve([SENCHA, TIEGUANYIN, entry()]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="almanac-view-place"]').trigger("click");

    expect(texts(wrapper, "almanac-chapter-name")).toEqual(["China", "Japan"]);
    expect(texts(wrapper, "almanac-group-name")).toEqual([
      "Green",
      "Oolong",
      "Green",
    ]);
    expect(useTeaAlmanacStore().view).toBe("place");
  });

  it("opens in the view it was last left in", async () => {
    serve([SENCHA, entry()]);
    useTeaAlmanacStore().view = "place";
    const wrapper = render();
    await flushPromises();

    expect(texts(wrapper, "almanac-chapter-name")).toEqual(["China", "Japan"]);
    expect(
      wrapper
        .get('[data-testid="almanac-view-place"]')
        .attributes("aria-pressed"),
    ).toBe("true");
  });

  it("offers one rail chip per chapter", async () => {
    serve([SENCHA, TIEGUANYIN, entry()]);
    const wrapper = render();
    await flushPromises();

    expect(texts(wrapper, "almanac-chip")).toEqual(["綠", "烏"]);
  });

  it("scrolls to a chapter when its chip is tapped", async () => {
    serve([SENCHA, TIEGUANYIN, entry()]);
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo;
    const wrapper = render();
    await flushPromises();

    await wrapper.findAll('[data-testid="almanac-chip"]')[1].trigger("click");

    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth" }),
    );
  });

  it("opens a random page from the teas on show", async () => {
    serve([SENCHA, TIEGUANYIN, entry()]);
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="almanac-random"]').trigger("click");

    expect(push).toHaveBeenCalledWith({
      name: "tea-almanac-entry",
      params: { catalogueNodeId: expect.any(String) },
    });
    const picked = push.mock.calls[0][0].params.catalogueNodeId;
    expect(
      [SENCHA, TIEGUANYIN, entry()].map((e) => e.catalogue_node_id),
    ).toContain(picked);
  });

  it("disables the random page when nothing is on show", async () => {
    serve([]);
    const wrapper = render();
    await flushPromises();

    expect(
      wrapper.get('[data-testid="almanac-random"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("shows the empty state when nothing matches", async () => {
    serve([]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-empty"]').text()).toContain(
      "No teas match",
    );
  });

  it("refetches with the search text when it changes", async () => {
    serve([entry()]);
    const wrapper = render();
    await flushPromises();
    getMock.mockClear();

    await wrapper.get('[data-testid="almanac-search"]').setValue("longjing");
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/tea/almanac?q=longjing");
  });

  it("opens the entry's detail page when a row is tapped", async () => {
    serve([entry()]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="almanac-row"]').trigger("click");

    expect(push).toHaveBeenCalledWith({
      name: "tea-almanac-entry",
      params: { catalogueNodeId: "green.longjing" },
    });
  });

  it("surfaces an error and hides the empty state", async () => {
    serve(Object.assign(new Error("no"), { detail: "Couldn't load." }));
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="almanac-error"]').text()).toContain(
      "Couldn't load",
    );
    expect(wrapper.find('[data-testid="almanac-empty"]').exists()).toBe(false);
  });
});
