import { describe, it, expect } from "vitest";
import {
  canSaveWare,
  groupByType,
  isBrewingVessel,
  matchesWareFilters,
  toWareWrite,
  vesselLabel,
  wareSummary,
  type WareFilterState,
} from "./ware";
import type { TeaSession, Teaware } from "./types";

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

function session(overrides: Partial<TeaSession> = {}): TeaSession {
  return {
    id: "s-1",
    brewed_by: "jakub",
    tea_id: "t-1",
    status: "finalised",
    started_at: "2026-09-27T18:00:00Z",
    updated_at: "2026-09-27T18:30:00Z",
    finished_at: "2026-09-27T18:30:00Z",
    leaf_grams: 7,
    water_temp_c: 95,
    rating: null,
    curve_source: "generic",
    curve_source_label: "",
    away_tea_name: "",
    away_class_id: null,
    timed: true,
    cha_xi: null,
    image_url: null,
    infusions: [],
    teaware_id: null,
    vessel_volume_ml: null,
    ...overrides,
  };
}

const NO_FILTERS: WareFilterState = {
  type: null,
  material: null,
  minMl: null,
  maxMl: null,
  showRetired: false,
};

describe("ware helpers", () => {
  it("groups by type in shelf order, names A–Z, empty types omitted", () => {
    const sections = groupByType([
      ware("b-cup", { type: "cup" }),
      ware("Zhuni", { type: "pot" }),
      ware("Duanni", { type: "pot" }),
      ware("Gaiwan", { type: "gaiwan" }),
    ]);
    expect(sections.map((s) => s.type)).toEqual(["gaiwan", "pot", "cup"]);
    expect(sections[1].items.map((i) => i.name)).toEqual(["Duanni", "Zhuni"]);
  });

  it("shelves a shiboridashi between kyusu and chawan", () => {
    const sections = groupByType([
      ware("c", { type: "chawan" }),
      ware("s", { type: "shiboridashi" }),
      ware("k", { type: "kyusu" }),
    ]);
    expect(sections.map((s) => s.type)).toEqual(["kyusu", "shiboridashi", "chawan"]);
  });

  it("knows what can be brewed in", () => {
    expect(isBrewingVessel(ware("a", { type: "gaiwan" }))).toBe(true);
    expect(isBrewingVessel(ware("a", { type: "shiboridashi" }))).toBe(true);
    expect(isBrewingVessel(ware("a", { type: "cup" }))).toBe(false);
    expect(isBrewingVessel(ware("a", { retired_at: "2026-09-27T10:00:00Z" }))).toBe(false);
  });

  it("hides retired pieces unless asked, and filters by type, material and volume", () => {
    const retired = ware("r", { retired_at: "2026-09-27T10:00:00Z" });
    expect(matchesWareFilters(retired, NO_FILTERS)).toBe(false);
    expect(matchesWareFilters(retired, { ...NO_FILTERS, showRetired: true })).toBe(true);
    expect(matchesWareFilters(ware("a"), { ...NO_FILTERS, type: "gaiwan" })).toBe(false);
    expect(matchesWareFilters(ware("a"), { ...NO_FILTERS, material: "glass" })).toBe(false);
    expect(matchesWareFilters(ware("a"), { ...NO_FILTERS, minMl: 100, maxMl: 120 })).toBe(true);
    expect(matchesWareFilters(ware("a"), { ...NO_FILTERS, minMl: 120 })).toBe(false);
    expect(matchesWareFilters(ware("a", { volume_ml: null }), { ...NO_FILTERS, maxMl: 200 })).toBe(
      false,
    );
  });

  it("summarises volume and material", () => {
    expect(wareSummary(ware("a"))).toBe("110 ml · clay");
    expect(wareSummary(ware("a", { material: "clay_glazed" }))).toBe("110 ml · clay (glazed)");
    expect(wareSummary(ware("a", { volume_ml: null, material: null }))).toBe("");
  });

  it("labels a session's vessel, including one since removed", () => {
    const pot = ware("w-1", { name: "Zhuni" });
    expect(vesselLabel(session({ teaware_id: "w-1", vessel_volume_ml: 110 }), [pot])).toBe(
      "Zhuni 110 ml",
    );
    expect(vesselLabel(session({ teaware_id: null, vessel_volume_ml: 110 }), [pot])).toBe(
      "110 ml, vessel removed",
    );
    expect(vesselLabel(session(), [pot])).toBe("");
  });

  it("round-trips an item into a write body and needs only a name to save", () => {
    const body = toWareWrite(ware("w-1", { retired_at: "2026-09-27T10:00:00Z" }));
    expect(body.retired).toBe(true);
    expect("id" in body).toBe(false);
    expect(canSaveWare({ ...body, name: "  " })).toBe(false);
    expect(canSaveWare(body)).toBe(true);
  });
});
