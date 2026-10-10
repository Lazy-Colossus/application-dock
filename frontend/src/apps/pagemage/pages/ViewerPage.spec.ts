import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, postMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  postMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: {
    get: getMock,
    post: postMock,
    put: putMock,
    del: delMock,
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
  share_token: "",
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
  "q-dialog": {
    template: '<div v-if="modelValue"><slot /></div>',
    props: ["modelValue"],
  },
  "q-card": { template: "<div><slot /></div>" },
  "q-card-section": { template: "<div><slot /></div>" },
  "q-card-actions": { template: "<div><slot /></div>" },
  "q-input": {
    template:
      '<input :data-testid="$attrs[\'data-testid\']" :value="modelValue" readonly />',
    props: ["modelValue"],
  },
};

function render() {
  return mount(ViewerPage, { global: { stubs: STUBS } });
}

beforeEach(() => {
  setActivePinia(createPinia());
  getMock.mockReset();
  putMock.mockReset();
  postMock.mockReset();
  delMock.mockReset();
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

describe("PageMage ViewerPage sharing", () => {
  it("creates a link and shows the share URL", async () => {
    getMock.mockResolvedValue(page());
    postMock.mockResolvedValue({ ...page(), share_token: "tok-xyz" });
    const wrapper = render();
    await flushPromises();
    await wrapper.find('[data-testid="share"]').trigger("click");
    await wrapper.find('[data-testid="create-link"]').trigger("click");
    await flushPromises();
    const url = wrapper.find('[data-testid="share-url"]')
      .element as HTMLInputElement;
    expect(url.value).toContain("/api/pagemage/share/tok-xyz/raw");
  });

  it("disable calls revoke", async () => {
    getMock.mockResolvedValue({ ...page(), share_token: "tok-xyz" });
    delMock.mockResolvedValue({ ...page(), share_token: "" });
    const wrapper = render();
    await flushPromises();
    await wrapper.find('[data-testid="share"]').trigger("click");
    await wrapper.find('[data-testid="disable-link"]').trigger("click");
    await flushPromises();
    expect(delMock).toHaveBeenCalledWith("/pagemage/pages/p-1/share");
  });
});
