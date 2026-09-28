import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

import { useShipStore } from "./useShipStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { emptyGrid } from "../resources";
import type { Ship } from "../types";

function ship(over: Partial<Ship> = {}): Ship {
  return {
    id: "s_1",
    owner: "ana",
    members: ["ana"],
    is_owner: true,
    rev: 1,
    stock: emptyGrid(),
    projects: [],
    ...over,
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("useShipStore", () => {
  it("fetches the ship and derives needed and diff", async () => {
    getMock.mockResolvedValue(ship());
    const store = useShipStore();
    await store.fetchShip();
    expect(getMock).toHaveBeenCalledWith("/iss-vanguard/ship");
    expect(store.ship?.id).toBe("s_1");
    expect(store.needed?.minerals.basic).toBe(0);
    expect(store.loading).toBe(false);
  });

  it("sends a tap as a delta and takes the returned ship", async () => {
    const after = ship({ rev: 2 });
    after.stock.minerals.rare = 1;
    postMock.mockResolvedValue(after);
    const store = useShipStore();
    expect(await store.adjustStock("minerals", "rare", 1)).toBe(true);
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/stock", {
      resource: "minerals",
      tier: "rare",
      delta: 1,
    });
    expect(store.ship?.stock.minerals.rare).toBe(1);
  });

  it("reports a rejected tap and refetches so the grid reconverges", async () => {
    postMock.mockRejectedValue({ detail: "minerals (rare) is already at 0" });
    getMock.mockResolvedValue(ship({ rev: 5 }));
    const store = useShipStore();
    expect(await store.adjustStock("minerals", "rare", -1)).toBe(false);
    expect(store.error).toBe("minerals (rare) is already at 0");
    expect(store.ship?.rev).toBe(5);
    expect(store.loading).toBe(false);
  });

  it("refetches on a remote change only when it is newer", async () => {
    getMock.mockResolvedValue(ship({ rev: 3 }));
    const store = useShipStore();
    await store.fetchShip();
    getMock.mockClear();
    await store.applyRemoteRev(3, "s_1");
    expect(getMock).not.toHaveBeenCalled();
    await store.applyRemoteRev(4, "s_1");
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("uses the project endpoints", async () => {
    const draft = {
      code: "VB07",
      name: "",
      prerequisite_id: null,
      cost: emptyGrid(),
    };
    postMock.mockResolvedValue(ship());
    putMock.mockResolvedValue(ship());
    delMock.mockResolvedValue(ship());
    const store = useShipStore();
    await store.createProject(draft);
    await store.updateProject("p-1", draft);
    await store.completeProject("p-1");
    await store.reopenProject("p-1");
    await store.deleteProject("p-1");
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/projects", draft);
    expect(putMock).toHaveBeenCalledWith(
      "/iss-vanguard/ship/projects/p-1",
      draft,
    );
    expect(postMock).toHaveBeenCalledWith(
      "/iss-vanguard/ship/projects/p-1/complete",
    );
    expect(postMock).toHaveBeenCalledWith(
      "/iss-vanguard/ship/projects/p-1/reopen",
    );
    expect(delMock).toHaveBeenCalledWith("/iss-vanguard/ship/projects/p-1");
  });

  it("adds, removes and leaves via the members endpoints", async () => {
    useAuthStore().username = "bo";
    postMock.mockResolvedValue(ship());
    delMock.mockResolvedValue(ship({ owner: "bo", members: ["bo"] }));
    const store = useShipStore();
    await store.addMember("cy");
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/members", {
      username: "cy",
    });
    expect(await store.leave()).toBe(true);
    expect(delMock).toHaveBeenCalledWith("/iss-vanguard/ship/members/bo");
    expect(store.ship?.owner).toBe("bo");
  });
  it("refetches an event from a different ship even when its rev is lower", async () => {
    getMock.mockResolvedValue(ship({ rev: 12 }));
    const store = useShipStore();
    await store.fetchShip();
    getMock.mockClear();
    getMock.mockResolvedValue(ship({ id: "s_2", rev: 1 }));
    await store.applyRemoteRev(1, "s_2");
    expect(getMock).toHaveBeenCalledTimes(1);
    expect(store.ship?.id).toBe("s_2");
  });
});
