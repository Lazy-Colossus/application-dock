import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ChaXiFields from "./ChaXiFields.vue";
import { emptyChaXi } from "../journal";
import type { ChaXi } from "../types";

interface Props {
  modelValue: ChaXi;
  photoSrc: string | null;
  photoError: string | null;
}

function render(overrides: Partial<Props> = {}) {
  return mount(ChaXiFields, {
    props: {
      modelValue: emptyChaXi(),
      photoSrc: null,
      photoSaving: false,
      photoError: null,
      ...overrides,
    },
  });
}

describe("ChaXiFields", () => {
  it("toggles moods into vocabulary order", async () => {
    const wrapper = render({ modelValue: { ...emptyChaXi(), moods: ["social"] } });
    await wrapper.get("[data-testid=chaxi-mood-calm]").trigger("click");
    expect(wrapper.emitted("update:modelValue")![0][0]).toEqual({
      ...emptyChaXi(),
      moods: ["calm", "social"],
    });
    expect(wrapper.get("[data-testid=chaxi-mood-social]").attributes("aria-pressed")).toBe("true");
  });

  it("emits guests and notes as typed", async () => {
    const wrapper = render();
    await wrapper.get("[data-testid=chaxi-guests]").setValue("Eva");
    await wrapper.get("[data-testid=chaxi-notes]").setValue("orchid");
    const emitted = wrapper.emitted("update:modelValue")!.map((e) => e[0] as ChaXi);
    expect(emitted[0].guests).toBe("Eva");
    expect(emitted[1].notes).toBe("orchid");
  });

  it("hands a picked photo up, and offers the same file again after a failure", async () => {
    const wrapper = render();
    const file = new File(["x"], "t.jpg", { type: "image/jpeg" });
    const input = wrapper.get("[data-testid=chaxi-photo-input]");
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    expect(wrapper.emitted("photo")![0][0]).toBe(file);

    await wrapper.setProps({ photoError: "Too big" });
    await wrapper.get("[data-testid=chaxi-photo-retry]").trigger("click");
    expect(wrapper.emitted("photo")![1][0]).toBe(file);
  });

  it("shows the saved photo with a remove button", async () => {
    const wrapper = render({ photoSrc: "/api/tea/sessions/s-1/image?token=t" });
    expect(wrapper.get("[data-testid=chaxi-photo-img]").attributes("src")).toContain("s-1");
    await wrapper.get("[data-testid=chaxi-photo-remove]").trigger("click");
    expect(wrapper.emitted("remove-photo")).toHaveLength(1);
  });
});
