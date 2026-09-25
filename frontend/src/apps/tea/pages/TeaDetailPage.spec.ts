import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

// Repo pattern (see CabinetPage.spec.ts): real Pinia, useApi mocked, vue-router
// mocked. Not @pinia/testing — it isn't a dependency here.
const { getMock, putMock, postMock, delMock, push, backMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
  backMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

// Captures the guard callback so tests can invoke it directly and observe
// whether it prompts — a `vi.fn()` stub here would never call the callback,
// silently "proving" both the dirty and the clean case at once.
let leaveGuard: (() => boolean) | null = null;
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, back: backMock }),
  useRoute: () => ({ params: { teaId: "t-1" } }),
  onBeforeRouteLeave: (cb: () => boolean) => {
    leaveGuard = cb;
  },
}));

import TeaDetailPage from "./TeaDetailPage.vue";
import type { Tea, CatalogueNode } from "../types";

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
};

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "t-1",
    name: "Da Hong Pao",
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: "loose",
    origin: "Wuyi Shan, Fujian",
    vendor: "Yunnan Sourcing",
    year: 2021,
    harvest_season: "spring",
    cultivar: "Qi Dan",
    grams_purchased: 100,
    grams_remaining: 38,
    price_paid: 68,
    purchase_date: "2024-03-12",
    storage_location: "Cupboard, top shelf",
    low_threshold_grams: 15,
    notes: "Heavy roast.",
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

const OOLONG: CatalogueNode = {
  id: "oolong",
  parent_id: null,
  name: "Oolong",
  name_zh: "烏龍",
  source: "seed",
  default_origin: "",
};

const WUYI: CatalogueNode = {
  id: "oolong.wuyi",
  parent_id: "oolong",
  name: "Wuyi yancha",
  name_zh: "",
  source: "seed",
  default_origin: "Wuyi Shan, Fujian",
};

/** Resolves `/tea/teas` and `/tea/catalogue` from one mock, by path. */
function mockApi(teas: Tea[], nodes: CatalogueNode[] = [OOLONG, WUYI]) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teas") return Promise.resolve(teas);
    if (path === "/tea/catalogue") return Promise.resolve(nodes);
    return Promise.resolve([]);
  });
}

async function page(teas: Tea[] = [tea()], nodes: CatalogueNode[] = [OOLONG, WUYI]) {
  mockApi(teas, nodes);
  const wrapper = mount(TeaDetailPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("TeaDetailPage", () => {
  it("shows the tea's name", async () => {
    expect((await page()).get('[data-testid="tea-title"]').text()).toContain("Da Hong Pao");
  });

  it("shows the large rim", async () => {
    expect((await page()).find('[data-testid="rim"]').exists()).toBe(true);
  });

  it("says the tea is not here when the id matches nothing", async () => {
    expect((await page([])).get('[data-testid="tea-missing"]').text()).toContain(
      "not in your cabinet",
    );
  });

  it("names the removal action as what it does", async () => {
    expect((await page()).get('[data-testid="tea-remove"]').text()).toBe("Remove from cabinet");
  });

  it("takes '← Cabinet' straight to the cabinet, not one step back through history", async () => {
    const wrapper = await page();
    await wrapper.get('[data-testid="page-back"]').trigger("click");

    // A plain history.back() would land on whatever page preceded this one in
    // the browser's history stack — e.g. the New Tea form right after saving —
    // not necessarily the Cabinet the label promises.
    expect(backMock).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({ name: "tea-cabinet" });
  });

  it("asks before removing, and only removes after the confirm", async () => {
    const wrapper = await page();
    await wrapper.get('[data-testid="tea-remove"]').trigger("click");
    expect(delMock).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="remove-confirm"]').text()).toContain("Da Hong Pao");

    await wrapper.get('[data-testid="remove-yes"]').trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/tea/teas/t-1");
  });

  it("opens the grams sheet from the rim", async () => {
    const wrapper = await page();
    await wrapper.get('[data-testid="tea-rim-button"]').trigger("click");
    expect(wrapper.find('[data-testid="grams-sheet"]').exists()).toBe(true);
  });

  // Bug: commitGrams used to replace the whole draft with the server tea,
  // silently discarding anything typed since the page loaded (e.g. Notes),
  // and clearing `dirty` so the leave guard stopped warning about it.
  it("keeps other unsaved edits, and stays dirty, after a grams write commits", async () => {
    const wrapper = await page();

    await wrapper.get('[data-testid="field-notes"]').setValue("Mid-session notes.");
    expect(
      (wrapper.get('[data-testid="tea-save"]').element as HTMLButtonElement).disabled,
    ).toBe(false);

    putMock.mockResolvedValue(tea({ grams_remaining: 39 }));
    await wrapper.get('[data-testid="tea-rim-button"]').trigger("click");
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    await wrapper.get('[data-testid="grams-save"]').trigger("click");
    await flushPromises();

    expect((wrapper.get('[data-testid="field-notes"]').element as HTMLTextAreaElement).value).toBe(
      "Mid-session notes.",
    );
    expect(
      (wrapper.get('[data-testid="tea-save"]').element as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  // Correction: AddNodeDialog must be wired here too, not only on NewTeaPage —
  // reclassifying a tea you already own is exactly when the catalogue gap
  // shows up.
  it("adds a catalogue node from the picker while editing a tea", async () => {
    const wrapper = await page();

    await wrapper.get('[data-testid="add-oolong"]').trigger("click");
    expect(wrapper.find('[data-testid="add-node"]').exists()).toBe(true);

    postMock.mockResolvedValue({
      id: "oolong.rougui",
      parent_id: "oolong",
      name: "Rou Gui",
      name_zh: "",
      source: "user",
      default_origin: "",
    });

    await wrapper.get('[data-testid="node-name"]').setValue("Rou Gui");
    await wrapper.get('[data-testid="node-save"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/tea/catalogue",
      expect.objectContaining({ parent_id: "oolong", name: "Rou Gui" }),
    );
    expect(wrapper.find('[data-testid="add-node"]').exists()).toBe(false);
  });

  it("disables Save changes when the name is cleared, even though something changed", async () => {
    const wrapper = await page();
    await wrapper.get('[data-testid="field-name"]').setValue("");
    const button = wrapper.get('[data-testid="tea-save"]').element as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("enables Save changes once something changed and the required fields are still present", async () => {
    const wrapper = await page();
    expect((wrapper.get('[data-testid="tea-save"]').element as HTMLButtonElement).disabled).toBe(
      true,
    );

    await wrapper.get('[data-testid="field-notes"]').setValue("Updated notes.");
    expect((wrapper.get('[data-testid="tea-save"]').element as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it("leaves silently when nothing has changed", async () => {
    await page();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    expect(leaveGuard).not.toBeNull();
    expect(leaveGuard?.()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("asks before leaving when the draft is dirty", async () => {
    const wrapper = await page();
    await wrapper.get('[data-testid="field-notes"]').setValue("Changed my mind.");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    expect(leaveGuard?.()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith(
      "Leave without saving? Your changes to this tea will be lost.",
    );
    confirmSpy.mockRestore();
  });
});
