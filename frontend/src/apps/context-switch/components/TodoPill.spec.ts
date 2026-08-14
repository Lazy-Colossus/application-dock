import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TodoPill from "./TodoPill.vue";
import type { Todo } from "@/apps/context-switch/types";

function update(id: string, text: string) {
  return { id, text, created_at: "2026-08-13T10:00:00Z" };
}

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "t-1",
    header: "Ship it",
    color: "#ffffff",
    status: "active",
    order: 0,
    created_at: "2026-08-13T10:00:00Z",
    updated_at: "2026-08-13T10:00:00Z",
    archived_at: null,
    updates: [],
    ...overrides,
  };
}

describe("TodoPill", () => {
  it("renders just the header when there are no updates", () => {
    const wrapper = mount(TodoPill, { props: { todo: makeTodo() } });
    expect(wrapper.find('[data-testid="pill-header"]').text()).toBe("Ship it");
    expect(wrapper.find('[data-testid="pill-update-latest"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="pill-update-previous"]').exists()).toBe(
      false,
    );
  });

  it("shows only the latest update when there is one", () => {
    const wrapper = mount(TodoPill, {
      props: { todo: makeTodo({ updates: [update("u-1", "did a thing")] }) },
    });
    expect(wrapper.find('[data-testid="pill-update-latest"]').text()).toBe(
      "did a thing",
    );
    expect(wrapper.find('[data-testid="pill-update-previous"]').exists()).toBe(
      false,
    );
  });

  it("shows the two most recent updates, newest on top and previous faded", () => {
    const wrapper = mount(TodoPill, {
      props: {
        todo: makeTodo({
          // Stored oldest→newest; the pill surfaces the last two, newest first.
          updates: [
            update("u-1", "oldest"),
            update("u-2", "middle"),
            update("u-3", "newest"),
          ],
        }),
      },
    });
    expect(wrapper.find('[data-testid="pill-update-latest"]').text()).toBe(
      "newest",
    );
    const previous = wrapper.find('[data-testid="pill-update-previous"]');
    expect(previous.text()).toBe("middle");
    expect(previous.classes()).toContain("cs-pill-update--faded");
  });

  it("paints the pill in the todo's color", () => {
    const wrapper = mount(TodoPill, {
      props: { todo: makeTodo({ color: "#aecbfa" }) },
    });
    expect(
      wrapper.find('[data-testid="pill-t-1"]').attributes("style"),
    ).toContain("background: #aecbfa");
  });

  it("picks readable text for light and dark backgrounds", () => {
    const light = mount(TodoPill, {
      props: { todo: makeTodo({ color: "#ffffff" }) },
    });
    expect(
      light.find('[data-testid="pill-t-1"]').attributes("style"),
    ).toContain("color: #000000");

    const dark = mount(TodoPill, {
      props: { todo: makeTodo({ color: "#202124" }) },
    });
    expect(dark.find('[data-testid="pill-t-1"]').attributes("style")).toContain(
      "color: #ffffff",
    );
  });

  it("emits open when clicked (Story 2.4)", async () => {
    const wrapper = mount(TodoPill, { props: { todo: makeTodo() } });
    await wrapper.find('[data-testid="pill-t-1"]').trigger("click");
    expect(wrapper.emitted("open")).toHaveLength(1);
  });
});
