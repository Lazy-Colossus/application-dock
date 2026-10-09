// The almanac's browsing rules as pure functions: the same entries read as a
// book of classes or an atlas of countries.

import type { AlmanacEntryView, CatalogueNode, TeaClass } from "./types";
import { rootClassOf } from "./catalogue";
import { CLASS_ORDER, CLASS_TOKENS } from "./tokens";

export type AlmanacView = "class" | "place";

export interface AlmanacGroup {
  key: string;
  label: string;
  classId: TeaClass | null;
  entries: AlmanacEntryView[];
}

export interface AlmanacChapter {
  key: string;
  label: string;
  labelZh: string;
  classId: TeaClass | null;
  count: number;
  groups: AlmanacGroup[];
}

interface Keyed {
  entry: AlmanacEntryView;
  classId: TeaClass;
}

function bucket<K>(items: Keyed[], keyOf: (item: Keyed) => K): Map<K, Keyed[]> {
  const buckets = new Map<K, Keyed[]>();
  for (const item of items) {
    const key = keyOf(item);
    const found = buckets.get(key);
    if (found) found.push(item);
    else buckets.set(key, [item]);
  }
  return buckets;
}

// China, Japan, Taiwan… reads like tea's own history, where A–Z would open
// the atlas on Argentina's single entry.
function countryOrder(items: Keyed[]): string[] {
  const counts = bucket(items, (item) => item.entry.country);
  return [...counts.keys()].sort(
    (a, b) =>
      (counts.get(b)?.length ?? 0) - (counts.get(a)?.length ?? 0) ||
      a.localeCompare(b),
  );
}

function sortedEntries(items: Keyed[]): AlmanacEntryView[] {
  return items
    .map((item) => item.entry)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function groupAlmanac(
  entries: AlmanacEntryView[],
  nodes: CatalogueNode[],
  view: AlmanacView,
): AlmanacChapter[] {
  const items = entries.map((entry) => ({
    entry,
    classId: rootClassOf(nodes, entry.catalogue_node_id),
  }));
  const countries = countryOrder(items);

  if (view === "class") {
    const byClass = bucket(items, (item) => item.classId);
    return CLASS_ORDER.filter((classId) => byClass.has(classId)).map(
      (classId) => {
        const inClass = byClass.get(classId) ?? [];
        const byCountry = bucket(inClass, (item) => item.entry.country);
        return {
          key: classId,
          label: CLASS_TOKENS[classId].label,
          labelZh: CLASS_TOKENS[classId].labelZh,
          classId,
          count: inClass.length,
          groups: countries
            .filter((country) => byCountry.has(country))
            .map((country) => ({
              key: country,
              label: country,
              classId: null,
              entries: sortedEntries(byCountry.get(country) ?? []),
            })),
        };
      },
    );
  }

  const byCountry = bucket(items, (item) => item.entry.country);
  return countries.map((country) => {
    const inCountry = byCountry.get(country) ?? [];
    const byClass = bucket(inCountry, (item) => item.classId);
    return {
      key: country,
      label: country,
      labelZh: "",
      classId: null,
      count: inCountry.length,
      groups: CLASS_ORDER.filter((classId) => byClass.has(classId)).map(
        (classId) => ({
          key: classId,
          label: CLASS_TOKENS[classId].label,
          classId,
          entries: sortedEntries(byClass.get(classId) ?? []),
        }),
      ),
    };
  });
}

export function pickRandom<T>(
  items: T[],
  random: () => number = Math.random,
): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(random() * items.length)];
}

/**
 * The chapter being read: the last whose top has reached `line`. A chapter
 * runs to thousands of pixels, so the shelf's nearest-centre rule would hand
 * the rail to a short neighbour while a long chapter fills the screen.
 * Non-finite tops are chapters no longer on the page.
 */
export function chapterAt(tops: number[], line: number): number {
  let found = -1;
  tops.forEach((top, index) => {
    if (!Number.isFinite(top)) return;
    if (found === -1 || top <= line) found = index;
  });
  return found;
}
