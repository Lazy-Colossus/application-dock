import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, delMock, push, replace } = vi.hoisted(() => ({
  getMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: delMock },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push, replace }) }));

import HotaruSettingsPage from "./HotaruSettingsPage.vue";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import { useHotaruLibraryStore } from "@/apps/hotaru/stores/useHotaruLibraryStore";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: ["label", "disable", "flat", "unelevated", "noCaps"],
    emits: ["click"],
  },
  // The dialog only renders its contents while open, like the real q-dialog.
  "q-dialog": {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ["modelValue"],
  },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
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
  delMock.mockReset().mockResolvedValue(undefined);
  push.mockReset();
  replace.mockReset();
});

async function mountAs(id: string) {
  const userStore = useHotaruUserStore();
  userStore.users = USERS;
  userStore.setActiveUser(id);
  const wrapper = mount(HotaruSettingsPage, MOUNT_OPTS);
  await flushPromises();
  return { wrapper, userStore, store: useHotaruLibraryStore() };
}

describe("HotaruSettingsPage", () => {
  it("names the active user in the reset action", async () => {
    const { wrapper } = await mountAs("jake");
    expect(wrapper.find('[data-testid="reset-progress"]').text()).toBe(
      "Reset Jake's progress",
    );
  });

  it("follows the active user when they switch", async () => {
    const { wrapper, userStore } = await mountAs("jake");
    userStore.setActiveUser("dani");
    await flushPromises();
    expect(wrapper.find('[data-testid="reset-progress"]').text()).toBe(
      "Reset Dani's progress",
    );
  });

  it("does not reset until the confirm is accepted", async () => {
    const { wrapper } = await mountAs("jake");
    await wrapper.find('[data-testid="reset-progress"]').trigger("click");
    // Dialog is open, but nothing has been sent yet.
    expect(delMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="reset-confirm"]').exists()).toBe(true);

    await wrapper.find('[data-testid="reset-confirm"]').trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/hotaru/practice/progress?user=jake");
  });

  it("cancelling sends nothing and closes the dialog", async () => {
    const { wrapper } = await mountAs("jake");
    await wrapper.find('[data-testid="reset-progress"]').trigger("click");
    await wrapper.find('[data-testid="reset-cancel"]').trigger("click");
    expect(delMock).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="reset-confirm"]').exists()).toBe(false);
  });

  it("states what is cleared and what is kept before acting", async () => {
    const { wrapper } = await mountAs("jake");
    await wrapper.find('[data-testid="reset-progress"]').trigger("click");
    const text = wrapper.text();
    expect(text).toContain("Cleared");
    expect(text).toContain("Kept");
    expect(text).toContain("cannot be undone");
  });

  it("empties familiarity so every word reads as New", async () => {
    const { wrapper, store } = await mountAs("jake");
    store.familiarity = { w1: 4, w2: 2 };
    await wrapper.find('[data-testid="reset-progress"]').trigger("click");
    await wrapper.find('[data-testid="reset-confirm"]').trigger("click");
    await flushPromises();

    expect(store.familiarity).toEqual({});
    expect(store.familiarityTier("w1")).toBe(0);
    expect(wrapper.find('[data-testid="reset-done"]').exists()).toBe(true);
  });

  it("surfaces a failure instead of swallowing it", async () => {
    delMock.mockRejectedValueOnce({ detail: "Unknown user jake." });
    const { wrapper, store } = await mountAs("jake");
    store.familiarity = { w1: 3 };
    await wrapper.find('[data-testid="reset-progress"]').trigger("click");
    await wrapper.find('[data-testid="reset-confirm"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="reset-error"]').text()).toBe(
      "Unknown user jake.",
    );
    expect(wrapper.find('[data-testid="reset-done"]').exists()).toBe(false);
    // A failed reset must not fake the local wipe.
    expect(store.familiarity).toEqual({ w1: 3 });
  });

  it("redirects to the identity picker when nobody is studying", async () => {
    const userStore = useHotaruUserStore();
    userStore.users = USERS;
    mount(HotaruSettingsPage, MOUNT_OPTS);
    await flushPromises();
    expect(replace).toHaveBeenCalledWith("/hotaru/identity");
  });

  it("offers reset as its only action", async () => {
    const { wrapper } = await mountAs("jake");
    // Scoped to the card — the page also hosts the avatar switcher, whose own
    // testids are not "actions" in the sense AC 8 means.
    const testids = wrapper
      .findAll(".settings-card [data-testid]")
      .map((el) => el.attributes("data-testid"));
    // No motion toggle, export, About block or practice preferences (AC 8).
    expect(testids).toEqual(["reset-progress"]);
  });
});
