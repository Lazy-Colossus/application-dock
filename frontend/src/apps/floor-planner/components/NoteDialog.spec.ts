import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import NoteDialog from "./NoteDialog.vue";

describe("NoteDialog", () => {
  it("saves the trimmed text with its direction", async () => {
    const wrapper = mount(NoteDialog, {
      props: { initial: { text: "", vertical: false }, isNew: true },
    });
    expect(wrapper.text()).toContain("New note");
    expect(
      wrapper.get("[data-testid=note-save]").attributes("disabled"),
    ).toBeDefined();
    await wrapper.get("[data-testid=note-text]").setValue("  Pipe ");
    await wrapper.get("[data-testid=note-vertical]").trigger("click");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("save")?.[0]).toEqual(["Pipe", true]);
    expect(wrapper.find("[data-testid=note-remove]").exists()).toBe(false);
  });

  it("starts from the note's direction and offers Delete", async () => {
    const wrapper = mount(NoteDialog, {
      props: { initial: { text: "Pipe", vertical: true }, isNew: false },
    });
    expect(
      wrapper.get("[data-testid=note-vertical]").attributes("aria-pressed"),
    ).toBe("true");
    await wrapper.get("[data-testid=note-remove]").trigger("click");
    expect(wrapper.emitted("remove")).toHaveLength(1);
  });
});
