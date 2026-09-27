import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push } = vi.hoisted(() => ({ getMock: vi.fn(), push: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import WareCabinetPage from "./WareCabinetPage.vue";
import { useTeawareFiltersStore } from "../stores/useTeawareFiltersStore";
import type { Teaware } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function ware(id: string, overrides: Partial<Teaware> = {}): Teaware {
  return {
    id,
    name: id,
    type: "pot",
    material: "clay",
    volume_ml: 110,
    porous: false,
    dedicated_node_id: null,
    maker: "",
    origin: "",
    acquired_date: null,
    price_paid: null,
    notes: "",
    image_url: null,
    retired_at: null,
    created_at: "2026-09-27T10:00:00Z",
    updated_at: "2026-09-27T10:00:00Z",
    ...overrides,
  };
}

async function render(items: Teaware[]) {
  getMock.mockImplementation((path: string) =>
    path === "/tea/teaware" ? Promise.resolve(items) : Promise.resolve([]),
  );
  const wrapper = mount(WareCabinetPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("WareCabinetPage", () => {
  it("invites you to add the first piece when there is none", async () => {
    expect((await render([])).find("[data-testid=ware-empty]").exists()).toBe(true);
  });

  it("shelves pieces by type in shelf order, hiding retired ones", async () => {
    const wrapper = await render([
      ware("Cup", { type: "cup" }),
      ware("Zhuni"),
      ware("Gaiwan", { type: "gaiwan" }),
      ware("Old", { retired_at: "2026-09-27T10:00:00Z" }),
    ]);
    expect(wrapper.findAll("[data-testid=ware-section-name]").map((n) => n.text())).toEqual([
      "Gaiwan",
      "Pot",
      "Cup",
    ]);
    expect(wrapper.findAll("[data-testid=ware-card-name]").map((n) => n.text())).not.toContain(
      "Old",
    );
    expect(wrapper.get("[data-testid=ware-count]").text()).toBe("3 pieces");
    expect(wrapper.findAll("[data-testid=ware-card-meta]")[1].text()).toBe("110 ml · clay");
  });

  it("filters, and offers to clear when nothing matches", async () => {
    const wrapper = await render([ware("Zhuni")]);
    useTeawareFiltersStore().type = "gaiwan";
    await flushPromises();
    expect(wrapper.find("[data-testid=ware-no-match]").exists()).toBe(true);
    expect(wrapper.get("[data-testid=ware-count]").text()).toBe("0 of 1 piece");
    await wrapper.get("[data-testid=ware-clear-filters]").trigger("click");
    expect(wrapper.findAll("[data-testid=ware-card]")).toHaveLength(1);
  });

  it("shows retired pieces when asked", async () => {
    const wrapper = await render([ware("Old", { retired_at: "2026-09-27T10:00:00Z" })]);
    await wrapper.get("[data-testid=ware-filters]").trigger("click");
    await wrapper.get("[data-testid=ware-filter-retired]").setValue(true);
    expect(wrapper.findAll("[data-testid=ware-card]")).toHaveLength(1);
  });

  it("opens a piece and the add form", async () => {
    const wrapper = await render([ware("w-1")]);
    await wrapper.get("[data-testid=ware-card]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-ware-detail", params: { wareId: "w-1" } });
    await wrapper.get("[data-testid=ware-add]").trigger("click");
    expect(push).toHaveBeenCalledWith({ name: "tea-ware-new" });
  });
});
