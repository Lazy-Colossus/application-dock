import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useNoteEvents, type NoteEvent } from "./useNoteEvents";

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

  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent<string>);
  }

  emitRaw(data: string) {
    this.onmessage?.({ data } as MessageEvent<string>);
  }
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEventSource);
  FakeEventSource.last = null;
});

afterEach(() => vi.unstubAllGlobals());

describe("useNoteEvents", () => {
  it("opens the stream with the token in the query", () => {
    useNoteEvents("n-abc12345", "tok en/+", {});
    expect(FakeEventSource.last?.url).toBe(
      "/api/shared-notes/notes/n-abc12345/events?token=tok%20en%2F%2B",
    );
  });

  it("dispatches each event type to its handler", () => {
    const onChanged = vi.fn();
    const onMembersChanged = vi.fn();
    const onClosed = vi.fn();
    useNoteEvents("n-abc12345", "t", {
      onChanged,
      onMembersChanged,
      onClosed,
    });

    const changed: NoteEvent = {
      type: "note.changed",
      note_id: "n-abc12345",
      rev: 2,
      actor: "bo",
    };
    FakeEventSource.last?.emit(changed);
    FakeEventSource.last?.emit({
      type: "members.changed",
      note_id: "n-abc12345",
      members: ["ana", "bo"],
    });
    FakeEventSource.last?.emit({
      type: "note.closed",
      note_id: "n-abc12345",
      reason: "deleted",
    });

    expect(onChanged).toHaveBeenCalledWith(changed);
    expect(onMembersChanged).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("ignores a malformed frame instead of throwing", () => {
    const onChanged = vi.fn();
    useNoteEvents("n-abc12345", "t", { onChanged });

    expect(() => FakeEventSource.last?.emitRaw("not json")).not.toThrow();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("ignores an unknown event type", () => {
    const onChanged = vi.fn();
    useNoteEvents("n-abc12345", "t", { onChanged });

    FakeEventSource.last?.emit({ type: "something.else" });
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("closes the underlying stream", () => {
    const subscription = useNoteEvents("n-abc12345", "t", {});
    subscription.close();
    expect(FakeEventSource.last?.closed).toBe(true);
  });
});
