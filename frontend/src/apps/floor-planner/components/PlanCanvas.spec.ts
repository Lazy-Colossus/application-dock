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
import { emptyRows, type Cell, type PlanGrid } from "../grid";
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
    doors: [],
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
  describe("doors", () => {
    const door = structureBrush(STRUCTURE[2]);
    /** A wall along row 2 with a 4-square door in columns 3–6. */
    function withDoor(): PlanGrid {
      const feature = emptyRows(10, 8);
      feature[2] = "wl".repeat(3) + "dr".repeat(4) + "wl".repeat(3);
      return plan({ feature });
    }

    it("draws a door as a swing, not as painted squares", () => {
      const wrapper = canvas({ plan: withDoor() });
      expect(wrapper.find("[data-testid=door-3,2]").exists()).toBe(true);
      expect(wrapper.findAll("[data-testid=door-leaf]")).toHaveLength(1);
      const painted = wrapper.findAll("[data-testid=feature-runs] rect");
      expect(painted.map((r) => r.attributes("width"))).toEqual(["60", "60"]);
    });

    it("draws two leaves for a double door, and the shut leaf along the wall", () => {
      const p = withDoor();
      p.doors = [{ col: 3, row: 2, into: 1, hinge: 0, double: true }];
      const wrapper = canvas({ plan: p, closedDoors: ["3,2"] });
      const leaves = wrapper.findAll("[data-testid=door-leaf]");
      expect(leaves).toHaveLength(2);
      // Shut, each leaf lies along the wall's face, below it as it opens downwards.
      expect(leaves[0].attributes()).toMatchObject({
        x1: "60",
        y1: "60",
        x2: "100",
        y2: "60",
      });
    });

    it("swings the door with its handle, without painting", async () => {
      const wrapper = canvas({ plan: withDoor() });
      const handle = wrapper.get("[data-testid=door-handle-3,2]");
      await handle.trigger("pointerdown", at(4, 2));
      await handle.trigger("click");
      expect(wrapper.emitted("doorToggle")).toEqual([["3,2"]]);
      expect(wrapper.emitted("stroke")).toBeUndefined();
    });

    it("opens the setup on a click with a door brush, but a drag still paints", async () => {
      const wrapper = canvas({ plan: withDoor(), brush: door });
      const svg = wrapper.get("[data-testid=plan-canvas]");
      await svg.trigger("pointerdown", at(4, 2));
      await svg.trigger("pointerup", at(4, 2));
      expect(wrapper.emitted("doorPick")?.[0][0]).toBe("3,2");
      expect(wrapper.emitted("stroke")).toBeUndefined();

      await svg.trigger("pointerdown", at(4, 2));
      await svg.trigger("pointermove", at(4, 3));
      await svg.trigger("pointerup", at(4, 3));
      expect(wrapper.emitted("stroke")).toHaveLength(1);
    });

    it("fills the opening with the door's colour, clickable only when it does something", () => {
      const opening = (props = {}) =>
        canvas({ plan: withDoor(), ...props }).get(
          "[data-testid=door-opening]",
        );
      expect(opening().attributes("fill")).toBe("#e3a548");
      expect(opening().attributes("pointer-events")).toBe("none");
      expect(opening({ brush: door }).classes()).toContain(
        "plan-canvas__door-hit",
      );
      expect(
        opening({ editable: false, brush: null, arranging: true }).attributes(
          "pointer-events",
        ),
      ).toBe("all");
    });

    it("swings a door when its opening or leaf is clicked in Arrange", async () => {
      const wrapper = canvas({
        plan: withDoor(),
        editable: false,
        brush: null,
        arranging: true,
      });
      await wrapper.get("[data-testid=door-opening]").trigger("click");
      await wrapper.get("[data-testid=door-leaf]").trigger("click");
      expect(wrapper.emitted("doorToggle")).toEqual([["3,2"], ["3,2"]]);
      expect(wrapper.emitted("select")).toBeUndefined();
    });

    it("paints over a door with any other brush", async () => {
      const wrapper = canvas({ plan: withDoor() });
      const svg = wrapper.get("[data-testid=plan-canvas]");
      await svg.trigger("pointerdown", at(4, 2));
      await svg.trigger("pointerup", at(4, 2));
      expect(wrapper.emitted("stroke")).toHaveLength(1);
      expect(wrapper.emitted("doorPick")).toBeUndefined();
    });
  });

  it("draws merged runs per layer", () => {
    const surface = emptyRows(10, 8);
    surface[0] = "t0t0t0" + "..".repeat(7);
    surface[1] = "w1w1" + "..".repeat(8);
    const wrapper = canvas({ plan: plan({ surface }) });
    expect(wrapper.findAll("[data-testid=surface-runs] rect")).toHaveLength(2);
    expect(wrapper.findAll("[data-testid=feature-runs] rect")).toHaveLength(0);
  });

  it("draws the grid over the floors only while the plan can be painted", () => {
    const gridAfterFloors = (editable: boolean) => {
      const html = canvas({ editable }).html();
      return (
        html.indexOf("url(#fp-grid-minor)") >
        html.indexOf('data-testid="surface-runs"')
      );
    };
    expect(gridAfterFloors(true)).toBe(true);
    expect(gridAfterFloors(false)).toBe(false);
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

  it("paints a 2×2 block per square with a bigger freehand brush", async () => {
    const wrapper = canvas({ brushSize: 2 });
    const svg = wrapper.get("svg");
    await svg.trigger("pointerdown", at(0, 0));
    await svg.trigger("pointermove", at(1, 0));
    await svg.trigger("pointerup", at(1, 0));
    const cells = wrapper.emitted("stroke")?.[0][0] as Cell[];
    expect(cells).toHaveLength(6);
    expect(cells).toContainEqual({ col: 2, row: 1 });
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

    it("draws the selected piece on top of the others", () => {
      const table = { ...sofa, id: "f_table", name: "Table" };
      const under = {
        piece: table,
        placement: {
          furniture_id: "f_table",
          x_cm: 60,
          y_cm: 60,
          rotation: 0 as const,
        },
        warned: false,
      };
      const order = (selectedId: string | null) =>
        arranging([under, at(40, 60)], selectedId)
          .findAll("[data-testid^=placed-]")
          .map((g) => g.attributes("data-testid"));
      expect(order(null)).toEqual(["placed-f_table", "placed-f_sofa"]);
      expect(order("f_table")).toEqual(["placed-f_sofa", "placed-f_table"]);
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
