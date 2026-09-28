// Pure helpers for the Cha Xi Journal.

import type { ChaXi, JournalEntry, Mood, TeaSession } from "./types";

/** Mirrors backend `Mood`; also the order moods are shown and stored in. */
export const MOODS: Mood[] = [
  "calm",
  "bright",
  "contemplative",
  "cosy",
  "social",
  "focused",
  "tired",
  "restless",
];

export function emptyChaXi(): ChaXi {
  return { moods: [], guests: "", notes: "" };
}

export function toggleMood(moods: Mood[], mood: Mood): Mood[] {
  const next = moods.includes(mood) ? moods.filter((m) => m !== mood) : [...moods, mood];
  return MOODS.filter((m) => next.includes(m));
}

/** Whether anything of a sitting's cha xi is recorded — the Journal's "Cha xi only" test. */
export function hasChaXi(session: { cha_xi: ChaXi | null; image_url: string | null }): boolean {
  if (session.image_url !== null) return true;
  const chaXi = session.cha_xi;
  if (chaXi === null) return false;
  return chaXi.moods.length > 0 || chaXi.guests.trim() !== "" || chaXi.notes.trim() !== "";
}

export interface MonthGroup {
  key: string;
  label: string;
  entries: JournalEntry[];
}

/** Newest-first entries cut into calendar months, in the viewer's own time zone. */
export function groupByMonth(entries: JournalEntry[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  for (const entry of entries) {
    const at = new Date(entry.started_at);
    const key = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}`;
    let group = groups.find((g) => g.key === key);
    if (!group) {
      group = {
        key,
        label: at.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
        entries: [],
      };
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
}

/** Grams a delete gives back — only a cabinet tea's leaf was ever taken. */
export function gramsReturned(session: Pick<TeaSession, "tea_id" | "leaf_grams">): number | null {
  return session.tea_id !== null ? session.leaf_grams : null;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** `YYYY-MM-DD` for an `<input type="date">`, in local time. */
export function toDateInput(iso: string): string {
  const at = new Date(iso);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Local noon of a picked day, so no time zone can tip it into the day before or after. */
export function fromDateInput(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12).toISOString();
}
