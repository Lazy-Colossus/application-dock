import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import MainLayout from '@/layouts/MainLayout.vue';

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/archery', component: { template: '<div />' } },
      { path: '/settings', component: { template: '<div />' } },
    ],
  });
  await router.push(path);
  await router.isReady();
  return mount(MainLayout, { global: { plugins: [router] } });
}

describe('MainLayout toolbar control', () => {
  it('shows Settings button and hides Home button on root route', async () => {
    const wrapper = await mountAt('/');
    expect(wrapper.find('[aria-label="Open settings"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Go to apps home"]').exists()).toBe(false);
  });

  it('shows Home button and hides Settings button on non-root route', async () => {
    const wrapper = await mountAt('/archery');
    expect(wrapper.find('[aria-label="Go to apps home"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Open settings"]').exists()).toBe(false);
  });

  it('shows Home button and hides Settings button on /settings route', async () => {
    const wrapper = await mountAt('/settings');
    expect(wrapper.find('[aria-label="Go to apps home"]').exists()).toBe(true);
    expect(wrapper.find('[aria-label="Open settings"]').exists()).toBe(false);
  });

  it('back arrow absent on root route', async () => {
    const wrapper = await mountAt('/');
    expect(wrapper.find('[aria-label="Go back"]').exists()).toBe(false);
  });

  it('back arrow present on /settings', async () => {
    const wrapper = await mountAt('/settings');
    expect(wrapper.find('[aria-label="Go back"]').exists()).toBe(true);
  });

  it('back arrow present on /archery', async () => {
    const wrapper = await mountAt('/archery');
    expect(wrapper.find('[aria-label="Go back"]').exists()).toBe(true);
  });
});
