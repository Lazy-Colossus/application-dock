import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

import CollaboratorsDialog from "./CollaboratorsDialog.vue";
import { useSharedNotesStore } from "@/apps/shared-notes/stores/useSharedNotesStore";
import type { Note } from "@/apps/shared-notes/types";

const note = (overrides: Partial<Note> = {}): Note => ({
  id: "n-abc12345",
  title: "Groceries",
  body: "milk",
  owner: "ana",
  members: ["ana", "bo"],
  rev: 1,
  can_manage: true,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:05:00Z",
  ...overrides,
});

const STUBS = {
  "q-dialog": {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\', $event)">{{ label }}</button>',
    props: [
      "label",
      "disable",
      "color",
      "flat",
      "dense",
      "round",
      "icon",
      "unelevated",
      "noCaps",
    ],
    emits: ["click"],
  },
  "q-option-group": {
    // Emits the toggled selection inline; a `methods` block here would be
    // untyped against the stub's own shape.
    template:
      '<div><label v-for="o in options" :key="o.value">' +
      '<input type="checkbox" :data-testid="`pick-${o.value}`" @change="$emit(\'update:modelValue\', modelValue.includes(o.value) ? modelValue.filter((v) => v !== o.value) : [...modelValue, o.value])" />' +
      "{{ o.label }}</label></div>",
    props: ["modelValue", "options", "type"],
    emits: ["update:modelValue"],
  },
};

async function render(currentNote: Note) {
  setActivePinia(createPinia());
  const store = useSharedNotesStore();
  store.currentNote = currentNote;
  getMock.mockResolvedValue({ usernames: ["ana", "bo", "cy"] });

  const wrapper = mount(CollaboratorsDialog, {
    props: { modelValue: true },
    global: { stubs: STUBS },
  });
  await flushPromises();
  return { wrapper, store };
}

beforeEach(() => vi.clearAllMocks());

describe("CollaboratorsDialog — roster", () => {
  it("lists the members and marks the owner", async () => {
    const { wrapper } = await render(note());

    expect(wrapper.get('[data-testid="member-ana"]').text()).toContain("owner");
    expect(wrapper.find('[data-testid="member-bo"]').exists()).toBe(true);
  });

  it("offers only dock users who are not already members", async () => {
    const { wrapper } = await render(note());

    expect(wrapper.find('[data-testid="pick-cy"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="pick-bo"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pick-ana"]').exists()).toBe(false);
  });
});

describe("CollaboratorsDialog — owner controls", () => {
  it("shares with the picked users", async () => {
    const { wrapper } = await render(note({ members: ["ana"] }));
    postMock.mockResolvedValue(note({ members: ["ana", "cy"] }));

    await wrapper.get('[data-testid="pick-cy"]').trigger("change");
    await wrapper.get('[data-testid="share-submit"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/shared-notes/notes/n-abc12345/share",
      { usernames: ["cy"] },
    );
  });

  it("cannot submit an empty selection", async () => {
    const { wrapper } = await render(note({ members: ["ana"] }));

    expect(
      wrapper.get('[data-testid="share-submit"]').attributes("disabled"),
    ).toBeDefined();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("removes a member behind a confirmation", async () => {
    const { wrapper } = await render(note());
    delMock.mockResolvedValue(note({ members: ["ana"] }));

    await wrapper.get('[data-testid="remove-bo"]').trigger("click");
    expect(delMock).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="remove-confirm-bo"]').trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith(
      "/shared-notes/notes/n-abc12345/share/bo",
    );
  });

  it("never offers to remove the owner", async () => {
    const { wrapper } = await render(note());
    expect(wrapper.find('[data-testid="remove-ana"]').exists()).toBe(false);
  });

  it("surfaces a rejected share", async () => {
    const { wrapper } = await render(note({ members: ["ana"] }));
    postMock.mockRejectedValue(new Error("422: unknown user: cy"));

    await wrapper.get('[data-testid="pick-cy"]').trigger("change");
    await wrapper.get('[data-testid="share-submit"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="share-error"]').text()).toContain(
      "unknown user",
    );
  });
});

describe("CollaboratorsDialog — a member who is not the owner", () => {
  it("sees the roster read-only", async () => {
    const { wrapper } = await render(note({ can_manage: false }));

    expect(wrapper.find('[data-testid="member-bo"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="remove-bo"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="share-submit"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pick-cy"]').exists()).toBe(false);
  });

  it("does not fetch the platform roster it cannot use", async () => {
    await render(note({ can_manage: false }));
    expect(getMock).not.toHaveBeenCalled();
  });
});
