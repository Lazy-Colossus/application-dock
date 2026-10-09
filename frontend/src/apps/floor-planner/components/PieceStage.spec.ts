import { describe, it, expect } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import PieceStage from "./PieceStage.vue";
import type { PieceDraft } from "../furniture";

const table: PieceDraft = {
  name: "Table",
  colour: "brown",
  note: "",
  shape: "rectangle",
  width_cm: 40,
  depth_cm: 20,
  cells: null,
};

/** 14 px squares at 100 %; the grid sits at the page's top-left in jsdom. */
const at = (col: number, row: number) => ({
  clientX: col * 14 + 7,
  clientY: row * 14 + 7,
  button: 0,
  pointerId: 1,
});

function stage(draft: PieceDraft | null) {
  const wrapper: VueWrapper = mount(PieceStage, {
    props: {
      draft,
      zoom: 1,
      "onUpdate:draft": (d: PieceDraft) => wrapper.setProps({ draft: d }),
    },
  });
  return wrapper;
}

const draftNow = (w: VueWrapper) => (w.props() as { draft: PieceDraft }).draft;

async function drag(
  w: VueWrapper,
  from: [number, number],
  to: [number, number],
) {
  const grid = w.get("[data-testid=piece-grid]");
  await grid.trigger("pointerdown", at(...from));
  await grid.trigger("pointermove", at(...to));
  await grid.trigger("pointerup", at(...to));
}

describe("PieceStage", () => {
  it("shows a typed shape on the grid with its size", () => {
    const wrapper = stage(table);
    expect(wrapper.find("[data-testid=piece-grid]").exists()).toBe(true);
    expect(wrapper.get("[data-testid=piece-preview]").text()).toBe(
      "40 × 20 cm",
    );
  });

  it("paints a freehand line in the chosen colour", async () => {
    const wrapper = stage({ ...table, shape: "custom", cells: [] });
    await wrapper.get("[data-testid=paint-blue]").trigger("click");
    await drag(wrapper, [2, 3], [5, 3]);
    expect(draftNow(wrapper)).toMatchObject({
      shape: "custom",
      cells: ["uuuu"],
      width_cm: 40,
      depth_cm: 10,
      colour: "blue",
    });
  });

  it("fills a rectangle on release", async () => {
    const wrapper = stage({ ...table, shape: "custom", cells: [] });
    await wrapper.get("[data-testid=tool-rectangle]").trigger("click");
    const grid = wrapper.get("[data-testid=piece-grid]");
    await grid.trigger("pointerdown", at(1, 1));
    await grid.trigger("pointermove", at(3, 2));
    expect(wrapper.find("[data-testid=rect-preview]").exists()).toBe(true);
    await grid.trigger("pointerup", at(3, 2));
    expect(draftNow(wrapper).cells).toEqual(["bbb", "bbb"]);
  });

  it("turns a typed shape into squares on the first stroke, and Undo brings it back", async () => {
    const wrapper = stage(table);
    await wrapper.get("[data-testid=paint-eraser]").trigger("click");
    // The 4 × 2 table is centred on the 40-square grid: columns 18–21, rows 19–20.
    await drag(wrapper, [18, 19], [18, 20]);
    expect(draftNow(wrapper)).toMatchObject({
      shape: "custom",
      cells: ["bbb", "bbb"],
      width_cm: 30,
    });

    await wrapper.get("[data-testid=stage-undo]").trigger("click");
    expect(draftNow(wrapper)).toEqual(table);
    expect(
      wrapper.get("[data-testid=stage-undo]").attributes("disabled"),
    ).toBeDefined();
  });

  it("only previews pieces over 4 m, shrunk", () => {
    const wrapper = stage({ ...table, width_cm: 600 });
    expect(wrapper.find("[data-testid=piece-grid]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=furniture-shape]").exists()).toBe(true);
    expect(wrapper.get("[data-testid=piece-preview]").text()).toContain(
      "shown at 67 %",
    );
    expect(wrapper.text()).toContain("Pieces over 4 m can't be drawn on.");
  });

  it("says when nothing is open", () => {
    const wrapper = stage(null);
    expect(wrapper.text()).toBe("No piece selected.");
  });
});
