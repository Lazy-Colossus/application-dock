import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HistoryListItem from './HistoryListItem.vue';
import type { SessionSummary } from '@/apps/archery/types';

const STUBS = {
  'q-icon': { template: '<span class="q-icon"><slot /></span>' }
};

const SUMMARY: SessionSummary = {
  label: '2026-05-29',
  archer_count: 3,
  winner: 'Alice',
  winning_score: 324
};

const SUFFIX_SUMMARY: SessionSummary = {
  label: '2026-05-29-2',
  archer_count: 2,
  winner: 'Bob',
  winning_score: 200
};

describe('HistoryListItem', () => {
  it('renders the session label', () => {
    const w = mount(HistoryListItem, { props: { summary: SUMMARY }, global: { stubs: STUBS } });
    expect(w.find('.hli__label').text()).toBe('2026-05-29');
  });

  it('formats suffix labels as YYYY-MM-DD #N', () => {
    const w = mount(HistoryListItem, { props: { summary: SUFFIX_SUMMARY }, global: { stubs: STUBS } });
    expect(w.find('.hli__label').text()).toBe('2026-05-29 #2');
  });

  it('renders archer count, winner, winning score in sub-line', () => {
    const w = mount(HistoryListItem, { props: { summary: SUMMARY }, global: { stubs: STUBS } });
    const sub = w.find('.hli__sub').text();
    expect(sub).toContain('3 archers');
    expect(sub).toContain('Alice');
    expect(sub).toContain('324');
  });

  it('emits tap with the label when clicked', async () => {
    const w = mount(HistoryListItem, { props: { summary: SUMMARY }, global: { stubs: STUBS } });
    await w.find('button').trigger('click');
    expect(w.emitted('tap')?.[0]).toEqual(['2026-05-29']);
  });

  it('has an accessible aria-label', () => {
    const w = mount(HistoryListItem, { props: { summary: SUMMARY }, global: { stubs: STUBS } });
    const label = w.find('button').attributes('aria-label') ?? '';
    expect(label).toContain('2026-05-29');
    expect(label).toContain('Alice');
    expect(label).toContain('324');
  });
});
