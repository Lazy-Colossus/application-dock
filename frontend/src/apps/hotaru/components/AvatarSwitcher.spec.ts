import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import AvatarSwitcher from "./AvatarSwitcher.vue";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
  { id: "jim", name: "Jim" },
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
  push.mockReset();
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
  it("shows the active avatar and a switch item for every other user", () => {
    const { wrapper } = mountWithActive("dani");
    expect(wrapper.find('[data-testid="avatar-switcher"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="avatar-switcher"]').text()).toContain(
      "D",
    );
    // Both other household users are reachable (not just a single "other").
    expect(wrapper.find('[data-testid="switch-user-jake"]').text()).toContain(
      "Jake",
    );
    expect(wrapper.find('[data-testid="switch-user-jim"]').text()).toContain(
      "Jim",
    );
    // The active user isn't offered as a switch target.
    expect(wrapper.find('[data-testid="switch-user-dani"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="settings"]').exists()).toBe(true);
  });

  it("switches to a chosen user", async () => {
    const { store, wrapper } = mountWithActive("dani");
    await wrapper.find('[data-testid="switch-user-jim"]').trigger("click");
    expect(store.activeUserId).toBe("jim");
  });

  it("routes to the Who's studying? picker", async () => {
    const { wrapper } = mountWithActive("dani");
    await wrapper.find('[data-testid="who-studying"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/hotaru/identity");
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
