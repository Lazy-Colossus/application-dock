import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import HistoryDetailPage from './HistoryDetailPage.vue';
import { useArcheryHistoryStore } from '@/apps/archery/stores/useArcheryHistoryStore';
import type { SessionData } from '@/apps/archery/types';

vi.mock('@/composables/useApi', () => ({
  api: { get: vi.fn() }
}));

import { api } from '@/composables/useApi';

const SESSION: SessionData = {
  label: '2026-05-21',
  created: '2026-05-21T10:00:00Z',
  status: 'finalised',
  archers: ['Alice', 'Bob'],
  targets: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    scores: {
      Alice: [10, 8] as [number, number],
      Bob: [5, 11] as [number, number]
    }
  }))
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/archery/history', component: { template: '<div />' } },
    { path: '/archery/history/:label', component: HistoryDetailPage }
  ]
});

const STUBS = {
  'q-page': { template: '<div><slot /></div>' },
  'q-banner': { template: '<div class="q-banner"><slot /></div>' },
  'q-btn': {
    template: '<button @click="$emit(\'click\')">{{ label }}</button>',
    props: ['label'],
    emits: ['click']
  },
  'q-spinner': { template: '<div class="q-spinner" />' },
  ResultsTable: { template: '<div class="results-table-stub" />', props: ['session'] }
};

async function mountAt(label: string) {
  await router.push(`/archery/history/${label}`);
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    wrapper: mount(HistoryDetailPage, { global: { plugins: [pinia, router], stubs: STUBS } }),
    store: useArcheryHistoryStore()
  };
}

describe('HistoryDetailPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(api.get).mockResolvedValue(SESSION);
  });

  it('renders ResultsTable when detail is loaded', async () => {
    const { wrapper, store } = await mountAt('2026-05-21');
    store.detailLoading = false;
    store.detail = SESSION;
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.results-table-stub').exists()).toBe(true);
  });

  it('shows session label formatted', async () => {
    const { wrapper, store } = await mountAt('2026-05-21-2');
    store.detailLoading = false;
    store.detail = { ...SESSION, label: '2026-05-21-2' };
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.history-detail-page__label').text()).toBe('2026-05-21 #2');
  });

  it('shows error banner when detailError is set', async () => {
    const { wrapper, store } = await mountAt('2026-05-21');
    store.detailLoading = false;
    store.detailError = 'Session 2026-05-21 not found.';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.q-banner').exists()).toBe(true);
    expect(wrapper.find('[data-testid="back-btn"]').exists()).toBe(true);
    expect(wrapper.find('.results-table-stub').exists()).toBe(false);
  });

  it('does not render action buttons (read-only)', async () => {
    const { wrapper, store } = await mountAt('2026-05-21');
    store.detailLoading = false;
    store.detail = SESSION;
    await wrapper.vm.$nextTick();
    const text = wrapper.text();
    expect(text).not.toContain('Finalise');
    expect(text).not.toContain('Return to Scoring');
    expect(text).not.toContain('Delete');
    expect(text).not.toContain('Edit');
  });

  it('renders ranked archers sorted by total', async () => {
    const { wrapper, store } = await mountAt('2026-05-21');
    store.detailLoading = false;
    store.detail = SESSION;
    await wrapper.vm.$nextTick();
    const rows = wrapper.findAll('.history-detail-page__rank-row');
    expect(rows[0].text()).toContain('Alice');
    expect(rows[1].text()).toContain('Bob');
  });
});
