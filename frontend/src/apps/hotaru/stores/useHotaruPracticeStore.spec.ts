import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));

import { useHotaruPracticeStore } from "./useHotaruPracticeStore";

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  postMock.mockReset().mockResolvedValue({});
});

describe("useHotaruPracticeStore", () => {
  it("loads the overview from the scope-scoped endpoint", async () => {
    const overview = {
      scope: "lesson:L2",
      word_count: 3,
      familiarity: [2, 1, 0, 0, 0],
    };
    getMock.mockResolvedValueOnce(overview);
    const store = useHotaruPracticeStore();
    await store.loadOverview("lesson:L2", "dani");
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/overview?scope=lesson%3AL2&user=dani",
    );
    expect(store.overview).toEqual(overview);
    expect(store.error).toBeNull();
  });

  it("routes API failures into error", async () => {
    getMock.mockRejectedValueOnce({ detail: "Invalid scope 'bogus'." });
    const store = useHotaruPracticeStore();
    await store.loadOverview("bogus", "dani");
    expect(store.error).toBe("Invalid scope 'bogus'.");
    expect(store.loading).toBe(false);
  });

  it("fetchOverview returns the overview without touching loading/error", async () => {
    const overview = {
      scope: "lesson:L2",
      word_count: 4,
      familiarity: [1, 1, 1, 1, 0],
    };
    getMock.mockResolvedValueOnce(overview);
    const store = useHotaruPracticeStore();
    const ov = await store.fetchOverview("lesson:L2", "dani");
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/overview?scope=lesson%3AL2&user=dani",
    );
    expect(ov).toEqual(overview);
    // Best-effort getter — does not become the picker's `overview` state.
    expect(store.overview).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("fetchOverview returns null on failure without setting error", async () => {
    getMock.mockRejectedValueOnce(new Error("boom"));
    const store = useHotaruPracticeStore();
    const ov = await store.fetchOverview("lesson:L2", "dani");
    expect(ov).toBeNull();
    expect(store.error).toBeNull();
  });

  it("loads the queue from the scope+direction endpoint", async () => {
    const items = [{ word: { id: "a" } }, { word: { id: "b" } }];
    getMock.mockResolvedValueOnce(items);
    const store = useHotaruPracticeStore();
    await store.loadQueue("lesson:L2", "dani");
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/queue?scope=lesson%3AL2&user=dani&direction=r2m",
    );
    expect(store.queue.map((i) => i.word.id)).toEqual(["a", "b"]);
    expect(store.error).toBeNull();
  });

  it("loadQueue appends Quick Practice filters when given", async () => {
    getMock.mockResolvedValueOnce([]);
    const store = useHotaruPracticeStore();
    await store.loadQueue("all", "dani", "r2m", {
      tiers: [0, 1, 2],
      lessons: ["L1", "L2"],
      limit: 30,
    });
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/queue?scope=all&user=dani&direction=r2m&tiers=0,1,2&lessons=L1,L2&limit=30",
    );
  });

  it("loadQueue appends limit=0 (All) — omits it only when undefined", async () => {
    getMock.mockResolvedValueOnce([]);
    const store = useHotaruPracticeStore();
    await store.loadQueue("all", "dani", "r2m", { limit: 0 });
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/queue?scope=all&user=dani&direction=r2m&limit=0",
    );
  });

  it("loadQueue surfaces errors", async () => {
    getMock.mockRejectedValueOnce({ detail: "Invalid scope 'x'." });
    const store = useHotaruPracticeStore();
    await store.loadQueue("x", "dani");
    expect(store.error).toBe("Invalid scope 'x'.");
    expect(store.loading).toBe(false);
  });

  it("loadStudy fetches the scope's full word list into `study`", async () => {
    const words = [{ id: "a" }, { id: "b" }, { id: "c" }];
    getMock.mockResolvedValueOnce(words);
    const store = useHotaruPracticeStore();
    await store.loadStudy("lesson:L2", "dani");
    expect(getMock).toHaveBeenCalledWith(
      "/hotaru/practice/study?scope=lesson%3AL2&user=dani",
    );
    expect(store.study.map((w) => w.id)).toEqual(["a", "b", "c"]);
    expect(store.error).toBeNull();
  });

  it("loadStudy surfaces errors", async () => {
    getMock.mockRejectedValueOnce({ detail: "Invalid scope 'x'." });
    const store = useHotaruPracticeStore();
    await store.loadStudy("x", "dani");
    expect(store.error).toBe("Invalid scope 'x'.");
    expect(store.loading).toBe(false);
  });

  it("submitGrades posts the batch without touching loading", async () => {
    const store = useHotaruPracticeStore();
    const grades = [{ word_id: "a", grade: "correct" as const }];
    await store.submitGrades("dani", grades);
    expect(postMock).toHaveBeenCalledWith(
      "/hotaru/practice/grades?user=dani",
      grades,
    );
    expect(store.loading).toBe(false);
  });

  it("submitGrades is a no-op for an empty batch", async () => {
    const store = useHotaruPracticeStore();
    await store.submitGrades("dani", []);
    expect(postMock).not.toHaveBeenCalled();
  });

  it("submitGrades is best-effort: returns false on failure, never touches shared error", async () => {
    postMock.mockRejectedValueOnce({ detail: "boom" });
    const store = useHotaruPracticeStore();
    const ok = await store.submitGrades("dani", [
      { word_id: "a", grade: "close" as const },
    ]);
    expect(ok).toBe(false);
    // A background sync failure must not hijack the drill/picker page error.
    expect(store.error).toBeNull();
  });
});
