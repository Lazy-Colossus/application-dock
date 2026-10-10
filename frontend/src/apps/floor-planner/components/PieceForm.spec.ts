import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, type VueWrapper } from "@vue/test-utils";
import PieceForm from "./PieceForm.vue";
import { BLANK_DRAFT, draftOf, type PieceDraft } from "../furniture";
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

/** Mounted the way the page uses it: the draft goes out and comes back in. */
function form(
  piece: Furniture | null,
  draft: PieceDraft = piece ? draftOf(piece) : { ...BLANK_DRAFT },
  placedIn = 0,
) {
  const wrapper: VueWrapper = mount(PieceForm, {
    props: {
      piece,
      placedIn,
      draft,
      "onUpdate:draft": (d: PieceDraft) => wrapper.setProps({ draft: d }),
    },
  });
  return wrapper;
}

const draftNow = (w: VueWrapper) => (w.props() as { draft: PieceDraft }).draft;

beforeEach(() => vi.restoreAllMocks());

describe("PieceForm", () => {
  it("adds a rectangle", async () => {
    const wrapper = form(null);
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
    const wrapper = form(null);
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
    const wrapper = form(null);
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

  it("shows the draft it is given", () => {
    const wrapper = form(null, { ...draftOf(sofa), name: "Sofa copy" });
    expect(wrapper.get("h3").text()).toBe("New piece");
    expect(
      (wrapper.get("[data-testid=piece-name]").element as HTMLInputElement)
        .value,
    ).toBe("Sofa copy");
    expect(wrapper.find("[data-testid=piece-delete]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=piece-copy]").exists()).toBe(false);
  });

  it("offers Copy for a saved piece", async () => {
    const wrapper = form(sofa);
    await wrapper.get("[data-testid=piece-copy]").trigger("click");
    expect(wrapper.emitted("copy")).toHaveLength(1);
  });

  it("confirms delete, naming every layout only when placed", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const placed = form(sofa, draftOf(sofa), 2);
    await placed.get("[data-testid=piece-delete]").trigger("click");
    expect(confirm).toHaveBeenLastCalledWith(
      "Delete Sofa? It's removed from every layout.",
    );
    expect(placed.emitted("remove")).toHaveLength(1);

    const loose = form(sofa);
    await loose.get("[data-testid=piece-delete]").trigger("click");
    expect(confirm).toHaveBeenLastCalledWith("Delete Sofa?");
  });

  it("turns a typed shape into squares when switched to Custom", async () => {
    const wrapper = form({ ...sofa, width_cm: 40, depth_cm: 20 });
    await wrapper.get("[data-testid=shape-custom]").trigger("click");
    expect(draftNow(wrapper)).toMatchObject({
      shape: "custom",
      cells: ["gggg", "gggg"],
      width_cm: 40,
      depth_cm: 20,
    });
    expect(wrapper.find("[data-testid=piece-width]").exists()).toBe(false);
    expect(wrapper.find("[data-testid=colour-grey]").exists()).toBe(false);
    expect(wrapper.get("[data-testid=piece-drawn]").text()).toContain(
      "40 × 20 cm",
    );

    await wrapper.get("[data-testid=shape-rectangle]").trigger("click");
    expect(draftNow(wrapper)).toMatchObject({
      shape: "rectangle",
      cells: null,
      width_cm: 40,
      depth_cm: 20,
    });
  });

  it("saves a drawn shape as it is", async () => {
    const drawn: Furniture = {
      ...sofa,
      shape: "custom",
      cells: ["u..", "ggg"],
      width_cm: 30,
      depth_cm: 20,
    };
    const wrapper = form(drawn);
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[0][0]).toMatchObject({
      shape: "custom",
      cells: ["u..", "ggg"],
      width_cm: 30,
      depth_cm: 20,
    });
  });
});
