import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { noteId: "n-abc12345" } }),
}));

import NotePage from "./NotePage.vue";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
};

describe("NotePage (Story 1.1)", () => {
  it("reads the note id from the route", () => {
    const wrapper = mount(NotePage, { global: { stubs: STUBS } });
    expect(wrapper.get('[data-testid="note-id"]').text()).toBe("n-abc12345");
  });
});
