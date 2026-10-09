import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAutosave } from "./useAutosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useAutosave", () => {
  it("collapses a burst of keystrokes into one save", () => {
    const save = vi.fn();
    const { schedule } = useAutosave(save, 600);

    schedule();
    vi.advanceTimersByTime(200);
    schedule();
    vi.advanceTimersByTime(200);
    schedule();
    expect(save).not.toHaveBeenCalled();

    vi.advanceTimersByTime(600);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush runs a pending save at once", () => {
    const save = vi.fn();
    const { schedule, flush } = useAutosave(save, 600);

    schedule();
    flush();
    expect(save).toHaveBeenCalledTimes(1);

    // The timer was consumed, not merely pre-empted.
    vi.advanceTimersByTime(600);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush does nothing when no save is pending", () => {
    const save = vi.fn();
    useAutosave(save, 600).flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("cancel drops a pending save", () => {
    const save = vi.fn();
    const { schedule, cancel } = useAutosave(save, 600);

    schedule();
    cancel();
    vi.advanceTimersByTime(600);
    expect(save).not.toHaveBeenCalled();
  });
});
