import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import HotaruHomePage from "./HotaruHomePage.vue";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\">{{ label }}</button>",
    props: ["label", "outline", "unelevated", "noCaps"],
  },
};

describe("HotaruHomePage", () => {
  it("renders the Hotaru brand and entry actions", () => {
    const wrapper = mount(HotaruHomePage, { global: { stubs: STUBS } });
    expect(wrapper.text()).toContain("Hotaru");
    expect(wrapper.find('[data-testid="practice-btn"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="library-btn"]').exists()).toBe(true);
  });

  it("scopes the forest theme via the hotaru-app root class", () => {
    const wrapper = mount(HotaruHomePage, { global: { stubs: STUBS } });
    expect(wrapper.find(".hotaru-app").exists()).toBe(true);
  });
});
