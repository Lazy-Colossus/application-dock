import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ShotButton from './ShotButton.vue';

function mountBtn(value: 0 | 5 | 8 | 10 | 11, disabled = false) {
  return mount(ShotButton, { props: { value, disabled } });
}

describe('ShotButton', () => {
  it('renders the value', () => {
    expect(mountBtn(8).text()).toContain('8');
  });

  it('0/5/8 use surface-card class (no v10/v11 modifier)', () => {
    for (const v of [0, 5, 8] as const) {
      const w = mountBtn(v);
      expect(w.find('button').classes()).not.toContain('shot-button--v10');
      expect(w.find('button').classes()).not.toContain('shot-button--v11');
    }
  });

  it('10 has v10 modifier class', () => {
    expect(mountBtn(10).find('button').classes()).toContain('shot-button--v10');
  });

  it('11 has v11 (accent) modifier class', () => {
    expect(mountBtn(11).find('button').classes()).toContain('shot-button--v11');
  });

  it('emits tap with the correct value on click', async () => {
    const w = mountBtn(5);
    await w.find('button').trigger('click');
    expect(w.emitted('tap')).toEqual([[5]]);
  });

  it('aria-label for non-11 values', () => {
    expect(mountBtn(8).find('button').attributes('aria-label')).toBe('Shot value 8');
  });

  it('aria-label for 11 includes bullseye', () => {
    expect(mountBtn(11).find('button').attributes('aria-label')).toBe('Shot value 11, bullseye');
  });

  it('disabled button does not emit on click', async () => {
    const w = mountBtn(5, true);
    await w.find('button').trigger('click');
    // disabled native button won't fire click in happy-dom — no emits
    expect(w.emitted('tap') ?? []).toHaveLength(0);
  });
});
