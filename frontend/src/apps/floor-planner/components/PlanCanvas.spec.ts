import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import PlanCanvas from "./PlanCanvas.vue";
import {
  FLOORS,
  LABEL_TOOL,
  STRUCTURE,
  floorBrush,
  structureBrush,
  type Brush,
} from "../codes";
import { emptyRows, type PlanGrid } from "../grid";

const wall = structureBrush(STRUCTURE[0]);

function plan(over: Partial<PlanGrid> = {}): PlanGrid {
  return {
    cols: 10,
    rows: 8,
    surface: emptyRows(10, 8),
    feature: emptyRows(10, 8),
    labels: [],
    ...over,
  };
}

function canvas(
  props: Partial<{
    plan: PlanGrid;
    editable: boolean;
    brush: Brush | null;
    shape: "freehand" | "rectangle";
  }> = {},
) {
  return mount(PlanCanvas, {
    props: {
      plan: plan(),
      zoom: 1,
      editable: true,
      brush: wall,
      shape: "freehand",
      ...props,
    },
  });
}

/** The screen point at the middle of a square at 100 %: 32 px of ruler, 16 px per square. */
const at = (col: number, row: number) => ({
  clientX: 32 + col * 16 + 8,
  clientY: 32 + row * 16 + 8,
  pointerId: 1,
});

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0,
    top: 0,
  } as DOMRect);
});

describe("PlanCanvas", () => {
  it("draws merged runs per layer", () => {
    const surface = emptyRows(10, 8);
    surface[0] = "t0t0t0" + "..".repeat(7);
    surface[1] = "w1w1" + "..".repeat(8);
    const wrapper = canvas({ plan: plan({ surface }) });
    expect(wrapper.findAll("[data-testid=surface-runs] rect")).toHaveLength(2);
    expect(wrapper.findAll("[data-testid=feature-runs] rect")).toHaveLength(0);
  });

  it("sizes the svg by zoom but keeps the viewBox in cm", async () => {
    const wrapper = canvas();
    const svg = wrapper.get("svg");
    expect(svg.attributes("viewBox")).toBe("-40 -40 240 200");
    expect(svg.attributes("width")).toBe(String(240 * 0.8));
    await wrapper.setProps({ zoom: 2 });
    expect(svg.attributes("viewBox")).toBe("-40 -40 240 200");
    expect(svg.attributes("width")).toBe(String(240 * 1.6));
  });

  it("emits one stroke on release, with no gaps on a fast freehand drag", async () => {
    const wrapper = canvas();
    const svg = wrapper.get("svg");
    await svg.trigger("pointerdown", at(0, 0));
    await svg.trigger("pointermove", at(3, 0));
    expect(wrapper.emitted("stroke")).toBeUndefined();
    expect(wrapper.get("[data-testid=stroke-readout]").text()).toBe(
      "Wall · 0.80 m",
    );
    await svg.trigger("pointerup", at(3, 0));
    expect(wrapper.emitted("stroke")?.[0][0]).toEqual([
      { col: 0, row: 0 },
      { col: 1, row: 0 },
      { col: 2, row: 0 },
      { col: 3, row: 0 },
    ]);
    expect(wrapper.find("[data-testid=stroke-preview]").exists()).toBe(false);
  });

  it("fills a rectangle", async () => {
    const wrapper = canvas({
      shape: "rectangle",
      brush: floorBrush(FLOORS[0]),
    });
    const svg = wrapper.get("svg");
    await svg.trigger("pointerdown", at(1, 1));
    await svg.trigger("pointermove", at(2, 3));
    expect(wrapper.get("[data-testid=stroke-readout]").text()).toBe(
      "Tile · 0.40 × 0.60 m",
    );
    await svg.trigger("pointerup", at(2, 3));
    expect(wrapper.emitted("stroke")?.[0][0]).toHaveLength(6);
  });

  it("does nothing when not editable", async () => {
    const wrapper = canvas({ editable: false });
    const svg = wrapper.get("svg");
    await svg.trigger("pointerdown", at(0, 0));
    await svg.trigger("pointerup", at(0, 0));
    expect(wrapper.emitted("stroke")).toBeUndefined();
  });

  it("reports the hovered square", async () => {
    const wrapper = canvas();
    await wrapper.get("svg").trigger("pointermove", at(4, 2));
    expect(wrapper.emitted("hover")?.[0][0]).toEqual({ col: 4, row: 2 });
  });

  describe("with the Label tool", () => {
    const labels = [{ id: "lb_1", text: "Hall", col: 2, row: 2 }];

    it("asks for a new label on an empty square", async () => {
      const wrapper = canvas({ brush: LABEL_TOOL, plan: plan({ labels }) });
      await wrapper.get("svg").trigger("pointerdown", at(6, 6));
      expect(wrapper.emitted("labelAt")?.[0][0]).toEqual({ col: 6, row: 6 });
    });

    it("picks a label on click and moves it on drag", async () => {
      const wrapper = canvas({ brush: LABEL_TOOL, plan: plan({ labels }) });
      const svg = wrapper.get("svg");
      await svg.trigger("pointerdown", at(2, 2));
      await svg.trigger("pointerup", at(2, 2));
      expect(wrapper.emitted("labelPick")?.[0][0]).toBe("lb_1");

      await svg.trigger("pointerdown", at(2, 2));
      await svg.trigger("pointermove", at(5, 4));
      await svg.trigger("pointerup", at(5, 4));
      expect(wrapper.emitted("labelMove")?.[0]).toEqual([
        "lb_1",
        { col: 5, row: 4 },
      ]);
    });
  });
});
