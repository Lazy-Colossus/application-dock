import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";

import SharedNotesHomePage from "./SharedNotesHomePage.vue";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
};

describe("SharedNotesHomePage (Story 1.1)", () => {
  it("renders the app heading", () => {
    const wrapper = mount(SharedNotesHomePage, { global: { stubs: STUBS } });
    expect(wrapper.text()).toContain("Shared Notes");
  });
});
