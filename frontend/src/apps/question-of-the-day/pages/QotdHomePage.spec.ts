import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: putMock, del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import QotdHomePage from "./QotdHomePage.vue";
import type { TodayView } from "@/apps/question-of-the-day/types";

const TEXT_TODAY: TodayView = {
  date: "2026-09-06",
  question: {
    id: "q-highlight",
    text: "Best part of your day?",
    type: "text",
    scale: null,
  },
  answered: false,
  my_answer: null,
};

const SCALE_TODAY: TodayView = {
  date: "2026-09-06",
  question: {
    id: "q-energy",
    text: "How is your energy?",
    type: "scale",
    scale: { min: 1, max: 5, min_label: "Empty", max_label: "Charged" },
  },
  answered: false,
  my_answer: null,
};

// The form's own behaviour is covered in AnswerForm.spec; here we only verify
// the page renders it with the right props and wires its submit to the store.
const AnswerFormStub = {
  name: "AnswerForm",
  props: ["question", "initial", "loading", "error"],
  emits: ["submit"],
  template:
    '<div data-testid="answer-form" :data-qtype="question.type" :data-has-initial="initial ? \'1\' : \'0\'">' +
    "<button data-testid=\"stub-submit\" @click=\"$emit('submit', { text: 'from form' })\">go</button>" +
    "</div>",
};

const QBtnStub = {
  template:
    "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\">{{ label }}</button>",
  props: ["label"],
  emits: ["click"],
};

// TodayFeed's own behaviour is covered in TodayFeed.spec; stub it here.
const TodayFeedStub = { name: "TodayFeed", template: "<div />" };

const MOUNT_OPTS = {
  global: {
    stubs: {
      AnswerForm: AnswerFormStub,
      TodayFeed: TodayFeedStub,
      "q-btn": QBtnStub,
    },
  },
};

async function mountPage() {
  const wrapper = mount(QotdHomePage, MOUNT_OPTS);
  await flushPromises();
  return wrapper;
}

describe("QotdHomePage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("shows the date and question and renders the text answer form", async () => {
    getMock.mockResolvedValueOnce(TEXT_TODAY);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="question-text"]').text()).toBe(
      "Best part of your day?",
    );
    expect(wrapper.find('[data-testid="today-date"]').text()).not.toBe("");
    expect(
      wrapper.find('[data-testid="answer-form"]').attributes("data-qtype"),
    ).toBe("text");
  });

  it("renders the form for a scale question", async () => {
    getMock.mockResolvedValueOnce(SCALE_TODAY);
    const wrapper = await mountPage();
    expect(
      wrapper.find('[data-testid="answer-form"]').attributes("data-qtype"),
    ).toBe("scale");
  });

  it("passes the caller's saved answer to the form for pre-fill", async () => {
    getMock.mockResolvedValueOnce({
      ...TEXT_TODAY,
      answered: true,
      my_answer: {
        text: "saved",
        rating: null,
        created_at: "2026-09-06T10:00:00Z",
        updated_at: "2026-09-06T10:00:00Z",
      },
    });
    const wrapper = await mountPage();
    expect(
      wrapper
        .find('[data-testid="answer-form"]')
        .attributes("data-has-initial"),
    ).toBe("1");
  });

  it("wires the form's submit to the store", async () => {
    getMock.mockResolvedValueOnce(TEXT_TODAY);
    putMock.mockResolvedValueOnce({
      text: "from form",
      rating: null,
      created_at: "2026-09-06T10:00:00Z",
      updated_at: "2026-09-06T10:00:00Z",
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="stub-submit"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/qotd/today/answer", {
      text: "from form",
    });
  });

  it("links to the history of past questions", async () => {
    getMock.mockResolvedValueOnce(TEXT_TODAY);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="history-link"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/question-of-the-day/history");
  });

  it("surfaces a failed load and shows no form", async () => {
    // Both the today and feed fetches fail together on a network outage.
    getMock.mockRejectedValue(new Error("network down"));
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="error"]').text()).toContain(
      "network down",
    );
    expect(wrapper.find('[data-testid="answer-form"]').exists()).toBe(false);
  });
});
