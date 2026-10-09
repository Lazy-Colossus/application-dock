import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import SharedNotesHomePage from "./SharedNotesHomePage.vue";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
};

describe("SharedNotesHomePage", () => {
  it("renders the app title", () => {
    const wrapper = mount(SharedNotesHomePage, { global: { stubs: STUBS } });
    expect(wrapper.text()).toContain("Shared Notes");
  });
});
