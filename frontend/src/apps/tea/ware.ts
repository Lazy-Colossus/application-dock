// The ware shelf's rules as pure functions, like shelf.ts is for teas.

import type {
  TeaSession,
  Teaware,
  TeawareMaterial,
  TeawareType,
  TeawareWrite,
} from "./types";

export const WARE_TYPE_ORDER: TeawareType[] = [
  "gaiwan",
  "pot",
  "kyusu",
  "chawan",
  "pitcher",
  "cup",
  "other",
];

export const WARE_TYPE_LABELS: Record<TeawareType, { label: string; labelZh: string }> = {
  gaiwan: { label: "Gaiwan", labelZh: "蓋碗" },
  pot: { label: "Pot", labelZh: "壺" },
  kyusu: { label: "Kyusu", labelZh: "急須" },
  chawan: { label: "Chawan", labelZh: "茶碗" },
  pitcher: { label: "Pitcher", labelZh: "公道杯" },
  cup: { label: "Cup", labelZh: "杯" },
  other: { label: "Other", labelZh: "其他" },
};

export const MATERIAL_LABELS: Record<TeawareMaterial, string> = {
  porcelain: "Porcelain",
  clay: "Clay",
  stoneware: "Stoneware",
  glass: "Glass",
  other: "Other",
};

// Must match the server's BREWING_TYPES.
const BREWING_TYPES: ReadonlySet<TeawareType> = new Set([
  "gaiwan",
  "pot",
  "kyusu",
  "chawan",
  "other",
]);

export function isBrewingVessel(item: Teaware): boolean {
  return BREWING_TYPES.has(item.type) && item.retired_at === null;
}

export interface WareSectionData {
  type: TeawareType;
  items: Teaware[];
}

/** Sections in shelf order, names A–Z, empty types omitted. */
export function groupByType(items: Teaware[]): WareSectionData[] {
  const buckets = new Map<TeawareType, Teaware[]>();
  for (const item of items) {
    // A type this build doesn't know means the server is ahead; shelve it rather than drop it.
    const type: TeawareType = WARE_TYPE_ORDER.includes(item.type) ? item.type : "other";
    buckets.set(type, [...(buckets.get(type) ?? []), item]);
  }
  return WARE_TYPE_ORDER.filter((type) => buckets.has(type)).map((type) => ({
    type,
    items: [...(buckets.get(type) ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
  }));
}

export interface WareFilterState {
  type: TeawareType | null;
  material: TeawareMaterial | null;
  minMl: number | null;
  maxMl: number | null;
  showRetired: boolean;
}

export function matchesWareFilters(item: Teaware, filters: WareFilterState): boolean {
  if (!filters.showRetired && item.retired_at !== null) return false;
  if (filters.type && item.type !== filters.type) return false;
  if (filters.material && item.material !== filters.material) return false;
  const volume = item.volume_ml;
  if (filters.minMl !== null && (volume === null || volume < filters.minMl)) return false;
  if (filters.maxMl !== null && (volume === null || volume > filters.maxMl)) return false;
  return true;
}

/** "110 ml · clay", leaving out whatever isn't recorded. */
export function wareSummary(item: Teaware): string {
  return [
    item.volume_ml !== null ? `${item.volume_ml} ml` : "",
    item.material ? MATERIAL_LABELS[item.material].toLowerCase() : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** What a session row says about its vessel: name and volume, or that the pot is gone. */
export function vesselLabel(session: TeaSession, items: Teaware[]): string {
  const ml = session.vessel_volume_ml !== null ? `${session.vessel_volume_ml} ml` : "";
  const item = session.teaware_id ? items.find((i) => i.id === session.teaware_id) : undefined;
  if (item) return ml ? `${item.name} ${ml}` : item.name;
  if (session.teaware_id === null && ml) return `${ml}, vessel removed`;
  return ml;
}

export function blankWare(): TeawareWrite {
  return {
    name: "",
    type: "gaiwan",
    material: null,
    volume_ml: null,
    porous: false,
    dedicated_node_id: null,
    maker: "",
    origin: "",
    acquired_date: null,
    price_paid: null,
    notes: "",
    retired: false,
  };
}

export function toWareWrite(item: Teaware): TeawareWrite {
  return {
    name: item.name,
    type: item.type,
    material: item.material,
    volume_ml: item.volume_ml,
    porous: item.porous,
    dedicated_node_id: item.dedicated_node_id,
    maker: item.maker,
    origin: item.origin,
    acquired_date: item.acquired_date,
    price_paid: item.price_paid,
    notes: item.notes,
    retired: item.retired_at !== null,
  };
}

export function canSaveWare(draft: TeawareWrite): boolean {
  return draft.name.trim() !== "";
}
