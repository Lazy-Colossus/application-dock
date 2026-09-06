import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import TodayFeed from "./TodayFeed.vue";
import type { TodayFeed as Feed } from "@/apps/question-of-the-day/types";

// q-list/q-item aren't globally stubbed; stub what the feed uses, passing
// data-testid through and rendering slots.
const STUBS = {
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template: "<div :data-testid=\"$attrs['data-testid']\"><slot /></div>",
  },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": {
    template: "<div :data-testid=\"$attrs['data-testid']\"><slot /></div>",
  },
};

function mountFeed(feed: Feed | null, questionType: "text" | "scale" = "text") {
  return mount(TodayFeed, {
    props: { feed, questionType },
    global: { stubs: STUBS },
  });
}

const answer = (username: string, text: string, created_at: string) => ({
  username,
  text,
  rating: null,
  created_at,
  updated_at: created_at,
});

describe("TodayFeed", () => {
  it("renders nothing when there is no feed yet", () => {
    const wrapper = mountFeed(null);
    expect(wrapper.find(".qotd-feed").exists()).toBe(false);
  });

  it("shows the locked prompt and a count teaser when withheld", () => {
    const wrapper = mountFeed({ revealed: false, count: 3, answers: [] });
    expect(wrapper.find('[data-testid="feed-locked"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="feed-teaser"]').text()).toContain("3");
    // No answers are rendered while withheld.
    expect(wrapper.find('[data-testid="feed-heading"]').exists()).toBe(false);
  });

  it("omits the teaser when nobody has answered yet", () => {
    const wrapper = mountFeed({ revealed: false, count: 0, answers: [] });
    expect(wrapper.find('[data-testid="feed-locked"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="feed-teaser"]').exists()).toBe(false);
  });

  it("lists attributed text answers once revealed", () => {
    const feed: Feed = {
      revealed: true,
      count: 2,
      answers: [
        answer("alice", "A great day", "2026-09-06T09:00:00Z"),
        answer("bob", "Slept in", "2026-09-06T09:05:00Z"),
      ],
    };
    const wrapper = mountFeed(feed, "text");

    expect(wrapper.find('[data-testid="feed-author-alice"]').text()).toBe(
      "alice",
    );
    expect(wrapper.find('[data-testid="feed-answer-alice"]').text()).toContain(
      "A great day",
    );
    expect(wrapper.find('[data-testid="feed-answer-bob"]').text()).toContain(
      "Slept in",
    );
  });

  it("shows the rating for a scale question", () => {
    const feed: Feed = {
      revealed: true,
      count: 1,
      answers: [
        {
          username: "alice",
          text: null,
          rating: 4,
          created_at: "2026-09-06T09:00:00Z",
          updated_at: "2026-09-06T09:00:00Z",
        },
      ],
    };
    const wrapper = mountFeed(feed, "scale");
    expect(wrapper.find('[data-testid="feed-answer-alice"]').text()).toContain(
      "4",
    );
  });

  it("shows an empty state when revealed with no other answers", () => {
    const wrapper = mountFeed({ revealed: true, count: 0, answers: [] });
    expect(wrapper.find('[data-testid="feed-empty"]').exists()).toBe(true);
  });
});
