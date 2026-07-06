import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import WordRow from "./WordRow.vue";
import type { Word } from "@/apps/hotaru/types";

function word(overrides: Partial<Word> = {}): Word {
  return {
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
    ...overrides,
  };
}

describe("WordRow", () => {
  it("shows kanji as primary with the reading beneath, plus the meaning", () => {
    const wrapper = mount(WordRow, { props: { word: word() } });
    expect(wrapper.text()).toContain("大学");
    expect(wrapper.text()).toContain("だいがく");
    expect(wrapper.text()).toContain("university");
  });

  it("falls back to the reading as primary for kana-only words", () => {
    const wrapper = mount(WordRow, {
      props: {
        word: word({
          kanji: null,
          reading: "ありがとう",
          meaning: "Thank you.",
        }),
      },
    });
    expect(wrapper.find(".word-row__primary").text()).toBe("ありがとう");
    // No separate reading line when there is no kanji.
    expect(wrapper.find(".word-row__reading").exists()).toBe(false);
  });

  it("hides romaji by default and reveals it per-row on toggle", async () => {
    const wrapper = mount(WordRow, { props: { word: word() } });
    expect(wrapper.find('[data-testid="romaji"]').exists()).toBe(false);

    await wrapper.find('[data-testid="romaji-toggle"]').trigger("click");
    expect(wrapper.find('[data-testid="romaji"]').text()).toBe("daigaku");

    await wrapper.find('[data-testid="romaji-toggle"]').trigger("click");
    expect(wrapper.find('[data-testid="romaji"]').exists()).toBe(false);
  });

  const STUBS = { "q-icon": { template: "<i />" } };

  it("hides edit/delete affordances unless editable", () => {
    const wrapper = mount(WordRow, {
      props: { word: word() },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="edit-word"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="delete-word"]').exists()).toBe(false);
  });

  it("emits edit and delete with the word when editable", async () => {
    const w = word();
    const wrapper = mount(WordRow, {
      props: { word: w, editable: true },
      global: { stubs: STUBS },
    });
    await wrapper.find('[data-testid="edit-word"]').trigger("click");
    await wrapper.find('[data-testid="delete-word"]').trigger("click");
    expect(wrapper.emitted("edit")?.[0]).toEqual([w]);
    expect(wrapper.emitted("delete")?.[0]).toEqual([w]);
  });

  it("shows a private mark for private words", () => {
    const wrapper = mount(WordRow, {
      props: { word: word({ visibility: "private" }) },
      global: { stubs: STUBS },
    });
    const mark = wrapper.find('[data-testid="private-mark"]');
    expect(mark.exists()).toBe(true);
    expect(mark.attributes("aria-label")).toBe("Private");
  });

  it("shows no mark for shared words (shared is the implicit default)", () => {
    const wrapper = mount(WordRow, {
      props: { word: word({ visibility: "shared" }) },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="private-mark"]').exists()).toBe(false);
  });

  it("shows the private mark independent of the editable prop", () => {
    const wrapper = mount(WordRow, {
      props: { word: word({ visibility: "private" }), editable: true },
      global: { stubs: STUBS },
    });
    expect(wrapper.find('[data-testid="private-mark"]').exists()).toBe(true);
  });
});
