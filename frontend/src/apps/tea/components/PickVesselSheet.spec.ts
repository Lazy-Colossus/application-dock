import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import PickVesselSheet from "./PickVesselSheet.vue";
import type { Teaware } from "../types";

function ware(id: string, overrides: Partial<Teaware> = {}): Teaware {
  return {
    id,
    name: id,
    type: "pot",
    material: null,
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

describe("PickVesselSheet", () => {
  it("offers only vessels you can brew in, and picks one", async () => {
    const wrapper = mount(PickVesselSheet, {
      props: {
        items: [
          ware("w-pot"),
          ware("w-cup", { type: "cup" }),
          ware("w-old", { retired_at: "2026-09-27T10:00:00Z" }),
        ],
        currentId: null,
      },
    });
    expect(wrapper.find("[data-testid=vessel-w-cup]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=vessel-w-old]").exists()).toBe(false);
    await wrapper.get("[data-testid=vessel-w-pot]").trigger("click");
    expect(wrapper.emitted("pick")?.[0][0]).toMatchObject({ id: "w-pot" });
  });

  it("can clear the vessel, and says so when there is nothing to pick", async () => {
    const withCurrent = mount(PickVesselSheet, { props: { items: [ware("w-pot")], currentId: "w-pot" } });
    await withCurrent.get("[data-testid=vessel-none]").trigger("click");
    expect(withCurrent.emitted("pick")?.[0][0]).toBeNull();

    const empty = mount(PickVesselSheet, { props: { items: [], currentId: null } });
    expect(empty.find("[data-testid=vessel-empty]").exists()).toBe(true);
  });
});
