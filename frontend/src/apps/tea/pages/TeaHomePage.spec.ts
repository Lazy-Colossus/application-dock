import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import TeaHomePage from "./TeaHomePage.vue";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

function render() {
  return mount(TeaHomePage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TeaHomePage", () => {
  it("offers the cabinet, brewing and the almanac, in that order", () => {
    const labels = render()
      .findAll('[data-testid="tea-home-section"] .tea-home__name')
      .map((n) => n.text());

    expect(labels).toEqual(["Cabinet", "Brew", "Almanac"]);
  });

  it.each([
    ["Cabinet", "tea-cabinet"],
    ["Brew", "tea-timer"],
    ["Almanac", "tea-almanac"],
  ])("opens the %s section", async (label, routeName) => {
    const wrapper = render();
    const section = wrapper
      .findAll('[data-testid="tea-home-section"]')
      .find((s) => s.text().includes(label));

    await section!.trigger("click");

    expect(push).toHaveBeenCalledWith({ name: routeName });
  });
});
