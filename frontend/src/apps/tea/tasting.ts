// The tasting sheet, described once: every page renders and reads it from here.

import type { LiquorBody, Saturation, Tasting, TeaSession } from "./types";

export type TastingKind = "text" | "stars" | "scale" | "picks";
export type TastingValue = string | number | string[] | null;

export interface TastingOption {
  value: string;
  label: string;
  zh?: string;
  /** Picking it clears the others, and picking another clears it. */
  exclusive?: boolean;
}

export interface TastingField {
  path: string;
  label: string;
  zh?: string;
  hint?: string;
  kind: TastingKind;
  options?: TastingOption[];
}

export interface TastingSection {
  key: "leaf" | "liquor" | "aroma" | "sensation";
  title: string;
  zh?: string;
  fields: TastingField[];
}

const LIQUOR_COLOURS: TastingOption[] = [
  { value: "pale_jade", label: "pale jade" },
  { value: "yellow_green", label: "yellow-green" },
  { value: "golden", label: "golden" },
  { value: "amber", label: "amber" },
  { value: "orange_red", label: "orange-red" },
  { value: "red", label: "red" },
  { value: "deep_red", label: "deep red" },
  { value: "dark_brown", label: "dark brown" },
];

const STRUCTURES: TastingOption[] = [
  { value: "single", label: "single-note", zh: "单一" },
  { value: "simple", label: "simple", zh: "简单" },
  { value: "coarse", label: "coarse", zh: "粗狂" },
  { value: "short", label: "short", zh: "短促" },
  { value: "high", label: "high", zh: "高扬" },
  { value: "layered", label: "layered", zh: "多元" },
  { value: "complex", label: "complex", zh: "复杂" },
  { value: "delicate", label: "delicate", zh: "细腻" },
  { value: "long", label: "long", zh: "悠长" },
  { value: "deep", label: "deep", zh: "沉稳" },
];

const BODIES: TastingOption[] = [
  { value: "watery", label: "watery", zh: "水味" },
  { value: "light", label: "light", zh: "淡" },
  { value: "mild", label: "mild", zh: "和" },
  { value: "mellow", label: "mellow", zh: "醇" },
  { value: "thick", label: "thick", zh: "浓" },
];

const SATURATIONS: TastingOption[] = [
  { value: "low", label: "low", zh: "低" },
  { value: "medium", label: "medium", zh: "中" },
  { value: "fairly_high", label: "fairly high", zh: "稍高" },
  { value: "high", label: "high", zh: "高" },
];

const BODY_FEELS: TastingOption[] = [
  { value: "none", label: "none noticeable", zh: "体感不明显", exclusive: true },
  { value: "sweating", label: "sweat on hands or back", zh: "手/背出汗" },
  { value: "warmth", label: "gentle, lasting warmth", zh: "温和且持续的发热" },
  { value: "head_rush", label: "dizzy, head rush, cold sweat", zh: "头晕上头且冒冷汗" },
];

const MOUTHFEEL: [string, string, string][] = [
  ["thin", "thin", "薄"],
  ["dry", "dry", "干"],
  ["astringent", "astringent", "涩"],
  ["rough", "rough", "粗"],
  ["thick", "thick", "厚"],
  ["moist", "moist", "润"],
  ["slick", "slick", "滑"],
  ["cooling", "cooling", "清凉"],
];

