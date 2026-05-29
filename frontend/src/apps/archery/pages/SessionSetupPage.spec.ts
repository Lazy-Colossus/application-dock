import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import SessionSetupPage from './SessionSetupPage.vue';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';

vi.mock('@/composables/useApi', () => ({
  ApiError: class extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(`${status}: ${detail}`);
      this.status = status;
      this.detail = detail;
    }
  },
  api: { post: vi.fn(), get: vi.fn() }
}));

import { api } from '@/composables/useApi';

const focusSpy = vi.fn();

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/archery', component: { template: '<div />' } },
    { path: '/archery/setup', component: SessionSetupPage },
    { path: '/archery/scoring', component: { template: '<div />' } }
  ]
});

function mountPage() {
  return mount(SessionSetupPage, {
    global: {
      plugins: [createPinia(), router],
      stubs: {
        'q-page': { template: '<div><slot /></div>' },
        'q-banner': { template: '<div><slot /></div>' },
        'q-btn': {
          template: '<button :disabled="disable" @click="$emit(\'click\')"><slot /></button>',
          props: ['disable', 'loading'],
          emits: ['click']
        },
        'q-input': {
          template: '<div><input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><div v-if="errorMessage" data-testid="input-error">{{ errorMessage }}</div></div>',
          props: ['modelValue', 'error', 'errorMessage', 'label'],
          emits: ['update:modelValue'],
          methods: {
            focus() {
              focusSpy();
            }
          }
        },
        'ArcherChip': {
          template: '<div class="archer-chip">{{ name }}<button @click="$emit(\'remove\')">x</button></div>',
          props: ['name', 'removable'],
          emits: ['remove']
        }
      }
    }
  });
}

describe('SessionSetupPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // Default: no in-progress session on the server (404)
    const err = Object.assign(new Error('404'), { status: 404 });
    vi.mocked(api.get).mockRejectedValue(err);
  });

  it('shows empty state when roster is empty', () => {
    const wrapper = mountPage();
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true);
  });

  it('confirm button is disabled when roster is empty', () => {
    const wrapper = mountPage();
    const btn = wrapper.find('[data-testid="confirm-btn"]');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('shows error when adding empty name', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftName = '';
    // Find add button (second button in the row)
    const addBtn = wrapper.findAll('button')[0];
    await addBtn.trigger('click');
    expect(wrapper.find('[data-testid="input-error"]').text()).toBe('Archer name is required.');
  });

  it('adds archer to roster and clears input', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftName = 'Alice';
    const addBtn = wrapper.findAll('button')[0];
    await addBtn.trigger('click');
    expect(store.draftRoster).toContain('Alice');
    expect(store.draftName).toBe('');
  });

  it('shows error for duplicate archer name', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    store.draftName = 'Alice';
    const addBtn = wrapper.findAll('button')[0];
    await addBtn.trigger('click');
    expect(wrapper.find('[data-testid="input-error"]').text()).toBe('Archer name is already used.');
    expect(store.draftRoster.length).toBe(1);
  });

  it('confirm button enabled when roster has archers', async () => {
    const wrapper = mountPage();
    await flushPromises(); // wait for onMounted checkInProgress to settle
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    await wrapper.vm.$nextTick();
    const btn = wrapper.find('[data-testid="confirm-btn"]');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('confirm calls store.createSession', async () => {
    const wrapper = mountPage();
    await flushPromises(); // wait for onMounted to settle
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    store.createSession = vi.fn().mockResolvedValue(undefined);
    await wrapper.vm.$nextTick();
    const confirmBtn = wrapper.find('[data-testid="confirm-btn"]');
    await confirmBtn.trigger('click');
    expect(store.createSession).toHaveBeenCalled();
  });

  it('keeps focus in the name field after a successful add (Story 8.1)', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftName = 'Alice';
    focusSpy.mockClear();
    await wrapper.findAll('button')[0].trigger('click');
    await wrapper.vm.$nextTick();
    expect(store.draftName).toBe('');
    expect(focusSpy).toHaveBeenCalled();
  });

  it('keeps focus in the name field after a rejected add (Story 8.1)', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftName = '';
    focusSpy.mockClear();
    await wrapper.findAll('button')[0].trigger('click');
    await wrapper.vm.$nextTick();
    expect(focusSpy).toHaveBeenCalled();
  });

  it('preloads the session-name input with today’s date (Story 6.2)', async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.vm.$nextTick();
    const today = new Date().toISOString().slice(0, 10);
    const input = wrapper.find('[data-testid="session-name-input"] input');
    expect((input.element as HTMLInputElement).value).toBe(today);
  });
});
