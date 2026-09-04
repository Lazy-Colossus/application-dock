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
const { routeRef } = vi.hoisted(() => ({
  routeRef: {
    current: {
      params: { calendarId: "cal-ab12cd34" } as Record<string, string>,
      path: "/kdh/c/cal-ab12cd34",
    },
  },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push }),
  useRoute: () => routeRef.current,
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
  notes: {},
  chosen_dates: [],
  share_token: "tok-secret",
};

const STUBS = {
  // Rendered inline so the hover list can be inspected; Quasar teleports it.
  "q-tooltip": { template: '<div class="tip"><slot /></div>' },
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
    routeRef.current = {
      params: { calendarId: "cal-ab12cd34" },
      path: "/kdh/c/cal-ab12cd34",
    };
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

  it("copies the invitee link, not the admin address bar", async () => {
    mockApi(true);
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
    await wrapper.find('[data-testid="share-action"]').trigger("click");
    await flushPromises();

    // The address bar needs a login the invitees do not have; pasting it into
    // the group chat would send everyone to a login screen.
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      `${window.location.origin}/kdh/s/tok-secret`,
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
      "/kdh/s/tok-secret",
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

  it("does not open a past day at all", async () => {
    mockApi(false, {
      ...CAL,
      invitees: TWO_INVITEES,
      votes: { "2026-09-01": { "inv-2": "yes" } },
    });
    const wrapper = await mountPage();

    const past = wrapper.find('[data-testid="day-2026-09-01"]');
    expect(past.classes()).toContain("past");

    await past.trigger("click");
    expect(wrapper.find('[data-testid="sheet-date"]').exists()).toBe(false);
    // But who was there is still readable, on hover.
    expect(past.find(".kdh-voter").text()).toContain("Jake");
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

  it("does not let even an admin open a past day", () => {
    // Consequence of past days being inert: marking a past day chosen was
    // reachable only through its sheet, so that capability is gone with it.
    // Restoring it means letting an admin through the guard in `DayCell`.
    mockApi(true, { ...CAL, invitees: TWO_INVITEES });
    return mountPage().then(async (wrapper) => {
      await wrapper.find('[data-testid="day-2026-09-01"]').trigger("click");
      expect(wrapper.find('[data-testid="toggle-chosen"]').exists()).toBe(
        false,
      );
      expect(wrapper.find('[data-testid="sheet-date"]').exists()).toBe(false);
    });
  });

  it("offers bulk selection only to someone who has claimed a name", async () => {
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const unclaimed = await mountPage();
    expect(unclaimed.find('[data-testid="select-toggle"]').exists()).toBe(
      false,
    );

    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    const claimed = await mountPage();
    expect(claimed.find('[data-testid="select-toggle"]').exists()).toBe(true);
  });

  it("collects days instead of opening them, and marks them all free", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    putMock.mockResolvedValueOnce({
      ...CAL,
      invitees: TWO_INVITEES,
      votes: {
        "2026-09-14": { "inv-1": "yes" },
        "2026-09-15": { "inv-1": "yes" },
      },
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="select-toggle"]').trigger("click");
    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    await wrapper.find('[data-testid="day-2026-09-15"]').trigger("click");

    // No sheet: a tap collects rather than opens.
    expect(wrapper.find('[data-testid="sheet-date"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="select-bar"]').text()).toContain(
      "2 days selected",
    );

    await wrapper.find('[data-testid="select-apply-yes"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/kdh/calendars/cal-ab12cd34/votes/bulk",
      {
        invitee_id: "inv-1",
        dates: ["2026-09-14", "2026-09-15"],
        status: "yes",
        clear_notes: false,
      },
    );
    // Mode closes on success.
    expect(wrapper.find('[data-testid="select-bar"]').exists()).toBe(false);
  });

  it("deselects a day that is tapped twice", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="select-toggle"]').trigger("click");
    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");

    expect(wrapper.find('[data-testid="select-bar"]').text()).toContain(
      "0 days selected",
    );
    expect(
      wrapper.find('[data-testid="select-apply-yes"]').attributes("disabled"),
    ).toBeDefined();
  });

  it("offers every answer to a selection, not just free", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="select-toggle"]').trigger("click");
    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    await wrapper
      .find('[data-testid="select-apply-if_needed"]')
      .trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/kdh/calendars/cal-ab12cd34/votes/bulk",
      {
        invitee_id: "inv-1",
        dates: ["2026-09-14"],
        status: "if_needed",
        clear_notes: false,
      },
    );
  });

  it("clears the days outright when the answer is Can't", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="select-toggle"]').trigger("click");
    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    await wrapper.find('[data-testid="select-apply-none"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith(
      "/kdh/calendars/cal-ab12cd34/votes/bulk",
      {
        invitee_id: "inv-1",
        dates: ["2026-09-14"],
        status: "none",
        // A note saying why you cannot come outlives answering "Can't".
        clear_notes: false,
      },
    );
  });

  it("will not collect a past day", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="select-toggle"]').trigger("click");
    await wrapper.find('[data-testid="day-2026-09-01"]').trigger("click");

    expect(wrapper.find('[data-testid="select-bar"]').text()).toContain(
      "0 days selected",
    );
  });

  it("keeps the selection when the bulk write fails, so it can be retried", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    putMock.mockRejectedValueOnce(
      new Error("That day has already been and gone"),
    );
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="select-toggle"]').trigger("click");
    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    await wrapper.find('[data-testid="select-apply-yes"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="select-bar"]').text()).toContain(
      "1 day selected",
    );
    expect(wrapper.find('[data-testid="error"]').text()).toContain(
      "been and gone",
    );
  });

  it("saves a note from the day sheet", async () => {
    window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
    mockApi(false, { ...CAL, invitees: TWO_INVITEES });
    putMock.mockResolvedValueOnce({
      ...CAL,
      invitees: TWO_INVITEES,
      notes: { "2026-09-14": { "inv-1": "Only after 8pm" } },
    });
    const wrapper = await mountPage();

    await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
    await wrapper.find('[data-testid="note-open"]').trigger("click");
    await wrapper
      .find('[data-testid="note-input"] input')
      .setValue("Only after 8pm");
    await wrapper.find('[data-testid="note-save"]').trigger("click");
    await flushPromises();

    expect(putMock).toHaveBeenCalledWith("/kdh/calendars/cal-ab12cd34/notes", {
      invitee_id: "inv-1",
      date: "2026-09-14",
      text: "Only after 8pm",
    });
  });

  describe("clearing a month of your own answers", () => {
    // Today is 2026-09-03, so September is the month on screen.
    const VOTED: Calendar = {
      ...CAL,
      invitees: TWO_INVITEES,
      votes: {
        "2026-09-01": { "inv-1": "yes" }, // past: a record, left alone
        "2026-09-03": { "inv-1": "if_needed" }, // today counts as still to come
        "2026-09-14": { "inv-1": "yes", "inv-2": "yes" },
        "2026-09-20": { "inv-2": "yes" }, // not mine
        "2026-10-05": { "inv-1": "yes" }, // another month
      },
      notes: {
        "2026-09-02": { "inv-1": "Past note" }, // past: a record, left alone
        "2026-09-18": { "inv-1": "Only after 8pm" }, // a note with no vote
        "2026-09-25": { "inv-2": "Bring dice" }, // not mine
      },
    };

    async function openMenuAs(admin: boolean, calendar: Calendar = VOTED) {
      window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
      mockApi(admin, calendar);
      const wrapper = await mountPage();
      await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
      return wrapper;
    }

    it("gives a claimed guest the menu, holding only what is theirs", async () => {
      const wrapper = await openMenuAs(false);

      expect(
        wrapper.find('[data-testid="clear-month-action"]').text(),
      ).toContain("September 2026");
      for (const admin of ["rename", "invitees", "share", "delete"]) {
        expect(wrapper.find(`[data-testid="${admin}-action"]`).exists()).toBe(
          false,
        );
      }
    });

    it("keeps the menu away from a guest who has not said who they are", async () => {
      mockApi(false, VOTED);
      const wrapper = await mountPage();
      expect(wrapper.find('[data-testid="admin-menu-btn"]').exists()).toBe(
        false,
      );
    });

    it("clears only your own future answers in the month on screen", async () => {
      const wrapper = await openMenuAs(true);
      await wrapper.find('[data-testid="clear-month-action"]').trigger("click");

      // The count is what will actually disappear, not every day in the month.
      const warning = wrapper
        .find('[data-testid="clear-month-warning"]')
        .text();
      // Three, not two: the 18th carries a note and no vote, and it still goes.
      expect(warning).toContain("3 days");
      expect(warning).toContain("notes you left");

      await wrapper
        .find('[data-testid="clear-month-confirm"]')
        .trigger("click");
      await flushPromises();

      expect(putMock).toHaveBeenCalledWith(
        "/kdh/calendars/cal-ab12cd34/votes/bulk",
        {
          invitee_id: "inv-1",
          // Not 09-01/09-02 (past), not 09-20/09-25 (Jake's), not 10-05
          // (another month). 09-18 is in on the strength of its note alone.
          dates: ["2026-09-03", "2026-09-14", "2026-09-18"],
          status: "none",
          clear_notes: true,
        },
      );
    });

    it("offers nothing to clear in a month you have not answered", async () => {
      const wrapper = await openMenuAs(true, {
        ...CAL,
        invitees: TWO_INVITEES,
        votes: { "2026-09-01": { "inv-1": "yes" } },
        notes: { "2026-09-25": { "inv-2": "Bring dice" } },
      });

      expect(
        wrapper
          .find('[data-testid="clear-month-action"]')
          .attributes("disable"),
      ).toBeDefined();

      await wrapper.find('[data-testid="clear-month-action"]').trigger("click");
      await wrapper
        .find('[data-testid="clear-month-confirm"]')
        .trigger("click");
      await flushPromises();

      // Nothing of mine is left in September to clear, so nothing is written.
      // (Dialog visibility itself is not observable: q-dialog is a passthrough
      // stub in test/setup.ts, so its content is in the DOM either way.)
      expect(putMock).not.toHaveBeenCalled();
    });

    it("surfaces a failed clear instead of swallowing it", async () => {
      putMock.mockRejectedValueOnce(new Error("Calendar not found"));
      const wrapper = await openMenuAs(true);

      await wrapper.find('[data-testid="clear-month-action"]').trigger("click");
      await wrapper
        .find('[data-testid="clear-month-confirm"]')
        .trigger("click");
      await flushPromises();

      expect(wrapper.find('[data-testid="error"]').text()).toContain(
        "Calendar not found",
      );
    });
  });

  describe("opened from an invitee link", () => {
    /** Arrive as somebody with no account, holding only the token. */
    async function mountShared(
      calendar: Calendar = { ...CAL, invitees: TWO_INVITEES },
    ) {
      routeRef.current = {
        params: { shareToken: "tok-secret" },
        path: "/kdh/s/tok-secret",
      };
      getMock.mockImplementation((path: string) => {
        if (path === "/kdh/share/tok-secret")
          return Promise.resolve({ calendar, today: "2026-09-03" });
        return Promise.reject(new Error("should not be called"));
      });
      return mountPage();
    }

    it("asks once, unauthenticated, and never for /kdh/me", async () => {
      await mountShared();

      expect(getMock).toHaveBeenCalledWith("/kdh/share/tok-secret");
      // There is no logged-in user on this path; the date rides along instead.
      expect(getMock).not.toHaveBeenCalledWith("/kdh/me");
      expect(getMock).not.toHaveBeenCalledWith("/kdh/calendars/cal-ab12cd34");
    });

    it("shows the calendar itself", async () => {
      const wrapper = await mountShared();
      expect(wrapper.find('[data-testid="calendar-name"]').text()).toBe("DnD");
      expect(wrapper.find('[data-testid="day-2026-09-14"]').exists()).toBe(
        true,
      );
    });

    it("offers no way back to a list they cannot open", async () => {
      const wrapper = await mountShared();
      expect(wrapper.find('[data-testid="back-btn"]').exists()).toBe(false);
    });

    it("hides the group summary", async () => {
      // Whose silence is whose is the organiser's question, and this names
      // every person to anyone holding the link.
      const wrapper = await mountShared();
      expect(wrapper.find('[data-testid="month-tally"]').exists()).toBe(false);
    });

    it("gives them none of the admin surface", async () => {
      window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
      const wrapper = await mountShared();

      for (const action of ["rename", "invitees", "share", "delete"]) {
        expect(wrapper.find(`[data-testid="${action}-action"]`).exists()).toBe(
          false,
        );
      }
      // Nor the marking control, which lives in the day sheet.
      await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
      expect(wrapper.find('[data-testid="toggle-chosen"]').exists()).toBe(
        false,
      );
    });

    it("lets them vote, through the public route", async () => {
      window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
      const wrapper = await mountShared();

      await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
      await wrapper.find('[data-testid="set-yes"]').trigger("click");
      await flushPromises();

      expect(putMock).toHaveBeenCalledWith("/kdh/share/tok-secret/votes", {
        invitee_id: "inv-1",
        date: "2026-09-14",
        status: "yes",
      });
    });

    it("lets them leave a note, through the public route", async () => {
      window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
      const wrapper = await mountShared();

      await wrapper.find('[data-testid="day-2026-09-14"]').trigger("click");
      await wrapper.find('[data-testid="note-open"]').trigger("click");
      await wrapper
        .find('[data-testid="note-input"] input')
        .setValue("Only after 8pm");
      await wrapper.find('[data-testid="note-save"]').trigger("click");
      await flushPromises();

      expect(putMock).toHaveBeenCalledWith("/kdh/share/tok-secret/notes", {
        invitee_id: "inv-1",
        date: "2026-09-14",
        text: "Only after 8pm",
      });
    });

    it("lets them clear their own month, through the public route", async () => {
      window.localStorage.setItem("kdh.claim.cal-ab12cd34", "inv-1");
      const wrapper = await mountShared({
        ...CAL,
        invitees: TWO_INVITEES,
        votes: { "2026-09-14": { "inv-1": "yes" } },
      });

      await wrapper.find('[data-testid="admin-menu-btn"]').trigger("click");
      await wrapper.find('[data-testid="clear-month-action"]').trigger("click");
      await wrapper
        .find('[data-testid="clear-month-confirm"]')
        .trigger("click");
      await flushPromises();

      expect(putMock).toHaveBeenCalledWith("/kdh/share/tok-secret/votes/bulk", {
        invitee_id: "inv-1",
        dates: ["2026-09-14"],
        status: "none",
        clear_notes: true,
      });
    });

    it("says a dead link is dead without saying why", async () => {
      routeRef.current = {
        params: { shareToken: "tok-gone" },
        path: "/kdh/s/tok-gone",
      };
      getMock.mockRejectedValue(new Error("Not found"));
      const wrapper = await mountPage();

      const text = wrapper.find('[data-testid="not-found"]').text();
      expect(text).toContain("This link no longer works");
      // A revoked token and a deleted calendar read the same, so probing
      // cannot tell them apart.
      expect(text).not.toContain("no longer exists");
      expect(wrapper.find('[data-testid="not-found-back"]').exists()).toBe(
        false,
      );
    });
  });
});
