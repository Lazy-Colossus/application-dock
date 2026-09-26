import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

// Repo pattern (see CabinetPage.spec.ts / TeaDetailPage.spec.ts): real Pinia,
// useApi mocked, vue-router mocked.
const { getMock, postMock, push, backMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  push: vi.fn(),
  backMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));

// Captures the guard callback so tests can invoke it directly — a plain
// `vi.fn()` stub here would never call the callback, so neither "prompts
// when dirty" nor "silent when clean" would actually be exercised.
let leaveGuard: (() => boolean) | null = null;
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, back: backMock }),
  onBeforeRouteLeave: (cb: () => boolean) => {
    leaveGuard = cb;
  },
}));

import NewTeaPage from "./NewTeaPage.vue";
import type { CatalogueNode, Tea } from "../types";

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
};

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

function tea(overrides: Partial<Tea> = {}): Tea {
  return {
    id: "created-1",
    name: "Da Hong Pao",
    catalogue_node_id: "oolong",
    class_id: "oolong",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 0,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    created_at: "2026-09-25T10:00:00Z",
    updated_at: "2026-09-25T10:00:00Z",
    ...overrides,
  };
}

function mockCatalogue(nodes: CatalogueNode[] = [OOLONG, WUYI]) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/catalogue") return Promise.resolve(nodes);
    return Promise.resolve([]);
  });
}

async function render() {
  mockCatalogue();
  const wrapper = mount(NewTeaPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  leaveGuard = null;
});

describe("NewTeaPage", () => {
  it("takes '← Cabinet' straight to the cabinet, not one step back through history", async () => {
    const wrapper = await render();
    await wrapper.get('[data-testid="page-back"]').trigger("click");

    expect(backMock).not.toHaveBeenCalled();
    expect(push).toHaveBeenCalledWith({ name: "tea-cabinet" });
  });

  it("disables Save with an empty name, then with a name but no classification, and enables once both are set", async () => {
    const wrapper = await render();
    const saveButton = () =>
      wrapper.get('[data-testid="new-save"]').element as HTMLButtonElement;

    expect(saveButton().disabled).toBe(true);

    await wrapper.get('[data-testid="field-name"]').setValue("Da Hong Pao");
    expect(saveButton().disabled).toBe(true);

    await wrapper.get('[data-testid="chip-oolong"]').trigger("click");
    expect(saveButton().disabled).toBe(false);
  });

  it("keeps the draft and shows the error when the save is rejected", async () => {
    postMock.mockImplementation((path: string) => {
      if (path === "/tea/teas") return Promise.reject(new Error("Couldn't save this tea."));
      return Promise.reject(new Error("unexpected path"));
    });
    const wrapper = await render();

    await wrapper.get('[data-testid="field-name"]').setValue("Da Hong Pao");
    await wrapper.get('[data-testid="chip-oolong"]').trigger("click");
    await wrapper.get('[data-testid="new-save"]').trigger("click");
    await flushPromises();

    expect(push).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="new-error"]').text()).toContain("Couldn't save this tea.");
    expect((wrapper.get('[data-testid="field-name"]').element as HTMLInputElement).value).toBe(
      "Da Hong Pao",
    );
  });

  it("adds a catalogue node from the picker and selects it", async () => {
    const wrapper = await render();

    await wrapper.get('[data-testid="chip-oolong"]').trigger("click");
    await wrapper.get('[data-testid="add-oolong"]').trigger("click");
    expect(wrapper.find('[data-testid="add-node"]').exists()).toBe(true);

    postMock.mockImplementation((path: string) => {
      if (path === "/tea/catalogue") {
        return Promise.resolve({
          id: "oolong.rougui",
          parent_id: "oolong",
          name: "Rou Gui",
          name_zh: "",
          source: "user",
          default_origin: "",
        });
      }
      if (path === "/tea/teas") {
        return Promise.resolve(tea({ catalogue_node_id: "oolong.rougui" }));
      }
      return Promise.reject(new Error("unexpected path"));
    });

    await wrapper.get('[data-testid="node-name"]').setValue("Rou Gui");
    await wrapper.get('[data-testid="node-save"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/tea/catalogue",
      expect.objectContaining({ parent_id: "oolong", name: "Rou Gui" }),
    );
    expect(wrapper.find('[data-testid="add-node"]').exists()).toBe(false);

    // The picker's selection carries the new node, not just the dialog post —
    // saving the tea now must use the id the catalogue just handed back.
    await wrapper.get('[data-testid="field-name"]').setValue("Da Hong Pao");
    await wrapper.get('[data-testid="new-save"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/tea/teas",
      expect.objectContaining({ catalogue_node_id: "oolong.rougui" }),
    );
  });

  it("leaves silently when the form is untouched", async () => {
    await render();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    expect(leaveGuard).not.toBeNull();
    expect(leaveGuard?.()).toBe(true);
    expect(confirmSpy).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it("asks before leaving once something has been typed", async () => {
    const wrapper = await render();
    await wrapper.get('[data-testid="field-name"]').setValue("Da Hong Pao");
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    expect(leaveGuard?.()).toBe(false);
    expect(confirmSpy).toHaveBeenCalledWith(
      "Leave without saving? Your changes to this tea will be lost.",
    );
    confirmSpy.mockRestore();
  });
});
