import { describe, it, expect, vi, afterEach } from "vitest";
import { copyToClipboard } from "./clipboard";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("copyToClipboard", () => {
  it("uses navigator.clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const ok = await copyToClipboard("https://x/link");
    expect(writeText).toHaveBeenCalledWith("https://x/link");
    expect(ok).toBe(true);
  });

  it("falls back to execCommand when clipboard is unavailable", async () => {
    vi.stubGlobal("navigator", {}); // no clipboard (insecure context)
    const exec = vi.fn().mockReturnValue(true);
    // happy-dom has no execCommand by default; define it for the fallback path.
    Object.defineProperty(document, "execCommand", {
      value: exec,
      configurable: true,
    });
    const ok = await copyToClipboard("https://x/link");
    expect(exec).toHaveBeenCalledWith("copy");
    expect(ok).toBe(true);
  });
});
