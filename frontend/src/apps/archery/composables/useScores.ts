import type { SessionData } from '@/apps/archery/types';

export interface RankedArcher {
  archer: string;
  total: number;
}

export function totalFor(session: SessionData, archer: string): number {
  return session.targets.reduce(
    (sum, t) => sum + (t.scores[archer]?.[0] ?? 0) + (t.scores[archer]?.[1] ?? 0),
    0
  );
}

export function ranked(session: SessionData): RankedArcher[] {
  return session.archers
    .map((a) => ({ archer: a, total: totalFor(session, a) }))
    .sort(
      (x, y) =>
        y.total - x.total ||
        x.archer.localeCompare(y.archer, undefined, { sensitivity: 'base' })
    );
}
