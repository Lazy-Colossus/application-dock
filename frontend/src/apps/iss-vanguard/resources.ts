import type { Grid, ResourceId, TierId } from "./types";

// The game's own Slovak names; the rest of the UI is English.
export const RESOURCES: readonly { id: ResourceId; name: string }[] = [
  { id: "microorganisms", name: "Mikroorganizmy" },
  { id: "alien_technologies", name: "Mimozemské technológie" },
  { id: "minerals", name: "Minerály" },
  { id: "strange_flora", name: "Podivná flóra" },
  { id: "living_specimens", name: "Živé exempláre" },
];

export const TIERS: readonly { id: TierId; name: string }[] = [
  { id: "basic", name: "Základný" },
  { id: "rare", name: "Vzácny" },
  { id: "very_rare", name: "Veľmi vzácny" },
];

export function emptyGrid(): Grid {
  return Object.fromEntries(
    RESOURCES.map((r) => [
      r.id,
      Object.fromEntries(TIERS.map((t) => [t.id, 0])),
    ]),
  ) as Grid;
}

export function cellName(resource: ResourceId, tier: TierId): string {
  const r = RESOURCES.find((x) => x.id === resource)?.name ?? resource;
  const t = TIERS.find((x) => x.id === tier)?.name ?? tier;
  return `${r} · ${t}`;
}
