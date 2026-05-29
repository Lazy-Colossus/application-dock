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

  it('confirm button disabled until all shots complete', async () => {
    const { wrapper } = mountPanel();
    const confirmBtn = wrapper.find('[data-testid="confirm-btn"]');
    expect(confirmBtn.attributes('disabled')).toBeDefined();

    // Fill Alice
    await shotBtnByValue(wrapper, 5).trigger('click');
    await shotBtnByValue(wrapper, 8).trigger('click');
    // Still need Bob
    expect(confirmBtn.attributes('disabled')).toBeDefined();

    // Fill Bob
    await shotBtnByValue(wrapper, 10).trigger('click');
    await shotBtnByValue(wrapper, 11).trigger('click');
    expect(confirmBtn.attributes('disabled')).toBeUndefined();
  });

  it('confirm calls saveTarget with correct data and closes panel', async () => {
    const { wrapper, store } = mountPanel();
    const saveSpy = vi.spyOn(store, 'saveTarget');
    const closeSpy = vi.spyOn(store, 'closeTarget');

    await shotBtnByValue(wrapper, 5).trigger('click');  // Alice shot 1
    await shotBtnByValue(wrapper, 8).trigger('click');  // Alice shot 2 → advance to Bob
    await shotBtnByValue(wrapper, 10).trigger('click'); // Bob shot 1
    await shotBtnByValue(wrapper, 11).trigger('click'); // Bob shot 2

    await wrapper.find('[data-testid="confirm-btn"]').trigger('click');
    await wrapper.vm.$nextTick();

    expect(saveSpy).toHaveBeenCalledWith({
      number: 1,
      scores: { Alice: [5, 8], Bob: [10, 11] }
    });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('back link hidden on first archer first shot', () => {
    const { wrapper } = mountPanel();
    expect(wrapper.find('.sep__back-link').exists()).toBe(false);
  });

  it('back link visible after advancing', async () => {
    const { wrapper } = mountPanel();
    await shotBtnByValue(wrapper, 5).trigger('click'); // shot 1 → now on shot 2
    expect(wrapper.find('.sep__back-link').exists()).toBe(true);
  });

  it('back link navigates back preserving values', async () => {
    const { wrapper } = mountPanel();
    await shotBtnByValue(wrapper, 5).trigger('click'); // Alice shot 1 = 5, now shot 2
    await wrapper.find('.sep__back-link').trigger('click'); // back to shot 1
    expect(wrapper.text()).toContain('Shot 1 of 2');
    // Shot 1 slot should still show 5
    const slots = wrapper.findAll('.sep__slot');
    expect(slots[0].text()).toContain('5');
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

  it('close button shows discard dialog when entries present', async () => {
    const { wrapper } = mountPanel();
    await shotBtnByValue(wrapper, 5).trigger('click');
    // Find the X close button (the button with icon="close" label area)
    const closeBtn = wrapper.find('.sep__close');
    await closeBtn.trigger('click');
    expect(wrapper.find('[data-testid="discard-confirm-btn"]').exists()).toBe(true);
  });

  it('discard guard forceClose calls closeTarget', async () => {
    const { wrapper, store } = mountPanel();
    const closeSpy = vi.spyOn(store, 'closeTarget');
    await shotBtnByValue(wrapper, 5).trigger('click');
    await wrapper.find('.sep__close').trigger('click');
    await wrapper.find('[data-testid="discard-confirm-btn"]').trigger('click');
    expect(closeSpy).toHaveBeenCalled();
  });
});
