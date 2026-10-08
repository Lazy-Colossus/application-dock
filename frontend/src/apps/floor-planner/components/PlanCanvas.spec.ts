import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import PlanCanvas from "./PlanCanvas.vue";
import {
  FLOORS,
  LABEL_TOOL,
  STRUCTURE,
  floorBrush,
  structureBrush,
} from "../codes";
import { emptyRows, type PlanGrid } from "../grid";
import { PIECE_DRAG_TYPE } from "../furniture";
import type { Furniture, Rotation } from "../types";

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
  props: Partial<InstanceType<typeof PlanCanvas>["$props"]> = {},
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

  describe("furniture", () => {
    const sofa: Furniture = {
      id: "f_sofa",
      name: "Sofa",
      colour: "grey",
      note: "",
      shape: "rectangle",
      width_cm: 100,
      depth_cm: 40,
      cells: null,
    };
    const at = (x: number, y: number, rotation: Rotation = 0) => ({
      piece: sofa,
      placement: { furniture_id: "f_sofa", x_cm: x, y_cm: y, rotation },
      warned: false,
    });
    /** A screen point at plan (x, y) cm at 100 %: the 40 cm ruler, then 0.8 px per cm. */
    const px = (x: number, y: number) => ({
      clientX: (40 + x) * 0.8,
      clientY: (40 + y) * 0.8,
      pointerId: 1,
    });

    function arranging(
      placed = [at(40, 60)],
      selectedId: string | null = null,
    ) {
      return canvas({
        brush: null,
        editable: false,
        placed,
        selectedId,
        arranging: true,
      });
    }

    it("draws each piece rotated about its centre with its name upright", () => {
      const wrapper = canvas({ placed: [at(40, 60, 90)] });
      const group = wrapper.get("[data-testid=placed-f_sofa]");
      expect(group.get("g").attributes("transform")).toBe(
        "translate(90 80) rotate(90) translate(-50 -20)",
      );
      expect(group.get("text").attributes("transform")).toBeUndefined();
      expect(group.text()).toBe("Sofa");
    });

    it("marks the selected piece and a warned one", () => {
      const wrapper = arranging([{ ...at(40, 60), warned: true }], "f_sofa");
      expect(wrapper.find("[data-testid=piece-selected]").exists()).toBe(true);
      expect(wrapper.find("[data-testid=piece-warned]").exists()).toBe(true);
    });

    it("drags a piece in 10 cm steps and emits one move on release", async () => {
      const wrapper = arranging();
      await wrapper
        .get("[data-testid=placed-f_sofa]")
        .trigger("pointerdown", px(60, 70));
      await wrapper.get("svg").trigger("pointermove", px(97, 70));
      expect(wrapper.emitted("move")).toBeUndefined();
      await wrapper.get("svg").trigger("pointerup", px(97, 70));
      expect(wrapper.emitted("select")?.[0]).toEqual(["f_sofa"]);
      expect(wrapper.emitted("move")?.[0]).toEqual(["f_sofa", 80, 60]);
    });

    it("selects without moving on a plain click", async () => {
      const wrapper = arranging();
      await wrapper
        .get("[data-testid=placed-f_sofa]")
        .trigger("pointerdown", px(60, 70));
      await wrapper.get("svg").trigger("pointerup", px(60, 70));
      expect(wrapper.emitted("select")?.[0]).toEqual(["f_sofa"]);
      expect(wrapper.emitted("move")).toBeUndefined();
    });

    it("deselects on empty plan", async () => {
      const wrapper = arranging();
      await wrapper.get("svg").trigger("pointerdown", px(400, 400));
      expect(wrapper.emitted("select")?.[0]).toEqual([null]);
    });

    it("won't move pieces when not arranging", async () => {
      const wrapper = canvas({ placed: [at(40, 60)] });
      await wrapper
        .get("[data-testid=placed-f_sofa]")
        .trigger("pointerdown", px(60, 70));
      await wrapper.get("svg").trigger("pointerup", px(160, 70));
      expect(wrapper.emitted("move")).toBeUndefined();
      expect(wrapper.emitted("select")).toBeUndefined();
    });

    it("takes a tray card dropped onto the plan, at its centre in cm", async () => {
      const wrapper = canvas({ droppable: true });
      const dataTransfer = {
        types: [PIECE_DRAG_TYPE],
        getData: (t: string) => (t === PIECE_DRAG_TYPE ? "f_sofa" : ""),
      };
      await wrapper
        .get("svg")
        .trigger("drop", { ...px(250, 120), dataTransfer });
      expect(wrapper.emitted("drop")?.[0]).toEqual(["f_sofa", 250, 120]);
    });
  });
});
