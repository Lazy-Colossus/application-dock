import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));

import AvatarSwitcher from "./AvatarSwitcher.vue";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

const STUBS = {
  "q-menu": { template: "<div><slot /></div>" },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template:
      '<button type="button" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')"><slot /></button>',
    emits: ["click"],
  },
  "q-item-section": { template: "<div><slot /></div>" },
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
});

function mountWithActive(id: string) {
  const store = useHotaruUserStore();
  store.users = USERS;
  store.setActiveUser(id);
  return {
    store,
    wrapper: mount(AvatarSwitcher, {
      global: { stubs: STUBS, directives: { "close-popup": {} } },
    }),
  };
}

describe("AvatarSwitcher", () => {
  it("shows the active user avatar and a switch-to-other + settings menu", () => {
    const { wrapper } = mountWithActive("dani");
    expect(wrapper.find('[data-testid="avatar-switcher"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="avatar-switcher"]').text()).toContain(
      "D",
    );
    expect(wrapper.find('[data-testid="switch-user"]').text()).toContain(
      "Jake",
    );
    expect(wrapper.find('[data-testid="settings"]').exists()).toBe(true);
  });

  it("switches to the other user when chosen", async () => {
    const { store, wrapper } = mountWithActive("dani");
    await wrapper.find('[data-testid="switch-user"]').trigger("click");
    expect(store.activeUserId).toBe("jake");
  });

  it("renders nothing when no active user", () => {
    useHotaruUserStore().users = USERS;
    const wrapper = mount(AvatarSwitcher, {
      global: { stubs: STUBS, directives: { "close-popup": {} } },
    });
    expect(wrapper.find('[data-testid="avatar-switcher"]').exists()).toBe(
      false,
    );
  });
});
