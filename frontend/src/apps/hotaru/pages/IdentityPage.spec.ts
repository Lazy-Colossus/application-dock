import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { nextTick } from "vue";

const { getMock, replace } = vi.hoisted(() => ({
  getMock: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ replace }) }));

import IdentityPage from "./IdentityPage.vue";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-menu": { template: "<div><slot /></div>" },
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  getMock.mockReset().mockResolvedValue(USERS);
  replace.mockReset();
});

describe("IdentityPage", () => {
  it("renders an avatar for each user", async () => {
    const store = useHotaruUserStore();
    await store.loadUsers();
    const wrapper = mount(IdentityPage, { global: { stubs: STUBS } });
    await nextTick();
    expect(wrapper.text()).toContain("Who's studying?");
    expect(wrapper.find('[data-testid="pick-dani"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pick-jake"]').exists()).toBe(true);
  });

  it("selecting a user sets active and navigates home", async () => {
    const store = useHotaruUserStore();
    await store.loadUsers();
    const wrapper = mount(IdentityPage, { global: { stubs: STUBS } });
    await nextTick();
    await wrapper.find('[data-testid="pick-jake"]').trigger("click");
    expect(store.activeUserId).toBe("jake");
    expect(replace).toHaveBeenCalledWith("/hotaru");
  });
});
