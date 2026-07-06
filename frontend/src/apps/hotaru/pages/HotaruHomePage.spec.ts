import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, replace } = vi.hoisted(() => ({
  getMock: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ replace }) }));

import HotaruHomePage from "./HotaruHomePage.vue";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\">{{ label }}</button>",
    props: ["label", "outline", "unelevated", "noCaps"],
  },
  "q-menu": { template: "<div><slot /></div>" },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": { template: "<div @click=\"$emit('click')\"><slot /></div>" },
  "q-item-section": { template: "<div><slot /></div>" },
};

const MOUNT_OPTS = {
  global: { stubs: STUBS, directives: { "close-popup": {} } },
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  getMock.mockReset().mockResolvedValue(USERS);
  replace.mockReset();
});

describe("HotaruHomePage", () => {
  it("renders the Hotaru brand and entry actions", async () => {
    localStorage.setItem("hotaru.activeUser", "dani");
    const wrapper = mount(HotaruHomePage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.text()).toContain("Hotaru");
    expect(wrapper.find('[data-testid="practice-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="library-btn"]').exists()).toBe(true);
  });

  it("scopes the forest theme via the hotaru-app root class", async () => {
    localStorage.setItem("hotaru.activeUser", "dani");
    const wrapper = mount(HotaruHomePage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.find(".hotaru-app").exists()).toBe(true);
  });

  it("greets the active user by name", async () => {
    localStorage.setItem("hotaru.activeUser", "jake");
    const wrapper = mount(HotaruHomePage, MOUNT_OPTS);
    await flushPromises();
    expect(wrapper.text()).toContain("Welcome back, Jake");
    expect(replace).not.toHaveBeenCalled();
  });

  it("redirects to identity when no active user is set", async () => {
    const wrapper = mount(HotaruHomePage, MOUNT_OPTS);
    await flushPromises();
    expect(replace).toHaveBeenCalledWith("/hotaru/identity");
    void wrapper;
  });

  it("sets the active user via the store", async () => {
    localStorage.setItem("hotaru.activeUser", "dani");
    mount(HotaruHomePage, MOUNT_OPTS);
    await flushPromises();
    expect(useHotaruUserStore().activeUser?.name).toBe("Dani");
  });
});
