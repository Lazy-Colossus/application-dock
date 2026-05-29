import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import ArcheryHomePage from './ArcheryHomePage.vue';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import type { InProgressSummary } from '@/apps/archery/types';

vi.mock('@/composables/useApi', () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn(), del: vi.fn(), post: vi.fn(), put: vi.fn() }
}));

const TODAY = new Date().toISOString().slice(0, 10);

function summary(label: string, date = TODAY): InProgressSummary {
  return { label, name: label, date, confirmed_targets: 3 };
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/archery', component: ArcheryHomePage },
    { path: '/archery/setup', component: { template: '<div />' } },
    { path: '/archery/scoring', component: { template: '<div />' } },
    { path: '/archery/history', component: { template: '<div />' } }
  ]
});

const STUBS = {
  'q-page': { template: '<div><slot /></div>' },
  'q-btn': {
    template: '<button @click="$emit(\'click\')">{{ label }}</button>',
    props: ['disable', 'loading', 'label', 'outline', 'unelevated', 'color', 'flat', 'noCaps'],
    emits: ['click']
  },
  'q-dialog': {
    template: '<div v-if="modelValue" class="q-dialog-stub"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue']
  },
  'q-list': { template: '<div><slot /></div>' },
  'q-item': {
    template: '<div @click="$emit(\'click\')"><slot /></div>',
    props: ['clickable'],
    emits: ['click']
  },
  'q-item-section': { template: '<div><slot /></div>' },
  'q-item-label': { template: '<div><slot /></div>', props: ['caption'] }
};

function mountPage(list: InProgressSummary[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useArcherySessionStore();
  vi.spyOn(store, 'loadInProgress').mockResolvedValue(undefined);
  store.inProgressList = list;
  const wrapper = mount(ArcheryHomePage, { global: { plugins: [pinia, router], stubs: STUBS } });
  return { wrapper, store };
}

describe('ArcheryHomePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('renders New Session and History; Resume hidden when no today sessions', () => {
    const { wrapper } = mountPage([]);
    expect(wrapper.find('[data-testid="new-session-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="history-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="resume-btn"]').exists()).toBe(false);
  });

  it('shows Resume when a session is in progress today', () => {
    const { wrapper } = mountPage([summary('2026-05-29')]);
    expect(wrapper.find('[data-testid="resume-btn"]').exists()).toBe(true);
  });

  it('hides Resume when the only open session is from another day', () => {
    const { wrapper } = mountPage([summary('2026-05-01', '2026-05-01')]);
    expect(wrapper.find('[data-testid="resume-btn"]').exists()).toBe(false);
  });

  it('New Session with no open sessions goes straight to setup', async () => {
    const pushSpy = vi.spyOn(router, 'push');
    const { wrapper } = mountPage([]);
    await wrapper.find('[data-testid="new-session-btn"]').trigger('click');
    expect(pushSpy).toHaveBeenCalledWith('/archery/setup');
  });

  it('New Session with open sessions opens the conflict dialog', async () => {
    const { wrapper } = mountPage([summary('2026-05-29')]);
    await wrapper.find('[data-testid="new-session-btn"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="conflict-leave-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="conflict-delete-btn"]').exists()).toBe(true);
  });

  it('conflict "Leave" navigates to setup without deleting', async () => {
    const pushSpy = vi.spyOn(router, 'push');
    const { wrapper, store } = mountPage([summary('2026-05-29')]);
    const discardSpy = vi.spyOn(store, 'discardAllInProgress').mockResolvedValue(undefined);
    await wrapper.find('[data-testid="new-session-btn"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="conflict-leave-btn"]').trigger('click');
    expect(discardSpy).not.toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledWith('/archery/setup');
  });

  it('conflict "Delete" discards all then navigates to setup', async () => {
    const pushSpy = vi.spyOn(router, 'push');
    const { wrapper, store } = mountPage([summary('2026-05-29')]);
    const discardSpy = vi.spyOn(store, 'discardAllInProgress').mockResolvedValue(undefined);
    await wrapper.find('[data-testid="new-session-btn"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="conflict-delete-btn"]').trigger('click');
    await nextTick();
    expect(discardSpy).toHaveBeenCalled();
    expect(pushSpy).toHaveBeenCalledWith('/archery/setup');
  });

  it('Resume with one of today’s sessions resumes it directly', async () => {
    const pushSpy = vi.spyOn(router, 'push');
    const { wrapper, store } = mountPage([summary('2026-05-29')]);
    const resumeSpy = vi.spyOn(store, 'resumeSession').mockResolvedValue(undefined);
    await wrapper.find('[data-testid="resume-btn"]').trigger('click');
    await nextTick();
    expect(resumeSpy).toHaveBeenCalledWith('2026-05-29');
    expect(pushSpy).toHaveBeenCalledWith('/archery/scoring');
  });

  it('Resume with multiple today sessions opens the picker', async () => {
    const { wrapper } = mountPage([summary('2026-05-29'), summary('2026-05-29-2')]);
    await wrapper.find('[data-testid="resume-btn"]').trigger('click');
    await nextTick();
    const rows = wrapper.findAll('[data-testid="resume-picker-row"]');
    expect(rows.length).toBe(2);
  });
});
