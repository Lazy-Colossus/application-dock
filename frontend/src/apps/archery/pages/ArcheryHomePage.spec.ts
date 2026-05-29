import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ArcheryHomePage from './ArcheryHomePage.vue';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import type { SessionData } from '@/apps/archery/types';

vi.mock('@/composables/useApi', () => ({
  ApiError: class extends Error {
    status: number;
    detail: string;
    constructor(s: number, d: string) {
      super(`${s}: ${d}`);
      this.status = s;
      this.detail = d;
    }
  },
  api: { get: vi.fn(), del: vi.fn(), post: vi.fn(), put: vi.fn() }
}));

const SESSION: SessionData = {
  label: '2026-05-29',
  created: '2026-05-29T10:00:00Z',
  status: 'in_progress',
  archers: ['Alice', 'Bob'],
  targets: Array.from({ length: 3 }, (_, i) => ({
    number: i + 1,
    scores: { Alice: [10, 8] as [number, number], Bob: [5, 11] as [number, number] }
  }))
};

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/archery', component: ArcheryHomePage },
    { path: '/archery/setup', component: { template: '<div />' } },
    { path: '/archery/scoring', component: { template: '<div />' } }
  ]
});

const STUBS = {
  'q-page': { template: '<div><slot /></div>' },
  'q-btn': {
    template: '<button :disabled="disable || loading" @click="$emit(\'click\')">{{ label }}</button>',
    props: ['disable', 'loading', 'label', 'outline', 'unelevated', 'color', 'noCaps'],
    emits: ['click']
  },
  'q-bottom-sheet': {
    template: '<div v-if="modelValue" data-testid="resume-sheet"><slot /></div>',
    props: ['modelValue', 'persistent'],
    emits: ['update:modelValue']
  }
};

function mountPage() {
  const pinia = createPinia();
  setActivePinia(pinia);
  return {
    wrapper: mount(ArcheryHomePage, { global: { plugins: [pinia, router], stubs: STUBS } }),
    store: useArcherySessionStore()
  };
}

describe('ArcheryHomePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('shows normal home buttons when no in-progress session', async () => {
    const { wrapper, store } = mountPage();
    vi.spyOn(store, 'checkInProgress').mockResolvedValue(null);
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper.find('[data-testid="new-session-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="history-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="resume-sheet"]').exists()).toBe(false);
  });

  it('shows resume sheet when session exists', async () => {
    const { wrapper, store } = mountPage();
    vi.spyOn(store, 'checkInProgress').mockResolvedValue(SESSION);
    // trigger onMounted manually since spy was set after mount
    await (wrapper.vm as unknown as { $options: { setup: () => void } }).$options;
    // Re-mount with spy in place
    vi.clearAllMocks();
    const pinia2 = createPinia();
    setActivePinia(pinia2);
    const store2 = useArcherySessionStore();
    vi.spyOn(store2, 'checkInProgress').mockResolvedValue(SESSION);
    const wrapper2 = mount(ArcheryHomePage, { global: { plugins: [pinia2, router], stubs: STUBS } });
    await new Promise((r) => setTimeout(r, 0));
    expect(wrapper2.find('[data-testid="resume-sheet"]').exists()).toBe(true);
  });

  it('resume sheet shows label and target count', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useArcherySessionStore();
    vi.spyOn(store, 'checkInProgress').mockResolvedValue(SESSION);
    const wrapper = mount(ArcheryHomePage, { global: { plugins: [pinia, router], stubs: STUBS } });
    await new Promise((r) => setTimeout(r, 0));
    const subLine = wrapper.find('[data-testid="resume-sub-line"]');
    expect(subLine.text()).toContain('2026-05-29');
    expect(subLine.text()).toContain('3 of 18 confirmed');
  });

  it('Resume button calls resumeSession and navigates to /archery/scoring', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useArcherySessionStore();
    vi.spyOn(store, 'checkInProgress').mockResolvedValue(SESSION);
    vi.spyOn(store, 'resumeSession').mockResolvedValue(undefined);
    const pushSpy = vi.spyOn(router, 'push');
    const wrapper = mount(ArcheryHomePage, { global: { plugins: [pinia, router], stubs: STUBS } });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.find('[data-testid="resume-btn"]').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(store.resumeSession).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledWith('/archery/scoring');
  });

  it('Start Fresh button calls discardSession and navigates to /archery/setup', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useArcherySessionStore();
    vi.spyOn(store, 'checkInProgress').mockResolvedValue(SESSION);
    vi.spyOn(store, 'discardSession').mockResolvedValue(undefined);
    const pushSpy = vi.spyOn(router, 'push');
    const wrapper = mount(ArcheryHomePage, { global: { plugins: [pinia, router], stubs: STUBS } });
    await new Promise((r) => setTimeout(r, 0));
    await wrapper.find('[data-testid="start-fresh-btn"]').trigger('click');
    await new Promise((r) => setTimeout(r, 0));
    expect(store.discardSession).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledWith('/archery/setup');
  });
});
