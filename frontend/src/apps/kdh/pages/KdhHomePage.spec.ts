import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import KdhHomePage from "./KdhHomePage.vue";
import type { Calendar } from "@/apps/kdh/types";

const SUMMARIES = [
  {
    id: "cal-1",
    name: "DnD",
    invitee_count: 6,
    created_at: "2026-09-03T10:00:00Z",
  },
  {
    id: "cal-2",
    name: "Movie night",
    invitee_count: 1,
    created_at: "2026-09-02T10:00:00Z",
  },
];

const CREATED: Calendar = {
  schema_version: 1,
  id: "cal-new",
  name: "Birthday",
  created_at: "2026-09-03T12:00:00Z",
  created_by: "jake",
  updated_at: "2026-09-03T12:00:00Z",
  invitees: [
    { id: "inv-1", name: "Dani", color: "#e8643a", order: 0, removed_at: null },
  ],
  votes: {},
  chosen_dates: [],
};

// Quasar list components are not in the global stub set (test/setup.ts); the
// house pattern is to stub what a page actually uses, locally. `q-item` keeps
// its data-testid and re-emits click so selection can be driven.
const STUBS = {
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template:
      "<div :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></div>",
    emits: ["click"],
  },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": { template: "<div><slot /></div>" },
};

const MOUNT_OPTS = {
  global: { stubs: STUBS, directives: { ripple: {} } },
};

/** `fetchMe` and `fetchCalendars` fire together in onMounted, so the mock is
 *  routed by path rather than by call order. */
function mockApi(isAdmin: boolean, calendars: unknown[] = SUMMARIES) {
  getMock.mockImplementation((path: string) =>
    path === "/kdh/me"
      ? Promise.resolve({
          username: isAdmin ? "jake" : "players",
          is_admin: isAdmin,
        })
      : Promise.resolve(calendars),
  );
}

async function mountPage() {
  const wrapper = mount(KdhHomePage, MOUNT_OPTS);
  await flushPromises();
  return wrapper;
}

describe("KdhHomePage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
  });

  it("lists every calendar with its invitee count", async () => {
    mockApi(true);
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain("DnD");
    expect(wrapper.text()).toContain("6 people invited");
    expect(wrapper.text()).toContain("Movie night");
    expect(wrapper.text()).toContain("1 person invited");
  });

  it("opens a calendar on selection", async () => {
    mockApi(true);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="calendar-cal-1"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/kdh/c/cal-1");
  });

  it("prompts an admin to create the first calendar", async () => {
    mockApi(true, []);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain(
      "create one",
    );
    expect(wrapper.find('[data-testid="new-calendar-btn"]').exists()).toBe(
      true,
    );
  });

  it("tells a guest to ask an admin, and shows no create control at all", async () => {
    mockApi(false, []);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="empty-state"]').text()).toContain(
      "ask an admin",
    );
    expect(wrapper.find('[data-testid="new-calendar-btn"]').exists()).toBe(
      false,
    );
  });

  it("hides the create control from a guest even when calendars exist", async () => {
    mockApi(false);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="new-calendar-btn"]').exists()).toBe(
      false,
    );
    expect(wrapper.text()).toContain("DnD");
  });

  it("creates a calendar and navigates to it", async () => {
    mockApi(true, []);
    postMock.mockResolvedValueOnce(CREATED);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="new-calendar-btn"]').trigger("click");
    await wrapper
      .find('[data-testid="calendar-name-input"] input')
      .setValue("Birthday");
    await wrapper
      .find('[data-testid="invitee-input-0"] input')
      .setValue("Dani");
    await wrapper.find('[data-testid="create-calendar-btn"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/kdh/calendars", {
      name: "Birthday",
      invitee_names: ["Dani"],
    });
    expect(push).toHaveBeenCalledWith("/kdh/c/cal-new");
  });

  it("keeps the dialog open and shows the message when create fails", async () => {
    mockApi(true, []);
    postMock.mockRejectedValueOnce(new Error("Duplicate invitee name: Dani"));
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="new-calendar-btn"]').trigger("click");
    await wrapper
      .find('[data-testid="calendar-name-input"] input')
      .setValue("Birthday");
    await wrapper
      .find('[data-testid="invitee-input-0"] input')
      .setValue("Dani");
    await wrapper.find('[data-testid="create-calendar-btn"]').trigger("click");
    await flushPromises();

    expect(push).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="error"]').text()).toContain("Duplicate");
  });

  it("warns about a duplicate name before the server has to", async () => {
    mockApi(true, []);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="new-calendar-btn"]').trigger("click");
    await wrapper
      .find('[data-testid="calendar-name-input"] input')
      .setValue("Birthday");
    await wrapper
      .find('[data-testid="invitee-input-0"] input')
      .setValue("Dani");
    await wrapper.find('[data-testid="add-invitee-btn"]').trigger("click");
    await wrapper
      .find('[data-testid="invitee-input-1"] input')
      .setValue(" dani ");

    expect(wrapper.find('[data-testid="duplicate-warning"]').exists()).toBe(
      true,
    );
    expect(
      wrapper.find('[data-testid="create-calendar-btn"]').attributes("disable"),
    ).toBeDefined();
  });

  it("surfaces a failed load", async () => {
    getMock.mockRejectedValue(new Error("network down"));
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="error"]').text()).toContain(
      "network down",
    );
  });
});
