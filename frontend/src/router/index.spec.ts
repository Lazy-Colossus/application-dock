import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";

const mockRestoreSession = vi.fn();
const mockAuth = { isAuthenticated: false, restoreSession: mockRestoreSession };

vi.mock("@/stores/useAuthStore", () => ({
  useAuthStore: () => mockAuth,
}));

function makeGuardedRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/login", component: { template: "<div />" } },
      {
        path: "/",
        component: { template: "<div />" },
        meta: { requiresAuth: true },
      },
      {
        path: "/archery",
        component: { template: "<div />" },
        meta: { requiresAuth: true },
      },
    ],
  });

  router.beforeEach(async (to) => {
    const { useAuthStore } = await import("@/stores/useAuthStore");
    const auth = useAuthStore();
    await auth.restoreSession();
    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      return { path: "/login", query: { redirect: to.fullPath } };
    }
    if (to.path === "/login" && auth.isAuthenticated) {
      return { path: "/" };
    }
  });

  return router;
}

describe("router beforeEach guard", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockAuth.isAuthenticated = false;
    mockRestoreSession.mockResolvedValue(undefined);
  });

  it("redirects unauthenticated user from protected route to /login", async () => {
    const router = makeGuardedRouter();
    await router.push("/");
    expect(router.currentRoute.value.path).toBe("/login");
    expect(router.currentRoute.value.query.redirect).toBe("/");
  });

  it("preserves redirect param for nested protected route", async () => {
    const router = makeGuardedRouter();
    await router.push("/archery");
    expect(router.currentRoute.value.path).toBe("/login");
    expect(router.currentRoute.value.query.redirect).toBe("/archery");
  });

  it("allows authenticated user through a protected route", async () => {
    mockAuth.isAuthenticated = true;
    const router = makeGuardedRouter();
    await router.push("/");
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("redirects authenticated user away from /login to /", async () => {
    mockAuth.isAuthenticated = true;
    const router = makeGuardedRouter();
    await router.push("/login");
    expect(router.currentRoute.value.path).toBe("/");
  });

  it("calls restoreSession on navigation", async () => {
    const router = makeGuardedRouter();
    await router.push("/login");
    expect(mockRestoreSession).toHaveBeenCalled();
  });
});
