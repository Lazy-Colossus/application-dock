import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock },
}));

import { useAmpStore } from "./useAmpStore";
import type { AmpInstance } from "@/apps/amp/types";

function inst(id: string, over: Partial<AmpInstance> = {}): AmpInstance {
  return {
    id,
    name: id,
    module: "Generic",
    running: false,
    state: "Stopped",
    active_users: null,
    max_users: null,
    port: null,
    steam_app_id: null,
    game: null,
    ...over,
  };
}

// fetch() calls GET /amp/instances then GET /amp/config. This helper wires both.
function mockFetch(instances: AmpInstance[], publicIp: string | null) {
  getMock.mockImplementation((path: string) => {
    if (path === "/amp/instances") return Promise.resolve(instances);
    if (path === "/amp/config") return Promise.resolve({ public_ip: publicIp });
    throw new Error(`unexpected GET ${path}`);
  });
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  putMock.mockReset();
});

describe("useAmpStore", () => {
  it("fetch loads instances plus public IP and clears loading", async () => {
    mockFetch([inst("i1", { port: 27015 })], "203.0.113.5");
    const store = useAmpStore();

    await store.fetch();

    expect(getMock).toHaveBeenCalledWith("/amp/instances");
    expect(getMock).toHaveBeenCalledWith("/amp/config");
    expect(store.instances).toHaveLength(1);
    expect(store.publicIp).toBe("203.0.113.5");
    expect(store.loading).toBe(false);
  });

  it("fetch carries the resolved game name through", async () => {
    mockFetch([inst("i1", { game: "Palworld", steam_app_id: 1623730 })], "203.0.113.5");
    const store = useAmpStore();

    await store.fetch();

    expect(store.instances[0]!.game).toBe("Palworld");
  });

  it("fetch tolerates a failed config call and leaves publicIp null", async () => {
    getMock.mockImplementation((path: string) => {
      if (path === "/amp/instances") return Promise.resolve([inst("i1")]);
      return Promise.reject(new Error("no config"));
    });
    const store = useAmpStore();

    await store.fetch();

    expect(store.instances).toHaveLength(1);
    expect(store.publicIp).toBeNull();
    expect(store.error).toBeNull();
  });

  it("fetch keeps the last known list and sets error on failure", async () => {
    mockFetch([inst("i1")], null);
    const store = useAmpStore();
    await store.fetch();

    getMock.mockImplementation((path: string) => {
      if (path === "/amp/instances") return Promise.reject(new Error("AMP down"));
      return Promise.resolve({ public_ip: null });
    });
    await store.fetch();

    expect(store.instances).toHaveLength(1);
    expect(store.error).toBe("AMP down");
  });

  it("linkFor builds ip:port and is null when ip or port is missing", async () => {
    mockFetch([inst("i1", { port: 27015 }), inst("i2")], "203.0.113.5");
    const store = useAmpStore();
    await store.fetch();

    expect(store.linkFor(store.instances[0]!)).toBe("203.0.113.5:27015");
    expect(store.linkFor(store.instances[1]!)).toBeNull(); // no port

    mockFetch([inst("i1", { port: 27015 })], null);
    await store.fetch();
    expect(store.linkFor(store.instances[0]!)).toBeNull(); // no public IP
  });

  it("savePorts PUTs the map and refetches", async () => {
    putMock.mockResolvedValue({ ports: { i1: 27015 } });
    mockFetch([inst("i1", { port: 27015 })], "203.0.113.5");
    const store = useAmpStore();

    await store.savePorts({ i1: 27015 });

    expect(putMock).toHaveBeenCalledWith("/amp/ports", { ports: { i1: 27015 } });
    expect(getMock).toHaveBeenCalledWith("/amp/instances");
    expect(store.error).toBeNull();
  });

  it("savePorts sets error and does not refetch on failure", async () => {
    putMock.mockRejectedValue(new Error("422: bad port"));
    const store = useAmpStore();

    await store.savePorts({ i1: 0 });

    expect(store.error).toBe("422: bad port");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("start posts, refetches, and clears the starting flag", async () => {
    postMock.mockResolvedValue(undefined);
    mockFetch([inst("i1", { running: true, state: "Running" })], null);
    const store = useAmpStore();

    await store.start("i1");

    expect(postMock).toHaveBeenCalledWith("/amp/instances/i1/start");
    expect(getMock).toHaveBeenCalledWith("/amp/instances");
    expect(store.isStarting("i1")).toBe(false);
  });

  it("start sets error and clears the starting flag on failure", async () => {
    postMock.mockRejectedValue(new Error("nope"));
    const store = useAmpStore();

    await store.start("i1");

    expect(store.error).toBe("nope");
    expect(store.isStarting("i1")).toBe(false);
  });
});
