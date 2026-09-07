// Question of the Day — shared frontend types. Mirrors the backend schemas
// (snake_case fields, as served).

export type QuestionType = "text" | "scale";

export interface Scale {
  min: number;
  max: number;
  min_label: string | null;
  max_label: string | null;
}

export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  scale: Scale | null;
}

// One person's answer. Exactly one of `text` / `rating` is set, matched to the
// question type.
export interface Answer {
  text: string | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
}

// The home page's view of today. Carries the caller's OWN answer (`my_answer`)
// for pre-fill/edit, but never the pool of other users' answers — that reveal is
// gated behind answer-to-reveal (Epic 3).
export interface TodayView {
  date: string;
  question: Question;
  answered: boolean;
  my_answer: Answer | null;
}

// One answer in a feed, attributed to its author.
export interface FeedAnswer extends Answer {
  username: string;
}

// Today's answers, gated behind answer-to-reveal: `answers` is empty and only
// `count` is offered until the caller has answered (`revealed`).
export interface TodayFeed {
  revealed: boolean;
  count: number;
  answers: FeedAnswer[];
}

// One past day in the history list — date + its resolved question.
export interface HistoryRow {
  date: string;
  question_text: string;
  type: QuestionType;
}

// A past day in full — question + everyone's answers, read-only and always
// visible (no answer-to-reveal gate on the archive).
export interface PastDayView {
  date: string;
  question: Question;
  answers: FeedAnswer[];
}
