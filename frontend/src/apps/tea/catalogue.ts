// Pure functions over the flat catalogue list the API returns. No Vue, no
// stores — the rules that are easy to get subtly wrong are unit-tested without
// mounting anything.

import type { CatalogueNode, TeaClass } from "./types";
import { CLASS_ORDER } from "./tokens";

export function buildIndex(nodes: CatalogueNode[]): Map<string, CatalogueNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

export function childrenOf(
  nodes: CatalogueNode[],
  parentId: string | null,
): CatalogueNode[] {
  return nodes.filter((node) => node.parent_id === parentId);
}

/**
 * Root-first ancestry, including the node itself.
 *
 * Returns [] for an unknown id, and for any chain that revisits a node — a
 * cycle can only arrive from a hand-edited file, and hanging the picker is a
 * worse answer than showing nothing.
 */
export function pathOf(nodes: CatalogueNode[], id: string): CatalogueNode[] {
  const index = buildIndex(nodes);
  const chain: CatalogueNode[] = [];
  const seen = new Set<string>();

  let current = index.get(id);
  while (current) {
    if (seen.has(current.id)) return [];
    seen.add(current.id);
    chain.unshift(current);
    if (current.parent_id === null) return chain;
    current = index.get(current.parent_id);
  }
  return [];
}

/** The class a node belongs to, or `other` when it cannot be resolved. */
export function rootClassOf(nodes: CatalogueNode[], id: string): TeaClass {
  const root = pathOf(nodes, id)[0];
  if (!root) return "other";
  return CLASS_ORDER.includes(root.id as TeaClass)
    ? (root.id as TeaClass)
    : "other";
}

/**
 * The origin to offer when this node is picked: the nearest one going up,
 * starting with the node itself. Empty string means "offer nothing" (FR-9).
 */
export function prefillOriginFor(nodes: CatalogueNode[], id: string): string {
  const chain = pathOf(nodes, id);
  for (let i = chain.length - 1; i >= 0; i -= 1) {
    if (chain[i].default_origin) return chain[i].default_origin;
  }
  return "";
}