export const TASTING_SECTIONS: TastingSection[] = [
  {
    key: "leaf",
    title: "Leaf",
    fields: [
      { path: "leaf.dry", label: "Dry leaf", hint: "look and fragrance", kind: "text" },
      { path: "leaf.wet", label: "Wet leaf", hint: "fragrance of the warmed leaf", kind: "text" },
      { path: "leaf.spent", label: "Spent leaves", zh: "叶底", kind: "text" },
      { path: "leaf.quality", label: "Leaf quality", kind: "stars" },
    ],
  },
  {
    key: "liquor",
    title: "Liquor",
    fields: [
      { path: "liquor.colour", label: "Colour", kind: "scale", options: LIQUOR_COLOURS },
      { path: "liquor.clarity", label: "Clarity", kind: "stars" },
    ],
  },
  {
    key: "aroma",
    title: "Aroma & Qi",
    zh: "香&气",
    fields: [
      { path: "aroma.aroma", label: "Aroma", zh: "香气", kind: "text" },
      { path: "aroma.aroma_type", label: "Aroma type", zh: "香型", kind: "text" },
      { path: "aroma.richness", label: "Richness", zh: "丰富程度", kind: "stars" },
      { path: "aroma.top_note", label: "Top note", zh: "前调", hint: "at the nose", kind: "text" },
      {
        path: "aroma.middle_note",
        label: "Middle note",
        zh: "中调",
        hint: "liquor in the mouth",
        kind: "text",
      },
      {
        path: "aroma.base_note",
        label: "Base note",
        zh: "后调",
        hint: "after swallowing",
        kind: "text",
      },
      {
        path: "aroma.tail_note",
        label: "Tail note",
        zh: "尾调",
        hint: "a minute or two after",
        kind: "text",
      },
      { path: "aroma.cup_aroma", label: "Cup & lid", hint: "the empty cup's fragrance", kind: "text" },
      {
        path: "aroma.structure",
        label: "Aroma structure",
        zh: "香气结构",
        kind: "picks",
        options: STRUCTURES,
      },
    ],
  },
  {
    key: "sensation",
    title: "Sensation",
    zh: "感&觉",
    fields: [
      { path: "sensation.body", label: "Body", zh: "汤感浓度", kind: "scale", options: BODIES },
      { path: "sensation.smoothness", label: "Smoothness", zh: "顺滑", kind: "stars" },
      {
        path: "sensation.saturation",
        label: "Saturation",
        zh: "饱和度",
        kind: "scale",
        options: SATURATIONS,
      },
      { path: "sensation.throat", label: "Throat", zh: "喉韵", hint: "hou yun", kind: "stars" },
      ...MOUTHFEEL.map(
        ([key, label, zh]): TastingField => ({
          path: `sensation.mouthfeel.${key}`,
          label: `Mouthfeel — ${label}`,
          zh,
          kind: "stars",
        }),
      ),
      { path: "sensation.hui_gan.strength", label: "Hui gan — strength", zh: "回甘", kind: "stars" },
      { path: "sensation.hui_gan.duration", label: "Hui gan — duration", kind: "stars" },
      {
        path: "sensation.sheng_jin.strength",
        label: "Sheng jin — strength",
        zh: "生津",
        kind: "stars",
      },
      { path: "sensation.sheng_jin.duration", label: "Sheng jin — duration", kind: "stars" },
      {
        path: "sensation.body_feel",
        label: "Body feeling",
        zh: "体感",
        kind: "picks",
        options: BODY_FEELS,
      },
      { path: "sensation.body_feel_other", label: "Other body feeling", kind: "text" },
    ],
  },
];

const FIELDS = TASTING_SECTIONS.flatMap((s) => s.fields);

function unrated() {
  return { strength: null, duration: null };
}

export function emptyTasting(): Tasting {
  return {
    leaf: { dry: "", wet: "", spent: "", quality: null },
    liquor: { colour: null, clarity: null },
    aroma: {
      aroma: "",
      aroma_type: "",
      richness: null,
      top_note: "",
      middle_note: "",
      base_note: "",
      tail_note: "",
      cup_aroma: "",
      structure: [],
    },
    sensation: {
      body: null,
      smoothness: null,
      saturation: null,
      throat: null,
      mouthfeel: {
        thin: null,
        dry: null,
        astringent: null,
        rough: null,
        thick: null,
        moist: null,
        slick: null,
        cooling: null,
      },
      hui_gan: unrated(),
      sheng_jin: unrated(),
      body_feel: [],
      body_feel_other: "",
    },
  };
}

export function getAt(tasting: Tasting, path: string): TastingValue {
  let node: unknown = tasting;
  for (const key of path.split(".")) node = (node as Record<string, unknown> | undefined)?.[key];
  return (node ?? null) as TastingValue;
}

/** A copy of `tasting` with `path` set. Plain JSON copy: it may be a reactive proxy. */
export function setAt(tasting: Tasting, path: string, value: TastingValue): Tasting {
  const next = JSON.parse(JSON.stringify(tasting)) as Tasting;
  const keys = path.split(".");
  const last = keys.pop()!;
  let node = next as unknown as Record<string, unknown>;
  for (const key of keys) node = node[key] as Record<string, unknown>;
  node[last] = value;
  return next;
}

export function isFilled(value: TastingValue): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value)) return value.length > 0;
  return value !== null;
}

export function filledCount(tasting: Tasting, section: TastingSection): number {
  return section.fields.filter((f) => isFilled(getAt(tasting, f.path))).length;
}

export function isEmptyTasting(tasting: Tasting): boolean {
  return FIELDS.every((f) => !isFilled(getAt(tasting, f.path)));
}

export function optionLabel(field: TastingField, value: string): string {
  return field.options?.find((o) => o.value === value)?.label ?? value;
}

function fieldAt(path: string): TastingField {
  return FIELDS.find((f) => f.path === path)!;
}

function stars(n: number): string {
  return "★".repeat(n) + "☆".repeat(5 - n);
}

