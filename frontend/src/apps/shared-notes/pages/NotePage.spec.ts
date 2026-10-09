import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("vue-router", async () => {
  const { reactive } = await import("vue");
  const route = reactive({ params: { noteId: "n-42" } });
  return { useRoute: () => route, useRouter: () => ({ push: vi.fn() }) };
});

import NotePage from "./NotePage.vue";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
};

describe("NotePage", () => {
  it("reads the note id from the route", () => {
    const wrapper = mount(NotePage, { global: { stubs: STUBS } });
    expect(wrapper.text()).toContain("n-42");
  });
});
