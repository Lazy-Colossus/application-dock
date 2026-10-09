import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import SharedNotesHomePage from "./SharedNotesHomePage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Note, NoteSummary } from "@/apps/shared-notes/types";

const MINE: NoteSummary = {
  id: "n-mine0001",
  title: "Groceries",
  owner: "ana",
  shared: false,
  updated_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
};

const THEIRS: NoteSummary = {
  id: "n-theirs01",
  title: "Bo's plan",
  owner: "bo",
  shared: true,
  updated_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
};

const CREATED: Note = {
  id: "n-new00001",
  title: "Packing list",
  body: "",
  owner: "ana",
  members: ["ana"],
  rev: 0,
  can_manage: true,
  created_at: "2026-09-20T11:00:00Z",
  updated_at: "2026-09-20T11:00:00Z",
};

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template:
      "<div :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></div>",
    emits: ["click"],
  },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\', $event)">{{ label }}</button>',
    props: [
      "label",
      "disable",
      "color",
      "unelevated",
      "noCaps",
      "icon",
      "flat",
      "dense",
      "round",
    ],
    emits: ["click"],
  },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @keyup.enter="$emit(\'keyup\', $event)" />',
    props: ["modelValue", "dense", "outlined", "autofocus", "label"],
    emits: ["update:modelValue", "keyup"],
  },
  "q-dialog": {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-badge": {
    template: "<span :data-testid=\"$attrs['data-testid']\">{{ label }}</span>",
    props: ["label", "color"],
  },
  "q-spinner": { template: "<div />" },
};

// The page subscribes to document/window events, so every mount is tracked and
// torn down — otherwise one case's listeners fire during the next one's.
const mounted: ReturnType<typeof mount>[] = [];

function render() {
  const wrapper = mount(SharedNotesHomePage, { global: { stubs: STUBS } });
  mounted.push(wrapper);
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  useAuthStore().username = "ana";
});

afterEach(() => {
  while (mounted.length) mounted.pop()?.unmount();
});

describe("SharedNotesHomePage — listing", () => {
  it("loads and lists the notes I can see", async () => {
    getMock.mockResolvedValue([MINE, THEIRS]);
    const wrapper = render();
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/shared-notes/notes");
    expect(wrapper.text()).toContain("Groceries");
    expect(wrapper.text()).toContain("Bo's plan");
  });

  it("shows a relative edited time", async () => {
    getMock.mockResolvedValue([MINE]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="note-n-mine0001"]').text()).toContain(
      "5m ago",
    );
  });

  it("names the owner of a note that is not mine", async () => {
    getMock.mockResolvedValue([THEIRS]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="note-n-theirs01"]').text()).toContain(
      "bo",
    );
  });

  it("shows a calm empty state when I have no notes", async () => {
    getMock.mockResolvedValue([]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true);
  });

  it("shows the store error instead of the list", async () => {
    getMock.mockRejectedValue(new Error("500: boom"));
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="error"]').text()).toContain("boom");
  });

  it("does not claim the list is empty when the load failed", async () => {
    getMock.mockRejectedValue(new Error("500: boom"));
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(false);
  });
});

describe("SharedNotesHomePage — opening", () => {
  it("navigates to the note when a row is selected", async () => {
    getMock.mockResolvedValue([MINE]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-n-mine0001"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/shared-notes/notes/n-mine0001");
  });
});

describe("SharedNotesHomePage — creating", () => {
  it("disables submit and sends nothing for a blank title", async () => {
    getMock.mockResolvedValue([]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="new-note"]').trigger("click");
    await wrapper.get('[data-testid="new-note-title"]').setValue("   ");

    expect(
      wrapper.get('[data-testid="new-note-submit"]').attributes("disabled"),
    ).toBeDefined();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("creates the note and navigates to it", async () => {
    getMock.mockResolvedValue([]);
    postMock.mockResolvedValue(CREATED);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="new-note"]').trigger("click");
    await wrapper
      .get('[data-testid="new-note-title"]')
      .setValue("Packing list");
    await wrapper.get('[data-testid="new-note-submit"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/shared-notes/notes", {
      title: "Packing list",
    });
    expect(push).toHaveBeenCalledWith("/shared-notes/notes/n-new00001");
  });

  it("stays put and surfaces the error when creating fails", async () => {
    getMock.mockResolvedValue([]);
    postMock.mockRejectedValue(new Error("422: title must not be blank"));
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="new-note"]').trigger("click");
    await wrapper.get('[data-testid="new-note-title"]').setValue("Packing");
    await wrapper.get('[data-testid="new-note-submit"]').trigger("click");
    await flushPromises();

    expect(push).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="error"]').text()).toContain("blank");
  });
});

describe("SharedNotesHomePage — deleting", () => {
  it("offers delete only for a note I own", async () => {
    getMock.mockResolvedValue([MINE, THEIRS]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="delete-n-mine0001"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="delete-n-theirs01"]').exists()).toBe(
      false,
    );
  });

  it("requires an explicit confirmation before deleting", async () => {
    getMock.mockResolvedValue([MINE]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="delete-n-mine0001"]').trigger("click");
    expect(delMock).not.toHaveBeenCalled();

    await wrapper
      .get('[data-testid="delete-confirm-n-mine0001"]')
      .trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith("/shared-notes/notes/n-mine0001");
    expect(wrapper.text()).not.toContain("Groceries");
  });

  it("keeps the note when the confirmation is dismissed", async () => {
    getMock.mockResolvedValue([MINE]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="delete-n-mine0001"]').trigger("click");
    await wrapper
      .get('[data-testid="delete-cancel-n-mine0001"]')
      .trigger("click");

    expect(delMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain("Groceries");
  });

  it("does not open the note when the delete control is used", async () => {
    getMock.mockResolvedValue([MINE]);
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="delete-n-mine0001"]').trigger("click");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("SharedNotesHomePage — shared state (Story 2.3)", () => {
  it("names the owner and cues a note shared with me", async () => {
    getMock.mockResolvedValue([THEIRS]);
    const wrapper = render();
    await flushPromises();

    const badge = wrapper.get('[data-testid="badge-n-theirs01"]');
    expect(badge.text()).toContain("bo");
    expect(badge.text()).toContain("shared with you");
  });

  it("marks a note I own that has other members as shared", async () => {
    getMock.mockResolvedValue([{ ...MINE, shared: true }]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="badge-n-mine0001"]').text()).toBe(
      "shared",
    );
  });

  it("badges nothing on a note only I can see", async () => {
    getMock.mockResolvedValue([MINE]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="badge-n-mine0001"]').exists()).toBe(
      false,
    );
  });

  it("still offers delete on a note I own that is shared", async () => {
    getMock.mockResolvedValue([{ ...MINE, shared: true }]);
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="delete-n-mine0001"]').exists()).toBe(
      true,
    );
  });
});

describe("SharedNotesHomePage — live membership (Story 2.3)", () => {
  it("picks up notes shared with me while I was away", async () => {
    getMock.mockResolvedValue([MINE]);
    const wrapper = render();
    await flushPromises();
    expect(wrapper.text()).not.toContain("Bo's plan");

    getMock.mockResolvedValue([MINE, THEIRS]);
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();

    expect(wrapper.text()).toContain("Bo's plan");
  });

  it("stops listening once the page is gone", async () => {
    getMock.mockResolvedValue([MINE]);
    const wrapper = render();
    await flushPromises();

    wrapper.unmount();
    getMock.mockClear();
    document.dispatchEvent(new Event("visibilitychange"));
    await flushPromises();

    expect(getMock).not.toHaveBeenCalled();
  });
});
