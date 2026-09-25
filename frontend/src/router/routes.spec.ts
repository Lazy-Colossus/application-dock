import { describe, expect, it } from "vitest";
import { createRouter, createMemoryHistory } from "vue-router";
import routes from "@/router/routes";

function makeRouter() {
  return createRouter({ history: createMemoryHistory(), routes });
}

// Kalendariq was called KDH until 2026-09-06. Invitee links are already sitting
// in group chats and cannot be reissued, so the old paths must keep landing.
describe("legacy KDH paths", () => {
  it("carries a share token from the old invitee link to the new one", async () => {
    const router = makeRouter();
    await router.push("/kdh/s/tok3n");

    expect(router.currentRoute.value.name).toBe("kalendariq-shared-calendar");
    expect(router.currentRoute.value.params.shareToken).toBe("tok3n");
  });

  it("keeps the invitee link free of the shell nav after redirecting", async () => {
    const router = makeRouter();
    await router.push("/kdh/s/tok3n");

    expect(router.currentRoute.value.meta.hideShellNav).toBe(true);
  });

  it("carries a calendar id from the old owner link to the new one", async () => {
    const router = makeRouter();
    await router.push("/kdh/c/cal-ab12cd34");

    expect(router.currentRoute.value.name).toBe("kalendariq-calendar");
    expect(router.currentRoute.value.params.calendarId).toBe("cal-ab12cd34");
  });

  it("sends the old app root to the new one", async () => {
    const router = makeRouter();
    await router.push("/kdh");

    expect(router.currentRoute.value.name).toBe("kalendariq-home");
  });
});

// The shell's "Go back" arrow falls back to browser history when a route has
// no `backTo` (see MainLayout.vue's goBack()), which lands on whatever page
// preceded it — e.g. the New Tea form right after saving a tea — rather than
// the fixed place these pages actually lead back to.
describe("tea back navigation", () => {
  it("points New Tea's back arrow at the cabinet", async () => {
    const router = makeRouter();
    await router.push("/tea/new");

    expect(router.currentRoute.value.meta.backTo).toBe("/tea");
  });

  it("points a tea's detail page back arrow at the cabinet", async () => {
    const router = makeRouter();
    await router.push("/tea/t-1");

    expect(router.currentRoute.value.meta.backTo).toBe("/tea");
  });

  it("points an almanac entry's back arrow at the almanac", async () => {
    const router = makeRouter();
    await router.push("/tea/almanac/green.longjing");

    expect(router.currentRoute.value.meta.backTo).toBe("/tea/almanac");
  });
});
