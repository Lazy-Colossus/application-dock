import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import SettingsPage from "@/pages/SettingsPage.vue";

vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(`${status}: ${detail}`);
      this.status = status;
      this.detail = detail;
    }
  },
  api: { get: vi.fn(), post: vi.fn() },
}));

vi.mock("quasar", () => ({
  Notify: { create: vi.fn() },
}));

import { api, ApiError } from "@/composables/useApi";
import { Notify } from "quasar";

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      '<button :disabled="disable || undefined" @click="$emit(\'click\')">{{ label }}</button>',
    props: ["label", "disable", "color", "unelevated", "noCaps", "flat"],
    emits: ["click"],
  },
  "q-input": {
    template:
      '<input :type="type || \'text\'" :value="modelValue" :data-has-error="error || undefined" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: [
      "modelValue",
      "type",
      "label",
      "error",
      "errorMessage",
      "rules",
      "hint",
    ],
    emits: ["update:modelValue"],
  },
  "q-dialog": {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ["modelValue"],
    emits: ["update:modelValue"],
  },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-tooltip": { template: "<span />" },
};

function mountPage() {
  return mount(SettingsPage, { global: { stubs: STUBS } });
}

async function mountResolved(available: boolean, usernames: string[] = []) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/shell/update-status") return Promise.resolve({ available });
    return Promise.resolve({ usernames });
  });
  const wrapper = mountPage();
  await flushPromises();
  return wrapper;
}

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── MAINTENANCE section ─────────────────────────────────────────────────────

  it('shows disabled button with "Update not available" when API returns available:false', async () => {
    const wrapper = await mountResolved(false);
    const btn = wrapper.find('[data-testid="update-btn"]');
    expect(btn.exists()).toBe(true);
    expect(btn.text()).toContain("Update not available");
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it('shows enabled button with "Update applications" when API returns available:true', async () => {
    const wrapper = await mountResolved(true);
    const btn = wrapper.find('[data-testid="update-btn"]');
    expect(btn.text()).toContain("Update applications");
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("clicking the enabled button opens the confirm dialog", async () => {
    const wrapper = await mountResolved(true);
    await wrapper.find('[data-testid="update-btn"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="confirm-btn"]').exists()).toBe(true);
  });

  it("confirming triggers POST, shows Notify, and disables button", async () => {
    vi.mocked(api.post).mockResolvedValue({ detail: "Update started" });
    const wrapper = await mountResolved(true);
    await wrapper.find('[data-testid="update-btn"]').trigger("click");
    await flushPromises();
    await wrapper.find('[data-testid="confirm-btn"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api.post)).toHaveBeenCalledWith("/shell/update");
    expect(vi.mocked(Notify.create)).toHaveBeenCalled();
    expect(
      wrapper.find('[data-testid="update-btn"]').attributes("disabled"),
    ).toBeDefined();
  });

  // ── USERS section ───────────────────────────────────────────────────────────

  it("USERS section renders on mount with existing usernames", async () => {
    const wrapper = await mountResolved(false, ["alice", "bob"]);
    expect(wrapper.find('[data-testid="username-list"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("alice");
    expect(wrapper.text()).toContain("bob");
  });

  it("Add button is disabled when username input is empty", async () => {
    const wrapper = await mountResolved(false);
    const btn = wrapper.find('[data-testid="add-user-btn"]');
    expect(btn.attributes("disabled")).toBeDefined();
  });

  it("Add button is enabled when username input has text", async () => {
    const wrapper = await mountResolved(false);
    await wrapper.find('[data-testid="new-username-input"]').setValue("alice");
    const btn = wrapper.find('[data-testid="add-user-btn"]');
    expect(btn.attributes("disabled")).toBeUndefined();
  });

  it("Add user success: POST called, username in list, Notify shown", async () => {
    vi.mocked(api.post).mockResolvedValue({ username: "alice" });
    const wrapper = await mountResolved(false, ["admin"]);
    await wrapper.find('[data-testid="new-username-input"]').setValue("alice");
    await wrapper.find('[data-testid="add-user-btn"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api.post)).toHaveBeenCalledWith("/auth/users", {
      username: "alice",
    });
    expect(wrapper.text()).toContain("alice");
    expect(vi.mocked(Notify.create)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "positive" }),
    );
  });

  it("Add user 409: negative Notify shown, input not cleared", async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(409, "Username already exists"),
    );
    const wrapper = await mountResolved(false);
    await wrapper
      .find('[data-testid="new-username-input"]')
      .setValue("duplicate");
    await wrapper.find('[data-testid="add-user-btn"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(Notify.create)).toHaveBeenCalledWith(
      expect.objectContaining({ type: "negative" }),
    );
    expect(
      (
        wrapper.find('[data-testid="new-username-input"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("duplicate");
  });

  // ── SECURITY section ────────────────────────────────────────────────────────

  it("SECURITY section renders with three password fields and disabled button", async () => {
    const wrapper = await mountResolved(false);
    expect(wrapper.find('[data-testid="current-password"]').exists()).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="new-password"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="confirm-password"]').exists()).toBe(
      true,
    );
    expect(
      wrapper
        .find('[data-testid="change-password-btn"]')
        .attributes("disabled"),
    ).toBeDefined();
  });

  it("Mismatch between new and confirm shows inline error, no POST sent", async () => {
    const wrapper = await mountResolved(false);
    await wrapper.find('[data-testid="current-password"]').setValue("oldpass");
    await wrapper.find('[data-testid="new-password"]').setValue("newpass99");
    await wrapper
      .find('[data-testid="confirm-password"]')
      .setValue("different");
    await wrapper.find('[data-testid="change-password-btn"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api.post)).not.toHaveBeenCalled();
    expect(
      wrapper
        .find('[data-testid="confirm-password"]')
        .attributes("data-has-error"),
    ).toBeDefined();
  });

  it("Change password success: POST called, fields cleared, positive Notify shown", async () => {
    vi.mocked(api.post).mockResolvedValue({ detail: "Password changed" });
    const wrapper = await mountResolved(false);
    await wrapper.find('[data-testid="current-password"]').setValue("oldpass");
    await wrapper.find('[data-testid="new-password"]').setValue("newpass99");
    await wrapper
      .find('[data-testid="confirm-password"]')
      .setValue("newpass99");
    await wrapper.find('[data-testid="change-password-btn"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(api.post)).toHaveBeenCalledWith("/auth/change-password", {
      current_password: "oldpass",
      new_password: "newpass99",
    });
    expect(
      (
        wrapper.find('[data-testid="current-password"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("");
    expect(
      (wrapper.find('[data-testid="new-password"]').element as HTMLInputElement)
        .value,
    ).toBe("");
    expect(
      (
        wrapper.find('[data-testid="confirm-password"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("");
    expect(vi.mocked(Notify.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "positive",
        message: "Password changed successfully.",
      }),
    );
  });

  it("Change password 400: negative Notify shown, fields not cleared", async () => {
    vi.mocked(api.post).mockRejectedValue(
      new ApiError(400, "Current password is incorrect"),
    );
    const wrapper = await mountResolved(false);
    await wrapper
      .find('[data-testid="current-password"]')
      .setValue("wrongpass");
    await wrapper.find('[data-testid="new-password"]').setValue("newpass99");
    await wrapper
      .find('[data-testid="confirm-password"]')
      .setValue("newpass99");
    await wrapper.find('[data-testid="change-password-btn"]').trigger("click");
    await flushPromises();
    expect(vi.mocked(Notify.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "negative",
        message: "Current password is incorrect",
      }),
    );
    expect(
      (
        wrapper.find('[data-testid="current-password"]')
          .element as HTMLInputElement
      ).value,
    ).toBe("wrongpass");
  });
});
