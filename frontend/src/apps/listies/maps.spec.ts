import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/** A fresh module per test: the loader deliberately caches across calls. */
async function freshLoader() {
  vi.resetModules();
  return (await import("./maps")).loadMapsSdk;
}

/**
 * The loader appends a real `<script src="https://maps.googleapis.com/…">`.
 * We intercept the append so the test environment never tries to fetch it —
 * otherwise the suite would depend on the network and print load errors. The
 * element itself is still the one the loader built, so the assertions about
 * its URL and about how many are created are unchanged; the tests drive
 * `onload` / `onerror` by hand.
 */
let appended: HTMLScriptElement[] = [];
let restoreAppend: (() => void) | null = null;

function interceptScriptAppends(): void {
  const original = document.head.appendChild.bind(document.head);
  const spy = vi
    .spyOn(document.head, "appendChild")
    .mockImplementation((node: Node) => {
      if (node instanceof HTMLScriptElement) {
        appended.push(node);
        return node;
      }
      return original(node);
    });
  restoreAppend = () => spy.mockRestore();
}

const scripts = () => appended;

beforeEach(() => {
  appended = [];
  interceptScriptAppends();
  delete (window as unknown as { google?: unknown }).google;
});

afterEach(() => {
  restoreAppend?.();
  restoreAppend = null;
  delete (window as unknown as { google?: unknown }).google;
});

function completeLoad(importLibrary?: unknown): void {
  (window as unknown as { google: unknown }).google = {
    maps: { Map: class {}, ...(importLibrary ? { importLibrary } : {}) },
  };
  scripts()[0]!.onload?.(new Event("load"));
}

describe("loadMapsSdk", () => {
  it("injects the Maps script with the browser key", async () => {
    const loadMapsSdk = await freshLoader();

    void loadMapsSdk("browser-key-xyz");

    expect(scripts()).toHaveLength(1);
    expect(scripts()[0]!.src).toContain("browser-key-xyz");
  });

  it("encodes the key rather than pasting it into the URL", async () => {
    const loadMapsSdk = await freshLoader();

    void loadMapsSdk("key with spaces&more");

    expect(scripts()[0]!.src).not.toContain("key with spaces&more");
    expect(scripts()[0]!.src).toContain(
      encodeURIComponent("key with spaces&more"),
    );
  });

  it("resolves with the SDK once it loads", async () => {
    const loadMapsSdk = await freshLoader();
    const pending = loadMapsSdk("k");

    completeLoad();

    await expect(pending).resolves.toHaveProperty("Map");
  });

  it("injects the script once however many callers ask", async () => {
    const loadMapsSdk = await freshLoader();

    const a = loadMapsSdk("k");
    const b = loadMapsSdk("k");
    completeLoad();
    await Promise.all([a, b]);

    expect(scripts()).toHaveLength(1);
  });

  it("hands later callers the same load, not a second one", async () => {
    const loadMapsSdk = await freshLoader();
    const first = loadMapsSdk("k");
    completeLoad();
    await first;

    const second = await loadMapsSdk("k");

    expect(scripts()).toHaveLength(1);
    expect(second).toHaveProperty("Map");
  });

  it("does not load anything when the SDK is already on the page", async () => {
    (window as unknown as { google: unknown }).google = {
      maps: { Map: class {} },
    };
    const loadMapsSdk = await freshLoader();

    await loadMapsSdk("k");

    expect(scripts()).toHaveLength(0);
  });

  it("rejects when the script fails to load", async () => {
    const loadMapsSdk = await freshLoader();
    const pending = loadMapsSdk("k");

    scripts()[0]!.onerror?.(new Event("error"));

    await expect(pending).rejects.toThrow(/could not be loaded/i);
  });

  it("rejects when the script loads but the SDK is not there — a rejected key", async () => {
    const loadMapsSdk = await freshLoader();
    const pending = loadMapsSdk("k");

    scripts()[0]!.onload?.(new Event("load"));

    await expect(pending).rejects.toThrow();
  });

  it("lets a later attempt retry after a failure", async () => {
    const loadMapsSdk = await freshLoader();
    const failed = loadMapsSdk("k");
    scripts()[0]!.onerror?.(new Event("error"));
    await expect(failed).rejects.toThrow();
    appended = [];

    void loadMapsSdk("k");

    expect(scripts()).toHaveLength(1);
  });

  it("refuses to try without a key", async () => {
    const loadMapsSdk = await freshLoader();

    await expect(loadMapsSdk("")).rejects.toThrow();
    expect(scripts()).toHaveLength(0);
  });
});

describe("loadMapsSdk — waiting for the SDK to be ready", () => {
  it("imports the maps library before handing the SDK over", async () => {
    // With `loading=async`, google.maps exists before it is usable: calling
    // `new google.maps.Map` too early throws. importLibrary is the wait.
    const importLibrary = vi.fn(() => Promise.resolve({}));
    const loadMapsSdk = await freshLoader();
    const pending = loadMapsSdk("k");

    completeLoad(importLibrary);
    await pending;

    expect(importLibrary).toHaveBeenCalledWith("maps");
  });

  it("still works against an SDK with no importLibrary", async () => {
    const loadMapsSdk = await freshLoader();
    const pending = loadMapsSdk("k");

    completeLoad();

    await expect(pending).resolves.toHaveProperty("Map");
  });

  it("fails cleanly when the library cannot be imported", async () => {
    const importLibrary = vi.fn(() => Promise.reject(new Error("no library")));
    const loadMapsSdk = await freshLoader();
    const pending = loadMapsSdk("k");

    completeLoad(importLibrary);

    await expect(pending).rejects.toThrow(/could not be loaded/i);
  });
});
