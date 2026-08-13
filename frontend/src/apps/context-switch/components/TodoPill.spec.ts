import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TodoPill from "./TodoPill.vue";
import type { Todo } from "@/apps/context-switch/types";

function makeTodo(overrides: Partial<Todo> = {}): Todo {
  return {
    id: "t-1",
    header: "Ship it",
    body: "the thing",
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
  it("renders the header and body", () => {
    const wrapper = mount(TodoPill, { props: { todo: makeTodo() } });
    expect(wrapper.find('[data-testid="pill-header"]').text()).toBe("Ship it");
    expect(wrapper.find('[data-testid="pill-body"]').text()).toBe("the thing");
  });

  it("omits the body block when there is no body", () => {
    const wrapper = mount(TodoPill, {
      props: { todo: makeTodo({ body: "" }) },
    });
    expect(wrapper.find('[data-testid="pill-body"]').exists()).toBe(false);
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
