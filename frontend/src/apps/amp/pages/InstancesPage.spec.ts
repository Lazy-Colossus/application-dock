import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import InstancesPage from "./InstancesPage.vue";
import { useAmpStore } from "@/apps/amp/stores/useAmpStore";
import type { AmpInstance } from "@/apps/amp/types";

const notifyMock = vi.fn();
vi.mock("quasar", () => ({ useQuasar: () => ({ notify: notifyMock }) }));

function inst(id: string, over: Partial<AmpInstance> = {}): AmpInstance {
  return {
    id,
    name: id,
    module: "Generic",
    running: false,
    state: "Stopped",
    active_users: null,
    max_users: null,
    port: null,
    steam_app_id: null,
    game: null,
    ...over,
  };
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/amp", component: InstancesPage },
    { path: "/amp/config", component: { template: "<div />" } },
  ],
});

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-banner": { template: "<div><slot /></div>" },
  "q-space": { template: "<div />" },
  "q-chip": { template: "<div><slot /></div>" },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": { template: "<div><slot /></div>" },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": { template: "<div><slot /></div>" },
  "q-tooltip": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      '<button :disabled="disable || loading" :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')">{{ label }}<slot /></button>',
    props: ["disable", "loading", "label", "icon"],
    emits: ["click"],
  },
};

function mountPage(instances: AmpInstance[], publicIp: string | null) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAmpStore();
  store.instances = instances;
  store.publicIp = publicIp;
  vi.spyOn(store, "fetch").mockResolvedValue();
  return {
    store,
    wrapper: mount(InstancesPage, { global: { plugins: [pinia, router], stubs: STUBS } }),
  };
}

beforeEach(() => {
  notifyMock.mockReset();
  // `navigator.clipboard` is getter-only in this test environment, so it has
  // to be redefined rather than assigned.
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

describe("InstancesPage copy link", () => {
  it("disables the copy button when no port is configured", () => {
    const { wrapper } = mountPage([inst("i1")], "203.0.113.5");
    const btn = wrapper.get('[data-testid="copy-link"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables every copy button when no public IP is set", () => {
    const { wrapper } = mountPage([inst("i1", { port: 27015 })], null);
    const btn = wrapper.get('[data-testid="copy-link"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it("copies ip:port and notifies when enabled", async () => {
    const { wrapper } = mountPage([inst("i1", { port: 27015 })], "203.0.113.5");
    await wrapper.get('[data-testid="copy-link"]').trigger("click");
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("203.0.113.5:27015");
    expect(notifyMock).toHaveBeenCalled();
  });

  it("falls back to execCommand on an insecure origin where clipboard is unset", async () => {
    // Plain-HTTP LAN origin: `navigator.clipboard` is undefined, which used to
    // make the click throw silently and copy nothing.
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const execMock = vi.fn().mockReturnValue(true);
    document.execCommand = execMock;
    const { wrapper } = mountPage([inst("i1", { port: 27015 })], "203.0.113.5");
    await wrapper.get('[data-testid="copy-link"]').trigger("click");
    expect(execMock).toHaveBeenCalledWith("copy");
    expect(notifyMock).toHaveBeenCalled();
  });
});

describe("InstancesPage start button", () => {
  it("enables Start and labels it 'Start' when the instance is Stopped", () => {
    const { wrapper } = mountPage([inst("i1", { state: "Stopped" })], null);
    const btn = wrapper.get('[data-testid="start"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(false);
    expect(btn.text()).toContain("Start");
    expect(btn.text()).not.toContain("Starting");
  });

  it("disables Start and shows 'Starting…' while the instance is coming up", () => {
    const { wrapper } = mountPage([inst("i1", { state: "Starting" })], null);
    const btn = wrapper.get('[data-testid="start"]');
    expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    expect(btn.text()).toContain("Starting");
  });

  it("disables Start once the instance is Running", () => {
    const { wrapper } = mountPage([inst("i1", { state: "Running", running: true })], null);
    expect((wrapper.get('[data-testid="start"]').element as HTMLButtonElement).disabled).toBe(true);
  });

  it("requests start then re-polls quickly so the row flips to Starting", async () => {
    vi.useFakeTimers();
    try {
      const { store, wrapper } = mountPage([inst("i1", { state: "Stopped" })], null);
      const startSpy = vi.spyOn(store, "start").mockResolvedValue();
      const fetchSpy = store.fetch as unknown as ReturnType<typeof vi.fn>;
      fetchSpy.mockClear(); // drop the onMounted fetch

      await wrapper.get('[data-testid="start"]').trigger("click");
      expect(startSpy).toHaveBeenCalledWith("i1");

      await vi.advanceTimersByTimeAsync(11_000);
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("InstancesPage game display", () => {
  it("shows the resolved game name when present", () => {
    const { wrapper } = mountPage([inst("i1", { module: "GenericModule", game: "Palworld" })], null);
    expect(wrapper.text()).toContain("Palworld");
    expect(wrapper.text()).not.toContain("GenericModule");
  });

  it("falls back to the module when there is no game", () => {
    const { wrapper } = mountPage([inst("ads", { module: "ADS", game: null })], null);
    expect(wrapper.text()).toContain("ADS");
  });
});
