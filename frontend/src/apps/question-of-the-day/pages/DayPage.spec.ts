import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({ params: { date: "2026-09-08" } }),
}));

import DayPage from "./DayPage.vue";
import type { PastDayView } from "@/apps/question-of-the-day/types";

const DAY: PastDayView = {
  date: "2026-09-08",
  question: {
    id: "q-highlight",
    text: "Best part of your day?",
    type: "text",
    scale: null,
  },
  answers: [
    {
      username: "alice",
      text: "A great day",
      rating: null,
      created_at: "2026-09-08T09:00:00Z",
      updated_at: "2026-09-08T09:00:00Z",
    },
    {
      username: "bob",
      text: "Slept in",
      rating: null,
      created_at: "2026-09-08T09:05:00Z",
      updated_at: "2026-09-08T09:05:00Z",
    },
  ],
};

const STUBS = {
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template: "<div :data-testid=\"$attrs['data-testid']\"><slot /></div>",
  },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"></button>",
    emits: ["click"],
  },
};

async function mountPage() {
  const wrapper = mount(DayPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

describe("DayPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("fetches the day from the route param and renders answers read-only", async () => {
    getMock.mockResolvedValueOnce(DAY);
    const wrapper = await mountPage();

    expect(getMock).toHaveBeenCalledWith("/qotd/days/2026-09-08");
    expect(wrapper.find('[data-testid="question-text"]').text()).toBe(
      "Best part of your day?",
    );
    expect(wrapper.find('[data-testid="day-answer-alice"]').text()).toContain(
      "A great day",
    );
    expect(wrapper.find('[data-testid="day-answer-bob"]').text()).toContain(
      "Slept in",
    );
    // Read-only: there is no answer form on a past day.
    expect(wrapper.find('[data-testid="answer-textarea"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="submit-answer"]').exists()).toBe(false);
  });

  it("shows a calm empty state when nobody answered", async () => {
    getMock.mockResolvedValueOnce({ ...DAY, answers: [] });
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="day-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="day-answer-alice"]').exists()).toBe(
      false,
    );
  });

  it("surfaces a load failure", async () => {
    getMock.mockRejectedValueOnce(new Error("Day not found"));
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="error"]').text()).toContain(
      "Day not found",
    );
  });
});
