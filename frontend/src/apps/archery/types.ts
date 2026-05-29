export interface TargetScores {
  number: number;
  scores: Record<string, [number, number]>;
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
