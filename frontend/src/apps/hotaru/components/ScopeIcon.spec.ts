import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import ScopeIcon from "./ScopeIcon.vue";

describe("ScopeIcon", () => {
  it("renders an svg for each kind", () => {
    for (const kind of ["lessons", "topics", "quick"] as const) {
      const wrapper = mount(ScopeIcon, { props: { kind } });
      expect(wrapper.find("svg").exists()).toBe(true);
    }
  });

  it("draws distinct glyphs per kind", () => {
    const html = (kind: "lessons" | "topics" | "quick") =>
      mount(ScopeIcon, { props: { kind } }).html();
    expect(html("lessons")).not.toBe(html("topics"));
    expect(html("topics")).not.toBe(html("quick"));
    expect(html("lessons")).not.toBe(html("quick"));
  });
});
