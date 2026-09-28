import { RESOURCES, TIERS, emptyGrid } from "./resources";
import type { Grid, ProjectShortfall, Ship, Shortage } from "./types";

export function needed(ship: Ship): Grid {
  const total = emptyGrid();
  for (const project of ship.projects) {
    if (project.done) continue;
    for (const r of RESOURCES)
      for (const t of TIERS) total[r.id][t.id] += project.cost[r.id][t.id];
  }
  return total;
}

export function diff(ship: Ship): Grid {
  const need = needed(ship);
  const out = emptyGrid();
  for (const r of RESOURCES)
    for (const t of TIERS)
      out[r.id][t.id] = ship.stock[r.id][t.id] - need[r.id][t.id];
  return out;
}

export function shortfall(stock: Grid, cost: Grid): Shortage[] {
  const missing: Shortage[] = [];
  for (const r of RESOURCES)
    for (const t of TIERS) {
      const amount = cost[r.id][t.id] - stock[r.id][t.id];
      if (amount > 0) missing.push({ resource: r.id, tier: t.id, amount });
    }
  return missing;
}

/** Each open project against the whole stock alone — stock is not shared out between them. */
export function perProjectShortfall(ship: Ship): ProjectShortfall[] {
  return ship.projects
    .filter((p) => !p.done)
    .map((project) => ({
      project,
      missing: shortfall(ship.stock, project.cost),
    }))
    .filter((p) => p.missing.length > 0);
}
