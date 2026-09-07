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
vi.mock("@/apps/listies/composables/useSheetEvents", () => ({
  useSheetEvents: vi.fn(() => ({ close: vi.fn() })),
}));

import ShareSheetDialog from "./ShareSheetDialog.vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import { useAuthStore } from "@/stores/useAuthStore";
import type { SheetView } from "@/apps/listies/types";

const STUBS = {
  "q-dialog": { template: "<div><slot /></div>", props: ["modelValue"] },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-space": { template: "<div />" },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')">{{ label }}</button>',
    props: [
      "label",
      "disable",
      "flat",
      "dense",
      "round",
      "color",
      "noCaps",
      "unelevated",
      "icon",
    ],
    emits: ["click"],
  },
  "q-checkbox": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('update:modelValue', !modelValue)\">{{ label }}</button>",
    props: ["modelValue", "label", "dense"],
    emits: ["update:modelValue"],
  },
};

const view = (over: Partial<SheetView> = {}): SheetView => ({
  id: "s-1",
  name: "Trip",
  created_at: "t",
  shared: true,
  owner: "alice",
  members: ["alice", "bob"],
  rev: 3,
  can_manage: true,
  tabs: [{ id: "tb-1", name: "One", order: 0, columns: [], rows: [] }],
  ...over,
});

function setup(over: Partial<SheetView> = {}) {
  const store = useListiesStore();
  const v = view(over);
  store.currentSheet = {
    id: v.id,
    name: v.name,
    created_at: v.created_at,
    tabs: v.tabs,
  };
  store.shared = v.shared;
  store.owner = v.owner ?? null;
  store.members = v.members ?? null;
  store.canManage = v.can_manage ?? false;
  return store;
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock
    .mockReset()
    .mockResolvedValue({ usernames: ["alice", "bob", "carol", "dave"] });
  postMock.mockReset().mockResolvedValue(view());
  delMock.mockReset().mockResolvedValue(view());
  const auth = useAuthStore();
  auth.username = "alice"; // the owner
});

describe("ShareSheetDialog", () => {
  it("lists current members with the owner tagged and only non-owners removable", async () => {
    setup();
    const wrapper = mount(ShareSheetDialog, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="member-alice"]').text()).toContain(
      "owner",
    );
    expect(wrapper.find('[data-testid="remove-member-alice"]').exists()).toBe(
      false,
    );
    expect(wrapper.find('[data-testid="remove-member-bob"]').exists()).toBe(
      true,
    );
  });

  it("offers the roster minus me and current members", async () => {
    setup();
    const wrapper = mount(ShareSheetDialog, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    });
    await flushPromises();

    // roster is alice/bob/carol/dave; minus me (alice) and member (bob).
    expect(wrapper.find('[data-testid="add-user-carol"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-user-dave"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="add-user-alice"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="add-user-bob"]').exists()).toBe(false);
  });

  it("adds selected users via the share endpoint", async () => {
    setup();
    const wrapper = mount(ShareSheetDialog, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    });
    await flushPromises();

    await wrapper.find('[data-testid="add-user-carol"]').trigger("click");
    await wrapper.find('[data-testid="share-add"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/listies/sheets/s-1/share", {
      usernames: ["carol"],
    });
  });

  it("removes a member after a confirm step", async () => {
    setup();
    const wrapper = mount(ShareSheetDialog, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    });
    await flushPromises();

    await wrapper.find('[data-testid="remove-member-bob"]').trigger("click");
    await wrapper.find('[data-testid="remove-confirm-bob"]').trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith("/listies/sheets/s-1/share/bob");
  });

  it("stops sharing after a confirm step and closes", async () => {
    delMock.mockResolvedValue(
      view({ shared: false, owner: null, members: null, rev: null }),
    );
    setup();
    const wrapper = mount(ShareSheetDialog, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    });
    await flushPromises();

    await wrapper.find('[data-testid="share-stop"]').trigger("click");
    await wrapper.find('[data-testid="stop-confirm"]').trigger("click");
    await flushPromises();

    expect(delMock).toHaveBeenCalledWith("/listies/sheets/s-1/share");
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([false]);
  });

  it("surfaces a store error inside the dialog", async () => {
    const store = setup();
    store.error = "Only the owner can manage this sheet";
    const wrapper = mount(ShareSheetDialog, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="share-error"]').text()).toContain(
      "Only the owner",
    );
  });

  it("a private sheet shows no member list or stop-sharing, and a Share button", async () => {
    setup({
      shared: false,
      owner: null,
      members: null,
      rev: null,
      can_manage: false,
    });
    const wrapper = mount(ShareSheetDialog, {
      props: { modelValue: true },
      global: { stubs: STUBS },
    });
    await flushPromises();

    expect(wrapper.find('[data-testid="share-stop"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="member-alice"]').exists()).toBe(false);
    // Everyone but me is offerable to share with.
    expect(wrapper.find('[data-testid="add-user-bob"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="share-add"]').text()).toBe("Share");
  });
});
