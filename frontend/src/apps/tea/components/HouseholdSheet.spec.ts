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
  api: { get: getMock, post: postMock, del: delMock, put: vi.fn() },
}));

import HouseholdSheet from "./HouseholdSheet.vue";
import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { Cabinet } from "../types";

async function sheet(cabinet: Cabinet, me = "jakub") {
  useAuthStore().username = me;
  useTeaHouseholdStore().cabinet = cabinet;
  getMock.mockResolvedValue({ usernames: ["jakub", "mia", "ola"] });
  const wrapper = mount(HouseholdSheet);
  await flushPromises();
  return wrapper;
}

const MINE: Cabinet = {
  id: "c_1",
  owner: "jakub",
  members: ["jakub", "mia"],
  is_owner: true,
};
const THEIRS: Cabinet = {
  id: "c_1",
  owner: "mia",
  members: ["jakub", "mia"],
  is_owner: false,
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
});

describe("HouseholdSheet", () => {
  it("lists members, marking the owner and me", async () => {
    const wrapper = await sheet(MINE);
    expect(
      wrapper.get("[data-testid=household-member-jakub]").text(),
    ).toContain("owner");
    expect(
      wrapper.get("[data-testid=household-member-jakub]").text(),
    ).toContain("you");
    expect(wrapper.get("[data-testid=household-member-mia]").text()).toContain(
      "mia",
    );
  });

  it("lets the owner remove others but not themself", async () => {
    const wrapper = await sheet(MINE);
    expect(wrapper.find("[data-testid=household-remove-jakub]").exists()).toBe(
      false,
    );
    delMock.mockResolvedValue({ ...MINE, members: ["jakub"] });
    await wrapper.get("[data-testid=household-remove-mia]").trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/tea/cabinet/members/mia");
  });

  it("offers only people not already here, and adds the typed name", async () => {
    const wrapper = await sheet(MINE);
    const options = wrapper
      .findAll("datalist option")
      .map((o) => o.attributes("value"));
    expect(options).toEqual(["ola"]);

    postMock.mockResolvedValue({ ...MINE, members: ["jakub", "mia", "ola"] });
    await wrapper.get("[data-testid=household-add-input]").setValue(" ola ");
    await wrapper.get("[data-testid=household-add]").trigger("click");
    await flushPromises();
    expect(postMock).toHaveBeenCalledWith("/tea/cabinet/members", {
      username: "ola",
    });
    expect(
      (
        wrapper.get("[data-testid=household-add-input]")
          .element as HTMLInputElement
      ).value,
    ).toBe("");
  });

  it("shows why an add was refused", async () => {
    const wrapper = await sheet(MINE);
    postMock.mockRejectedValue(
      Object.assign(new Error("422"), {
        detail: "ola already has teas in their cabinet",
      }),
    );
    await wrapper.get("[data-testid=household-add-input]").setValue("ola");
    await wrapper.get("[data-testid=household-add]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=household-error]").text()).toBe(
      "ola already has teas in their cabinet",
    );
  });

  it("gives a member leave behind a confirmation, and no add field", async () => {
    const wrapper = await sheet(THEIRS);
    expect(wrapper.find("[data-testid=household-add-input]").exists()).toBe(
      false,
    );
    await wrapper.get("[data-testid=household-leave]").trigger("click");
    expect(wrapper.text()).toContain("You'll start with an empty cabinet");

    delMock.mockResolvedValue({
      id: null,
      owner: "jakub",
      members: ["jakub"],
      is_owner: true,
    });
    await wrapper.get("[data-testid=household-leave-yes]").trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/tea/cabinet/members/jakub");
    expect(wrapper.emitted("close")).toHaveLength(1);
  });
});
