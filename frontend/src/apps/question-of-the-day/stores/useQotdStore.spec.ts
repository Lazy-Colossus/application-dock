import { describe, it, expect, vi, beforeEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: putMock, del: vi.fn() },
}));

import { useQotdStore } from "./useQotdStore";
import type {
  Answer,
  TodayFeed,
  TodayView,
} from "@/apps/question-of-the-day/types";

const TODAY: TodayView = {
  date: "2026-09-06",
  question: { id: "q1", text: "?", type: "text", scale: null },
  answered: false,
  my_answer: null,
};

const SAVED: Answer = {
  text: "my answer",
  rating: null,
  created_at: "2026-09-06T10:00:00Z",
  updated_at: "2026-09-06T10:00:00Z",
};

const LOCKED_FEED: TodayFeed = { revealed: false, count: 1, answers: [] };
const REVEALED_FEED: TodayFeed = {
  revealed: true,
  count: 2,
  answers: [
    { username: "alice", ...SAVED },
    { username: "test_user", ...SAVED },
  ],
};

// fetchToday and fetchFeed both GET; route the mock by path.
function routeGet(view: TodayView, feed: TodayFeed) {
  getMock.mockImplementation((path: string) =>
    Promise.resolve(path === "/qotd/today/answers" ? feed : view),
  );
}

describe("useQotdStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("loads today's view and clears loading afterwards", async () => {
    getMock.mockResolvedValueOnce(TODAY);
    const store = useQotdStore();

    const pending = store.fetchToday();
    expect(store.loading).toBe(true);
    await pending;

    expect(store.today).toEqual(TODAY);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("routes a load failure into error and clears loading", async () => {
    getMock.mockRejectedValueOnce(new Error("boom"));
    const store = useQotdStore();

    await store.fetchToday();

    expect(store.error).toContain("boom");
    expect(store.loading).toBe(false);
    expect(store.today).toBeNull();
  });

  it("keeps the feed withheld until answered, revealed after", async () => {
    getMock.mockResolvedValueOnce(LOCKED_FEED);
    const store = useQotdStore();
    await store.fetchFeed();
    expect(store.feed).toEqual(LOCKED_FEED);
    expect(store.loading).toBe(false);
  });

  it("submits an answer, updates own answer, and unlocks the feed in place", async () => {
    // A fresh copy: submitAnswer mutates today in place, which must not leak
    // into the shared fixture used by other tests.
    routeGet({ ...TODAY }, REVEALED_FEED);
    putMock.mockResolvedValueOnce(SAVED);
    const store = useQotdStore();
    await store.fetchToday();

    await store.submitAnswer({ text: "my answer" });

    expect(putMock).toHaveBeenCalledWith("/qotd/today/answer", {
      text: "my answer",
    });
    expect(store.today?.answered).toBe(true);
    expect(store.today?.my_answer).toEqual(SAVED);
    // The feed was refetched and is now revealed.
    expect(getMock).toHaveBeenCalledWith("/qotd/today/answers");
    expect(store.feed?.revealed).toBe(true);
    expect(store.error).toBeNull();
    expect(store.loading).toBe(false);
  });

  it("surfaces a submit failure, rethrows, and does not refetch the feed", async () => {
    getMock.mockResolvedValueOnce({ ...TODAY });
    putMock.mockRejectedValueOnce(new Error("an answer must not be empty"));
    const store = useQotdStore();
    await store.fetchToday();

    await expect(store.submitAnswer({ text: "" })).rejects.toThrow();
    expect(store.error).toContain("must not be empty");
    expect(store.today?.answered).toBe(false); // unchanged on failure
    // Feed endpoint was never called (only the initial fetchToday GET happened).
    expect(getMock).not.toHaveBeenCalledWith("/qotd/today/answers");
    expect(store.loading).toBe(false);
  });
});
