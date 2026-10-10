import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, uploadMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  uploadMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: vi.fn(),
    put: vi.fn(),
    del: vi.fn(),
    upload: uploadMock,
  },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import HomePage from "./HomePage.vue";

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
    props: ["label", "color", "unelevated", "noCaps", "icon"],
    emits: ["click"],
  },
  "q-card": {
    template:
      '<div :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\', $event)"><slot /></div>',
    props: ["clickable"],
    emits: ["click"],
  },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-icon": { template: "<i />", props: ["name", "size"] },
  "q-badge": {
    template: '<span :data-testid="$attrs[\'data-testid\']">{{ label }}</span>',
    props: ["label", "color"],
  },
};

function render() {
  return mount(HomePage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  uploadMock.mockReset();
  push.mockReset();
});

describe("PageMage HomePage", () => {
  it("fetches pages on mount", async () => {
    getMock.mockResolvedValue([]);
    render();
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith("/pagemage/pages");
  });

  it("shows the empty state when there are no pages", async () => {
    getMock.mockResolvedValue([]);
    const wrapper = render();
    await flushPromises();
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true);
  });

  it("renders a card per page and navigates on click", async () => {
    getMock.mockResolvedValue([
      { id: "p-1", name: "First", created_at: "t", updated_at: "t" },
    ]);
    const wrapper = render();
    await flushPromises();
    const card = wrapper.find('[data-testid="page-p-1"]');
    expect(card.exists()).toBe(true);
    await card.trigger("click");
    expect(push).toHaveBeenCalledWith("/pagemage/pages/p-1");
  });

  it("uploads a chosen file and navigates to the new page", async () => {
    getMock.mockResolvedValue([]);
    uploadMock.mockResolvedValue({
      id: "p-new",
      name: "New",
      created_at: "t",
      updated_at: "t",
    });
    const wrapper = render();
    await flushPromises();
    const file = new File(["<p>x</p>"], "new.html", { type: "text/html" });
    const input = wrapper.find('[data-testid="file-input"]');
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    await flushPromises();
    expect(uploadMock).toHaveBeenCalledWith("/pagemage/pages", file);
    expect(push).toHaveBeenCalledWith("/pagemage/pages/p-new");
  });

  it("shows a shared badge only on shared pages", async () => {
    getMock.mockResolvedValue([
      { id: "p-1", name: "Public", shared: true, created_at: "t", updated_at: "t" },
      { id: "p-2", name: "Private", shared: false, created_at: "t", updated_at: "t" },
    ]);
    const wrapper = render();
    await flushPromises();
    expect(wrapper.find('[data-testid="shared-p-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="shared-p-2"]').exists()).toBe(false);
  });
});
