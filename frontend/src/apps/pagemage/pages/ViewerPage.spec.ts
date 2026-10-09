import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: vi.fn(),
    put: putMock,
    del: vi.fn(),
    upload: vi.fn(),
  },
}));
vi.mock("vue-router", () => ({
  useRoute: () => ({ params: { pageId: "p-1" } }),
}));

import ViewerPage from "./ViewerPage.vue";

const page = () => ({
  id: "p-1",
  name: "Doc",
  html: "<p>body</p>",
  created_at: "t",
  updated_at: "t",
});

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
    props: [
      "label",
      "color",
      "unelevated",
      "noCaps",
      "icon",
      "flat",
      "round",
      "dense",
      "loading",
      "disable",
      "to",
    ],
    emits: ["click"],
  },
  "q-icon": { template: "<i />", props: ["name", "size"] },
};

function render() {
  return mount(ViewerPage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  putMock.mockReset();
});

describe("PageMage ViewerPage", () => {
  it("fetches the page on mount", async () => {
    getMock.mockResolvedValue(page());
    render();
    await flushPromises();
    expect(getMock).toHaveBeenCalledWith("/pagemage/pages/p-1");
  });

  it("renders a sandboxed iframe with the page html", async () => {
    getMock.mockResolvedValue(page());
    const wrapper = render();
    await flushPromises();
    const frame = wrapper.find('[data-testid="frame"]');
    expect(frame.exists()).toBe(true);
    expect(frame.attributes("sandbox")).toBe("allow-scripts allow-forms");
    expect(frame.attributes("srcdoc")).toContain("<p>body</p>");
  });

  it("posts a capture request to the iframe on Save", async () => {
    getMock.mockResolvedValue(page());
    const wrapper = render();
    await flushPromises();
    const frame = wrapper.find('[data-testid="frame"]')
      .element as HTMLIFrameElement;
    const post = vi.fn();
    Object.defineProperty(frame, "contentWindow", {
      configurable: true,
      value: { postMessage: post },
    });
    await wrapper.find('[data-testid="save"]').trigger("click");
    expect(post).toHaveBeenCalledWith({ type: "pm:capture" }, "*");
  });

  it("saves html received from a pm:html message", async () => {
    getMock.mockResolvedValue(page());
    putMock.mockResolvedValue({ ...page(), html: "<p>edited</p>" });
    render();
    await flushPromises();
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "pm:html", html: "<p>edited</p>" },
      }),
    );
    await flushPromises();
    expect(putMock).toHaveBeenCalledWith("/pagemage/pages/p-1", {
      html: "<p>edited</p>",
    });
  });
});
