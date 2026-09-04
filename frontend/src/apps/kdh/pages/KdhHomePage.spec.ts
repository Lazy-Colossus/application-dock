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
    invitee_names: ["Dani", "Jake", "Tom", "Ash", "Kit", "Rae"],
    created_at: "2026-09-03T10:00:00Z",
    next_session: null,
    last_session: null,
    share_token: "tok-dnd",
  },
  {
    id: "cal-2",
    name: "Movie night",
    invitee_count: 1,
    invitee_names: ["Dani"],
    created_at: "2026-09-02T10:00:00Z",
    next_session: null,
    last_session: null,
    share_token: "tok-movie",
  },
];

const CREATED: Calendar = {
  schema_version: 1,
  id: "cal-new",
  name: "Birthday",
  created_at: "2026-09-03T12:00:00Z",
  created_by: "jake",
  updated_at: "2026-09-03T12:00:00Z",
  invitees: [{ id: "inv-1", name: "Dani", order: 0, removed_at: null }],
  votes: {},
  notes: {},
  chosen_dates: [],
  share_token: "tok-secret",
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
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" :aria-label=\"$attrs['aria-label']\" @click=\"$emit('click', $event)\">{{ $attrs.label }}</button>",
    emits: ["click"],
  },
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

  it("shows a headcount beside the name and the roster beneath it", async () => {
    mockApi(true);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="headcount-cal-1"]').text()).toBe("6");
    expect(wrapper.find('[data-testid="roster-cal-1"]').text()).toBe(
      "Dani, Jake, Tom, Ash, Kit, Rae",
    );

    expect(wrapper.find('[data-testid="headcount-cal-2"]').text()).toBe("1");
    expect(wrapper.find('[data-testid="roster-cal-2"]').text()).toBe("Dani");
  });

  it("trails off past the sixth name", async () => {
    mockApi(true, [
      {
        id: "cal-big",
        name: "Big group",
        invitee_count: 8,
        invitee_names: ["A", "B", "C", "D", "E", "F", "G", "H"],
        created_at: "2026-09-03T10:00:00Z",
        next_session: null,
        last_session: null,
      },
    ]);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="roster-cal-big"]').text()).toBe(
      "A, B, C, D, E, F…",
    );
    expect(wrapper.find('[data-testid="headcount-cal-big"]').text()).toBe("8");
  });

  it("says so when a calendar has nobody on it", async () => {
    mockApi(true, [
      {
        id: "cal-empty",
        name: "Nobody",
        invitee_count: 0,
        invitee_names: [],
        created_at: "2026-09-03T10:00:00Z",
        next_session: null,
        last_session: null,
      },
    ]);
    const wrapper = await mountPage();

    expect(wrapper.find('[data-testid="roster-cal-empty"]').text()).toBe(
      "Nobody invited yet",
    );
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

  it("shows the next session when one is coming", async () => {
    mockApi(true, [
      {
        id: "cal-s",
        name: "DnD",
        invitee_count: 1,
        invitee_names: ["Dani"],
        created_at: "2026-09-03T10:00:00Z",
        next_session: "2026-09-14",
        last_session: "2026-08-10",
      },
    ]);
    const wrapper = await mountPage();

    const session = wrapper.find('[data-testid="session-cal-s"]').text();
    expect(session).toContain("Next");
    expect(session).toContain("14");
  });

  it("falls back to the last session once they are all behind you", async () => {
    mockApi(true, [
      {
        id: "cal-s",
        name: "DnD",
        invitee_count: 1,
        invitee_names: ["Dani"],
        created_at: "2026-09-03T10:00:00Z",
        next_session: null,
        last_session: "2026-08-10",
      },
    ]);
    const wrapper = await mountPage();

    const session = wrapper.find('[data-testid="session-cal-s"]').text();
    expect(session).toContain("Last");
    expect(session).toContain("10");
  });

  it("shows nothing rather than a placeholder when no day is chosen", async () => {
    mockApi(true);
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="session-cal-1"]').exists()).toBe(false);
  });

  describe("the invitee link on a row", () => {
    function stubClipboard(writeText: ReturnType<typeof vi.fn>) {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      });
    }

    it("copies the link an invitee follows, not this page's address", async () => {
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      mockApi(true);
      const wrapper = await mountPage();

      await wrapper.find('[data-testid="copy-link-cal-1"]').trigger("click");
      await flushPromises();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/kdh/s/tok-dnd`,
      );
      expect(wrapper.find('[data-testid="copy-notice"]').text()).toContain(
        "DnD",
      );
    });

    it("copies the right row's link", async () => {
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      mockApi(true);
      const wrapper = await mountPage();

      await wrapper.find('[data-testid="copy-link-cal-2"]').trigger("click");
      await flushPromises();

      expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
        `${window.location.origin}/kdh/s/tok-movie`,
      );
    });

    it("does not open the calendar it copies", async () => {
      // The row navigates on click; copying is emphatically not "open this".
      stubClipboard(vi.fn().mockResolvedValue(undefined));
      mockApi(true);
      const wrapper = await mountPage();

      await wrapper.find('[data-testid="copy-link-cal-1"]').trigger("click");
      await flushPromises();

      expect(push).not.toHaveBeenCalled();
    });

    it("shows the link to copy by hand when the clipboard is unavailable", async () => {
      // No secure context on plain HTTP over a LAN, which is how this is run.
      stubClipboard(vi.fn().mockRejectedValue(new Error("insecure context")));
      mockApi(true);
      const wrapper = await mountPage();

      await wrapper.find('[data-testid="copy-link-cal-1"]').trigger("click");
      await flushPromises();

      expect(wrapper.find('[data-testid="copy-notice"]').text()).toContain(
        "/kdh/s/tok-dnd",
      );
    });

    it("is not offered to a guest", async () => {
      mockApi(false);
      const wrapper = await mountPage();
      expect(wrapper.find('[data-testid="copy-link-cal-1"]').exists()).toBe(
        false,
      );
    });
  });
});
