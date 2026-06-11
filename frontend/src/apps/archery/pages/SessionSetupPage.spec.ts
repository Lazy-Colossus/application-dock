import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import SessionSetupPage from './SessionSetupPage.vue';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';
import { useRecurringPlayersStore } from '@/apps/archery/stores/useRecurringPlayersStore';

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
  api: { post: vi.fn(), get: vi.fn(), del: vi.fn() }
}));

const focusSpy = vi.fn();

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/archery', component: { template: '<div />' } },
    { path: '/archery/setup', component: SessionSetupPage },
    { path: '/archery/scoring', component: { template: '<div />' } },
    { path: '/archery/players', component: { template: '<div />' } }
  ]
});

const STUBS = {
  'q-page': { template: '<div><slot /></div>' },
  'q-banner': { template: '<div><slot /></div>' },
  'q-btn': {
    template: '<button :disabled="disable" @click="$emit(\'click\')"><slot />{{ label }}</button>',
    props: ['disable', 'loading', 'label', 'flat', 'outline', 'unelevated', 'color', 'noCaps'],
    emits: ['click']
  },
  'q-input': {
    template: '<div><input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" /><div v-if="errorMessage" data-testid="input-error">{{ errorMessage }}</div></div>',
    props: ['modelValue', 'error', 'errorMessage', 'label'],
    emits: ['update:modelValue'],
    methods: {
      focus() { focusSpy(); }
    }
  },
  'ArcherChip': {
    template: '<div class="archer-chip">{{ name }}<button @click="$emit(\'remove\')">x</button></div>',
    props: ['name', 'removable'],
    emits: ['remove']
  }
};

function mountPage(recurringPlayers: string[] = []) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const recurringStore = useRecurringPlayersStore();
  recurringStore.players = [...recurringPlayers];
  vi.spyOn(recurringStore, 'loadPlayers').mockResolvedValue(undefined);
  return mount(SessionSetupPage, {
    global: { plugins: [pinia, router], stubs: STUBS }
  });
}

describe('SessionSetupPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
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
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="input-error"]').text()).toBe('Archer name is required.');
  });

  it('adds archer to roster and clears input', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftName = 'Alice';
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    expect(store.draftRoster).toContain('alice');
    expect(store.draftName).toBe('');
  });

  it('shows error for duplicate archer name', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    store.draftName = 'Alice';
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="input-error"]').text()).toBe('Archer name is already used.');
    expect(store.draftRoster.length).toBe(1);
  });

  it('shows error for case-variant duplicate archer name', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    store.draftName = 'alice';
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="input-error"]').text()).toBe('Archer name is already used.');
    expect(store.draftRoster.length).toBe(1);
  });

  it('confirm button enabled when roster has archers', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    await wrapper.vm.$nextTick();
    const btn = wrapper.find('[data-testid="confirm-btn"]');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('confirm calls store.createSession', async () => {
    const wrapper = mountPage();
    await flushPromises();
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    store.createSession = vi.fn().mockResolvedValue(undefined);
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="confirm-btn"]').trigger('click');
    expect(store.createSession).toHaveBeenCalled();
  });

  it('keeps focus in the name field after a successful add (Story 8.1)', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftName = 'Alice';
    focusSpy.mockClear();
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(store.draftName).toBe('');
    expect(focusSpy).toHaveBeenCalled();
  });

  it('keeps focus in the name field after a rejected add (Story 8.1)', async () => {
    const wrapper = mountPage();
    const store = useArcherySessionStore();
    store.draftName = '';
    focusSpy.mockClear();
    await wrapper.find('[data-testid="add-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(focusSpy).toHaveBeenCalled();
  });

  it("preloads the session-name input with today's date (Story 6.2)", async () => {
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.vm.$nextTick();
    const today = new Date().toISOString().slice(0, 10);
    const input = wrapper.find('[data-testid="session-name-input"] input');
    expect((input.element as HTMLInputElement).value).toBe(today);
  });
});

describe('SessionSetupPage — recurring player picker (Story 8.4)', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('calls loadPlayers on mount', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const recurringStore = useRecurringPlayersStore();
    const spy = vi.spyOn(recurringStore, 'loadPlayers').mockResolvedValue(undefined);
    mount(SessionSetupPage, { global: { plugins: [pinia, router], stubs: STUBS } });
    await flushPromises();
    expect(spy).toHaveBeenCalled();
  });

  it('picker button is visible', () => {
    const wrapper = mountPage([]);
    expect(wrapper.find('[data-testid="picker-btn"]').exists()).toBe(true);
  });

  it('picker is hidden by default', () => {
    const wrapper = mountPage(['alice']);
    expect(wrapper.find('[data-testid="recurring-picker"]').exists()).toBe(false);
  });

  it('clicking picker button reveals the picker', async () => {
    const wrapper = mountPage(['alice']);
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="recurring-picker"]').exists()).toBe(true);
  });

  it('picker lists only players not already in the roster (AC 2)', async () => {
    const wrapper = mountPage(['alice', 'bob', 'cara']);
    const store = useArcherySessionStore();
    store.draftRoster = ['bob'];
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    const options = wrapper.findAll('[data-testid="recurring-player-option"]');
    expect(options.length).toBe(2);
    const names = options.map((o) => o.text());
    expect(names).toContain('alice');
    expect(names).toContain('cara');
    expect(names).not.toContain('bob');
  });

  it('selecting a player adds them to the roster (AC 3)', async () => {
    const wrapper = mountPage(['alice', 'bob']);
    const store = useArcherySessionStore();
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    const options = wrapper.findAll('[data-testid="recurring-player-option"]');
    await options[0].trigger('click');
    expect(store.draftRoster).toContain('alice');
  });

  it('selecting a player closes the picker (AC 3)', async () => {
    const wrapper = mountPage(['alice']);
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="recurring-player-option"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="recurring-picker"]').exists()).toBe(false);
  });

  it('already-rostered player cannot be re-added via picker (AC 4)', async () => {
    const wrapper = mountPage(['alice']);
    const store = useArcherySessionStore();
    store.draftRoster = ['alice'];
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('[data-testid="recurring-player-option"]').length).toBe(0);
  });

  it('case-variant of a rostered player is filtered from the picker', async () => {
    const wrapper = mountPage(['alice']);
    const store = useArcherySessionStore();
    store.draftRoster = ['Alice'];
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.findAll('[data-testid="recurring-player-option"]').length).toBe(0);
  });

  it('shows empty state pointing to management when no recurring players exist (AC 5)', async () => {
    await router.isReady();
    const wrapper = mountPage([]);
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="picker-empty-state"]').exists()).toBe(true);
    const link = wrapper.find('[data-testid="picker-manage-link"]');
    expect(link.exists()).toBe(true);
    expect(link.attributes('href')).toBe('/archery/players');
  });

  it('shows all-rostered message when all recurring players are already in the roster', async () => {
    const wrapper = mountPage(['alice', 'bob']);
    const store = useArcherySessionStore();
    store.draftRoster = ['alice', 'bob'];
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="picker-all-rostered"]').exists()).toBe(true);
    expect(wrapper.findAll('[data-testid="recurring-player-option"]').length).toBe(0);
  });

  it('picked player is excluded when picker is re-opened (AC 4)', async () => {
    const wrapper = mountPage(['alice', 'bob']);
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.findAll('[data-testid="recurring-player-option"]')[0].trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.find('[data-testid="picker-btn"]').trigger('click');
    await wrapper.vm.$nextTick();
    const options = wrapper.findAll('[data-testid="recurring-player-option"]');
    expect(options.length).toBe(1);
    expect(options[0].text()).toBe('bob');
  });
});
