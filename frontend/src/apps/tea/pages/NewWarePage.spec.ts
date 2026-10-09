import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }), onBeforeRouteLeave: vi.fn() }));

import NewWarePage from "./NewWarePage.vue";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  getMock.mockResolvedValue([]);
});

describe("NewWarePage", () => {
  it("needs a name before it saves, then opens the new piece", async () => {
    postMock.mockResolvedValue({ id: "w-9" });
    const wrapper = mount(NewWarePage, { global: { stubs: STUBS } });
    await flushPromises();
    expect(wrapper.get("[data-testid=ware-new-save]").attributes("disabled")).toBeDefined();

    await wrapper.get("[data-testid=ware-field-name]").setValue("Gaiwan");
    await wrapper.get("[data-testid=ware-new-save]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith(
      "/tea/teaware",
      expect.objectContaining({ name: "Gaiwan", type: "gaiwan" }),
    );
    expect(push).toHaveBeenCalledWith({ name: "tea-ware-detail", params: { wareId: "w-9" } });
  });

  it("shows a refused save and keeps the typing", async () => {
    postMock.mockRejectedValue(Object.assign(new Error("422"), { detail: "Teaware needs a name" }));
    const wrapper = mount(NewWarePage, { global: { stubs: STUBS } });
    await wrapper.get("[data-testid=ware-field-name]").setValue("x");
    await wrapper.get("[data-testid=ware-new-save]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=ware-new-error]").text()).toBe("Teaware needs a name");
    expect(
      (wrapper.get("[data-testid=ware-field-name]").element as HTMLInputElement).value,
    ).toBe("x");
  });
});
