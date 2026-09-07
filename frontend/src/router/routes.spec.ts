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
