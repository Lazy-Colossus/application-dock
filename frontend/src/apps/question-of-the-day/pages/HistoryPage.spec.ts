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
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import HistoryPage from "./HistoryPage.vue";
import type { HistoryRow } from "@/apps/question-of-the-day/types";

const ROWS: HistoryRow[] = [
  { date: "2026-09-09", question_text: "Best part of your day?", type: "text" },
  { date: "2026-09-08", question_text: "Energy?", type: "scale" },
];

const STUBS = {
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template:
      "<div :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></div>",
    emits: ["click"],
  },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": { template: "<div><slot /></div>" },
  "q-icon": { template: "<i></i>" },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\">{{ label }}</button>",
    props: ["label"],
    emits: ["click"],
  },
};

async function mountPage() {
  const wrapper = mount(HistoryPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

describe("HistoryPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("renders a row per past day, newest-first", async () => {
    getMock.mockResolvedValueOnce(ROWS);
    const wrapper = await mountPage();

    expect(getMock).toHaveBeenCalledWith("/qotd/history");
    expect(wrapper.find('[data-testid="history-2026-09-09"]').text()).toContain(
      "Best part of your day?",
    );
    expect(wrapper.find('[data-testid="history-2026-09-08"]').text()).toContain(
      "Energy?",
    );
  });

  it("links a row to that day's detail", async () => {
    getMock.mockResolvedValueOnce(ROWS);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="history-2026-09-08"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/question-of-the-day/days/2026-09-08");
  });

  it("shows a calm empty state when there are no past days", async () => {
    getMock.mockResolvedValueOnce([]);
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="empty-state"]').exists()).toBe(true);
  });

  it("surfaces a load failure", async () => {
    getMock.mockRejectedValueOnce(new Error("network down"));
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="error"]').text()).toContain(
      "network down",
    );
  });
});
