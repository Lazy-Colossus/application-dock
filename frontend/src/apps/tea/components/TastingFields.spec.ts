import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TastingFields from "./TastingFields.vue";
import { emptyTasting } from "../tasting";
import type { Tasting } from "../types";

function render(modelValue: Tasting | null = null) {
  return mount(TastingFields, { props: { modelValue } });
}

function last(wrapper: ReturnType<typeof render>): Tasting | null {
  return wrapper.emitted("update:modelValue")!.at(-1)![0] as Tasting | null;
}

describe("TastingFields", () => {
  it("starts a fresh sheet with every section closed", () => {
    const wrapper = render();
    for (const key of ["leaf", "liquor", "aroma", "sensation"]) {
      expect(wrapper.get(`[data-testid=tasting-section-${key}]`).attributes("open")).toBeUndefined();
    }
  });

  it("opens the sections that already hold something, and counts them", () => {
    const t = emptyTasting();
    t.aroma.top_note = "orchid";
    t.aroma.richness = 4;
    const wrapper = render(t);
    expect(wrapper.get("[data-testid=tasting-section-aroma]").attributes("open")).toBeDefined();
    expect(wrapper.get("[data-testid=tasting-count-aroma]").text()).toContain("2 noted");
    expect(wrapper.get("[data-testid=tasting-section-leaf]").attributes("open")).toBeUndefined();
  });

  it("writes text, stars, a scale and picks", async () => {
    const wrapper = render();
    await wrapper.get('[data-testid="tasting-aroma.top_note"]').setValue("orchid");
    expect(last(wrapper)!.aroma.top_note).toBe("orchid");

    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-sensation.hui_gan.strength-4"]').trigger("click");
    expect(last(wrapper)!.sensation.hui_gan.strength).toBe(4);

    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-sensation.body-mellow"]').trigger("click");
    expect(last(wrapper)!.sensation.body).toBe("mellow");

    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-aroma.structure-long"]').trigger("click");
    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-aroma.structure-single"]').trigger("click");
    expect(last(wrapper)!.aroma.structure).toEqual(["single", "long"]);
  });

  it("goes back to no tasting when the last field is cleared", async () => {
    const t = emptyTasting();
    t.sensation.throat = 3;
    const wrapper = render(t);
    await wrapper.get('[data-testid="tasting-sensation.throat-3"]').trigger("click");
    expect(last(wrapper)).toBeNull();
  });

  it("never lets 'none noticeable' sit beside another body feeling", async () => {
    const t = emptyTasting();
    t.sensation.body_feel = ["sweating", "warmth"];
    const wrapper = render(t);
    await wrapper.get('[data-testid="tasting-sensation.body_feel-none"]').trigger("click");
    expect(last(wrapper)!.sensation.body_feel).toEqual(["none"]);

    await wrapper.setProps({ modelValue: last(wrapper) });
    await wrapper.get('[data-testid="tasting-sensation.body_feel-warmth"]').trigger("click");
    expect(last(wrapper)!.sensation.body_feel).toEqual(["warmth"]);
  });

  it("unpicks a scale value when it is tapped again", async () => {
    const t = emptyTasting();
    t.sensation.body = "mellow";
    t.aroma.aroma = "orchid";
    const wrapper = render(t);
    await wrapper.get('[data-testid="tasting-sensation.body-mellow"]').trigger("click");
    expect(last(wrapper)!.sensation.body).toBeNull();
  });
});
