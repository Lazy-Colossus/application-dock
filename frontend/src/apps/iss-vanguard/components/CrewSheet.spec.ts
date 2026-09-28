import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: vi.fn(), del: delMock },
}));

import CrewSheet from "./CrewSheet.vue";
import { useShipStore } from "../stores/useShipStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { emptyGrid } from "../resources";
import type { Ship } from "../types";

function ship(over: Partial<Ship> = {}): Ship {
  return {
    id: "s_1",
    owner: "ana",
    members: ["ana", "bo"],
    is_owner: true,
    rev: 1,
    stock: emptyGrid(),
    projects: [],
    ...over,
  };
}

async function sheet(s: Ship, me: string) {
  useAuthStore().username = me;
  useShipStore().ship = s;
  getMock.mockResolvedValue({ usernames: ["ana", "bo", "cy"] });
  const wrapper = mount(CrewSheet);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("CrewSheet", () => {
  it("lets the owner add from the roster and remove others", async () => {
    const wrapper = await sheet(ship(), "ana");
    expect(wrapper.get("[data-testid=crew-member-ana]").text()).toContain(
      "owner",
    );
    expect(wrapper.find("[data-testid=crew-remove-ana]").exists()).toBe(false);
    expect(
      wrapper.findAll("datalist option").map((o) => o.attributes("value")),
    ).toEqual(["cy"]);

    postMock.mockResolvedValue(ship({ members: ["ana", "bo", "cy"] }));
    await wrapper.get("[data-testid=crew-add-input]").setValue("cy");
    await wrapper.get("[data-testid=crew-add]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith("/iss-vanguard/ship/members", {
      username: "cy",
    });

    delMock.mockResolvedValue(ship({ members: ["ana"] }));
    await wrapper.get("[data-testid=crew-remove-bo]").trigger("click");
    expect(delMock).toHaveBeenCalledWith("/iss-vanguard/ship/members/bo");
  });

  it("lets a member leave after confirming, then emits left", async () => {
    const wrapper = await sheet(ship({ is_owner: false }), "bo");
    expect(wrapper.find("[data-testid=crew-add]").exists()).toBe(false);
    delMock.mockResolvedValue(ship({ owner: "bo", members: ["bo"] }));
    await wrapper.get("[data-testid=crew-leave]").trigger("click");
    await wrapper.get("[data-testid=crew-leave-yes]").trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/iss-vanguard/ship/members/bo");
    expect(wrapper.emitted("left")).toHaveLength(1);
  });
});
