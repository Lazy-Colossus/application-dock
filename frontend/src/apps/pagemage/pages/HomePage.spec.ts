import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, uploadMock, putMock, delMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  uploadMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: vi.fn(),
    put: putMock,
    del: delMock,
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
  "q-dialog": {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ["modelValue"],
  },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
};

function render() {
  return mount(HomePage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  uploadMock.mockReset();
  putMock.mockReset();
  delMock.mockReset();
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

  it("uploads via the name dialog and navigates to the new page", async () => {
    getMock.mockResolvedValue([]);
    uploadMock.mockResolvedValue({
      id: "p-new",
      name: "Chosen",
      shared: false,
      created_at: "t",
      updated_at: "t",
    });
    const wrapper = render();
    await flushPromises();
    const file = new File(["<p>x</p>"], "new.html", { type: "text/html" });
    const input = wrapper.find('[data-testid="file-input"]');
    Object.defineProperty(input.element, "files", { value: [file] });
    await input.trigger("change");
    // Dialog opened, name pre-filled from filename (minus extension).
    const nameInput = wrapper.find('[data-testid="upload-name"]')
      .element as HTMLInputElement;
    expect(nameInput.value).toBe("new");
    await wrapper.find('[data-testid="upload-submit"]').trigger("click");
    await flushPromises();
    expect(uploadMock).toHaveBeenCalledWith("/pagemage/pages", file, {
      name: "new",
    });
    expect(push).toHaveBeenCalledWith("/pagemage/pages/p-new");
  });

  it("renames via the rename dialog", async () => {
    getMock.mockResolvedValue([
      { id: "p-1", name: "Old", shared: false, created_at: "t", updated_at: "t" },
    ]);
    putMock.mockResolvedValue({
      id: "p-1",
      name: "New",
      html: "",
      share_token: "",
      created_at: "t",
      updated_at: "t2",
    });
    const wrapper = render();
    await flushPromises();
    await wrapper.find('[data-testid="rename-p-1"]').trigger("click");
    const nameInput = wrapper.find('[data-testid="rename-name"]')
      .element as HTMLInputElement;
    expect(nameInput.value).toBe("Old");
    await wrapper.find('[data-testid="rename-name"]').setValue("New");
    await wrapper.find('[data-testid="rename-submit"]').trigger("click");
    await flushPromises();
    expect(putMock).toHaveBeenCalledWith("/pagemage/pages/p-1/name", {
      name: "New",
    });
  });

  it("deletes after inline confirm and removes the card", async () => {
    getMock.mockResolvedValue([
      { id: "p-1", name: "A", shared: false, created_at: "t", updated_at: "t" },
    ]);
    delMock.mockResolvedValue(undefined);
    const wrapper = render();
    await flushPromises();
    await wrapper.find('[data-testid="delete-p-1"]').trigger("click");
    await wrapper.find('[data-testid="delete-confirm-p-1"]').trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/pagemage/pages/p-1");
    expect(wrapper.find('[data-testid="page-p-1"]').exists()).toBe(false);
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
