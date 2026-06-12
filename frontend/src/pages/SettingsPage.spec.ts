import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import SettingsPage from '@/pages/SettingsPage.vue';

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
  api: { get: vi.fn(), post: vi.fn() },
}));

vi.mock('quasar', () => ({
  Notify: { create: vi.fn() },
}));

import { api } from '@/composables/useApi';
import { Notify } from 'quasar';

const STUBS = {
  'q-page': { template: '<div><slot /></div>' },
  'q-btn': {
    template: '<button :disabled="disable || undefined" @click="$emit(\'click\')">{{ label }}</button>',
    props: ['label', 'disable', 'color', 'unelevated', 'noCaps', 'flat'],
    emits: ['click'],
  },
  'q-dialog': {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ['modelValue'],
    emits: ['update:modelValue'],
  },
  'q-card': { template: '<div><slot /></div>' },
  'q-card-section': { template: '<div><slot /></div>' },
  'q-card-actions': { template: '<div><slot /></div>' },
  'q-tooltip': { template: '<span />' },
};

function mountPage() {
  return mount(SettingsPage, { global: { stubs: STUBS } });
}

async function mountResolved(available: boolean) {
  vi.mocked(api.get).mockResolvedValue({ available });
  const wrapper = mountPage();
  await nextTick();
  await nextTick();
  return wrapper;
}

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows disabled button with "Update not available" when API returns available:false', async () => {
    const wrapper = await mountResolved(false);
    const btn = wrapper.find('[data-testid="update-btn"]');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain('Update not available');
    expect(btn.attributes('disabled')).toBeDefined();
  });

  it('shows enabled button with "Update applications" when API returns available:true', async () => {
    const wrapper = await mountResolved(true);
    const btn = wrapper.find('[data-testid="update-btn"]');
    expect(btn.text()).toContain('Update applications');
    expect(btn.attributes('disabled')).toBeUndefined();
  });

  it('clicking the enabled button opens the confirm dialog', async () => {
    const wrapper = await mountResolved(true);
    await wrapper.find('[data-testid="update-btn"]').trigger('click');
    await nextTick();
    expect(wrapper.find('[data-testid="confirm-btn"]').exists()).toBe(true);
  });

  it('confirming triggers POST, shows Notify, and disables button', async () => {
    vi.mocked(api.post).mockResolvedValue({ detail: 'Update started' });
    const wrapper = await mountResolved(true);
    await wrapper.find('[data-testid="update-btn"]').trigger('click');
    await nextTick();
    await wrapper.find('[data-testid="confirm-btn"]').trigger('click');
    await nextTick();
    await nextTick();
    expect(vi.mocked(api.post)).toHaveBeenCalledWith('/shell/update');
    expect(vi.mocked(Notify.create)).toHaveBeenCalled();
    expect(wrapper.find('[data-testid="update-btn"]').attributes('disabled')).toBeDefined();
  });
});
