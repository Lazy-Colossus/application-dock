import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import RecurringPlayersPage from './RecurringPlayersPage.vue';
import { useRecurringPlayersStore } from '@/apps/archery/stores/useRecurringPlayersStore';

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
  api: { get: vi.fn(), post: vi.fn(), del: vi.fn() }
}));

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/archery/players', component: RecurringPlayersPage },
    { path: '/archery', component: { template: '<div />' } }
  ]
});

const STUBS = {
  'q-page': { template: '<div><slot /></div>' },
  'q-banner': { template: '<div><slot /></div>' },
  'q-btn': {
    template: '<button :disabled="disable || loading" @click="$emit(\'click\')">{{ label }}</button>',
    props: ['disable', 'loading', 'label', 'flat', 'outline', 'unelevated', 'color', 'round', 'dense', 'size', 'icon', 'noCaps'],
    emits: ['click']
  },
  'q-input': {
    template: '<div><input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><div v-if="errorMessage" data-testid="input-error">{{ errorMessage }}</div></div>',
    props: ['modelValue', 'error', 'errorMessage', 'label', 'outlined', 'dense'],
    emits: ['update:modelValue']
  },
  'ArcherChip': {
    template: '<div class="archer-chip" :data-name="name">{{ name }}<button @click="$emit(\'remove\')" data-testid="remove-btn">x</button></div>',
    props: ['name', 'removable'],
    emits: ['remove']
  }
};

function mountPage(initialPlayers: string[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useRecurringPlayersStore();
  store.players = [...initialPlayers];
  vi.spyOn(store, 'loadPlayers').mockResolvedValue(undefined);
  vi.spyOn(store, 'addPlayer').mockResolvedValue(undefined);
  vi.spyOn(store, 'removePlayer').mockResolvedValue(undefined);
  const wrapper = mount(RecurringPlayersPage, {
    global: { plugins: [pinia, router], stubs: STUBS }
  });
  return { wrapper, store };
}

describe('RecurringPlayersPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('calls loadPlayers on mount', async () => {
    const { store } = mountPage();
    await flushPromises();
    expect(store.loadPlayers).toHaveBeenCalled();
  });

  it('shows empty state when no players exist', () => {
    const { wrapper } = mountPage([]);
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true);
  });

  it('lists players when they exist', () => {
    const { wrapper } = mountPage(['Alice', 'Bob']);
    const chips = wrapper.findAll('.archer-chip');
    expect(chips.length).toBe(2);
    expect(chips[0].text()).toContain('Alice');
    expect(chips[1].text()).toContain('Bob');
  });

  it('hides empty state when players are present', () => {
    const { wrapper } = mountPage(['Alice']);
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false);
  });

  it('shows error when adding empty name', async () => {
    const { wrapper } = mountPage();
    // Leave input empty, click Add
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="input-error"]').text()).toBeTruthy();
  });

  it('calls store.addPlayer when a valid name is entered', async () => {
    const { wrapper, store } = mountPage();
    const input = wrapper.find('input');
    await input.setValue('Alice');
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    await flushPromises();
    expect(store.addPlayer).toHaveBeenCalledWith('alice');
  });

  it('clears input after successful add', async () => {
    const { wrapper } = mountPage();
    const input = wrapper.find('input');
    await input.setValue('Alice');
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('shows error for duplicate player name (same case)', async () => {
    const { wrapper } = mountPage(['alice']);
    const input = wrapper.find('input');
    await input.setValue('alice');
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="input-error"]').text()).toBeTruthy();
  });

  it('shows error for duplicate player name (different case)', async () => {
    const { wrapper } = mountPage(['alice']);
    const input = wrapper.find('input');
    await input.setValue('Alice');
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="input-error"]').text()).toBeTruthy();
  });

  it('does not call addPlayer for duplicates', async () => {
    const { wrapper, store } = mountPage(['alice']);
    const input = wrapper.find('input');
    await input.setValue('Alice');
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    expect(store.addPlayer).not.toHaveBeenCalled();
  });

  it('calls store.removePlayer when remove is triggered', async () => {
    const { wrapper, store } = mountPage(['alice']);
    const removeBtn = wrapper.find('[data-testid="remove-btn"]');
    await removeBtn.trigger('click');
    expect(store.removePlayer).toHaveBeenCalledWith('alice');
  });

  it('shows store error when present', async () => {
    const { wrapper, store } = mountPage();
    store.error = 'Failed to load';
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="error-banner"]').exists()).toBe(true);
  });
});
