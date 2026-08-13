import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { listId: "l-42" } }),
  useRouter: () => ({ push }),
}));

import BoardPage from "./BoardPage.vue";

const STUBS = {
  "q-page": { template: '<div class="q-page-stub"><slot /></div>' },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click')\">{{ label }}</button>",
    props: ["label", "icon", "flat", "noCaps"],
    emits: ["click"],
  },
};

const MOUNT_OPTS = { global: { stubs: STUBS } };

beforeEach(() => {
  push.mockReset();
});

describe("BoardPage", () => {
  it("shows the list id from the route", () => {
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    expect(wrapper.find('[data-testid="list-id"]').text()).toBe("l-42");
  });

  it("navigates back to the picker", async () => {
    const wrapper = mount(BoardPage, MOUNT_OPTS);
    await wrapper.find('[data-testid="back-btn"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/context-switch");
  });
});