export function tastingLine(tasting: Tasting): string {
  const parts: string[] = [];
  const aroma = tasting.aroma.aroma_type.trim() || tasting.aroma.aroma.trim();
  if (aroma) parts.push(aroma);
  const body = tasting.sensation.body;
  if (body) parts.push(optionLabel(fieldAt("sensation.body"), body));
  // Ties go to the earlier of these, so hui gan wins when it's as strong as the others.
  const candidates: [string, number | null][] = [
    ["hui gan", tasting.sensation.hui_gan.strength],
    ["throat", tasting.sensation.throat],
    ["smoothness", tasting.sensation.smoothness],
  ];
  let best: [string, number] | null = null;
  for (const [name, value] of candidates) {
    if (value !== null && (best === null || value > best[1])) best = [name, value];
  }
  if (best) parts.push(`${best[0]} ${"★".repeat(best[1])}`);
  return parts.join(" · ");
}

export interface TastingRow {
  path: string;
  label: string;
  zh?: string;
  hint?: string;
  value: string;
}

export interface TastingBlock {
  key: TastingSection["key"];
  title: string;
  zh?: string;
  rows: TastingRow[];
}

function describe(field: TastingField, value: TastingValue): string {
  if (field.kind === "stars") return stars(value as number);
  if (field.kind === "scale") return optionLabel(field, value as string);
  if (field.kind === "picks") return (value as string[]).map((v) => optionLabel(field, v)).join(" · ");
  return (value as string).trim();
}

/** The filled fields only, in words, section by section. */
export function describeTasting(tasting: Tasting): TastingBlock[] {
  return TASTING_SECTIONS.map((section) => ({
    key: section.key,
    title: section.title,
    zh: section.zh,
    rows: section.fields
      .filter((f) => isFilled(getAt(tasting, f.path)))
      .map((f) => ({
        path: f.path,
        label: f.label,
        zh: f.zh,
        hint: f.hint,
        value: describe(f, getAt(tasting, f.path)),
      })),
  })).filter((block) => block.rows.length > 0);
}

export interface StarAverage {
  path: string;
  label: string;
  average: number;
  count: number;
}

export interface TastingSummary {
  count: number;
  stars: StarAverage[];
  body: LiquorBody | null;
  saturation: Saturation | null;
  structure: { value: string; label: string; count: number }[];
  aromaWords: string[];
}

/** The most frequent value; a tie goes to the one earlier in `order`. */
function usual(values: string[], order: string[]): string | null {
  let best: string | null = null;
  let bestCount = 0;
  for (const candidate of order) {
    const count = values.filter((v) => v === candidate).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

function words(text: string): string[] {
  return text
    // The notebook is Chinese, so its commas and enumeration mark split words too.
    .split(/[,，、;；]/)
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w !== "");
}

export function tastingSummary(
  sessions: Pick<TeaSession, "tasting">[],
): TastingSummary | null {
  const tasted = sessions
    .map((s) => s.tasting)
    .filter((t): t is Tasting => t !== null && !isEmptyTasting(t));
  if (tasted.length === 0) return null;

  const starAverages: StarAverage[] = [];
  for (const field of FIELDS.filter((f) => f.kind === "stars")) {
    const values = tasted.map((t) => getAt(t, field.path)).filter((v): v is number => typeof v === "number");
    if (values.length === 0) continue;
    const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
    starAverages.push({ path: field.path, label: field.label, average, count: values.length });
  }

  const optionsOf = (path: string) => (fieldAt(path).options ?? []).map((o) => o.value);
  const structureField = fieldAt("aroma.structure");
  const picked = tasted.flatMap((t) => t.aroma.structure);
  const structure = optionsOf("aroma.structure")
    .map((value) => ({
      value,
      label: optionLabel(structureField, value),
      count: picked.filter((p) => p === value).length,
    }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.count - a.count);

  const sittingsWith = new Map<string, number>();
  for (const t of tasted) {
    for (const word of new Set([...words(t.aroma.aroma), ...words(t.aroma.aroma_type)])) {
      sittingsWith.set(word, (sittingsWith.get(word) ?? 0) + 1);
    }
  }
  const aromaWords = [...sittingsWith.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([word]) => word);

  return {
    count: tasted.length,
    stars: starAverages,
    body: usual(
      tasted.map((t) => t.sensation.body).filter((v): v is LiquorBody => v !== null),
      optionsOf("sensation.body"),
    ) as LiquorBody | null,
    saturation: usual(
      tasted.map((t) => t.sensation.saturation).filter((v): v is Saturation => v !== null),
      optionsOf("sensation.saturation"),
    ) as Saturation | null,
    structure,
    aromaWords,
  };
}
