import { describe, it, expect, beforeEach, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { createRouter, createMemoryHistory } from "vue-router";
import { createPinia, setActivePinia } from "pinia";
import MainLayout from "@/layouts/MainLayout.vue";
import { usePageDetailStore } from "@/stores/usePageDetailStore";

// Auth store not under test here; stub it out
vi.mock("@/stores/useAuthStore", () => ({
  useAuthStore: () => ({ isAuthenticated: false, logout: vi.fn() }),
}));

beforeEach(() => {
  setActivePinia(createPinia());
});

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/", component: { template: "<div />" } },
      { path: "/archery", component: { template: "<div />" } },
      {
        path: "/settings",
        component: { template: "<div />" },
        meta: { title: "Settings" },
      },
      {
        path: "/listies",
        component: { template: "<div />" },
        meta: { title: "Listies" },
      },
      {
        path: "/kalendariq/s/:shareToken",
        component: { template: "<div />" },
        meta: { title: "Kalendariq", hideShellNav: true },
      },
    ],
  });
  await router.push(path);
  await router.isReady();
  return mount(MainLayout, { global: { plugins: [router] } });
}

describe("MainLayout toolbar control", () => {
  it("shows Settings button and hides Home button on root route", async () => {
    const wrapper = await mountAt("/");
    expect(wrapper.find('[aria-label="Open settings"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Go to apps home"]').exists()).toBe(false);
  });

  it("shows Home button and hides Settings button on non-root route", async () => {
    const wrapper = await mountAt("/archery");
    expect(wrapper.find('[aria-label="Go to apps home"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Open settings"]').exists()).toBe(false);
  });

  it("shows Home button and hides Settings button on /settings route", async () => {
    const wrapper = await mountAt("/settings");
    expect(wrapper.find('[aria-label="Go to apps home"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Open settings"]').exists()).toBe(false);
  });

  it("back arrow absent on root route", async () => {
    const wrapper = await mountAt("/");
    expect(wrapper.find('[aria-label="Go back"]').exists()).toBe(false);
  });

  it("back arrow present on /settings", async () => {
    const wrapper = await mountAt("/settings");
    expect(wrapper.find('[aria-label="Go back"]').exists()).toBe(true);
  });

  it("back arrow present on /archery", async () => {
    const wrapper = await mountAt("/archery");
    expect(wrapper.find('[aria-label="Go back"]').exists()).toBe(true);
  });

  it("hides both nav buttons on a route that opts out of the shell nav", async () => {
    const wrapper = await mountAt("/kalendariq/s/tok3n");
    expect(wrapper.find('[aria-label="Go back"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Go to apps home"]').exists()).toBe(false);
    expect(wrapper.find('[aria-label="Open settings"]').exists()).toBe(false);
  });

  it("still names the app in the title bar on a nav-less route", async () => {
    const wrapper = await mountAt("/kalendariq/s/tok3n");
    expect(wrapper.find(".app-bar__title").text()).toBe("Kalendariq");
  });

  it("logout button hidden when not authenticated", async () => {
    const wrapper = await mountAt("/");
    expect(wrapper.find('[aria-label="Log out"]').exists()).toBe(false);
  });
});

describe("MainLayout title detail", () => {
  it("shows only the route title when a page sets no detail", async () => {
    const wrapper = await mountAt("/listies");
    expect(wrapper.find(".app-bar__title").text()).toBe("Listies");
  });

  it("appends the detail a page sets, so one bar names both", async () => {
    const wrapper = await mountAt("/listies");
    usePageDetailStore().setDetail("chuina trip");
    await wrapper.vm.$nextTick();

    expect(wrapper.find(".app-bar__title").text()).toBe(
      "Listies - chuina trip",
    );
  });

  it("drops the detail when the route changes, so it cannot leak onto another page", async () => {
    const wrapper = await mountAt("/listies");
    usePageDetailStore().setDetail("chuina trip");
    await wrapper.vm.$nextTick();

    await wrapper.vm.$router.push("/settings");
    await wrapper.vm.$nextTick();

    expect(usePageDetailStore().detail).toBeNull();
    expect(wrapper.find(".app-bar__title").text()).toBe("Settings");
  });
});
