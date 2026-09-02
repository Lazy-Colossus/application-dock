import { describe, it, expect, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { calendarId: "cal-ab12cd34" } }),
}));

import CalendarPage from "./CalendarPage.vue";

describe("CalendarPage", () => {
  it("reads the calendar id from the route (Story 1.1 placeholder)", () => {
    const wrapper = mount(CalendarPage);
    expect(wrapper.text()).toContain("cal-ab12cd34");
  });
});
