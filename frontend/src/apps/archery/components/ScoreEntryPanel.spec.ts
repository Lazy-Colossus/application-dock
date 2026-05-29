import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ScoreEntryPanel from './ScoreEntryPanel.vue';
import { useArcherySessionStore } from '@/apps/archery/stores/useArcherySessionStore';

vi.mock('@/composables/useApi', () => ({
  ApiError: class extends Error {},
  api: { post: vi.fn(), put: vi.fn() }
}));

import type { SessionData } from '@/apps/archery/types';

const SESSION: SessionData = {
  label: '2026-05-29',
  name: '2026-05-29',
  date: '2026-05-29',
  created: '2026-05-29T10:00:00Z',
  status: 'in_progress',
  archers: ['Alice', 'Bob'],
  targets: []
};

const SHOT_STUBS = {
  ShotButton: {
    template:
      '<button class="shot-btn" :data-value="value" :disabled="disabled" @click="$emit(\'tap\', value)">{{ value }}</button>',
    props: ['value', 'disabled'],
    emits: ['tap']
  },
  'q-bottom-sheet': { template: '<div><slot /></div>' },
  'q-dialog': { template: '<div v-if="modelValue"><slot /></div>', props: ['modelValue'] },
  'q-btn': {
    template: '<button :disabled="disable" @click="$emit(\'click\')">{{ label }}<slot /></button>',
    props: ['disable', 'label', 'flat', 'unelevated'],
    emits: ['click']
  }
};

function mountPanel(session = SESSION, open = true, targetNumber = 1) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useArcherySessionStore();
  store.session = { ...session };
  store.activeTargetNumber = targetNumber;
  store.scoreEntryOpen = open;

  return { wrapper: mount(ScoreEntryPanel, { global: { plugins: [pinia], stubs: SHOT_STUBS } }), store };
}

function shotBtnByValue(wrapper: ReturnType<typeof mount>, v: number) {
  return wrapper.findAll('.shot-btn').find((b) => b.attributes('data-value') === String(v))!;
}

