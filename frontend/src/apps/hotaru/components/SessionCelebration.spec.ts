import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import SessionCelebration from "./SessionCelebration.vue";

describe("SessionCelebration", () => {
  it("renders the requested number of fireflies", () => {
    const wrapper = mount(SessionCelebration, { props: { count: 10 } });
    expect(wrapper.findAll(".cel__fly").length).toBe(10);
  });

  it("defaults to a full flock", () => {
    const wrapper = mount(SessionCelebration);
    expect(wrapper.find('[data-testid="session-celebration"]').exists()).toBe(
      true,
    );
    expect(wrapper.findAll(".cel__fly").length).toBe(14);
  });
});
