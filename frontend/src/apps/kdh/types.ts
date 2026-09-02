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
  color: string;
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
  chosen_dates: string[];
}

export interface CalendarSummary {
  id: string;
  name: string;
  invitee_count: number;
  created_at: string;
}

export interface Me {
  username: string;
  is_admin: boolean;
}
