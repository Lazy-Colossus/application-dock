import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock, push } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
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

const TWO_INVITEES = [
  { id: "inv-1", name: "Dani", order: 0, removed_at: null },
  { id: "inv-2", name: "Jake", order: 1, removed_at: null },
];

const CAL: Calendar = {
  schema_version: 1,
  id: "cal-ab12cd34",
  name: "DnD",
  created_at: "2026-09-03T10:00:00Z",
  created_by: "jake",
  updated_at: "2026-09-03T10:00:00Z",
  invitees: [{ id: "inv-1", name: "Dani", order: 0, removed_at: null }],
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
        today: "2026-09-03",
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
    window.localStorage.clear();
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

  it("lists the roster and adds an invitee", async () => {
    mockApi(true);
    postMock.mockResolvedValueOnce({
      ...CAL,
      invitees: [
        ...CAL.invitees,
        {
          id: "inv-2",
          name: "Jake",
          order: 1,
          removed_at: null,
        },
      ],
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="invitees-action"]').trigger("click");
    expect(wrapper.find('[data-testid="roster"]').text()).toContain("Dani");

    await wrapper
      .find('[data-testid="invitee-name-input"] input')
      .setValue("Jake");
    await wrapper.find('[data-testid="invitee-add"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/kdh/calendars/cal-ab12cd34/invitees",
      {
        name: "Jake",
      },
    );
    expect(wrapper.find('[data-testid="roster"]').text()).toContain("Jake");
  });

  it("will not submit a name already on the roster", async () => {
    mockApi(true);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="invitees-action"]').trigger("click");
    await wrapper
      .find('[data-testid="invitee-name-input"] input')
      .setValue(" dani ");

    expect(wrapper.find('[data-testid="invitee-duplicate"]').exists()).toBe(
      true,
    );
    expect(
      wrapper.find('[data-testid="invitee-add"]').attributes("disable"),
    ).toBeDefined();
    expect(postMock).not.toHaveBeenCalled();
  });

  it("gives a guest no way to manage invitees", async () => {
    mockApi(false);
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="invitees-action"]').exists()).toBe(
      false,
    );
  });

  it("warns what is kept before removing an invitee", async () => {
    mockApi(true);
    delMock.mockResolvedValueOnce({ ...CAL, invitees: [] });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="invitees-action"]').trigger("click");
    await wrapper.find('[data-testid="remove-inv-1"]').trigger("click");

    const warning = wrapper.find('[data-testid="remove-warning"]').text();
    expect(warning).toContain("from today onwards will be cleared");
    expect(warning).toContain("past keep their answers");
    expect(delMock).not.toHaveBeenCalled();

    await wrapper.find('[data-testid="remove-confirm"]').trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith(
      "/kdh/calendars/cal-ab12cd34/invitees/inv-1",
    );
    expect(wrapper.find('[data-testid="roster"]').text()).not.toContain("Dani");
  });

  it("does not show tombstoned invitees on the roster", async () => {
    mockApi(true, {
      ...CAL,
      invitees: [
        ...CAL.invitees,
        {
          id: "inv-gone",
          name: "Departed",
          order: 1,
          removed_at: "2026-08-20T18:00:00Z",
        },
      ],
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="invitees-action"]').trigger("click");

    const roster = wrapper.find('[data-testid="roster"]').text();
    expect(roster).toContain("Dani");
    expect(roster).not.toContain("Departed");
  });

  it("asks who you are until a name is claimed", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="whoami-btn"]').text()).toContain(
      "Who are you?",
    );
  });

  it("claims a name and remembers it", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="whoami-btn"]').trigger("click");
    await wrapper.find('[data-testid="claim-inv-2"]').trigger("click");

    expect(wrapper.find('[data-testid="whoami-btn"]').text()).toContain("Jake");
    expect(window.localStorage.getItem("kdh.claim.cal-ab12cd34")).toBe("inv-2");
  });

  it("restores a stored claim on a later visit", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="whoami-btn"]').text()).toContain("Dani");
  });

  it("discards a stored claim naming someone since removed", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-gone");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="whoami-btn"]').text()).toContain(
      "Who are you?",
    );
    expect(window.localStorage.getItem("kdh.claim.cal-ab12cd34")).toBeNull();
  });

  it("switches to a different name by picking one", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="whoami-btn"]').trigger("click");
    await wrapper.find('[data-testid="claim-inv-1"]').trigger("click");
    expect(wrapper.find('[data-testid="whoami-btn"]').text()).toContain("Dani");

    await wrapper.find('[data-testid="whoami-btn"]').trigger("click");
    await wrapper.find('[data-testid="claim-inv-2"]').trigger("click");

    expect(wrapper.find('[data-testid="whoami-btn"]').text()).toContain("Jake");
    expect(window.localStorage.getItem("kdh.claim.cal-ab12cd34")).toBe("inv-2");
  });

  it("has no release control — switching is done by picking someone else", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="whoami-btn"]').trigger("click");
    await wrapper.find('[data-testid="claim-inv-1"]').trigger("click");
    await wrapper.find('[data-testid="whoami-btn"]').trigger("click");

    expect(wrapper.find('[data-testid="release-claim"]').exists()).toBe(false);
  });

  it("offers only active invitees as names to claim", async () => {
    mockApi(false, {
      ...CAL,
      invitees: [
        ...TWO_INVITEES,
        {
          id: "inv-gone",
          name: "Departed",
          order: 2,
          removed_at: "2026-08-20T18:00:00Z",
        },
      ],
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="whoami-btn"]').trigger("click");
    expect(wrapper.find('[data-testid="claim-inv-1"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="claim-inv-gone"]').exists()).toBe(false);
  });

  it("offers the name control to guests, since claiming is not an admin action", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="whoami-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="admin-menu-btn"]').exists()).toBe(false);
  });

  it("shows how many people are invited beside the calendar name", async () => {
    mockApi(true, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="headcount"]').text()).toBe("2");
  });

  it("counts only active invitees in the headcount", async () => {
    mockApi(true, {
      ...CAL,
      invitees: [
        ...TWO_INVITEES,
        {
          id: "inv-gone",
          name: "Departed",
          order: 2,
          removed_at: "2026-08-20T18:00:00Z",
        },
      ],
    });
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="headcount"]').text()).toBe("2");
  });

  it("marks the name control as unanswered until you claim one", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="whoami-btn"]').classes()).toContain(
      "unclaimed",
    );
  });

  it("drops the unanswered treatment once a name is claimed", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="whoami-btn"]').trigger("click");
    await wrapper.find('[data-testid="claim-inv-1"]').trigger("click");

    expect(wrapper.find('[data-testid="whoami-btn"]').classes()).not.toContain(
      "unclaimed",
    );
  });

  it("renders the month on the server's current month", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="month-label"]').text()).toBe(
      "September 2026",
    );
    expect(wrapper.find('[data-testid="day-2026-09-14"]').exists()).toBe(true);
  });

  it("prompts an unclaimed visitor from inside the day they tapped", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");

    // The sheet opens either way — it is useful to read. What is missing is the
    // ability to answer, and the prompt says so in the day's own context.
    expect(wrapper.find('[data-testid="sheet-date"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="set-yes"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="claim-prompt"]').exists()).toBe(true);

    await wrapper.find('[data-testid="claim-prompt"]').trigger("click");
    expect(wrapper.find('[data-testid="claim-inv-1"]').exists()).toBe(true);
  });

  it("offers no claim prompt on a day nobody can answer any more", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="day-2026-09-01"]').trigger("click");
    expect(wrapper.find('[data-testid="claim-prompt"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="sheet-past"]').exists()).toBe(true);
  });

  it("opens the day sheet once a name is claimed", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, {
      ...CAL,
      invitees: TWO_INVITEES,
      votes: { "2026-09-14": { "inv-2": "yes" } },
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");

    expect(wrapper.find('[data-testid="sheet-date"]').text()).toContain(
      "September",
    );
    expect(wrapper.find('[data-testid="sheet-row-inv-2"]').text()).toContain(
      "Jake",
    );
  });

  it("votes from the day sheet", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    putMock.mockResolvedValueOnce({
      ...CAL,
      invitees: TWO_INVITEES,
      votes: { "2026-09-14": { "inv-1": "yes" } },
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    await wrapper.find('[data-testid="set-yes"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/kdh/calendars/cal-ab12cd34/votes", {
      invitee_id: "inv-1",
      date: "2026-09-14",
      status: "yes",
    });
    expect(wrapper.find('[data-testid="day-2026-09-14"]').text()).toContain(
      "1",
    );
  });

  it("opens a past day read-only — no vote controls", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, {
      ...CAL,
      invitees: TWO_INVITEES,
      votes: { "2026-09-01": { "inv-2": "yes" } },
    });
    const wrapper = await mountPage();

    const past = wrapper.find('[data-testid="day-2026-09-01"]');
    expect(past.classes()).toContain("past");

    await past.trigger("click");
    expect(wrapper.find('[data-testid="sheet-past"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="set-yes"]').exists()).toBe(false);
    // ...but it still shows who was there.
    expect(wrapper.find('[data-testid="sheet-row-inv-2"]').text()).toContain(
      "Jake",
    );
  });

  it("leaves today votable", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    const today = wrapper.find('[data-testid="day-2026-09-03"]');
    expect(today.classes()).toContain("today");
    expect(today.classes()).not.toContain("past");

    await today.trigger("click");
    expect(wrapper.find('[data-testid="sheet-date"]').exists()).toBe(true);
  });

  it("an admin marks the day from the sheet, and the cell shows it", async () => {
    mockApi(true, { ...CAL, invitees: TWO_INVITEES });
    putMock.mockResolvedValueOnce({
      ...CAL,
      invitees: TWO_INVITEES,
      chosen_dates: ["2026-09-14"],
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    await wrapper.find('[data-testid="toggle-chosen"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/kdh/calendars/cal-ab12cd34/chosen", {
      date: "2026-09-14",
      chosen: true,
    });
    expect(
      wrapper.find('[data-testid="day-2026-09-14"]').find(".crown").exists(),
    ).toBe(true);
  });

  it("shows a guest the chosen day but no way to change it", async () => {
    mockApi(false, {
      ...CAL,
      invitees: TWO_INVITEES,
      chosen_dates: ["2026-09-14"],
    });
    const wrapper = await mountPage();

    expect(
      wrapper.find('[data-testid="day-2026-09-14"]').find(".crown").exists(),
    ).toBe(true);

    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    expect(wrapper.find('[data-testid="toggle-chosen"]').exists()).toBe(false);
  });

  it("an admin may mark a past day", async () => {
    mockApi(true, { ...CAL, invitees: TWO_INVITEES });
    putMock.mockResolvedValueOnce({
      ...CAL,
      invitees: TWO_INVITEES,
      chosen_dates: ["2026-09-01"],
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="day-2026-09-01"]').trigger("click");
    await wrapper.find('[data-testid="toggle-chosen"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/kdh/calendars/cal-ab12cd34/chosen", {
      date: "2026-09-01",
      chosen: true,
    });
  });
});
