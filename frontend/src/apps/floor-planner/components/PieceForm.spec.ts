import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import PieceForm from "./PieceForm.vue";
import type { Furniture } from "../types";

const sofa: Furniture = {
  id: "f_1",
  name: "Sofa",
  colour: "grey",
  note: "IKEA Kivik",
  shape: "rectangle",
  width_cm: 220,
  depth_cm: 95,
  cells: null,
};

beforeEach(() => vi.restoreAllMocks());

describe("PieceForm", () => {
  it("adds a rectangle", async () => {
    const wrapper = mount(PieceForm, { props: { piece: null, placedIn: 0 } });
    await wrapper.get("[data-testid=piece-name]").setValue(" Desk ");
    await wrapper.get("[data-testid=piece-width]").setValue("140");
    await wrapper.get("[data-testid=piece-depth]").setValue("70");
    await wrapper.get("[data-testid=colour-brown]").trigger("click");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[0][0]).toEqual({
      name: "Desk",
      colour: "brown",
      note: "",
      shape: "rectangle",
      width_cm: 140,
      depth_cm: 70,
      cells: null,
    });
  });

  it("takes one diameter for a round piece", async () => {
    const wrapper = mount(PieceForm, { props: { piece: null, placedIn: 0 } });
    await wrapper.get("[data-testid=piece-name]").setValue("Table");
    await wrapper.get("[data-testid=shape-round]").trigger("click");
    expect(wrapper.find("[data-testid=piece-width]").exists()).toBe(false);
    await wrapper.get("[data-testid=piece-diameter]").setValue("110");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      shape: "round",
      width_cm: 110,
      depth_cm: 110,
    });
  });

  it("can't save without a name or with a zero size", async () => {
    const wrapper = mount(PieceForm, { props: { piece: null, placedIn: 0 } });
    const save = () =>
      wrapper.get("[data-testid=piece-save]").attributes("disabled");
    expect(save()).toBeDefined();
    await wrapper.get("[data-testid=piece-name]").setValue("Desk");
    expect(save()).toBeUndefined();
    await wrapper.get("[data-testid=piece-width]").setValue("0");
    expect(save()).toBeDefined();
    expect(wrapper.get("[data-testid=piece-problem]").text()).toBe(
      "Sizes must be 1–1000 cm",
    );
  });

  it("pre-fills when editing and says when the preview is shrunk", () => {
    const wrapper = mount(PieceForm, {
      props: { piece: { ...sofa, width_cm: 570 }, placedIn: 0 },
    });
    expect(
      (wrapper.get("[data-testid=piece-name]").element as HTMLInputElement)
        .value,
    ).toBe("Sofa");
    expect(wrapper.get("[data-testid=piece-preview]").text()).toContain(
      "shown at 50 %",
    );
  });

  it("confirms delete, naming every layout only when placed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const placed = mount(PieceForm, { props: { piece: sofa, placedIn: 2 } });
    await placed.get("[data-testid=piece-delete]").trigger("click");
    expect(confirm).toHaveBeenLastCalledWith(
      "Delete Sofa? It's removed from every layout.",
    );
    expect(placed.emitted("remove")).toHaveLength(1);

    const loose = mount(PieceForm, { props: { piece: sofa, placedIn: 0 } });
    await loose.get("[data-testid=piece-delete]").trigger("click");
    expect(confirm).toHaveBeenLastCalledWith("Delete Sofa?");
  });

  it("saves a custom shape sized from its mask", async () => {
    const wrapper = mount(PieceForm, {
      props: {
        piece: {
          ...sofa,
          shape: "custom",
          cells: ["#..", "###"],
          width_cm: 60,
          depth_cm: 40,
        },
        placedIn: 0,
      },
    });
    expect(wrapper.find("[data-testid=shape-editor]").exists()).toBe(true);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      shape: "custom",
      cells: ["#..", "###"],
      width_cm: 60,
      depth_cm: 40,
    });
  });
});
