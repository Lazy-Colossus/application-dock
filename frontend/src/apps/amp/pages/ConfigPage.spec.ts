import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";
import { createRouter, createMemoryHistory } from "vue-router";
import ConfigPage from "./ConfigPage.vue";
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
    ...over,
  };
}

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: "/amp", component: { template: "<div />" } },
    { path: "/amp/config", component: ConfigPage },
  ],
});

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-banner": { template: "<div><slot /></div>" },
  "q-space": { template: "<div />" },
  "q-list": { template: "<div><slot /></div>" },
  "q-item": { template: "<div><slot /></div>" },
  "q-item-section": { template: "<div><slot /></div>" },
  "q-item-label": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
    props: ["modelValue", "label", "type"],
    emits: ["update:modelValue"],
  },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\')">{{ label }}<slot /></button>',
    props: ["disable", "loading", "label", "icon"],
    emits: ["click"],
  },
};

function mountPage(instances: AmpInstance[]) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = useAmpStore();
  store.instances = instances;
  vi.spyOn(store, "fetch").mockResolvedValue();
  const savePorts = vi.spyOn(store, "savePorts").mockResolvedValue();
  return {
    store,
    savePorts,
    wrapper: mount(ConfigPage, { global: { plugins: [pinia, router], stubs: STUBS } }),
  };
}

beforeEach(() => {
  notifyMock.mockReset();
});

describe("ConfigPage", () => {
  it("prefills a port input per instance", () => {
    const { wrapper } = mountPage([inst("i1", { port: 27015 }), inst("i2")]);
    const inputs = wrapper.findAll('[data-testid^="port-"]');
    expect(inputs).toHaveLength(2);
    expect((wrapper.get('[data-testid="port-i1"]').element as HTMLInputElement).value).toBe(
      "27015",
    );
    expect((wrapper.get('[data-testid="port-i2"]').element as HTMLInputElement).value).toBe("");
  });

  it("saves the entered ports as integers, omitting blanks", async () => {
    const { wrapper, savePorts } = mountPage([inst("i1"), inst("i2")]);
    await wrapper.get('[data-testid="port-i1"]').setValue("27015");
    await wrapper.get('[data-testid="save-ports"]').trigger("click");
    expect(savePorts).toHaveBeenCalledWith({ i1: 27015 });
    expect(notifyMock).toHaveBeenCalled();
  });
});
