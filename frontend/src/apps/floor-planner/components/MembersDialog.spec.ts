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

import MembersDialog from "./MembersDialog.vue";
import { useFloorPlanStore } from "../stores/useFloorPlanStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Apartment } from "../types";

function apartment(over: Partial<Apartment> = {}): Apartment {
  return {
    id: "a_1",
    name: "Our flat",
    updated_at: null,
    owner: "jake",
    members: ["dani", "jake"],
    is_owner: true,
    rev: 1,
    plan_rev: 1,
    cols: 50,
    rows: 40,
    surface: [],
    feature: [],
    labels: [],
    locked: false,
    furniture: [],
    layouts: [],
    ...over,
  };
}

async function dialog(a: Apartment, me: string) {
  useAuthStore().username = me;
  useFloorPlanStore().apartment = a;
  getMock.mockResolvedValue({ usernames: ["dani", "jake", "kim"] });
  const wrapper = mount(MembersDialog);
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("MembersDialog", () => {
  it("lets the owner add from the roster and remove others", async () => {
    const wrapper = await dialog(apartment(), "jake");
    expect(wrapper.get("[data-testid=members-member-jake]").text()).toContain(
      "owner",
    );
    expect(wrapper.find("[data-testid=members-remove-jake]").exists()).toBe(
      false,
    );
    expect(
      wrapper.findAll("datalist option").map((o) => o.attributes("value")),
    ).toEqual(["kim"]);

    postMock.mockResolvedValue(apartment({ members: ["dani", "jake", "kim"] }));
    await wrapper.get("[data-testid=members-add-input]").setValue("kim");
    await wrapper.get("[data-testid=members-add]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/members",
      {
        username: "kim",
      },
    );

    delMock.mockResolvedValue(apartment({ members: ["jake"] }));
    await wrapper.get("[data-testid=members-remove-dani]").trigger("click");
    expect(delMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/members/dani",
    );
  });

  it("lets a member leave after confirming, then emits left", async () => {
    const wrapper = await dialog(apartment({ is_owner: false }), "dani");
    expect(wrapper.find("[data-testid=members-add]").exists()).toBe(false);
    postMock.mockResolvedValue([
      {
        id: "a_2",
        name: "My apartment",
        owner: "dani",
        members: ["dani"],
        is_owner: true,
        updated_at: null,
      },
    ]);
    await wrapper.get("[data-testid=members-leave]").trigger("click");
    await wrapper.get("[data-testid=members-leave-yes]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith(
      "/floor-planner/apartments/a_1/leave",
    );
    expect(wrapper.emitted("left")?.[0]).toEqual(["a_2"]);
  });

  it("shows the store's error", async () => {
    const wrapper = await dialog(apartment(), "jake");
    useFloorPlanStore().error =
      "dani already shares an apartment with someone else";
    await flushPromises();
    expect(wrapper.get("[data-testid=members-error]").text()).toContain(
      "someone else",
    );
  });
});
