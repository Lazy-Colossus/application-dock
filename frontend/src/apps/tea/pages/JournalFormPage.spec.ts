import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, putMock, uploadMock, replace, params } = vi.hoisted(() => ({
  getMock: vi.fn(),
  putMock: vi.fn(),
  uploadMock: vi.fn(),
  replace: vi.fn(),
  params: {} as Record<string, string>,
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, put: putMock, del: vi.fn(), upload: uploadMock, post: vi.fn() },
}));
vi.mock("vue-router", () => ({
  useRouter: () => ({ push: vi.fn(), replace }),
  useRoute: () => ({ params, query: {} }),
}));

import JournalFormPage from "./JournalFormPage.vue";
import { useAuthStore } from "@/stores/useAuthStore";
import { emptyTasting } from "../tasting";
import type { JournalEntry, Tea } from "../types";

const STUBS = { "q-page": { template: "<div><slot /></div>" } };

const TEA = { id: "t-1", name: "Tieguanyin", class_id: "oolong", grams_remaining: 40 } as Tea;

const JOURNAL_ONLY: JournalEntry = {
  id: "s-7",
  tea_id: "t-1",
  away_tea_name: "",
  away_class_id: null,
  status: "finalised",
  started_at: "2026-09-20T10:00:00.000Z",
  leaf_grams: 5,
  water_temp_c: null,
  rating: 3,
  curve_source: "generic",
  curve_source_label: "",
  infusions: [],
  teaware_id: null,
  timed: false,
  cha_xi: { moods: ["cosy"], guests: "", notes: "" },
  tasting: null,
  brewed_by: "jakub",
  vessel_volume_ml: null,
  updated_at: "2026-09-20T10:00:00.000Z",
  finished_at: "2026-09-20T10:00:00.000Z",
  image_url: null,
  tea_name: "Tieguanyin",
  class_id: "oolong",
  tea_image_url: null,
};

async function render(entries: JournalEntry[] = []) {
  getMock.mockImplementation((path: string) => {
    if (path === "/tea/teas") return Promise.resolve([TEA]);
    if (path === "/tea/journal") return Promise.resolve(entries);
    return Promise.resolve([]);
  });
  const wrapper = mount(JournalFormPage, { global: { stubs: STUBS } });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  useAuthStore().username = "jakub";
  getMock.mockReset();
  putMock.mockReset();
  uploadMock.mockReset();
  replace.mockReset();
  for (const key of Object.keys(params)) delete params[key];
});

