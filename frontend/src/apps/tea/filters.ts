import type { Tea } from "./types";

export interface CabinetFilterState {
  /** A catalogue node; a tea matches when this node is anywhere in its chain. */
  nodeId: string | null;
  country: string | null;
  query: string;
  showEmpty: boolean;
}

export function matchesFilters(
  tea: Tea,
  filters: CabinetFilterState,
  chainIds: string[],
  country: string | null,
): boolean {
  if (!filters.showEmpty && tea.grams_remaining <= 0) return false;
  if (filters.nodeId && !chainIds.includes(filters.nodeId)) return false;
  if (filters.country && country !== filters.country) return false;
  const needle = filters.query.trim().toLocaleLowerCase();
  if (needle && !tea.name.toLocaleLowerCase().includes(needle)) return false;
  return true;
}
