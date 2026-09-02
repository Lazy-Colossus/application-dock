import { describe, it, expect, beforeEach, vi } from "vitest";
import { nextTick, ref } from "vue";

import { useClaimedName } from "./useClaimedName";
import type { Invitee } from "@/apps/kdh/types";

const DANI: Invitee = {
  id: "inv-1",
  name: "Dani",
  color: "#E9A6A0",
  order: 0,
  removed_at: null,
};
const GONE: Invitee = {
  id: "inv-gone",
  name: "Departed",
  color: "#A9C8E8",
  order: 1,
  removed_at: "2026-08-20T18:00:00Z",
};

describe("useClaimedName", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("starts unclaimed", () => {
    const c = useClaimedName(
      () => "cal-1",
      () => [DANI],
    );
    c.restore();
    expect(c.hasClaim.value).toBe(false);
    expect(c.claimed.value).toBeNull();
  });

  it("claims a name and remembers it per calendar", () => {
    const c = useClaimedName(
      () => "cal-1",
      () => [DANI],
    );
    c.claim(DANI.id);

    expect(c.claimed.value?.name).toBe("Dani");
    expect(window.localStorage.getItem("kdh.claim.cal-1")).toBe("inv-1");
    expect(window.localStorage.getItem("kdh.claim.cal-2")).toBeNull();
  });

  it("restores a stored claim on a later visit", () => {
    window.localStorage.setItem("kdh.claim.cal-1", "inv-1");
    const c = useClaimedName(
      () => "cal-1",
      () => [DANI],
    );
    c.restore();
    expect(c.claimed.value?.name).toBe("Dani");
  });

  it("releases a claim", () => {
    const c = useClaimedName(
      () => "cal-1",
      () => [DANI],
    );
    c.claim(DANI.id);
    c.release();

    expect(c.hasClaim.value).toBe(false);
    expect(window.localStorage.getItem("kdh.claim.cal-1")).toBeNull();
  });

  it("discards a claim naming someone since removed", async () => {
    window.localStorage.setItem("kdh.claim.cal-1", GONE.id);
    const c = useClaimedName(
      () => "cal-1",
      () => [DANI, GONE],
    );
    c.restore();
    await nextTick();

    expect(c.claimed.value).toBeNull();
    expect(window.localStorage.getItem("kdh.claim.cal-1")).toBeNull();
  });

  it("discards a claim naming nobody at all", async () => {
    window.localStorage.setItem("kdh.claim.cal-1", "inv-nonsense");
    const c = useClaimedName(
      () => "cal-1",
      () => [DANI],
    );
    c.restore();
    await nextTick();

    expect(c.claimed.value).toBeNull();
  });

  it("survives a browser that refuses storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("site data blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("site data blocked");
    });

    const c = useClaimedName(
      () => "cal-1",
      () => [DANI],
    );
    expect(() => c.restore()).not.toThrow();
    expect(() => c.claim(DANI.id)).not.toThrow();
    // The claim still works for this page view; it just will not persist.
    expect(c.claimed.value?.name).toBe("Dani");
  });

  it("tracks the roster reactively", async () => {
    const roster = ref<Invitee[]>([DANI]);
    const c = useClaimedName(
      () => "cal-1",
      () => roster.value,
    );
    c.claim(DANI.id);
    expect(c.hasClaim.value).toBe(true);

    roster.value = [{ ...DANI, removed_at: "2026-09-01T00:00:00Z" }];
    await nextTick();

    expect(c.claimed.value).toBeNull();
  });
});
