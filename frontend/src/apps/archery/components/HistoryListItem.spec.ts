import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HistoryListItem from './HistoryListItem.vue';
import type { SessionSummary } from '@/apps/archery/types';

const STUBS = {
  'q-icon': { template: '<span class="q-icon"><slot /></span>' }
};

const SUMMARY: SessionSummary = {
  label: '2026-05-29',
  name: '2026-05-29',
  archer_count: 3,
  winner: 'Alice',
  winning_score: 324,
  top_archers: [
    { name: 'Alice', score: 324 },
    { name: 'Bob', score: 200 },
    { name: 'Charlie', score: 150 }
  ]
};

const SUFFIX_SUMMARY: SessionSummary = {
  label: '2026-05-29-2',
  name: '2026-05-29-2',
  archer_count: 2,
  winner: 'Bob',
  winning_score: 200,
  top_archers: [
    { name: 'Bob', score: 200 },
    { name: 'Alice', score: 100 }
  ]
};

const CUSTOM_NAME_SUMMARY: SessionSummary = {
  label: '2026-05-29',
  name: 'Club Champs',
  archer_count: 1,
  winner: 'Alice',
  winning_score: 324,
  top_archers: [{ name: 'Alice', score: 324 }]
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

  it('renders custom session name in title', () => {
    const w = mount(HistoryListItem, { props: { summary: CUSTOM_NAME_SUMMARY }, global: { stubs: STUBS } });
    expect(w.find('.hli__label').text()).toBe('Club Champs');
  });

  it('renders top-3 archers in subtext', () => {
    const w = mount(HistoryListItem, { props: { summary: SUMMARY }, global: { stubs: STUBS } });
    const sub = w.find('.hli__sub').text();
    expect(sub).toContain('Alice');
    expect(sub).toContain('324');
    expect(sub).toContain('Bob');
    expect(sub).toContain('200');
    expect(sub).toContain('Charlie');
    expect(sub).toContain('150');
  });

  it('subtext shows the archer count prefix', () => {
    const w = mount(HistoryListItem, { props: { summary: SUMMARY }, global: { stubs: STUBS } });
    expect(w.find('.hli__sub').text()).toContain('3 archers');
  });

  it('renders only as many archers as top_archers contains', () => {
    const w = mount(HistoryListItem, { props: { summary: SUFFIX_SUMMARY }, global: { stubs: STUBS } });
    const sub = w.find('.hli__sub').text();
    expect(sub).toContain('Bob');
    expect(sub).toContain('Alice');
  });

  it('subtext uses · separator between archers', () => {
    const w = mount(HistoryListItem, { props: { summary: SUMMARY }, global: { stubs: STUBS } });
    const sub = w.find('.hli__sub').text();
    expect(sub).toContain('·');
  });

  it('emits tap with the label when clicked', async () => {
    const w = mount(HistoryListItem, { props: { summary: SUMMARY }, global: { stubs: STUBS } });
    await w.find('button').trigger('click');
    expect(w.emitted('tap')?.[0]).toEqual(['2026-05-29']);
  });

  it('has an accessible aria-label mentioning top archers', () => {
    const w = mount(HistoryListItem, { props: { summary: SUMMARY }, global: { stubs: STUBS } });
    const label = w.find('button').attributes('aria-label') ?? '';
    expect(label).toContain('2026-05-29');
    expect(label).toContain('Alice');
    expect(label).toContain('324');
  });
});
