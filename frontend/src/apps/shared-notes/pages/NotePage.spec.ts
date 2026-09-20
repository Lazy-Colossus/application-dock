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
import { useAuthStore } from "@/stores/useAuthStore";
import type { Note } from "@/apps/shared-notes/types";
import type { NoteEvent } from "@/apps/shared-notes/composables/useNoteEvents";

class FakeEventSource {
  static last: FakeEventSource | null = null;
  onmessage: ((m: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.last = this;
  }
  close() {
    this.closed = true;
  }
  emit(payload: NoteEvent) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }
}

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
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
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
  "q-badge": {
    template: "<span :data-testid=\"$attrs['data-testid']\">{{ label }}</span>",
    props: ["label", "color"],
  },
  CollaboratorsDialog: {
    name: "CollaboratorsDialog",
    template: '<div data-testid="collaborators-dialog" />',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
};

function render() {
  return mount(NotePage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.stubGlobal("EventSource", FakeEventSource);
  FakeEventSource.last = null;
  const auth = useAuthStore();
  auth.username = "ana";
  auth.token = "tok";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
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

describe("NotePage — live channel (Story 2.2)", () => {
  it("subscribes to the note's events on load", async () => {
    getMock.mockResolvedValue(note());
    render();
    await flushPromises();

    expect(FakeEventSource.last?.url).toBe(
      "/api/shared-notes/notes/n-abc12345/events?token=tok",
    );
  });

  it("tears the stream down on unmount", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    wrapper.unmount();
    expect(FakeEventSource.last?.closed).toBe(true);
  });

  it("adopts another member's text when I have nothing unsaved", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    getMock.mockResolvedValue({ ...note(), rev: 2, body: "milk and eggs" });
    FakeEventSource.last?.emit({
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 2,
      actor: "bo",
    });
    await flushPromises();

    expect(
      (wrapper.get('[data-testid="note-body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("milk and eggs");
  });

  it("keeps my unsaved text when another member's change lands", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    // Typed, but still inside the debounce window — nothing saved yet.
    await wrapper.get('[data-testid="note-body"]').setValue("my draft");

    getMock.mockResolvedValue({ ...note(), rev: 2, body: "their text" });
    FakeEventSource.last?.emit({
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 2,
      actor: "bo",
    });
    await flushPromises();

    expect(
      (wrapper.get('[data-testid="note-body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe("my draft");
  });

  it("names who changed it when my text was kept", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-body"]').setValue("my draft");

    getMock.mockResolvedValue({ ...note(), rev: 2, body: "their text" });
    FakeEventSource.last?.emit({
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 2,
      actor: "bo",
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="remote-change"]').text()).toContain("bo");
  });

  it("adopts a renamed title when I am not editing it", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    getMock.mockResolvedValue({ ...note(), rev: 2, title: "Shopping" });
    FakeEventSource.last?.emit({
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 2,
      actor: "bo",
    });
    await flushPromises();

    expect(
      (wrapper.get('[data-testid="note-title"]').element as HTMLInputElement)
        .value,
    ).toBe("Shopping");
  });

  it("closes the editor when the note is deleted under me", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "deleted",
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="closed"]').text()).toContain("deleted");
    expect(wrapper.find('[data-testid="note-body"]').exists()).toBe(false);
  });

  it("explains a removal differently from a deletion", async () => {
    useAuthStore().username = "bo";
    getMock.mockResolvedValue({ ...note(), can_manage: false });
    const wrapper = render();
    await flushPromises();

    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "removed",
      member: "bo",
    });
    await flushPromises();

    expect(wrapper.get('[data-testid="closed"]').text()).toContain(
      "no longer shared",
    );
  });

  it("does not try to save into a note that has closed", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    await wrapper.get('[data-testid="note-body"]').setValue("too late");
    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "deleted",
    });
    await flushPromises();
    await vi.advanceTimersByTimeAsync(600);
    await flushPromises();

    expect(putMock).not.toHaveBeenCalled();
  });

  it("offers a way back from the closed state", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "deleted",
    });
    await flushPromises();

    await wrapper.get('[data-testid="back-home"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/shared-notes");
  });
});

describe("NotePage — collaborators (Story 2.3)", () => {
  it("opens the collaborators dialog from the note", async () => {
    getMock.mockResolvedValue(note());
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="collaborators-dialog"]').exists()).toBe(
      false,
    );
    await wrapper.get('[data-testid="collaborators"]').trigger("click");

    expect(wrapper.find('[data-testid="collaborators-dialog"]').exists()).toBe(
      true,
    );
  });

  it("offers the collaborators view to a member too, not just the owner", async () => {
    getMock.mockResolvedValue({ ...note(), can_manage: false });
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="collaborators"]').exists()).toBe(true);
  });

  it("shows how many people share the note", async () => {
    getMock.mockResolvedValue({ ...note(), members: ["ana", "bo", "cy"] });
    const wrapper = render();
    await flushPromises();

    expect(wrapper.get('[data-testid="member-count"]').text()).toBe("3");
  });

  it("shows no count for a note nobody else has", async () => {
    getMock.mockResolvedValue({ ...note(), members: ["ana"] });
    const wrapper = render();
    await flushPromises();

    expect(wrapper.find('[data-testid="member-count"]').exists()).toBe(false);
  });
});
