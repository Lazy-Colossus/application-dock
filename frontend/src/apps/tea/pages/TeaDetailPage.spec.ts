import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

// Repo pattern (see CabinetPage.spec.ts): real Pinia, useApi mocked, vue-router
// mocked. Not @pinia/testing — it isn't a dependency here.
const { getMock, putMock, postMock, delMock, uploadMock, push, backMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
  uploadMock: vi.fn(),
  push: vi.fn(),
  backMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: postMock,
    put: putMock,
    del: delMock,
    upload: uploadMock,
  },
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
import type { Tea, CatalogueNode, AlmanacEntryView } from "../types";

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
    image_url: null,
    brewing: null,
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

function entry(overrides: Partial<AlmanacEntryView> = {}): AlmanacEntryView {
  return {
    catalogue_node_id: "oolong.wuyi",
    country: "China",
    reading: "wǔyí yánchá",
    summary: "Rock teas from the Wuyi mountains.",
    brewing: { leaf_grams: 7, water_temp_c: 98, steep_seconds: [10, 15, 20] },
    source: "seed",
    name: "Wuyi yancha",
    name_zh: "武夷岩茶",
    default_origin: "Wuyi Shan, Fujian",
    ...overrides,
  };
}

/** Resolves `/tea/teas`, `/tea/catalogue` and `/tea/almanac` from one mock, by path. */
function mockApi(teas: Tea[], nodes: CatalogueNode[], entries: AlmanacEntryView[]) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teas") return Promise.resolve(teas);
    if (path === "/tea/catalogue") return Promise.resolve(nodes);
    if (path === "/tea/almanac") return Promise.resolve(entries);
    return Promise.resolve([]);
  });
}