describe('ScoreEntryPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it('shows target number in title', () => {
    const { wrapper } = mountPanel();
    expect(wrapper.text()).toContain('Target 1');
  });

  it('starts on archer 0, shot 1', () => {
    const { wrapper } = mountPanel();
    expect(wrapper.text()).toContain('Alice');
    expect(wrapper.text()).toContain('Shot 1 of 2');
  });

  it('tapping shot value 5 fills shot 1 and advances to shot 2', async () => {
    const { wrapper } = mountPanel();
    await shotBtnByValue(wrapper, 5).trigger('click');
    expect(wrapper.text()).toContain('Shot 2 of 2');
  });

  it('tapping shot 1 then shot 2 advances to next archer', async () => {
    const { wrapper } = mountPanel();
    await shotBtnByValue(wrapper, 8).trigger('click');
    await shotBtnByValue(wrapper, 10).trigger('click');
    expect(wrapper.text()).toContain('Bob');
    expect(wrapper.text()).toContain('Shot 1 of 2');
  });

  it('confirm button is always enabled (Story 7.3)', () => {
    const { wrapper } = mountPanel();
    const confirmBtn = wrapper.find('[data-testid="confirm-btn"]');
    expect(confirmBtn.attributes('disabled')).toBeUndefined();
  });

  it('confirm with a fully entered target saves it confirmed', async () => {
    const { wrapper, store } = mountPanel();
    const saveSpy = vi.spyOn(store, 'saveTarget');
    const closeSpy = vi.spyOn(store, 'closeTarget');

    await shotBtnByValue(wrapper, 5).trigger('click'); // Alice shot 1
    await shotBtnByValue(wrapper, 8).trigger('click'); // Alice shot 2 → advance to Bob
    await shotBtnByValue(wrapper, 10).trigger('click'); // Bob shot 1
    await shotBtnByValue(wrapper, 11).trigger('click'); // Bob shot 2

    await wrapper.find('[data-testid="confirm-btn"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(saveSpy).toHaveBeenCalledWith({
      number: 1,
      scores: { Alice: [5, 8], Bob: [10, 11] },
      confirmed: true
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('confirm zero-fills unentered shots and marks confirmed (Story 7.3)', async () => {
    const { wrapper, store } = mountPanel();
    const saveSpy = vi.spyOn(store, 'saveTarget');

    // Enter only Alice's first shot; leave the rest blank.
    await shotBtnByValue(wrapper, 11).trigger('click');

    await wrapper.find('[data-testid="confirm-btn"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(saveSpy).toHaveBeenCalledWith({
      number: 1,
      scores: { Alice: [11, 0], Bob: [0, 0] },
      confirmed: true
    });
  });

  it('tapping an archer chip jumps to that archer (Story 7.4)', async () => {
    const { wrapper } = mountPanel();
    const chips = wrapper.findAll('[data-testid="archer-chip"]');
    await chips[1].trigger('click'); // Bob
    expect(wrapper.find('.sep__archer-name').text()).toBe('Bob');
  });

  it('tapping a shot slot then a value writes that slot (Story 7.4)', async () => {
    const { wrapper } = mountPanel();
    // Use the last archer so the post-shot auto-advance doesn't move off them.
    await wrapper.findAll('[data-testid="archer-chip"]')[1].trigger('click'); // Bob
    await wrapper.find('[data-testid="slot-1"]').trigger('click'); // select shot 2
    await shotBtnByValue(wrapper, 8).trigger('click');
    expect(wrapper.find('.sep__archer-name').text()).toBe('Bob');
    expect(wrapper.find('[data-testid="slot-1"]').text()).toContain('8');
    expect(wrapper.find('[data-testid="slot-0"]').text().trim()).toBe('');
  });

  it('has no back-to-name link (Story 7.4)', async () => {
    const { wrapper } = mountPanel();
    await shotBtnByValue(wrapper, 5).trigger('click');
    expect(wrapper.find('.sep__back-link').exists()).toBe(false);
  });

  it('pre-populates from existing confirmed target', () => {
    const sessionWithTarget = {
      ...SESSION,
      targets: [{ number: 1, scores: { Alice: [10, 8] as [number, number], Bob: [5, 11] as [number, number] } }]
    };
    const { wrapper } = mountPanel(sessionWithTarget);
    const slots = wrapper.findAll('.sep__slot');
    // Alice slot 1 = 10, slot 2 = 8 on first render
    expect(slots[0].text()).toContain('10');
    expect(slots[1].text()).toContain('8');
  });

  it('X-close saves the partial entry unconfirmed, then closes (Story 7.2)', async () => {
    const { wrapper, store } = mountPanel();
    const saveSpy = vi.spyOn(store, 'saveTarget');
    const closeSpy = vi.spyOn(store, 'closeTarget');

    await shotBtnByValue(wrapper, 5).trigger('click'); // Alice shot 1 = 5
    await wrapper.find('[data-testid="close-btn"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(saveSpy).toHaveBeenCalledWith({
      number: 1,
      scores: { Alice: [5, null], Bob: [null, null] },
      confirmed: false
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('X-close with nothing entered just closes without saving (Story 7.2)', async () => {
    const { wrapper, store } = mountPanel();
    const saveSpy = vi.spyOn(store, 'saveTarget');
    const closeSpy = vi.spyOn(store, 'closeTarget');

    await wrapper.find('[data-testid="close-btn"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(saveSpy).not.toHaveBeenCalled();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('has no discard guard dialog (Story 7.2)', async () => {
    const { wrapper } = mountPanel();
    await shotBtnByValue(wrapper, 5).trigger('click');
    await wrapper.find('[data-testid="close-btn"]').trigger('click');
    expect(wrapper.find('[data-testid="discard-confirm-btn"]').exists()).toBe(false);
  });
});
