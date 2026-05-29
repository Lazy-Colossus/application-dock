import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import HistoryPage from './HistoryPage.vue';
import { useArcheryHistoryStore } from '@/apps/archery/stores/useArcheryHistoryStore';
import type { SessionSummary } from '@/apps/archery/types';

vi.mock('@/composables/useApi', () => ({
  api: { get: vi.fn() }
}));

import { api } from '@/composables/useApi';

const SUMMARIES: SessionSummary[] = [
  { label: '2026-05-29', archer_count: 2, winner: 'Alice', winning_score: 324 },
  { label: '2026-05-28', archer_count: 3, winner: 'Bob', winning_score: 200 }
];

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/archery/history', component: HistoryPage },
    { path: '/archery/history/:label', component: { template: '<div />' } }
  ]
});

const STUBS = {
  'q-page': { template: '<div><slot /></div>' },
  'q-banner': { template: '<div class="q-banner"><slot /><slot name="action" /></div>' },
  'q-btn': {
    template: '<button @click="$emit(\'click\')">{{ label }}</button>',
    props: ['label'],
    emits: ['click']
  },
  'q-spinner': { template: '<div class="q-spinner" />' },
  HistoryListItem: {
    template: '<div class="hli-stub" @click="$emit(\'tap\', summary.label)">{{ summary.label }}</div>',
    props: ['summary'],
    emits: ['tap']
  }
};

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    wrapper: mount(HistoryPage, { global: { plugins: [pinia, router], stubs: STUBS } }),
    store: useArcheryHistoryStore()
  };
}

describe('HistoryPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // default: loadHistory resolves to empty list so onMounted doesn't blow up
    vi.mocked(api.get).mockResolvedValue([]);
  });

  it('shows spinner while loading', () => {
    const { wrapper, store } = mountPage();
    store.loading = true;
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.find('.q-spinner').exists()).toBe(true);
    });
  });

  it('shows empty state when no summaries', async () => {
    const { wrapper, store } = mountPage();
    store.loading = false;
    store.summaries = [];
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('No sessions yet');
  });

  it('renders one HistoryListItem per summary', async () => {
    const { wrapper, store } = mountPage();
    store.loading = false;
    store.summaries = SUMMARIES;
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.hli-stub').length).toBe(2);
  });

  it('tapping an item navigates to detail route', async () => {
    const { wrapper, store } = mountPage();
    store.loading = false;
    store.summaries = SUMMARIES;
    await wrapper.vm.$nextTick();
    const pushSpy = vi.spyOn(router, 'push');
    await wrapper.findAll('.hli-stub')[0].trigger('click');
    expect(pushSpy).toHaveBeenCalledWith('/archery/history/2026-05-29');
  });

  it('shows error banner with retry button on error', async () => {
    const { wrapper, store } = mountPage();
    store.loading = false;
    store.error = 'boom';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('.q-banner').exists()).toBe(true);
    expect(wrapper.text()).toContain("Couldn't load history");
  });
});
