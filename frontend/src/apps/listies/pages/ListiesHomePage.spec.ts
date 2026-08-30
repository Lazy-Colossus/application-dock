import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import ListiesHomePage from "./ListiesHomePage.vue";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
};

describe("ListiesHomePage", () => {
  it("renders the app title", () => {
    const wrapper = mount(ListiesHomePage, { global: { stubs: STUBS } });
    expect(wrapper.text()).toContain("Listies");
  });
});
