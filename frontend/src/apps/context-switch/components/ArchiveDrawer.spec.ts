import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ArchiveDrawer from "./ArchiveDrawer.vue";
import type { Todo } from "@/apps/context-switch/types";

const STUBS = {
  "q-dialog": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\">{{ label }}</button>",
    props: ["label", "color", "flat", "dense", "round", "noCaps", "icon"],
    emits: ["click"],
  },
};

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "t-1",
    header: "Done thing",
    color: "#aecbfa",
    status: "archived",
    order: 0,
    created_at: "2026-08-13T10:00:00Z",
    updated_at: "2026-08-13T10:00:00Z",
    archived_at: "2026-08-13T12:00:00Z",
    updates: [
      { id: "u-1", text: "some notes", created_at: "2026-08-13T11:00:00Z" },
    ],
    ...overrides,
  };
}

function mountDrawer(archived: Todo[] = [makeTodo()]) {
  return mount(ArchiveDrawer, {
    props: { modelValue: true, archived },
    global: { stubs: STUBS },
  });
}

describe("ArchiveDrawer", () => {
  it("shows an empty state when nothing is archived", () => {
    const wrapper = mountDrawer([]);
    expect(wrapper.find('[data-testid="archived-empty"]').exists()).toBe(true);
  });

  it("lists archived todos with their header, latest update and archived date", () => {
    const wrapper = mountDrawer([makeTodo({ id: "t-7", header: "Shipped" })]);
    const item = wrapper.find('[data-testid="archived-item-t-7"]');
    expect(item.exists()).toBe(true);
    expect(item.text()).toContain("Shipped");
    expect(item.text()).toContain("some notes");
    expect(wrapper.find('[data-testid="archived-empty"]').exists()).toBe(false);
  });

  // Story 3.3 revises Story 2.7's "terminal, no reopen in v1": archiving is now
  // reversible, permanent delete still is not.
  it("offers both a restore and a delete control per row", () => {
    const wrapper = mountDrawer([makeTodo({ id: "t-7" })]);
    const item = wrapper.find('[data-testid="archived-item-t-7"]');
    expect(item.find('[data-testid="archived-restore-t-7"]').exists()).toBe(
      true,
    );
    expect(item.find('[data-testid="archived-delete-t-7"]').exists()).toBe(
      true,
    );
  });

  it("emits restore with the todo id, without a confirm step", async () => {
    const wrapper = mountDrawer([makeTodo({ id: "t-7" })]);

    await wrapper.find('[data-testid="archived-restore-t-7"]').trigger("click");

    expect(wrapper.emitted("restore")?.[0]).toEqual(["t-7"]);
    expect(wrapper.emitted("delete")).toBeUndefined();
  });

  it("confirms before deleting and emits delete only on confirm", async () => {
    const wrapper = mountDrawer([makeTodo({ id: "t-7" })]);

    await wrapper.find('[data-testid="archived-delete-t-7"]').trigger("click");
    // Nothing emitted yet — the click only reveals the confirm.
    expect(wrapper.emitted("delete")).toBeUndefined();

    await wrapper
      .find('[data-testid="archived-delete-confirm-t-7"]')
      .trigger("click");
    expect(wrapper.emitted("delete")?.[0]).toEqual(["t-7"]);
  });

  it("can cancel the delete confirmation without emitting", async () => {
    const wrapper = mountDrawer([makeTodo({ id: "t-7" })]);

    await wrapper.find('[data-testid="archived-delete-t-7"]').trigger("click");
    await wrapper
      .find('[data-testid="archived-delete-cancel-t-7"]')
      .trigger("click");

    expect(wrapper.emitted("delete")).toBeUndefined();
    // The trash button is back (confirm dismissed).
    expect(wrapper.find('[data-testid="archived-delete-t-7"]').exists()).toBe(
      true,
    );
  });
});
