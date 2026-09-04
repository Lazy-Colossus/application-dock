// KDH — shared availability calendars.
//
// Mirrors backend/app/schemas/kdh.py. Storage is shared, not per-user: every
// authenticated caller sees the same calendars, and the logged-in account
// decides only what they may do (see `Me.is_admin`).

/** Freely available, or "I can make this work if it's the day that saves the
 *  session". Every other state — declined, undecided — is absence. */
export type VoteStatus = "yes" | "if_needed";

export interface Invitee {
  id: string;
  name: string;
  order: number;
  /** Set when an admin removes them; the record survives so past day cells
   *  still render their name and colour. `null` means active. */
  removed_at: string | null;
}

export interface Calendar {
  schema_version: number;
  id: string;
  name: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  invitees: Invitee[];
  /** date (YYYY-MM-DD) -> invitee id -> status. */
  votes: Record<string, Record<string, VoteStatus>>;
  /** date -> invitee id -> a short note, independent of any answer. */
  notes: Record<string, Record<string, string>>;
  chosen_dates: string[];
  /** The secret in the invitee link. Only an admin ever receives a calendar. */
  share_token: string;
}

export interface CalendarSummary {
  id: string;
  name: string;
  invitee_count: number;
  /** Active invitees in roster order — tombstoned people are excluded. */
  invitee_names: string[];
  created_at: string;
  /** The nearest chosen day still to come, if any. */
  next_session: string | null;
  /** The most recent chosen day already past, if any. */
  last_session: string | null;
  /** So a row can offer the invitee link without opening the calendar first. */
  share_token: string;
}

export interface Me {
  username: string;
  is_admin: boolean;
  /** The server's date. The client never decides "past" from its own clock. */
  today: string;
}

/** Matches `NOTE_MAX_LENGTH` on the server, which is authoritative. */
export const NOTE_MAX_LENGTH = 200;
