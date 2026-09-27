import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TeaSessionsList from "./TeaSessionsList.vue";
import type { TeaSession } from "../types";

function session(id: string, overrides: Partial<TeaSession> = {}): TeaSession {
  return {
    id,
    brewed_by: "jakub",
    tea_id: "t-1",
    status: "finalised",
    started_at: "2026-09-25T19:40:00Z",
    updated_at: "2026-09-25T20:10:00Z",
    finished_at: "2026-09-25T20:10:00Z",
    leaf_grams: 6,
    water_temp_c: 95,
    rating: 4,
    curve_source: "almanac",
    curve_source_label: "almanac: Tieguanyin",
    infusions: [
      { number: 1, target_seconds: 20, actual_seconds: 21 },
      { number: 2, target_seconds: 25, actual_seconds: 26 },
    ],
    ...overrides,
  };
}

describe("TeaSessionsList", () => {
  it("shows stars, infusion count and leaf per session in the given order", () => {
    const wrapper = mount(TeaSessionsList, {
      props: { sessions: [session("s-2"), session("s-1", { rating: null, leaf_grams: null })] },
    });
    const rows = wrapper.findAll("[data-testid^=sessions-row-]");
    expect(rows.map((r) => r.attributes("data-testid"))).toEqual(["sessions-row-s-2", "sessions-row-s-1"]);
    expect(rows[0].text()).toContain("★★★★☆");
    expect(rows[0].text()).toContain("2 infusions");
    expect(rows[0].text()).toContain("6 g");
    expect(rows[1].text()).toContain("unrated");
  });

  it("says so when there are none", () => {
    expect(mount(TeaSessionsList, { props: { sessions: [] } }).find("[data-testid=sessions-empty]").exists()).toBe(true);
  });

  it("names who brewed others' sessions once the cabinet is shared", () => {
    const wrapper = mount(TeaSessionsList, {
      props: {
        sessions: [session("s-1", { brewed_by: "mia" }), session("s-2", { brewed_by: "jakub" })],
        shared: true,
        me: "jakub",
      },
    });
    expect(wrapper.get("[data-testid=sessions-brewer-s-1]").text()).toBe("· mia");
    expect(wrapper.find("[data-testid=sessions-brewer-s-2]").exists()).toBe(false);
  });

  it("names nobody in a cabinet of one", () => {
    const wrapper = mount(TeaSessionsList, {
      props: { sessions: [session("s-1", { brewed_by: "mia" })], shared: false, me: "jakub" },
    });
    expect(wrapper.find("[data-testid=sessions-brewer-s-1]").exists()).toBe(false);
  });
});
