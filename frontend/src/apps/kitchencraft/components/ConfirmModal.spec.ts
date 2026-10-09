import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ConfirmModal from "@/apps/kitchencraft/components/ConfirmModal.vue";

function mountConfirm(props: Record<string, unknown> = {}) {
  return mount(ConfirmModal, {
    props: {
      title: "Delete Pumpkin dal?",
      confirmLabel: "Delete",
      ...props,
    },
    attachTo: document.body,
  });
}

describe("what it asks", () => {
  it("shows the title and the confirm label it is given", () => {
    const wrapper = mountConfirm();
    expect(wrapper.find(".kc-title").text()).toBe("Delete Pumpkin dal?");
    expect(wrapper.find('[data-testid="confirm-confirm"]').text()).toBe(
      "Delete",
    );
  });

  it("shows the detail line when there is one", () => {
    const wrapper = mountConfirm({ detail: "This can't be undone." });
    expect(wrapper.find('[data-testid="confirm-detail"]').text()).toBe(
      "This can't be undone.",
    );
  });

  it("omits the detail entirely when there is none", () => {
    expect(mountConfirm().find('[data-testid="confirm-detail"]').exists()).toBe(
      false,
    );
  });

  it("names its controls from the testid it is given", () => {
    const wrapper = mountConfirm({ testid: "clear" });
    expect(wrapper.find('[data-testid="clear-confirm"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="clear-cancel"]').exists()).toBe(true);
  });
});

describe("the two answers", () => {
  it("emits confirm", async () => {
    const wrapper = mountConfirm();
    await wrapper.find('[data-testid="confirm-confirm"]').trigger("click");
    expect(wrapper.emitted("confirm")).toHaveLength(1);
  });

  it("emits cancel", async () => {
    const wrapper = mountConfirm();
    await wrapper.find('[data-testid="confirm-cancel"]').trigger("click");
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });

  it("puts the destructive answer first and carries it in danger", () => {
    const confirm = mountConfirm().find('[data-testid="confirm-confirm"]');
    expect(confirm.classes()).toContain("kc-btn--danger");
    // Never a moss fill: this is not the thing you came to the screen to do.
    expect(confirm.classes()).not.toContain("kc-chip--on");
  });
});

describe("a confirmation is not a modal", () => {
  // UX-DR14: escape and the backdrop close a modal, and NEITHER closes a
  // confirmation — it requires an explicit choice. This is the rule most likely
  // to be broken by someone generalising the two surfaces.
  it("does not close on escape", async () => {
    const wrapper = mountConfirm();
    await wrapper
      .find('[data-testid="confirm-backdrop"]')
      .trigger("keydown.esc");
    expect(wrapper.emitted("cancel")).toBeUndefined();
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });

  it("does not close on the backdrop", async () => {
    const wrapper = mountConfirm();
    await wrapper.find('[data-testid="confirm-backdrop"]').trigger("click");
    expect(wrapper.emitted("cancel")).toBeUndefined();
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });

  it("is announced as a dialog", () => {
    const dialog = mountConfirm().find('[role="dialog"]');
    expect(dialog.attributes("aria-modal")).toBe("true");
    expect(dialog.attributes("aria-labelledby")).toBe("confirm-title");
  });
});

describe("where it sits", () => {
  it("is centred, not anchored to the bottom edge", () => {
    // A confirmation is a question that stops you, not a surface you work in,
    // so it sits in the middle of the screen at every width.
    expect(
      mountConfirm().find('[data-testid="confirm-backdrop"]').classes(),
    ).toContain("kc-backdrop--centred");
  });
});
