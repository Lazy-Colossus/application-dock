import { describe, expect, it } from 'vitest';
import { mount, RouterLinkStub } from '@vue/test-utils';

import AppCard from '@/components/AppCard.vue';
import type { AppDescriptor } from '@/apps/registry';

const sample: AppDescriptor = {
  id: 'archery',
  label: 'Archery Score Counter',
  icon: 'sports_score',
  route: '/archery'
};

describe('AppCard', () => {
  it('renders the descriptor label', () => {
    const wrapper = mount(AppCard, {
      props: { descriptor: sample },
      global: { stubs: { RouterLink: RouterLinkStub } }
    });
    expect(wrapper.text()).toContain('Archery Score Counter');
  });

  it('points at the descriptor route', () => {
    const wrapper = mount(AppCard, {
      props: { descriptor: sample },
      global: { stubs: { RouterLink: RouterLinkStub } }
    });
    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.props('to')).toBe('/archery');
  });

  it('exposes an aria-label naming the app', () => {
    const wrapper = mount(AppCard, {
      props: { descriptor: sample },
      global: { stubs: { RouterLink: RouterLinkStub } }
    });
    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.attributes('aria-label')).toBe('Open Archery Score Counter');
  });
});
