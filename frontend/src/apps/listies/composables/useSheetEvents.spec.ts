import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useSheetEvents } from "./useSheetEvents";

// A stand-in for the browser's EventSource: records the URL, lets a test fire
// a message, and tracks close().
class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  onmessage: ((e: MessageEvent<string>) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  close(): void {
    this.closed = true;
  }
  emit(data: unknown): void {
    this.onmessage?.({ data: JSON.stringify(data) } as MessageEvent<string>);
  }
  emitRaw(data: string): void {
    this.onmessage?.({ data } as MessageEvent<string>);
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useSheetEvents", () => {
  it("opens an EventSource with the token on the query string", () => {
    useSheetEvents("s-1", "tok en/+", {});
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.url).toBe(
      "/api/listies/sheets/s-1/events?token=tok%20en%2F%2B",
    );
  });

  it("dispatches each event type to its handler", () => {
    const onChanged = vi.fn();
    const onMembersChanged = vi.fn();
    const onClosed = vi.fn();
    useSheetEvents("s-1", "t", { onChanged, onMembersChanged, onClosed });
    const source = FakeEventSource.instances[0]!;

    const changed = {
      type: "sheet.changed",
      sheet_id: "s-1",
      rev: 2,
      actor: "alice",
    };
    const membersChanged = {
      type: "members.changed",
      sheet_id: "s-1",
      members: ["alice"],
    };
    const closed = { type: "sheet.closed", sheet_id: "s-1", reason: "deleted" };
    source.emit(changed);
    source.emit(membersChanged);
    source.emit(closed);

    expect(onChanged).toHaveBeenCalledWith(changed);
    expect(onMembersChanged).toHaveBeenCalledWith(membersChanged);
    expect(onClosed).toHaveBeenCalledWith(closed);
  });

  it("ignores a malformed frame instead of throwing", () => {
    const onChanged = vi.fn();
    useSheetEvents("s-1", "t", { onChanged });
    const source = FakeEventSource.instances[0]!;
    expect(() => source.emitRaw("not json")).not.toThrow();
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("ignores an unknown event type", () => {
    const onChanged = vi.fn();
    const onMembersChanged = vi.fn();
    const onClosed = vi.fn();
    useSheetEvents("s-1", "t", { onChanged, onMembersChanged, onClosed });
    FakeEventSource.instances[0]!.emit({ type: "who.knows", sheet_id: "s-1" });
    expect(onChanged).not.toHaveBeenCalled();
    expect(onMembersChanged).not.toHaveBeenCalled();
    expect(onClosed).not.toHaveBeenCalled();
  });

  it("close() closes the underlying stream", () => {
    const sub = useSheetEvents("s-1", "t", {});
    sub.close();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });
});
