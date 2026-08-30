import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("vue-router", async () => {
  const { reactive } = await import("vue");
  const route = reactive({ params: { sheetId: "s-42" } });
  return { useRoute: () => route, useRouter: () => ({ push: vi.fn() }) };
});

import SheetPage from "./SheetPage.vue";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
};

describe("SheetPage", () => {
  it("reads the sheet id from the route", () => {
    const wrapper = mount(SheetPage, { global: { stubs: STUBS } });
    expect(wrapper.text()).toContain("s-42");
  });
});
