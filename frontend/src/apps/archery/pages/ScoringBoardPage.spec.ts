import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ScoringBoardPage from './ScoringBoardPage.vue';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';

vi.mock('@/composables/useApi', () => ({
  ApiError: class extends Error {},
  api: { post: vi.fn() }
}));

const SESSION = {
  label: '2026-05-29',
  name: '2026-05-29',
  date: '2026-05-29',
  created: '2026-05-29T10:00:00Z',
  status: 'in_progress' as const,
  archers: ['Alice', 'Bob'],
  targets: [
    { number: 1, scores: { Alice: [10, 8] as [number, number], Bob: [8, 5] as [number, number] } },
    { number: 5, scores: { Alice: [5, 0] as [number, number], Bob: [10, 11] as [number, number] } }
  ]
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/archery', component: { template: '<div />' } },
    { path: '/archery/scoring', component: ScoringBoardPage }
  ]
});

function mountPage(sessionData: typeof SESSION | null = SESSION) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useArcherySessionStore();
  store.session = sessionData as typeof SESSION;

  return mount(ScoringBoardPage, {
    global: {
      plugins: [pinia, router],
      stubs: {
        'q-page': { template: '<div><slot /></div>' },
        'q-btn': { template: '<button @click="$emit(\'click\')"><slot /></button>', emits: ['click'] },
        'q-bottom-sheet': { template: '<div><slot /></div>' },
        'TargetIcon': {
          template: '<button class="target-icon-stub" :data-confirmed="confirmed" @click="$emit(\'tap\', number)">{{ number }}</button>',
          props: ['number', 'confirmed'],
          emits: ['tap']
        },
        'ArcherChip': {
          template: '<div class="archer-chip-stub">{{ name }}</div>',
          props: ['name', 'removable']
        },
        'ScoreEntryPanel': { template: '<div class="score-panel-stub" />' }
      }
    }
  });
}

describe('ScoringBoardPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders 18 target icons', () => {
    const w = mountPage();
    expect(w.findAll('.target-icon-stub').length).toBe(18);
  });

  it('targets 1 and 5 are confirmed, others are not', () => {
    const w = mountPage();
    const icons = w.findAll('.target-icon-stub');
    // icons[0] = target 1 (confirmed), icons[4] = target 5 (confirmed)
    expect(icons[0].attributes('data-confirmed')).toBe('true');
    expect(icons[4].attributes('data-confirmed')).toBe('true');
    expect(icons[1].attributes('data-confirmed')).toBe('false');
    expect(icons[2].attributes('data-confirmed')).toBe('false');
  });

  it('subtitle shows confirmed count', () => {
    const w = mountPage();
    expect(w.text()).toContain('2 of 18 confirmed');
  });

  it('tapping a target calls store.openTarget', async () => {
    const w = mountPage();
    const store = useArcherySessionStore();
    const spy = vi.spyOn(store, 'openTarget');
    await w.findAll('.target-icon-stub')[2].trigger('click');
    expect(spy).toHaveBeenCalledWith(3);
  });

  it('redirects to /archery when session is null', async () => {
    const pushSpy = vi.spyOn(router, 'replace');
    mountPage(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(pushSpy).toHaveBeenCalledWith('/archery');
  });

  it('renders archer chips for each archer', () => {
    const w = mountPage();
    const chips = w.findAll('.archer-chip-stub');
    expect(chips.length).toBe(2);
    expect(chips[0].text()).toBe('Alice');
    expect(chips[1].text()).toBe('Bob');
  });
});
