import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ResultsPage from './ResultsPage.vue';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import type { SessionData } from '@/apps/archery/types';

vi.mock('@/composables/useApi', () => ({
  ApiError: class extends Error {
    status: number; detail: string;
    constructor(s: number, d: string) { super(`${s}: ${d}`); this.status = s; this.detail = d; }
  },
  api: { post: vi.fn(), put: vi.fn() }
}));

const SESSION: SessionData = {
  label: '2026-05-29',
  name: '2026-05-29',
  date: '2026-05-29',
  created: '2026-05-29T10:00:00Z',
  status: 'in_progress',
  archers: ['Alice', 'Bob'],
  targets: Array.from({ length: 18 }, (_, i) => ({
    number: i + 1,
    scores: {
      Alice: [10, 8] as [number, number],   // 18 per target → 324 total
      Bob: [5, 11] as [number, number]       // 16 per target → 288 total
    }
  }))
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/archery', component: { template: '<div />' } },
    { path: '/archery/scoring', component: { template: '<div />' } },
    { path: '/archery/results', component: ResultsPage }
  ]
});

const STUBS = {
  'q-page': { template: '<div><slot /></div>' },
  'q-banner': { template: '<div><slot /></div>' },
  'q-btn': {
    template: '<button :disabled="disable || loading" @click="$emit(\'click\')">{{ label }}<slot /></button>',
    props: ['disable', 'loading', 'label'],
    emits: ['click']
  },
  'q-dialog': {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue']
  },
  ResultsTable: { template: '<div class="results-table-stub" />', props: ['session'] }
};

function mountPage(session: SessionData | null = SESSION) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useArcherySessionStore();
  store.session = session;
  return {
    wrapper: mount(ResultsPage, { global: { plugins: [pinia, router], stubs: STUBS } }),
    store
  };
}

describe('ResultsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders ranked archers sorted by total descending', () => {
    const { wrapper } = mountPage();
    const rows = wrapper.findAll('.results-page__rank-row');
    expect(rows.length).toBe(2);
    // Alice (324) first, Bob (288) second
    expect(rows[0].text()).toContain('Alice');
    expect(rows[0].text()).toContain('324');
    expect(rows[1].text()).toContain('Bob');
    expect(rows[1].text()).toContain('288');
  });

  it('renders ResultsTable', () => {
    const { wrapper } = mountPage();
    expect(wrapper.find('.results-table-stub').exists()).toBe(true);
  });

  it('shows session label', () => {
    const { wrapper } = mountPage();
    expect(wrapper.find('.results-page__label').text()).toBe('2026-05-29');
  });

  it('finalise button opens confirm dialog', async () => {
    const { wrapper } = mountPage();
    await wrapper.find('[data-testid="finalise-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="finalise-confirm-btn"]').exists()).toBe(true);
  });

  it('confirming finalise calls store.finaliseSession and navigates to /archery', async () => {
    const { wrapper, store } = mountPage();
    const finaliseSpy = vi.spyOn(store, 'finaliseSession').mockResolvedValue(undefined);
    const replaceSpy = vi.spyOn(router, 'replace');

    await wrapper.find('[data-testid="finalise-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="finalise-confirm-btn"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(finaliseSpy).toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(replaceSpy).toHaveBeenCalledWith('/archery');
  });

  it('return to scoring button navigates to /archery/scoring', async () => {
    const { wrapper } = mountPage();
    const pushSpy = vi.spyOn(router, 'push');
    await wrapper.find('[data-testid="return-btn"]').trigger('click');
    expect(pushSpy).toHaveBeenCalledWith('/archery/scoring');
  });

  it('redirects to /archery when session is null', async () => {
    const replaceSpy = vi.spyOn(router, 'replace');
    mountPage(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(replaceSpy).toHaveBeenCalledWith('/archery');
  });

  it('tie-break: alphabetical when totals equal', () => {
    const tied: SessionData = {
      ...SESSION,
      archers: ['Zara', 'Alice'],
      targets: Array.from({ length: 18 }, (_, i) => ({
        number: i + 1,
        scores: { Zara: [5, 5] as [number, number], Alice: [5, 5] as [number, number] }
      }))
    };
    const { wrapper } = mountPage(tied);
    const rows = wrapper.findAll('.results-page__rank-row');
    expect(rows[0].text()).toContain('Alice'); // alphabetically first
    expect(rows[1].text()).toContain('Zara');
  });
});
