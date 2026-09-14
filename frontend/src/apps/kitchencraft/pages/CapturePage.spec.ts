import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { postMock, push } = vi.hoisted(() => ({
  postMock: vi.fn(),
  push: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn(), post: postMock, put: vi.fn(), del: vi.fn() },
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push }) }));

import CapturePage from "./CapturePage.vue";
import { recipe, resetRecipeFixture } from "@/apps/kitchencraft/recipe.fixture";

// A paste straight off a recipe site: mixed bullets, blank lines, inconsistent
// capitals, and the site's own boilerplate at the end.
const MESSY_PASTE = `- 1 small pumpkin
* 200g red lentils
• 2 tsp cumin

1. Soften the ONION.


2. Simmer 40 min.

Print Recipe`;

beforeEach(() => {
  setActivePinia(createPinia());
  resetRecipeFixture();
  vi.clearAllMocks();
});

function mountPage() {
  return mount(CapturePage, { attachTo: document.body });
}

describe("opening", () => {
  it("puts focus in the body field, not the name", () => {
    // The name reads first, but the keyboard lands in the body: paste, tap UP
    // to the name, Save — three interactions, under ten seconds.
    const wrapper = mountPage();
    expect(document.activeElement).toBe(
      wrapper.find('[data-testid="body"]').element,
    );
  });

  it("reads name first, body second", () => {
    const wrapper = mountPage();
    const ids = wrapper
      .findAll("textarea, input")
      .map((el) => el.attributes("id"));
    expect(ids).toEqual(["capture-name", "capture-body"]);
  });

  it("labels both fields properly rather than leaning on placeholders", () => {
    const wrapper = mountPage();
    expect(wrapper.find('label[for="capture-body"]').text()).toBe(
      "Recipe text",
    );
    expect(wrapper.find('label[for="capture-name"]').text()).toBe("Name");
    expect(
      wrapper.find('[data-testid="body"]').attributes("placeholder"),
    ).toBeUndefined();
    expect(
      wrapper.find('[data-testid="name"]').attributes("placeholder"),
    ).toBeUndefined();
  });
});

describe("saving", () => {
  it("saves from a name and a body alone", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();

    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Pumpkin dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/kitchencraft/recipes", {
      name: "Pumpkin dal",
      body: "Simmer.",
    });
  });

  it("sends no other field, so nothing optional can block the save", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(Object.keys(postMock.mock.calls[0][1])).toEqual(["name", "body"]);
  });

  it("sends the paste unaltered — no bullet, case or blank-line tidying", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue(MESSY_PASTE);
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock.mock.calls[0][1].body).toBe(MESSY_PASTE);
  });

  it("returns to the collection, where the new recipe is at the top", async () => {
    postMock.mockResolvedValueOnce(recipe());
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(push).toHaveBeenCalledWith("/kitchencraft");
  });

  it("offers exactly one primary action", () => {
    const wrapper = mountPage();
    const primaries = wrapper.findAll(
      ".kc-btn:not(.kc-btn--quiet):not(.kc-btn--danger)",
    );
    expect(primaries).toHaveLength(1);
    expect(primaries[0].text()).toBe("Save");
  });
});

describe("rejection", () => {
  it("names the missing name and keeps the paste on screen", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue(MESSY_PASTE);
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[data-testid="name-error"]').text()).toBe(
      "Give it a name.",
    );
    expect(postMock).not.toHaveBeenCalled();
    // Nothing about the failure risks the paste.
    expect(
      (wrapper.find('[data-testid="body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe(MESSY_PASTE);
  });

  it("names the missing body", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[data-testid="body-error"]').text()).toBe(
      "Paste or type the recipe text.",
    );
    expect(wrapper.find('[data-testid="name-error"]').text()).toBe("");
  });

  it("names both when both are empty", async () => {
    const wrapper = mountPage();
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[data-testid="name-error"]').text()).toBe(
      "Give it a name.",
    );
    expect(wrapper.find('[data-testid="body-error"]').text()).toBe(
      "Paste or type the recipe text.",
    );
  });

  it("rejects whitespace-only input", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("  \n \n ");
    await wrapper.find('[data-testid="name"]').setValue("   ");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(postMock).not.toHaveBeenCalled();
  });

  it("associates each error with its field and announces it", () => {
    const wrapper = mountPage();
    expect(
      wrapper.find('[data-testid="body"]').attributes("aria-describedby"),
    ).toBe("capture-body-error");
    expect(
      wrapper.find('[data-testid="name-error"]').attributes("aria-live"),
    ).toBe("polite");
  });

  it("clears the error once the field is filled and re-saved", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[data-testid="name-error"]').text()).toBe(
      "Give it a name.",
    );

    postMock.mockResolvedValueOnce(recipe());
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();
    expect(wrapper.find('[data-testid="name-error"]').text()).toBe("");
  });
});

describe("a failed save", () => {
  it("says nothing has been lost and keeps both fields", async () => {
    postMock.mockRejectedValueOnce(new Error("Network error"));
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue(MESSY_PASTE);
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(wrapper.find('[data-testid="save-failed"]').text()).toBe(
      "Couldn't save — nothing has been lost, try again.",
    );
    expect(
      (wrapper.find('[data-testid="body"]').element as HTMLTextAreaElement)
        .value,
    ).toBe(MESSY_PASTE);
    expect(
      (wrapper.find('[data-testid="name"]').element as HTMLInputElement).value,
    ).toBe("Dal");
    expect(push).not.toHaveBeenCalled();
  });

  it("re-enables the button so the retry is one tap", async () => {
    postMock.mockRejectedValueOnce(new Error("Network error"));
    const wrapper = mountPage();
    await wrapper.find('[data-testid="body"]').setValue("Simmer.");
    await wrapper.find('[data-testid="name"]').setValue("Dal");
    await wrapper.find("form").trigger("submit");
    await flushPromises();

    expect(
      wrapper.find('[data-testid="save"]').attributes("disabled"),
    ).toBeUndefined();
  });
});

describe("cancelling", () => {
  it("returns to the collection", async () => {
    const wrapper = mountPage();
    await wrapper.find('[data-testid="cancel"]').trigger("click");
    expect(push).toHaveBeenCalledWith("/kitchencraft");
  });
});

describe("the shopping list is reachable from here", () => {
  it("shows the shopping-list button (FR-14: every screen, without exception)", async () => {
    const wrapper = await mountPage();
    expect(wrapper.find('[data-testid="open-shopping"]').exists()).toBe(true);
  });
});
