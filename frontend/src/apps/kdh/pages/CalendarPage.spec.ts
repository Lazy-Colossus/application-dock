import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, delMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: vi.fn(), put: putMock, del: delMock },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => ({
    params: { calendarId: "cal-ab12cd34" },
    path: "/kdh/c/cal-ab12cd34",
  }),
}));

import CalendarPage from "./CalendarPage.vue";
import type { Calendar } from "@/apps/kdh/types";

const CAL: Calendar = {
  schema_version: 1,
  id: "cal-ab12cd34",
  name: "DnD",
  created_at: "2026-09-03T10:00:00Z",
  created_by: "jake",
  updated_at: "2026-09-03T10:00:00Z",
  invitees: [
    { id: "inv-1", name: "Dani", color: "#E9A6A0", order: 0, removed_at: null },
  ],
  votes: {},
  chosen_dates: [],
};

const STUBS = {
  "q-list": { template: "<div><slot /></div>" },
  "q-item": {
    template:
      "<div :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\"><slot /></div>",
    emits: ["click"],
  },
  "q-item-section": { template: "<div><slot /></div>" },
};
const MOUNT_OPTS = { global: { stubs: STUBS, directives: { ripple: {} } } };

function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

function mockApi(isAdmin: boolean, calendar: unknown = CAL, fails = false) {
  getMock.mockImplementation((path: string) => {
    if (path === "/kdh/me")
      return Promise.resolve({
        username: isAdmin ? "jake" : "players",
        is_admin: isAdmin,
      });
    return fails
      ? Promise.reject(new Error("Calendar not found"))
      : Promise.resolve(calendar);
  });
}

async function mountPage() {
  const wrapper = mount(CalendarPage, MOUNT_OPTS);
  await flushPromises();
  return wrapper;
}

describe("CalendarPage", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    // `navigator.clipboard` is getter-only in jsdom, so it has to be redefined
    // rather than assigned.
    stubClipboard(vi.fn().mockResolvedValue(undefined));
  });

  it("shows the calendar's name", async () => {
    mockApi(true);
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="calendar-name"]').text()).toBe("DnD");
  });

  it("goes back to the list", async () => {
    mockApi(true);
    const wrapper = await mountPage();
    await wrapper.find('[data-testid="back-btn"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/kdh");
  });

  it("shows a guest no admin menu at all", async () => {
    mockApi(false);
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="admin-menu-btn"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="rename-action"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="delete-action"]').exists()).toBe(false);
  });

  it("gives an admin the menu", async () => {
    mockApi(true);
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="admin-menu-btn"]').exists()).toBe(true);
  });

  it("renames the calendar in place", async () => {
    mockApi(true);
    putMock.mockResolvedValueOnce({ ...CAL, name: "Strahd" });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="rename-action"]').trigger("click");
    await wrapper.find('[data-testid="rename-input"] input').setValue("Strahd");
    await wrapper.find('[data-testid="rename-save"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/kdh/calendars/cal-ab12cd34", {
      name: "Strahd",
    });
    expect(wrapper.find('[data-testid="calendar-name"]').text()).toBe("Strahd");
    expect(push).not.toHaveBeenCalled();
  });

  it("will not submit a blank rename", async () => {
    mockApi(true);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="rename-action"]').trigger("click");
    await wrapper.find('[data-testid="rename-input"] input').setValue("   ");

    expect(
      wrapper.find('[data-testid="rename-save"]').attributes("disable"),
    ).toBeDefined();
  });

  it("names the calendar in the delete confirmation before deleting", async () => {
    mockApi(true);
    delMock.mockResolvedValueOnce(undefined);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="delete-action"]').trigger("click");

    expect(wrapper.find('[data-testid="delete-warning"]').text()).toContain(
      "DnD",
    );
    expect(delMock).not.toHaveBeenCalled();

    await wrapper.find('[data-testid="delete-confirm"]').trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith("/kdh/calendars/cal-ab12cd34");
    expect(push).toHaveBeenCalledWith("/kdh");
  });

  it("copies an absolute link", async () => {
    mockApi(true);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="share-action"]').trigger("click");
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/kdh/c/cal-ab12cd34`,
    );
    expect(wrapper.find('[data-testid="copy-notice"]').text()).toContain(
      "copied",
    );
  });

  it("shows the link to copy by hand when the clipboard is unavailable", async () => {
    mockApi(true);
    stubClipboard(vi.fn().mockRejectedValue(new Error("insecure context")));
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="share-action"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="copy-notice"]').text()).toContain(
      "/kdh/c/cal-ab12cd34",
    );
  });

  it("shows a not-found state instead of an error banner for a missing calendar", async () => {
    mockApi(true, null, true);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="not-found"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="error"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="admin-menu-btn"]').exists()).toBe(false);

    await wrapper.find('[data-testid="not-found-back"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/kdh");
  });
});
