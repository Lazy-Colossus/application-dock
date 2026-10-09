// The Yancha palette, from
// docs/planning-artifacts/ux-designs/ux-tea-2026-09-24/DESIGN.md — which wins
// over this file if they ever disagree.
//
// Liquor is the only colour system in the app: a hue appears because a tea
// makes that colour in the cup. `liquor` draws the gauge, the leaves and a
// selected chip; `head` is a lift of it for the 13px class name, which is
// unreadable at the liquor value itself.

import type { TeaClass } from "./types";

export const GROUND = {
  field: "#17120E",
  raised: "#1E1712",
  hairline: "#241E19",
  track: "#2C241D",
  trackOut: "#241E19",
  inkHi: "#EFE7DA",
  ink: "#E4D9C6",
  inkLo: "#6B5F52",
  inkMuted: "#8B7A63",
  inkZh: "#A99781",
  inkOut: "#574D43",
  inkOnFill: "#17120E",
} as const;

export interface ClassTokens {
  label: string;
  labelZh: string;
  liquor: string;
  head: string;
  zh: string;
  leaf: "sinensis" | "assamica";
}

/** The Chinese classification's own order, which is the shelf's order (FR-5). */
export const CLASS_ORDER: TeaClass[] = [
  "green",
  "yellow",
  "white",
  "oolong",
  "red",
  "dark",
  "other",
];

export const CLASS_TOKENS: Record<TeaClass, ClassTokens> = {
  green: {
    label: "Green",
    labelZh: "綠茶",
    liquor: "#6B8A63",
    head: "#96AF8D",
    zh: "#5D6E58",
    leaf: "sinensis",
  },
  yellow: {
    label: "Yellow",
    labelZh: "黃茶",
    liquor: "#A8944F",
    head: "#B5A472",
    zh: "#6B6144",
    leaf: "sinensis",
  },
  white: {
    label: "White",
    labelZh: "白茶",
    liquor: "#B9B2A0",
    head: "#C3BCAA",
    zh: "#6E695C",
    leaf: "sinensis",
  },
  oolong: {
    label: "Oolong",
    labelZh: "烏龍",
    liquor: "#B8832F",
    head: "#C7A271",
    zh: "#7A6244",
    leaf: "sinensis",
  },
  red: {
    label: "Red",
    labelZh: "紅茶",
    liquor: "#96543A",
    head: "#B8846E",
    zh: "#71544A",
    leaf: "sinensis",
  },
  // Pu-erh and the other dark teas are made from the broad-leaf assamica
  // varietal, so their silhouette is genuinely a different plant.
  dark: {
    label: "Dark",
    labelZh: "黑茶",
    liquor: "#8C4A3C",
    head: "#BC8578",
    zh: "#75504A",
    leaf: "assamica",
  },
  other: {
    label: "Other",
    labelZh: "其他",
    liquor: "#6E6255",
    head: "#9A8B78",
    zh: "#5C5248",
    leaf: "sinensis",
  },
};
