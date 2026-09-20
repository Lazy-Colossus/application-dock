import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock, push, FakeApiError } = vi.hoisted(
  () => ({
    getMock: vi.fn(),
    postMock: vi.fn(),
    putMock: vi.fn(),
    delMock: vi.fn(),
    push: vi.fn(),
    FakeApiError: class extends Error {
      status: number;
      detail: string;
      constructor(status: number, detail: string) {
        super(`${status}: ${detail}`);
        this.status = status;
        this.detail = detail;
      }
    },
  }),
);
vi.mock("@/composables/useApi", () => ({
  ApiError: FakeApiError,
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: { noteId: "n-abc12345" } }),
}));

import NotePage from "./NotePage.vue";
import type { Note } from "@/apps/shared-notes/types";

const note = (): Note => ({
  id: "n-abc12345",
  title: "Groceries",
  body: "milk",
  owner: "ana",
  members: ["ana"],
  rev: 1,
  can_manage: true,
  created_at: "2026-09-20T10:00:00Z",
  updated_at: "2026-09-20T10:05:00Z",
});

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
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
      "to",
    ],
    emits: ["click"],
  },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" @blur="$emit(\'blur\')" @keyup.enter="$emit(\'keyup\', $event)" />',
    props: ["modelValue", "dense", "outlined", "borderless", "autofocus"],
    emits: ["update:modelValue", "blur", "keyup"],
  },
  "q-spinner": { template: "<div />" },
};

function render() {
  return mount(NotePage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NotePage — loading", () => {
  it("fetches the note and renders its title and body", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    expect(getMock).toHaveBeenCalledWith("/shared-notes/notes/n-abc12345");
    expect(
      (wrapper.get('[data-testid="note-title"]').element as HTMLInputElement)
        .value,
    ).toBe("Groceries");
    expect(
      (wrapper.get('[data-testid="note-body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("milk");
  });

  it("shows a not-found state with a way back for a note that is not mine", async () => {
    getMock.mockRejectedValue(new FakeApiError(404, "Note not found"));
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="not-found"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="back-home"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="note-body"]').exists()).toBe(false);
  });

  it("returns to the home from the not-found state", async () => {
    getMock.mockRejectedValue(new FakeApiError(404, "Note not found"));
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="back-home"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/shared-notes");
  });
});

describe("NotePage — body autosave", () => {
  it("does not save on every keystroke", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-body"]').setValue("milk and");
    await wrapper.get('[data-testid="note-body"]').setValue("milk and eggs");

    expect(putMock).not.toHaveBeenCalled();
  });

  it("saves once after the typing pause", async () => {
    getMock.mockResolvedValue(note());
    putMock.mockResolvedValue({ ...note(), body: "milk and eggs", rev: 2 });
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-body"]').setValue("milk and");
    await wrapper.get('[data-testid="note-body"]').setValue("milk and eggs");
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(putMock).toHaveBeenCalledTimes(1);
    expect(putMock).toHaveBeenCalledWith("/shared-notes/notes/n-abc12345", {
      body: "milk and eggs",
    });
  });

  it("persists a body cleared to empty without deleting the note", async () => {
    getMock.mockResolvedValue(note());
    putMock.mockResolvedValue({ ...note(), body: "", rev: 2 });
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-body"]').setValue("");
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/shared-notes/notes/n-abc12345", {
      body: "",
    });
    expect(delMock).not.toHaveBeenCalled();
  });

  it("reflects saving then saved in the indicator", async () => {
    getMock.mockResolvedValue(note());
    let release: (v: unknown) => void = () => {};
    putMock.mockReturnValue(new Promise((r) => (release = r)));
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-body"]').setValue("milk and eggs");
    await vi.advanceTimersByTimeAsync(600);
    expect(wrapper.get('[data-testid="save-status"]').text()).toContain(
      "Saving",
    );

    release({ ...note(), body: "milk and eggs", rev: 2 });
    await flushPromises();
    expect(wrapper.get('[data-testid="save-status"]').text()).toContain(
      "Saved",
    );
  });

  it("keeps my text when the save fails", async () => {
    getMock.mockResolvedValue(note());
    putMock.mockRejectedValue(new FakeApiError(500, "boom"));
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-body"]').setValue("work in progress");
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(
      (wrapper.get('[data-testid="note-body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("work in progress");
    expect(wrapper.get('[data-testid="error"]').text()).toContain("boom");
  });

  it("does not revert my text to the server copy after a successful save", async () => {
    getMock.mockResolvedValue(note());
    // The server echoes the body it received, but I have typed on since.
    putMock.mockResolvedValue({ ...note(), body: "milk and", rev: 2 });
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-body"]').setValue("milk and");
    await vi.advanceTimersByTimeAsync(600);
    await wrapper.get('[data-testid="note-body"]').setValue("milk and eggs");
    await flushPromises();

    expect(
      (wrapper.get('[data-testid="note-body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("milk and eggs");
  });
});

describe("NotePage — title", () => {
  it("saves the title on commit", async () => {
    getMock.mockResolvedValue(note());
    putMock.mockResolvedValue({ ...note(), title: "Shopping", rev: 2 });
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-title"]').setValue("Shopping");
    await wrapper.get('[data-testid="note-title"]').trigger("blur");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/shared-notes/notes/n-abc12345", {
      title: "Shopping",
    });
  });

  it("rejects a blank title without sending it, and reverts the field", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-title"]').setValue("   ");
    await wrapper.get('[data-testid="note-title"]').trigger("blur");
    await flushPromises();

    expect(putMock).not.toHaveBeenCalled();
    expect(
      (wrapper.get('[data-testid="note-title"]').element as HTMLInputElement)
        .value,
    ).toBe("Groceries");
  });

  it("reverts to the last saved title when the server rejects it", async () => {
    getMock.mockResolvedValue(note());
    putMock.mockRejectedValue(new FakeApiError(422, "title must not be blank"));
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-title"]').setValue("Shopping");
    await wrapper.get('[data-testid="note-title"]').trigger("blur");
    await flushPromises();

    expect(
      (wrapper.get('[data-testid="note-title"]').element as HTMLInputElement)
        .value,
    ).toBe("Groceries");
  });

  it("does not save an unchanged title", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-title"]').trigger("blur");
    await flushPromises();

    expect(putMock).not.toHaveBeenCalled();
  });
});

describe("NotePage — leaving", () => {
  it("flushes a pending body save on unmount rather than dropping it", async () => {
    getMock.mockResolvedValue(note());
    putMock.mockResolvedValue({ ...note(), body: "unsaved", rev: 2 });
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-body"]').setValue("unsaved");
    wrapper.unmount();
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/shared-notes/notes/n-abc12345", {
      body: "unsaved",
    });
  });
});
