import { describe, it, expect, vi, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import PlanInfoPanel from "./PlanInfoPanel.vue";
import { emptyRows, type PlanGrid } from "../grid";

afterEach(() => vi.restoreAllMocks());

function plan(over: Partial<PlanGrid> = {}): PlanGrid {
  return {
    cols: 176,
    rows: 148,
    surface: emptyRows(176, 148),
    feature: emptyRows(176, 148),
    labels: [],
    doors: [],
    sockets: [],
    ...over,
  };
}

describe("PlanInfoPanel", () => {
  it("shows the size and resizes in whole squares", async () => {
    const wrapper = mount(PlanInfoPanel, {
      props: { plan: plan(), zoom: 1 },
    });
    expect(wrapper.get("[data-testid=plan-size]").text()).toBe("8.80 × 7.40 m");
    await wrapper.get("[data-testid=resize-width]").setValue("10");
    await wrapper.get("[data-testid=resize-depth]").setValue("8.81");
    await wrapper.get("[data-testid=resize]").trigger("click");
    expect(wrapper.emitted("resize")?.[0]).toEqual([200, 177]);
  });

  it("confirms only when shrinking would drop labels", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const labels = [{ id: "a", text: "Bath", col: 160, row: 2 }];
    const wrapper = mount(PlanInfoPanel, {
      props: { plan: plan({ labels }), zoom: 1 },
    });
    await wrapper.get("[data-testid=resize-width]").setValue("9.6");
    await wrapper.get("[data-testid=resize]").trigger("click");
    expect(confirm).not.toHaveBeenCalled();
    await wrapper.get("[data-testid=resize-width]").setValue("6");
    await wrapper.get("[data-testid=resize]").trigger("click");
    expect(confirm).toHaveBeenCalledWith(
      "Shrinking removes 1 label outside the new size.",
    );
    expect(wrapper.emitted("resize")).toHaveLength(1);
  });

  it("explains the grid for the zoom level", async () => {
    const wrapper = mount(PlanInfoPanel, { props: { plan: plan(), zoom: 1 } });
    expect(wrapper.get("[data-testid=info-legend]").text()).toBe(
      "Grid 20 cm · 5 cm steps",
    );
    expect(wrapper.text()).toContain("zoom to 200 % to see them");
    await wrapper.setProps({ zoom: 2 });
    expect(wrapper.get("[data-testid=info-legend]").text()).toBe(
      "1 square = 5 cm",
    );
  });

  it("refuses sizes outside 1–15 m", async () => {
    const wrapper = mount(PlanInfoPanel, {
      props: { plan: plan(), zoom: 1 },
    });
    await wrapper.get("[data-testid=resize-width]").setValue("15.05");
    expect(
      wrapper.get("[data-testid=resize]").attributes("disabled"),
    ).toBeDefined();
  });
});
