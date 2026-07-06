import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, push, replace, routeParams } = vi.hoisted(
  () => ({
    getMock: vi.fn(),
    postMock: vi.fn(),
    putMock: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    routeParams: { value: {} as Record<string, string> },
  }),
);
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push, replace }),
  useRoute: () => ({ params: routeParams.value }),
  onBeforeRouteLeave: () => {},
}));

import AddWordPage from "./AddWordPage.vue";
import type { Word } from "@/apps/hotaru/types";

const USERS = [
  { id: "dani", name: "Dani" },
  { id: "jake", name: "Jake" },
];

const CUSTOM: Word = {
  id: "dani-abcd1234",
  source: "dani",
  reading: "ねこ",
  kanji: "猫",
  romaji: "neko",
  meaning: "cat",
  pos: "noun",
  lesson: "",
  visibility: "shared",
  drill_caps: ["r2m", "m2r", "k2r"],
};

const SEED: Word[] = [
  {
    id: "genki_3-L1-0001",
    source: "genki_3",
    reading: "だいがく",
    kanji: "大学",
    romaji: "daigaku",
    meaning: "university",
    pos: "noun",
    lesson: "L1",
    visibility: "shared",
    drill_caps: ["r2m", "m2r", "k2r"],
  },
  CUSTOM,
];

const STUBS = {
  "q-page": { template: "<div><slot /></div>" },
  "q-icon": { template: "<i />" },
  "q-btn": {
    template:
      '<button :data-testid="$attrs[\'data-testid\']" :disabled="disable" @click="$emit(\'click\')" />',
    props: ["label", "disable", "unelevated", "noCaps", "type"],
    emits: ["click"],
  },
};

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.setItem("hotaru.activeUser", "dani");
  getMock
    .mockReset()
    .mockImplementation((path: string) =>
      path.startsWith("/hotaru/users")
        ? Promise.resolve(USERS)
        : Promise.resolve(SEED),
    );
  postMock.mockReset();
  putMock.mockReset();
  push.mockReset();
  replace.mockReset();
  routeParams.value = {};
});

async function mountPage() {
  const { useHotaruUserStore } =
    await import("@/apps/hotaru/stores/useHotaruUserStore");
  await useHotaruUserStore().loadUsers();
  const wrapper = mount(AddWordPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

describe("AddWordPage", () => {
  it("renders the required fields and hides source/lesson until 'add to a lesson'", async () => {
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="field-reading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="field-meaning"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="field-source"]').exists()).toBe(false);

    await wrapper.find('[data-testid="add-to-lesson"]').setValue(true);
    expect(wrapper.find('[data-testid="field-source"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="field-lesson"]').exists()).toBe(true);
  });

  it("posts a default (Custom) word without source/lesson and navigates to library", async () => {
    postMock.mockResolvedValueOnce({ ...SEED[0], id: "dani-abcd1234" });
    const wrapper = await mountPage();
    await wrapper.find('[data-testid="field-reading"]').setValue("ねこ");
    await wrapper.find('[data-testid="field-meaning"]').setValue("cat");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith(
      "/hotaru/words?user=dani",
      expect.objectContaining({
        reading: "ねこ",
        meaning: "cat",
        visibility: "shared",
      }),
    );
    const body = postMock.mock.calls[0][1];
    expect(body).not.toHaveProperty("source");
    expect(push).toHaveBeenCalledWith("/hotaru/library");
  });

  it("includes source/lesson when filing into a lesson", async () => {
    postMock.mockResolvedValueOnce({ ...SEED[0], id: "genki_3-abcd1234" });
    const wrapper = await mountPage();
    await wrapper.find('[data-testid="field-reading"]').setValue("ねこ");
    await wrapper.find('[data-testid="field-meaning"]').setValue("cat");
    await wrapper.find('[data-testid="add-to-lesson"]').setValue(true);
    await flushPromises();
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    const body = postMock.mock.calls[0][1];
    expect(body.source).toBe("genki_3");
    expect(body.lesson).toBe("L1");
  });

  describe("edit mode", () => {
    it("prefills the form from the word and shows edit affordances", async () => {
      routeParams.value = { id: CUSTOM.id };
      const wrapper = await mountPage();
      expect(wrapper.text()).toContain("Edit word");
      expect(
        (
          wrapper.find('[data-testid="field-reading"]')
            .element as HTMLInputElement
        ).value,
      ).toBe("ねこ");
      expect(
        (
          wrapper.find('[data-testid="field-meaning"]')
            .element as HTMLInputElement
        ).value,
      ).toBe("cat");
    });

    it("PUTs the changes (without source) and navigates back to library", async () => {
      routeParams.value = { id: CUSTOM.id };
      putMock.mockResolvedValueOnce({ ...CUSTOM, meaning: "kitty" });
      const wrapper = await mountPage();
      await wrapper.find('[data-testid="field-meaning"]').setValue("kitty");
      await wrapper.find("form").trigger("submit");
      await flushPromises();

      expect(putMock).toHaveBeenCalledWith(
        "/hotaru/words/dani-abcd1234?user=dani",
        expect.objectContaining({ meaning: "kitty" }),
      );
      const body = putMock.mock.calls[0][1];
      expect(body).not.toHaveProperty("source");
      expect(postMock).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith("/hotaru/library");
    });

    it("redirects to library when the word id is unknown", async () => {
      routeParams.value = { id: "does-not-exist" };
      await mountPage();
      expect(replace).toHaveBeenCalledWith("/hotaru/library");
    });
  });
});
