import { describe, it, expect, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";

import { usePageDetailStore } from "./usePageDetailStore";

beforeEach(() => {
  setActivePinia(createPinia());
});

describe("usePageDetailStore", () => {
  it("starts with no detail", () => {
    expect(usePageDetailStore().detail).toBeNull();
  });

  it("holds what a page puts there", () => {
    const store = usePageDetailStore();
    store.setDetail("chuina trip");
    expect(store.detail).toBe("chuina trip");
  });

  it("clears", () => {
    const store = usePageDetailStore();
    store.setDetail("chuina trip");
    store.clearDetail();
    expect(store.detail).toBeNull();
  });

  it("treats a blank detail as none, so the bar never shows a dangling separator", () => {
    const store = usePageDetailStore();
    store.setDetail("   ");
    expect(store.detail).toBeNull();
  });
});
