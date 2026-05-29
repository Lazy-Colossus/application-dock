import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ResultsTable from './ResultsTable.vue';
import type { SessionData } from '@/apps/archery/types';

function makeSession(targets: SessionData['targets'] = []): SessionData {
  return {
    label: '2026-05-29',
    name: '2026-05-29',
    date: '2026-05-29',
    created: '2026-05-29T10:00:00Z',
    status: 'in_progress',
    archers: ['Alice', 'Bob'],
    targets
  };
}

function allTargets(): SessionData['targets'] {
  return Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    scores: {
      Alice: [10, 8] as [number, number],
      Bob: [5, 11] as [number, number]
    }
  }));
}

describe('ResultsTable', () => {
  it('renders 18 body rows', () => {
    const w = mount(ResultsTable, { props: { session: makeSession(allTargets()) } });
    expect(w.findAll('tbody tr').length).toBe(18);
  });

  it('shows — for unconfirmed targets', () => {
    const w = mount(ResultsTable, { props: { session: makeSession([]) } });
    const cells = w.findAll('.results-table__empty');
    // 18 targets × 2 archers = 36 empty cells
    expect(cells.length).toBe(36);
  });

  it('formats shots as S1 / S2', () => {
    const w = mount(ResultsTable, {
      props: { session: makeSession([{ number: 1, scores: { Alice: [10, 8], Bob: [5, 11] } }]) }
    });
    const shots = w.findAll('.results-table__shots');
    expect(shots[0].text()).toBe('10 / 8');
    expect(shots[1].text()).toBe('5 / 11');
  });

  it('shows subtotal per cell', () => {
    const w = mount(ResultsTable, {
      props: { session: makeSession([{ number: 1, scores: { Alice: [10, 8], Bob: [5, 11] } }]) }
    });
    const subs = w.findAll('.results-table__sub');
    expect(subs[0].text()).toBe('= 18');
    expect(subs[1].text()).toBe('= 16');
  });

  it('shows archer totals in header', () => {
    const w = mount(ResultsTable, { props: { session: makeSession(allTargets()) } });
    const totals = w.findAll('.results-table__total');
    // Alice: 18 × 18 = 324, Bob: 18 × 16 = 288
    expect(totals[0].text()).toBe('324');
    expect(totals[1].text()).toBe('288');
  });

  it('renders archer name columns in header', () => {
    const w = mount(ResultsTable, { props: { session: makeSession() } });
    const headers = w.findAll('th');
    expect(headers.some((h) => h.text().includes('Alice'))).toBe(true);
    expect(headers.some((h) => h.text().includes('Bob'))).toBe(true);
  });
});
