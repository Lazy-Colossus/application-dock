// Canonical Hotaru domain types. Mirrors the backend Word schema (see
// architecture.md#Data Architecture) and the seed produced in Story 1.1.

export type DrillCap = "r2m" | "m2r" | "k2r";
export type Visibility = "shared" | "private";

// One of the two hardcoded users (ids "dani" / "jake"). No auth.
export interface HotaruUser {
  id: string;
  name: string;
}

export interface Word {
  id: string;
  // Origin: a textbook slug (e.g. "genki_3") for seeded words, or a user id
  // (e.g. "dani") for user-added words. Also serves as ownership.
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

// Shared, many-to-many grouping over the master list. `word_ids` holds raw ids;
// a private word's id here still only resolves for its owner (FR-7).
export interface Topic {
  id: string;
  name: string;
  word_ids: string[];
}
