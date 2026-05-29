export interface TargetScores {
  number: number;
  scores: Record<string, [number, number]>;
}

export interface SessionData {
  label: string;
  created: string;
  status: 'in_progress' | 'finalised';
  archers: string[];
  targets: TargetScores[];
}

export interface SessionSummary {
  label: string;
  archer_count: number;
  winner: string;
  winning_score: number;
}
