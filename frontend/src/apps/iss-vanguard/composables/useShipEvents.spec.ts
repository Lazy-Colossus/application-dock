import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useShipEvents } from "./useShipEvents";

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
}

beforeEach(() => {
  vi.stubGlobal("EventSource", FakeEventSource);
  FakeEventSource.last = null;
});
afterEach(() => vi.unstubAllGlobals());

describe("useShipEvents", () => {
  it("opens the caller's ship stream with the token in the query", () => {
    useShipEvents("tok en/+", {});
    expect(FakeEventSource.last?.url).toBe(
      "/api/iss-vanguard/ship/events?token=tok%20en%2F%2B",
    );
  });

  it("dispatches each event type and ignores junk", () => {
    const onChanged = vi.fn();
    const onMembersChanged = vi.fn();
    const onClosed = vi.fn();
    useShipEvents("t", { onChanged, onMembersChanged, onClosed });
    const src = FakeEventSource.last!;
    src.emit({ type: "ship.changed", ship_id: "s", rev: 2, actor: "bo" });
    src.emit({ type: "members.changed", ship_id: "s", members: ["ana"] });
    src.emit({
      type: "ship.closed",
      ship_id: "s",
      reason: "removed",
      member: "bo",
    });
    src.emit({ type: "other" });
    src.onmessage?.({ data: "not json" } as MessageEvent<string>);
    expect(onChanged).toHaveBeenCalledWith({
      type: "ship.changed",
      ship_id: "s",
      rev: 2,
      actor: "bo",
    });
    expect(onMembersChanged).toHaveBeenCalledTimes(1);
    expect(onClosed).toHaveBeenCalledTimes(1);
  });

  it("closes the stream", () => {
    useShipEvents("t", {}).close();
    expect(FakeEventSource.last?.closed).toBe(true);
  });
});