describe("JournalFormPage — new entry", () => {
  it("saves a cabinet tea drunk elsewhere as one finished, untimed session", async () => {
    putMock.mockResolvedValue({});
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-tea]").setValue("t-1");
    await wrapper.get("[data-testid=jform-day]").setValue("2026-09-20");
    await wrapper.get("[data-testid=jform-grams]").setValue("5");
    await wrapper.get("[data-testid=jform-star-4]").trigger("click");
    await wrapper.get("[data-testid=chaxi-mood-social]").trigger("click");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();

    const [path, body] = putMock.mock.calls[0];
    expect(path).toMatch(/^\/tea\/sessions\/s-[0-9a-f]{32}$/);
    expect(body).toMatchObject({
      tea_id: "t-1",
      away_tea_name: "",
      status: "finalised",
      timed: false,
      infusions: [],
      leaf_grams: 5,
      rating: 4,
      cha_xi: { moods: ["social"], guests: "", notes: "" },
      tasting: null,
    });
    expect(new Date(body.started_at).getDate()).toBe(20);
    expect(replace).toHaveBeenCalledWith({
      name: "tea-journal-entry",
      params: { id: path.split("/").at(-1) },
    });
  });

  it("saves an away tea by name, with its class", async () => {
    putMock.mockResolvedValue({});
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-source-away]").trigger("click");
    await wrapper.get("[data-testid=jform-away-name]").setValue("Teahouse Dancong");
    await wrapper.get("[data-testid=jform-away-class]").setValue("oolong");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls[0][1]).toMatchObject({
      tea_id: null,
      away_tea_name: "Teahouse Dancong",
      away_class_id: "oolong",
    });
  });

  it("retries a save whose response was lost under the same id, without a duplicate", async () => {
    putMock
      .mockRejectedValueOnce(Object.assign(new Error("x"), { status: 0, detail: "Network error" }))
      .mockRejectedValueOnce(Object.assign(new Error("x"), { status: 409, detail: "done" }));
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-tea]").setValue("t-1");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(replace).not.toHaveBeenCalled();
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls[1][0]).toBe(putMock.mock.calls[0][0]);
    expect(replace).toHaveBeenCalledWith({
      name: "tea-journal-entry",
      params: { id: putMock.mock.calls[0][0].split("/").at(-1) },
    });
  });

  it("uploads the photo on Try again once the entry exists", async () => {
    putMock.mockResolvedValue({});
    uploadMock
      .mockRejectedValueOnce(Object.assign(new Error("x"), { detail: "Upload failed" }))
      .mockResolvedValueOnce({ image_url: "/api/tea/sessions/x/image" });
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-tea]").setValue("t-1");
    const input = wrapper.get("[data-testid=chaxi-photo-input]");
    Object.defineProperty(input.element, "files", {
      value: [new File(["x"], "t.jpg", { type: "image/jpeg" })],
    });
    await input.trigger("change");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(replace).not.toHaveBeenCalled();
    await wrapper.get("[data-testid=chaxi-photo-retry]").trigger("click");
    await flushPromises();
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(putMock).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalled();
  });

  it("sends the tasting with a new entry", async () => {
    putMock.mockResolvedValue({});
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-tea]").setValue("t-1");
    await wrapper.get('[data-testid="tasting-sensation.body-thick"]').trigger("click");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls[0][1].tasting.sensation.body).toBe("thick");
  });

  it("won't save without a tea", async () => {
    const wrapper = await render();
    expect(wrapper.get("[data-testid=jform-save]").attributes("disabled")).toBeDefined();
  });

  it("uploads a picked photo once the entry exists", async () => {
    putMock.mockResolvedValue({});
    uploadMock.mockResolvedValue({ image_url: "/api/tea/sessions/x/image" });
    const wrapper = await render();
    await wrapper.get("[data-testid=jform-tea]").setValue("t-1");
    const input = wrapper.get("[data-testid=chaxi-photo-input]");
    Object.defineProperty(input.element, "files", {
      value: [new File(["x"], "t.jpg", { type: "image/jpeg" })],
    });
    await input.trigger("change");
    expect(uploadMock).not.toHaveBeenCalled();
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    const id = putMock.mock.calls[0][0].split("/").at(-1);
    expect(uploadMock.mock.calls[0][0]).toBe(`/tea/sessions/${id}/image`);
  });
});

describe("JournalFormPage — edit", () => {
  it("edits a journal-only entry, including its date and tea", async () => {
    params.id = "s-7";
    putMock.mockResolvedValue({ ...JOURNAL_ONLY, rating: 5 });
    const wrapper = await render([JOURNAL_ONLY]);
    expect((wrapper.get("[data-testid=jform-day]").element as HTMLInputElement).value).toBe(
      "2026-09-20",
    );
    await wrapper.get("[data-testid=jform-star-5]").trigger("click");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    const [path, body] = putMock.mock.calls[0];
    expect(path).toBe("/tea/sessions/s-7/journal");
    expect(body).toMatchObject({ rating: 5, leaf_grams: 5, tea_id: "t-1" });
    expect(body.started_at).toBeDefined();
    expect(replace).toHaveBeenCalledWith({ name: "tea-journal-entry", params: { id: "s-7" } });
  });

  it("keeps the tasting recorded at the table when the notes are edited", async () => {
    params.id = "s-7";
    const tasted = emptyTasting();
    tasted.aroma.top_note = "orchid";
    const entry = { ...JOURNAL_ONLY, tasting: tasted };
    putMock.mockResolvedValue(entry);
    const wrapper = await render([entry]);
    await wrapper.get("[data-testid=chaxi-notes]").setValue("third steep best");
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(putMock.mock.calls[0][1].tasting.aroma.top_note).toBe("orchid");
  });

  it("sends no tea or date for a timed session", async () => {
    params.id = "s-7";
    const timed = { ...JOURNAL_ONLY, timed: true };
    putMock.mockResolvedValue(timed);
    const wrapper = await render([timed]);
    expect(wrapper.find("[data-testid=jform-day]").exists()).toBe(false);
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    const body = putMock.mock.calls[0][1];
    expect(body).not.toHaveProperty("started_at");
    expect(body).not.toHaveProperty("tea_id");
  });

  it("shows the server's refusal", async () => {
    params.id = "s-7";
    putMock.mockRejectedValue(Object.assign(new Error("x"), { detail: "That vessel is retired" }));
    const wrapper = await render([JOURNAL_ONLY]);
    await wrapper.get("[data-testid=jform-save]").trigger("click");
    await flushPromises();
    expect(wrapper.get("[data-testid=jform-error]").text()).toContain("That vessel is retired");
    expect(replace).not.toHaveBeenCalled();
  });
});
