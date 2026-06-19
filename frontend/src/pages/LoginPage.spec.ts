import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import LoginPage from '@/pages/LoginPage.vue';

const mockLoginFn = vi.fn();
let mockIsAuthenticated = false;

vi.mock('@/stores/useAuthStore', () => ({
  useAuthStore: () => ({
    get isAuthenticated() {
      return mockIsAuthenticated;
    },
    loading: false,
    error: null,
    login: mockLoginFn,
    logout: vi.fn()
  })
}));

const quasarStubs = {
  QCard: { template: '<div><slot /></div>' },
  QCardSection: { template: '<div><slot /></div>' },
  // Pass $event through so the parent's @submit.prevent modifier has a real DOM Event to call
  QForm: {
    template: '<form @submit.prevent="$emit(\'submit\', $event)"><slot /></form>',
    emits: ['submit']
  },
  QInput: {
    props: ['modelValue', 'label', 'type', 'disable'],
    emits: ['update:modelValue'],
    template:
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />'
  },
  QBtn: {
    props: ['loading', 'type', 'label'],
    template: '<button :type="type ?? \'button\'"><slot>{{ label }}</slot></button>'
  }
};

function makeRouter() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/login', component: LoginPage },
      { path: '/', component: { template: '<div />' } },
      { path: '/archery', component: { template: '<div />' } }
    ]
  });
  return router;
}

beforeEach(() => {
  setActivePinia(createPinia());
  mockIsAuthenticated = false;
  vi.clearAllMocks();
});

describe('LoginPage', () => {
  it('calls authStore.login with form field values on submit', async () => {
    mockLoginFn.mockResolvedValue(undefined);
    const router = makeRouter();
    await router.push('/login');
    await router.isReady();
    const wrapper = mount(LoginPage, { global: { plugins: [router], stubs: quasarStubs } });
    const inputs = wrapper.findAll('input');
    await inputs[0].setValue('alice');
    await inputs[1].setValue('secret');
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(mockLoginFn).toHaveBeenCalledWith('alice', 'secret');
  });

  it('redirects to / after successful login with no redirect param', async () => {
    mockLoginFn.mockImplementation(async () => {
      mockIsAuthenticated = true;
    });
    const router = makeRouter();
    await router.push('/login');
    await router.isReady();
    const wrapper = mount(LoginPage, { global: { plugins: [router], stubs: quasarStubs } });
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('redirects to query.redirect after successful login', async () => {
    mockLoginFn.mockImplementation(async () => {
      mockIsAuthenticated = true;
    });
    const router = makeRouter();
    await router.push({ path: '/login', query: { redirect: '/archery' } });
    await router.isReady();
    const wrapper = mount(LoginPage, { global: { plugins: [router], stubs: quasarStubs } });
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/archery');
  });

  it('rejects external redirect URLs and falls back to /', async () => {
    mockLoginFn.mockImplementation(async () => {
      mockIsAuthenticated = true;
    });
    const router = makeRouter();
    await router.push({ path: '/login', query: { redirect: 'https://evil.example.com' } });
    await router.isReady();
    const wrapper = mount(LoginPage, { global: { plugins: [router], stubs: quasarStubs } });
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('rejects protocol-relative redirect URLs and falls back to /', async () => {
    mockLoginFn.mockImplementation(async () => {
      mockIsAuthenticated = true;
    });
    const router = makeRouter();
    await router.push({ path: '/login', query: { redirect: '//evil.example.com' } });
    await router.isReady();
    const wrapper = mount(LoginPage, { global: { plugins: [router], stubs: quasarStubs } });
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/');
  });

  it('stays on /login when login fails', async () => {
    mockLoginFn.mockResolvedValue(undefined); // isAuthenticated stays false
    const router = makeRouter();
    await router.push('/login');
    await router.isReady();
    const wrapper = mount(LoginPage, { global: { plugins: [router], stubs: quasarStubs } });
    await wrapper.find('form').trigger('submit');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/login');
  });
});
