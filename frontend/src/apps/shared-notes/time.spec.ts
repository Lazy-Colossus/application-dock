import { describe, it, expect } from "vitest";
import { relativeTime } from "./time";

const NOW = new Date("2026-09-20T12:00:00Z").getTime();
const ago = (secs: number) =>
  new Date(NOW - secs * 1000).toISOString().replace(/\.\d{3}/, "");

describe("relativeTime", () => {
  it("calls the last minute 'just now'", () => {
    expect(relativeTime(ago(5), NOW)).toBe("just now");
    expect(relativeTime(ago(59), NOW)).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    expect(relativeTime(ago(60), NOW)).toBe("1m ago");
    expect(relativeTime(ago(90 * 60), NOW)).toBe("1h ago");
    expect(relativeTime(ago(3 * 86400), NOW)).toBe("3d ago");
  });

  it("falls back to a date past a week", () => {
    expect(relativeTime(ago(30 * 86400), NOW)).toMatch(/Aug/);
  });

  it("never reads as being in the future when clocks disagree", () => {
    expect(relativeTime(ago(-120), NOW)).toBe("just now");
  });

  it("returns empty for an unparseable stamp", () => {
    expect(relativeTime("not a date", NOW)).toBe("");
  });
});
