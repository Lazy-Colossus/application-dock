// Canonical Hotaru domain types. Mirrors the backend Word schema (see
// architecture.md#Data Architecture) and the seed produced in Story 1.1.

export type DrillCap = "r2m" | "m2r" | "k2r";
export type Visibility = "shared" | "private";

export interface Word {
  id: string;
  // Origin: a textbook slug (e.g. "genki_3") for seeded words, or a user id
  // (e.g. "user1") for user-added words. Also serves as ownership.
  source: string;
  reading: string;
  kanji: string | null;
  romaji: string;
  meaning: string;
  pos: string;
  lesson: string;
  visibility: Visibility;
  drill_caps: DrillCap[];
}
