import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import RecoveryCard from "./RecoveryCard.vue";
import type { TeaSession } from "../types";

const SESSION: TeaSession = {
  id: "s-1",
  brewed_by: "jakub",
  teaware_id: null,
  vessel_volume_ml: null,
  tea_id: "t-1",
  status: "in_progress",
  started_at: "2026-09-25T19:40:00Z",
  updated_at: "2026-09-25T19:55:00Z",
  finished_at: null,
  leaf_grams: 6,
  water_temp_c: 95,
  rating: null,
  curve_source: "almanac",
  curve_source_label: "almanac: Tieguanyin",
  away_tea_name: "",
  away_class_id: null,
  timed: true,
  cha_xi: null,
  tasting: null,
  image_url: null,
  infusions: [
    { number: 1, target_seconds: 20, actual_seconds: 21 },
    { number: 2, target_seconds: 25, actual_seconds: 26 },
    { number: 3, target_seconds: 30, actual_seconds: null },
  ],
};

describe("RecoveryCard", () => {
  it("names the tea and counts only brewed infusions", () => {
    const text = mount(RecoveryCard, { props: { session: SESSION, teaName: "Tieguanyin" } })
      .get("[data-testid=recovery-text]")
      .text();
    expect(text).toContain("Unfinished Tieguanyin session");
    expect(text).toContain("2 infusions");
  });

  it("names the vessel when there is one", () => {
    const withVessel = mount(RecoveryCard, {
      props: { session: SESSION, teaName: "Tieguanyin", vesselName: "Zhuni" },
    });
    expect(withVessel.get("[data-testid=recovery-text]").text()).toContain(
      "Unfinished Tieguanyin session · in Zhuni ·",
    );
    const without = mount(RecoveryCard, { props: { session: SESSION, teaName: "Tieguanyin" } });
    expect(without.get("[data-testid=recovery-text]").text()).not.toContain(" in ");
  });

  it("emits resume and discard", async () => {
    const wrapper = mount(RecoveryCard, { props: { session: SESSION, teaName: "Tieguanyin" } });
    expect(wrapper.get("[data-testid=recovery-resume]").text()).toBe("Continue");
    await wrapper.get("[data-testid=recovery-resume]").trigger("click");
    await wrapper.get("[data-testid=recovery-discard]").trigger("click");
    expect(wrapper.emitted("resume")).toHaveLength(1);
    expect(wrapper.emitted("discard")).toHaveLength(1);
  });
});
