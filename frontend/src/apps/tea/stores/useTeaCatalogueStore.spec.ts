import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {
    status = 0;
    detail = "";
  },
  api: { get: getMock, post: postMock, del: delMock },
}));

import { useTeaCatalogueStore } from "./useTeaCatalogueStore";
import type { CatalogueNode } from "@/apps/tea/types";

function node(id: string, parent_id: string | null = null): CatalogueNode {
  return {
    id,
    parent_id,
    name: id,
    name_zh: "",
    source: "seed",
    default_origin: "",
  };
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset();
  delMock.mockReset();
});

describe("useTeaCatalogueStore", () => {
  it("fetchNodes loads the tree", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();

    await store.fetchNodes();

    expect(getMock).toHaveBeenCalledWith("/tea/catalogue");
    expect(store.nodes).toHaveLength(1);
    expect(store.loading).toBe(false);
  });

  it("fetches once and serves the cache afterwards", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();

    await store.fetchNodes();
    await store.fetchNodes();

    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when asked to force", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();

    await store.fetchNodes();
    await store.fetchNodes(true);

    expect(getMock).toHaveBeenCalledTimes(2);
  });

  it("makes a newly added node immediately pickable without a refetch", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();
    await store.fetchNodes();
    postMock.mockResolvedValue({ ...node("u-1", "oolong"), source: "user" });

    const added = await store.addNode({ parent_id: "oolong", name: "Mine" });

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(store.nodes.map((n) => n.id)).toContain("u-1");
    expect(added?.id).toBe("u-1");
  });

  it("surfaces a rejected add and leaves the tree untouched", async () => {
    getMock.mockResolvedValue([node("oolong")]);
    const store = useTeaCatalogueStore();
    await store.fetchNodes();
    postMock.mockRejectedValue(
      Object.assign(new Error("no"), { detail: "A catalogue entry needs a name" }),
    );

    const added = await store.addNode({ parent_id: "oolong", name: "  " });

    expect(added).toBeNull();
    expect(store.nodes).toHaveLength(1);
    expect(store.error).toContain("needs a name");
  });

  it("removeNode drops it from the tree", async () => {
    getMock.mockResolvedValue([node("oolong"), { ...node("u-1", "oolong"), source: "user" }]);
    const store = useTeaCatalogueStore();
    await store.fetchNodes();
    delMock.mockResolvedValue(undefined);

    await store.removeNode("u-1");

    expect(store.nodes.map((n) => n.id)).toEqual(["oolong"]);
  });

  it("keeps the node when removal is refused, and says why", async () => {
    getMock.mockResolvedValue([{ ...node("u-1", "oolong"), source: "user" }]);
    const store = useTeaCatalogueStore();
    await store.fetchNodes();
    delMock.mockRejectedValue(
      Object.assign(new Error("in use"), { detail: "3 teas are classified here." }),
    );

    await store.removeNode("u-1");

    expect(store.nodes).toHaveLength(1);
    expect(store.error).toContain("3 teas");
  });

  it("autofill posts the name and returns the suggestion", async () => {
    postMock.mockResolvedValue({ catalogue_node_id: "oolong.wuyi-yancha.da-hong-pao", origin: "Wuyi Shan, Fujian" });
    const store = useTeaCatalogueStore();

    const result = await store.autofill("Da Hong Pao");

    expect(postMock).toHaveBeenCalledWith("/tea/autofill", { name: "Da Hong Pao" });
    expect(result).toEqual({
      catalogue_node_id: "oolong.wuyi-yancha.da-hong-pao",
      origin: "Wuyi Shan, Fujian",
    });
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("autofill returns null when Jev isn't confident, without setting an error", async () => {
    postMock.mockResolvedValue(null);
    const store = useTeaCatalogueStore();

    const result = await store.autofill("some tea");

    expect(result).toBeNull();
    expect(store.error).toBeNull();
  });

  it("autofill surfaces a failure and returns null", async () => {
    postMock.mockRejectedValue(
      Object.assign(new Error("down"), { detail: "Autofill is not configured on this server" }),
    );
    const store = useTeaCatalogueStore();

    const result = await store.autofill("Da Hong Pao");

    expect(result).toBeNull();
    expect(store.error).toContain("not configured");
  });
});
