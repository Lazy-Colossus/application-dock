export interface TargetScores {
  number: number;
  // Mid-session a shot may be null ("not yet entered"); 0 is a real value.
  scores: Record<string, [number | null, number | null]>;
  // Source of truth for the green board state (Story 7.1). Absent ⇒ not confirmed.
  confirmed?: boolean;
}

export interface SessionData {
  label: string;
  name: string;
  date: string;
  created: string;
  status: 'in_progress' | 'finalised';
  archers: string[];
  targets: TargetScores[];
}

export interface SessionSummary {
  label: string;
  name: string;
  archer_count: number;
  winner: string;
  winning_score: number;
}

export interface InProgressSummary {
  label: string;
  name: string;
  date: string;
  confirmed_targets: number;
}
