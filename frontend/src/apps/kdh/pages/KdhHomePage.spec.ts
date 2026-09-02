import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import KdhHomePage from "./KdhHomePage.vue";

describe("KdhHomePage", () => {
  it("renders the app name (Story 1.1 placeholder)", () => {
    const wrapper = mount(KdhHomePage);
    expect(wrapper.text()).toContain("KDH");
  });
});