async function page(
  teas: Tea[] = [tea()],
  nodes: CatalogueNode[] = [OOLONG, WUYI],
  entries: AlmanacEntryView[] = [],
) {
  mockApi(teas, nodes, entries);
  const wrapper = mount(TeaDetailPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

async function editPage(teas: Tea[] = [tea()]) {
  const wrapper = await page(teas);
  await wrapper.get('[data-testid="tea-edit"]').trigger("click");
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
    expect((await editPage()).get('[data-testid="tea-remove"]').text()).toBe("Remove from cabinet");
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
    const wrapper = await editPage();
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
    const wrapper = await editPage();

    await wrapper.get('[data-testid="field-notes"]').setValue("Mid-session notes.");
    expect((wrapper.get('[data-testid="tea-save"]').element as HTMLButtonElement).disabled).toBe(
      false,
    );

    putMock.mockResolvedValue(tea({ grams_remaining: 39 }));
    await wrapper.get('[data-testid="tea-rim-button"]').trigger("click");
    await wrapper.get('[data-testid="grams-plus"]').trigger("click");
    await wrapper.get('[data-testid="grams-save"]').trigger("click");
    await flushPromises();

    expect((wrapper.get('[data-testid="field-notes"]').element as HTMLTextAreaElement).value).toBe(
      "Mid-session notes.",
    );
    expect((wrapper.get('[data-testid="tea-save"]').element as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  // Correction: AddNodeDialog must be wired here too, not only on NewTeaPage —
  // reclassifying a tea you already own is exactly when the catalogue gap
  // shows up.
  it("adds a catalogue node from the picker while editing a tea", async () => {
    const wrapper = await editPage();

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
    const wrapper = await editPage();
    await wrapper.get('[data-testid="field-name"]').setValue("");
    const button = wrapper.get('[data-testid="tea-save"]').element as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it("enables Save changes once something changed and the required fields are still present", async () => {
    const wrapper = await editPage();
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
    const wrapper = await editPage();
    await wrapper.get('[data-testid="field-notes"]').setValue("Changed my mind.");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    expect(leaveGuard?.()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith(
      "Leave without saving? Your changes to this tea will be lost.",
    );
    confirmSpy.mockRestore();
  });

  it("shows the tea's photo when it has one", async () => {
    const wrapper = await page([tea({ image_url: "https://example.com/photo.jpg" })]);
    expect(wrapper.get('[data-testid="tea-photo"]').attributes("src")).toBe(
      "https://example.com/photo.jpg",
    );
  });

  it("shows no photo and no remove button when the tea has none", async () => {
    const wrapper = await editPage([tea({ image_url: null })]);
    expect(wrapper.find('[data-testid="tea-photo"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="tea-remove-photo"]').exists()).toBe(false);
  });

  it("uploads a chosen photo and shows the server's image", async () => {
    const wrapper = await editPage([tea({ image_url: null })]);
    uploadMock.mockResolvedValue(tea({ image_url: "https://example.com/photo.jpg" }));
    const file = new File(["bytes"], "photo.jpg", { type: "image/jpeg" });

    const input = wrapper.get('[data-testid="tea-photo-input"]').element as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [file] });
    await wrapper.get('[data-testid="tea-photo-input"]').trigger("change");
    await flushPromises();

    expect(uploadMock).toHaveBeenCalledWith("/tea/teas/t-1/image", file);
    expect(wrapper.find('[data-testid="tea-photo"]').exists()).toBe(true);
  });

  it("removes the photo and hides it once gone", async () => {
    const wrapper = await editPage([tea({ image_url: "https://example.com/photo.jpg" })]);
    delMock.mockResolvedValue(tea({ image_url: null }));

    await wrapper.get('[data-testid="tea-remove-photo"]').trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith("/tea/teas/t-1/image");
    expect(wrapper.find('[data-testid="tea-photo"]').exists()).toBe(false);
  });

  describe("view mode", () => {
    it("opens read-only: no form, no save, no removal", async () => {
      const wrapper = await page();
      expect(wrapper.find('[data-testid="field-name"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="tea-save"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="tea-remove"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="tea-upload-photo"]').exists()).toBe(false);
    });

    it("shows the tea's recorded details and notes", async () => {
      const wrapper = await page([tea({ catalogue_node_id: "oolong.wuyi" })]);
      expect(wrapper.get('[data-testid="fact-origin"]').text()).toBe("Wuyi Shan, Fujian");
      expect(wrapper.get('[data-testid="fact-form"]').text()).toBe("Loose");
      expect(wrapper.get('[data-testid="fact-harvest"]').text()).toBe("Spring 2021");
      expect(wrapper.get('[data-testid="fact-price"]').text()).toBe("68 (0.68 per gram)");
      expect(wrapper.get('[data-testid="tea-notes"]').text()).toBe("Heavy roast.");
    });

    it("leaves out details that were never recorded", async () => {
      const wrapper = await page([tea({ vendor: "", year: null, harvest_season: null })]);
      expect(wrapper.find('[data-testid="fact-vendor"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="fact-harvest"]').exists()).toBe(false);
    });

    it("shows the almanac entry for the tea's catalogue node", async () => {
      const wrapper = await page(
        [tea({ catalogue_node_id: "oolong.wuyi" })],
        [OOLONG, WUYI],
        [entry()],
      );
      expect(wrapper.get('[data-testid="tea-almanac-summary"]').text()).toBe(
        "Rock teas from the Wuyi mountains.",
      );
      expect(wrapper.get('[data-testid="tea-almanac-temp"]').text()).toBe("98°C");
      expect(wrapper.get('[data-testid="tea-almanac-steeps"]').text()).toBe("10s, 15s, 20s");
      expect(wrapper.find('[data-testid="tea-almanac-via"]').exists()).toBe(false);
    });

    it("falls back to the nearest ancestor's almanac entry, and says whose it is", async () => {
      const rougui: CatalogueNode = {
        id: "oolong.wuyi.rougui",
        parent_id: "oolong.wuyi",
        name: "Rou Gui",
        name_zh: "",
        source: "seed",
        default_origin: "",
      };
      const wrapper = await page(
        [tea({ catalogue_node_id: rougui.id })],
        [OOLONG, WUYI, rougui],
        [entry()],
      );
      expect(wrapper.get('[data-testid="tea-almanac-via"]').text()).toContain("Wuyi yancha");
    });

    it("shows no almanac section when nothing in the chain has an entry", async () => {
      const wrapper = await page([tea()], [OOLONG, WUYI], [entry({ catalogue_node_id: "green" })]);
      expect(wrapper.find('[data-testid="tea-almanac"]').exists()).toBe(false);
    });

    it("opens the full almanac entry", async () => {
      const wrapper = await page(
        [tea({ catalogue_node_id: "oolong.wuyi" })],
        [OOLONG, WUYI],
        [entry()],
      );
      await wrapper.get('[data-testid="tea-almanac-open"]').trigger("click");
      expect(push).toHaveBeenCalledWith({
        name: "tea-almanac-entry",
        params: { catalogueNodeId: "oolong.wuyi" },
      });
    });

    it("returns to view mode after a successful save", async () => {
      const wrapper = await editPage();
      await wrapper.get('[data-testid="field-notes"]').setValue("Lighter than expected.");
      putMock.mockResolvedValue(tea({ notes: "Lighter than expected." }));
      await wrapper.get('[data-testid="tea-save"]').trigger("click");
      await flushPromises();
      expect(wrapper.find('[data-testid="field-notes"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="tea-notes"]').text()).toBe("Lighter than expected.");
    });

    it("Done with unsaved edits asks first, and discards them on confirm", async () => {
      const wrapper = await editPage();
      await wrapper.get('[data-testid="field-notes"]').setValue("Scrap this.");
      const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

      await wrapper.get('[data-testid="tea-edit-done"]').trigger("click");
      expect(wrapper.find('[data-testid="field-notes"]').exists()).toBe(true);

      confirmSpy.mockReturnValue(true);
      await wrapper.get('[data-testid="tea-edit-done"]').trigger("click");
      expect(wrapper.get('[data-testid="tea-notes"]').text()).toBe("Heavy roast.");
      expect(leaveGuard?.()).toBe(true);
      confirmSpy.mockRestore();
    });
  });

  it("opens the timer with this tea from the Brew button", async () => {
    const wrapper = await page();
    await wrapper.get("[data-testid=tea-brew]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-timer", query: { tea: "t-1" } });
  });

  it("lists the tea's finished sessions", async () => {
    const finished = {
      id: "s-1",
      brewed_by: "jakub",
      tea_id: "t-1",
      status: "finalised",
      started_at: "2026-09-25T19:40:00Z",
      updated_at: "2026-09-25T20:10:00Z",
      finished_at: "2026-09-25T20:10:00Z",
      leaf_grams: 6,
      water_temp_c: 95,
      rating: 5,
      curve_source: "almanac",
      curve_source_label: "almanac: Tieguanyin",
      infusions: [{ number: 1, target_seconds: 20, actual_seconds: 21 }],
    };
    getMock.mockImplementation((path: string) => {
      if (path === "/tea/teas") return Promise.resolve([tea()]);
      if (path === "/tea/catalogue") return Promise.resolve([OOLONG, WUYI]);
      if (path === "/tea/teas/t-1/sessions") return Promise.resolve([finished]);
      return Promise.resolve([]);
    });
    const wrapper = mount(TeaDetailPage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.get("[data-testid=tea-sessions]").text()).toContain("★★★★★");
  });

  it("shows the tea's own brewing parameters as a fact", async () => {
    const wrapper = await page([
      tea({ brewing: { leaf_grams: 7, water_temp_c: 95, steep_seconds: [15, 20] } }),
    ]);
    expect(wrapper.get("[data-testid=fact-brewing]").text()).toBe("7g · 95°C · 15s, 20s");
  });
});
