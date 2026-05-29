import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TargetIcon from './TargetIcon.vue';

function mountIcon(props: { number: number; confirmed: boolean }) {
  return mount(TargetIcon, { props });
}

describe('TargetIcon', () => {
  it('renders the target number', () => {
    const w = mountIcon({ number: 7, confirmed: false });
    expect(w.text()).toContain('7');
  });

  it('unconfirmed: no confirmed class', () => {
    const w = mountIcon({ number: 1, confirmed: false });
    expect(w.find('button').classes()).not.toContain('target-icon--confirmed');
  });

  it('confirmed: has confirmed class', () => {
    const w = mountIcon({ number: 1, confirmed: true });
    expect(w.find('button').classes()).toContain('target-icon--confirmed');
  });

  it('emits tap with the target number on click', async () => {
    const w = mountIcon({ number: 5, confirmed: false });
    await w.find('button').trigger('click');
    expect(w.emitted('tap')).toEqual([[5]]);
  });

  it('aria-label unconfirmed', () => {
    const w = mountIcon({ number: 3, confirmed: false });
    expect(w.find('button').attributes('aria-label')).toBe('Target 3, not confirmed');
  });

  it('aria-label confirmed', () => {
    const w = mountIcon({ number: 3, confirmed: true });
    expect(w.find('button').attributes('aria-label')).toBe('Target 3, confirmed');
  });

  it('is a button element', () => {
    const w = mountIcon({ number: 1, confirmed: false });
    expect(w.find('button').exists()).toBe(true);
  });
});
