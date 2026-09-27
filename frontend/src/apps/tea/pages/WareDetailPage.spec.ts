import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: putMock, del: delMock, upload: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { wareId: "w-1" } }),
  useRouter: () => ({ push }),
  onBeforeRouteLeave: vi.fn(),
}));

import WareDetailPage from "./WareDetailPage.vue";
import type { Cabinet, TeaSession, Teaware } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };
const SOLO: Cabinet = { id: null, owner: "jakub", members: ["jakub"], is_owner: true };

const POT: Teaware = {
  id: "w-1",
  name: "Zhuni shuiping",
  type: "pot",
  material: "clay",
  volume_ml: 110,
  porous: true,
  dedicated_node_id: "oolong",
  maker: "Wang",
  origin: "Yixing",
  acquired_date: null,
  price_paid: null,
  notes: "",
  image_url: null,
  retired_at: null,
  created_at: "2026-09-27T10:00:00Z",
  updated_at: "2026-09-27T10:00:00Z",
};

const SESSION: TeaSession = {
  id: "s-1",
  brewed_by: "jakub",
  tea_id: "t-1",
  status: "finalised",
  started_at: "2026-09-27T18:00:00Z",
  updated_at: "2026-09-27T18:30:00Z",
  finished_at: "2026-09-27T18:30:00Z",
  leaf_grams: 7,
  water_temp_c: 95,
  rating: 4,
  curve_source: "generic",
  curve_source_label: "",
  infusions: [],
  teaware_id: "w-1",
  vessel_volume_ml: 110,
};

async function page(item: Teaware | null = POT) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teaware") return Promise.resolve(item ? [item] : []);
    if (path === "/tea/teaware/w-1/usage")
      return Promise.resolve({ sessions: [SESSION], total: 1, off_dedication: 1 });
    if (path === "/tea/cabinet") return Promise.resolve(SOLO);
    if (path === "/tea/teas")
      return Promise.resolve([{ id: "t-1", name: "Longjing" }]);
    if (path === "/tea/catalogue")
      return Promise.resolve([
        { id: "oolong", parent_id: null, name: "Oolong", name_zh: "", source: "seed", default_origin: "" },
      ]);
    return Promise.resolve([]);
  });
  const wrapper = mount(WareDetailPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("WareDetailPage", () => {
  it("shows the piece, its facts and its dedication", async () => {
    const wrapper = await page();
    expect(wrapper.get("[data-testid=ware-title]").text()).toBe("Zhuni shuiping");
    expect(wrapper.get("[data-testid=ware-summary]").text()).toContain("110 ml · clay");
    expect(wrapper.get("[data-testid=ware-fact-seasons]").text()).toContain("Oolong");
    expect(wrapper.get("[data-testid=ware-fact-maker]").text()).toBe("Wang");
  });

  it("counts its sessions and the ones off its dedication, naming each tea", async () => {
    const wrapper = await page();
    expect(wrapper.get("[data-testid=ware-usage]").text()).toContain(
      "1 session · 1 off-dedication",
    );
    expect(wrapper.get("[data-testid=sessions-tea-s-1]").text()).toBe("Longjing");
  });

  it("retires and brings back", async () => {
    putMock.mockResolvedValue({ ...POT, retired_at: "2026-09-27T12:00:00Z" });
    const wrapper = await page();
    await wrapper.get("[data-testid=ware-retire]").trigger("click");
    await flushPromises();
    expect(putMock).toHaveBeenCalledWith(
      "/tea/teaware/w-1",
      expect.objectContaining({ retired: true, name: "Zhuni shuiping" }),
    );
    expect(wrapper.get("[data-testid=ware-retire]").text()).toBe("Bring back");
  });

  it("asks before deleting, saying how many sessions it is cleared from", async () => {
    delMock.mockResolvedValue(undefined);
    const wrapper = await page();
    await wrapper.get("[data-testid=ware-edit]").trigger("click");
    await wrapper.get("[data-testid=ware-remove]").trigger("click");
    expect(wrapper.get("[data-testid=ware-remove-confirm]").text()).toContain("1 session");
    await wrapper.get("[data-testid=ware-remove-yes]").trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/tea/teaware/w-1");
    expect(push).toHaveBeenCalledWith({ name: "tea-ware" });
  });

  it("saves edits", async () => {
    putMock.mockResolvedValue({ ...POT, name: "Renamed" });
    const wrapper = await page();
    await wrapper.get("[data-testid=ware-edit]").trigger("click");
    await wrapper.get("[data-testid=ware-field-name]").setValue("Renamed");
    await wrapper.get("[data-testid=ware-save]").trigger("click");
    await flushPromises();
    expect(putMock).toHaveBeenCalledWith(
      "/tea/teaware/w-1",
      expect.objectContaining({ name: "Renamed" }),
    );
    expect(wrapper.find("[data-testid=ware-edit]").exists()).toBe(true);
  });

  it("says so when the piece is not in the cabinet", async () => {
    expect((await page(null)).find("[data-testid=ware-missing]").exists()).toBe(true);
  });
});
