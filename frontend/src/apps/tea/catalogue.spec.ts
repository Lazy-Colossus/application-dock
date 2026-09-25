import { describe, it, expect } from "vitest";
import {
  buildIndex,
  childrenOf,
  pathOf,
  rootClassOf,
  prefillOriginFor,
} from "./catalogue";
import type { CatalogueNode } from "./types";

function node(
  id: string,
  parent_id: string | null,
  overrides: Partial<CatalogueNode> = {},
): CatalogueNode {
  return {
    id,
    parent_id,
    name: id,
    name_zh: "",
    source: "seed",
    default_origin: "",
    ...overrides,
  };
}

const tree: CatalogueNode[] = [
  node("oolong", null, { name: "Oolong", name_zh: "烏龍" }),
  node("oolong.wuyi", "oolong", {
    name: "Wuyi yancha",
    default_origin: "Wuyi Shan, Fujian",
  }),
  node("oolong.wuyi.dhp", "oolong.wuyi", { name: "Da Hong Pao" }),
  node("oolong.anxi", "oolong", { name: "Anxi", default_origin: "Anxi, Fujian" }),
  node("green", null, { name: "Green" }),
  node("green.longjing", "green", { name: "Longjing", default_origin: "Xihu, Zhejiang" }),
];

describe("childrenOf", () => {
  it("returns the roots for a null parent", () => {
    expect(childrenOf(tree, null).map((n) => n.id)).toEqual(["oolong", "green"]);
  });

  it("returns a node's direct children only", () => {
    expect(childrenOf(tree, "oolong").map((n) => n.id)).toEqual([
      "oolong.wuyi",
      "oolong.anxi",
    ]);
  });

  it("returns nothing for a leaf", () => {
    expect(childrenOf(tree, "oolong.wuyi.dhp")).toEqual([]);
  });
});

describe("pathOf", () => {
  it("returns root-first ancestry including the node", () => {
    expect(pathOf(tree, "oolong.wuyi.dhp").map((n) => n.id)).toEqual([
      "oolong",
      "oolong.wuyi",
      "oolong.wuyi.dhp",
    ]);
  });

  it("returns just the node for a root", () => {
    expect(pathOf(tree, "oolong").map((n) => n.id)).toEqual(["oolong"]);
  });

  it("returns nothing for an unknown id", () => {
    expect(pathOf(tree, "ghost")).toEqual([]);
  });

  it("does not loop forever on a cycle", () => {
    const cyclic = [node("a", "b"), node("b", "a")];
    expect(pathOf(cyclic, "a")).toEqual([]);
  });
});

describe("rootClassOf", () => {
  it.each([
    ["oolong", "oolong"],
    ["oolong.wuyi", "oolong"],
    ["oolong.wuyi.dhp", "oolong"],
    ["green.longjing", "green"],
  ])("resolves %s to %s", (id, expected) => {
    expect(rootClassOf(tree, id)).toBe(expected);
  });

  it("falls back to other for an unknown id", () => {
    expect(rootClassOf(tree, "retired.in.v2")).toBe("other");
  });
});

describe("prefillOriginFor", () => {
  it("uses the node's own origin when it has one", () => {
    expect(prefillOriginFor(tree, "oolong.anxi")).toBe("Anxi, Fujian");
  });

  it("walks up to the nearest ancestor that has one", () => {
    expect(prefillOriginFor(tree, "oolong.wuyi.dhp")).toBe("Wuyi Shan, Fujian");
  });

  it("returns empty when no ancestor has one", () => {
    expect(prefillOriginFor(tree, "oolong")).toBe("");
  });

  it("returns empty for an unknown id", () => {
    expect(prefillOriginFor(tree, "ghost")).toBe("");
  });

  it("returns the nearest origin, not a distant ancestor's", () => {
    // Fixture: oolong (root) has "Fujian", oolong.wuyi has "Wuyi Shan, Fujian".
    // When asking for oolong.wuyi.dhp, must return the NEAREST ancestor's origin.
    const treeWithMultiOrigins: CatalogueNode[] = [
      node("oolong", null, { name: "Oolong", default_origin: "Fujian" }),
      node("oolong.wuyi", "oolong", {
        name: "Wuyi yancha",
        default_origin: "Wuyi Shan, Fujian",
      }),
      node("oolong.wuyi.dhp", "oolong.wuyi", { name: "Da Hong Pao" }),
    ];
    expect(prefillOriginFor(treeWithMultiOrigins, "oolong.wuyi.dhp")).toBe(
      "Wuyi Shan, Fujian",
    );
  });
});

describe("buildIndex", () => {
  it("keys every node by id", () => {
    expect(buildIndex(tree).get("green.longjing")?.name).toBe("Longjing");
  });
});
