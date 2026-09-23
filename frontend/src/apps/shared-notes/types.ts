// Shared types for the Shared Notes app. Mirrors
// backend/app/schemas/shared_notes.py — snake_case field names are the API
// contract, not an oversight.

/** A note as the home list sees it. No body, so the list stays cheap. */
export interface NoteSummary {
  id: string;
  title: string;
  owner: string;
  // True when the note has more than one member. Story 2.3 turns this into the
  // shared-with-me / shared-by-me distinction; the home only passes it through.
  shared: boolean;
  updated_at: string;
}

/**
 * A note as the editor sees it, plus what the caller may do with it.
 * `can_manage` is true only for the owner: it gates delete, and membership
 * management in Epic 2. Members edit title and body but manage neither.
 */
export interface Note {
  id: string;
  title: string;
  body: string;
  owner: string;
  members: string[];
  rev: number;
  can_manage: boolean;
  created_at: string;
  updated_at: string;
}
