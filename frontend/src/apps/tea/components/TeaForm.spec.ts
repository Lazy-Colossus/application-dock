import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { postMock, uploadMock } = vi.hoisted(() => ({ postMock: vi.fn(), uploadMock: vi.fn() }));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: vi.fn(), post: postMock, put: vi.fn(), del: vi.fn(), upload: uploadMock },
}));
const { downscaleMock } = vi.hoisted(() => ({ downscaleMock: vi.fn() }));
vi.mock("../image", () => ({ downscaleImage: downscaleMock }));

import TeaForm from "./TeaForm.vue";
import type { CatalogueNode, TeaWrite } from "../types";

const nodes: CatalogueNode[] = [
  {
    id: "oolong",
    parent_id: null,
    name: "Oolong",
    name_zh: "烏龍",
    source: "seed",
    default_origin: "",
  },
  {
    id: "oolong.wuyi",
    parent_id: "oolong",
    name: "Wuyi yancha",
    name_zh: "",
    source: "seed",
    default_origin: "Wuyi Shan, Fujian",
  },
];

function blank(): TeaWrite {
  return {
    name: "",
    catalogue_node_id: "",
    form: null,
    origin: "",
    vendor: "",
    year: null,
    harvest_season: null,
    cultivar: "",
    grams_purchased: null,
    grams_remaining: 0,
    price_paid: null,
    purchase_date: null,
    storage_location: "",
    low_threshold_grams: null,
    notes: "",
    image_url: null,
    brewing: null,
  };
}

const form = (value: TeaWrite = blank()) =>
  mount(TeaForm, { props: { modelValue: value, nodes } });

beforeEach(() => {
  setActivePinia(createPinia());
  postMock.mockReset();
  uploadMock.mockReset();
  downscaleMock.mockReset();
  downscaleMock.mockImplementation(async (file: File) => file);
  // jsdom has no object URLs.
  URL.createObjectURL = vi.fn(() => "blob:thumb");
  URL.revokeObjectURL = vi.fn();
});

describe("TeaForm", () => {
  it("groups the fields under the four headings", () => {
    const headings = form()
      .findAll('[data-testid="group"]')
      .map((h) => h.text());
    expect(headings).toEqual(["Where it's from", "What it cost", "On the shelf", "Brewing"]);
  });

  it("emits the typed name", async () => {
    const wrapper = form();
    await wrapper.get('[data-testid="field-name"]').setValue("Rou Gui");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.name).toBe("Rou Gui");
  });

  it("fills an untouched origin from the picked node", async () => {
    const wrapper = form();
    await wrapper.getComponent({ name: "CataloguePicker" }).vm.$emit("prefill", "Wuyi Shan, Fujian");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.origin).toBe("Wuyi Shan, Fujian");
  });

  it("refuses to overwrite an origin the person typed", async () => {
    const wrapper = form({ ...blank(), origin: "A shop in Prague" });
    await wrapper.get('[data-testid="field-origin"]').setValue("A shop in Prague");
    await wrapper.getComponent({ name: "CataloguePicker" }).vm.$emit("prefill", "Wuyi Shan, Fujian");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.origin).toBe("A shop in Prague");
  });

  it("shows price per gram when both numbers are known", () => {
    const wrapper = form({ ...blank(), price_paid: 68, grams_purchased: 100 });
    expect(wrapper.get('[data-testid="price-per-gram"]').text()).toContain("0.68");
  });

  it("shows no price per gram when the amount bought is zero", () => {
    const wrapper = form({ ...blank(), price_paid: 68, grams_purchased: 0 });
    expect(wrapper.find('[data-testid="price-per-gram"]').exists()).toBe(false);
  });

  it("has no input for grams left — the grams sheet is the only way that changes", () => {
    expect(form().find('[data-testid="field-remaining"]').exists()).toBe(false);
  });

  it("round-trips a chosen form into the emitted write", async () => {
    const wrapper = form();
    await wrapper.get('[data-testid="field-form"]').setValue("cake");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.form).toBe("cake");
  });

  it("clears form back to null when the empty option is chosen", async () => {
    const wrapper = form({ ...blank(), form: "cake" });
    await wrapper.get('[data-testid="field-form"]').setValue("");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.form).toBeNull();
  });

  it("round-trips a chosen harvest season into the emitted write", async () => {
    const wrapper = form();
    await wrapper.get('[data-testid="field-harvest-season"]').setValue("spring");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.harvest_season).toBe("spring");
  });

  it("clears harvest season back to null when the empty option is chosen", async () => {
    const wrapper = form({ ...blank(), harvest_season: "spring" });
    await wrapper.get('[data-testid="field-harvest-season"]').setValue("");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.harvest_season).toBeNull();
  });

  it("disables the autofill button while the name is empty", () => {
    const wrapper = form();
    expect(wrapper.get('[data-testid="autofill"]').attributes("disabled")).toBeDefined();
  });

  it("applies the suggested category and origin on autofill", async () => {
    postMock.mockResolvedValue({
      catalogue_node_id: "oolong.wuyi-yancha.da-hong-pao",
      origin: "Wuyi Shan, Fujian",
    });
    const wrapper = form({ ...blank(), name: "Da Hong Pao" });

    await wrapper.get('[data-testid="autofill"]').trigger("click");
    await flushPromises();

    expect(postMock).toHaveBeenCalledWith("/tea/autofill", { name: "Da Hong Pao" });
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.catalogue_node_id).toBe("oolong.wuyi-yancha.da-hong-pao");
    expect(last.origin).toBe("Wuyi Shan, Fujian");
  });

  it("never overwrites an origin the person already typed, even from autofill", async () => {
    postMock.mockResolvedValue({
      catalogue_node_id: "oolong.wuyi-yancha.da-hong-pao",
      origin: "Wuyi Shan, Fujian",
    });
    const wrapper = form({ ...blank(), name: "Da Hong Pao", origin: "A shop in Prague" });

    await wrapper.get('[data-testid="autofill"]').trigger("click");
    await flushPromises();

    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.origin).toBe("A shop in Prague");
  });

  it("emits a pasted image URL", async () => {
    const wrapper = form();
    await wrapper.get('[data-testid="field-image-url"]').setValue("https://example.com/photo.jpg");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.image_url).toBe("https://example.com/photo.jpg");
  });

  it("clears image_url back to null when the field is emptied", async () => {
    const wrapper = form({ ...blank(), image_url: "https://example.com/photo.jpg" });
    await wrapper.get('[data-testid="field-image-url"]').setValue("");
    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.image_url).toBeNull();
  });

  it("shows a message when Jev isn't confident about the name", async () => {
    postMock.mockResolvedValue(null);
    const wrapper = form({ ...blank(), name: "some tea" });

    await wrapper.get('[data-testid="autofill"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="autofill-message"]').text()).toContain("pick a category");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("shows the real error when autofill fails outright", async () => {
    postMock.mockRejectedValue(
      Object.assign(new Error("down"), { detail: "Autofill is not configured on this server" }),
    );
    const wrapper = form({ ...blank(), name: "Da Hong Pao" });

    await wrapper.get('[data-testid="autofill"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="autofill-message"]').text()).toContain("not configured");
  });
});

describe("TeaForm brewing", () => {
  it("patches leaf grams and water temperature into brewing", async () => {
    const wrapper = form();
    await wrapper.get("[data-testid=field-brew-grams]").setValue("7");
    const emitted = wrapper.emitted("update:modelValue")!.at(-1)![0] as TeaWrite;
    expect(emitted.brewing).toEqual({ leaf_grams: 7, water_temp_c: null, steep_seconds: [] });
  });

  it("parses a comma list of steep times", async () => {
    const wrapper = form();
    await wrapper.get("[data-testid=field-brew-steeps]").setValue("10, 15,20 ,");
    const emitted = wrapper.emitted("update:modelValue")!.at(-1)![0] as TeaWrite;
    expect(emitted.brewing?.steep_seconds).toEqual([10, 15, 20]);
    expect(wrapper.find("[data-testid=brew-steeps-error]").exists()).toBe(false);
  });

  it("flags a bad steep list and keeps the last good one", async () => {
    const wrapper = form({
      ...blank(),
      brewing: { leaf_grams: null, water_temp_c: null, steep_seconds: [10] },
    });
    await wrapper.get("[data-testid=field-brew-steeps]").setValue("10, abc");
    expect(wrapper.get("[data-testid=brew-steeps-error]").text()).toContain("whole seconds");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("collapses brewing back to null when every field is cleared", async () => {
    const wrapper = form({
      ...blank(),
      brewing: { leaf_grams: 5, water_temp_c: null, steep_seconds: [] },
    });
    await wrapper.get("[data-testid=field-brew-grams]").setValue("");
    const emitted = wrapper.emitted("update:modelValue")!.at(-1)![0] as TeaWrite;
    expect(emitted.brewing).toBeNull();
  });
});

const SUGGESTION = {
  name: "Da Hong Pao",
  catalogue_node_id: "oolong.wuyi",
  origin: "Wuyi Shan, Fujian",
  vendor: "Wuyi Origin",
  year: 2023,
  cultivar: "",
  grams: 100,
};

async function pickPhoto(wrapper: ReturnType<typeof form>, file: File) {
  const input = wrapper.get('[data-testid="scan-input"]');
  Object.defineProperty(input.element, "files", { value: [file], configurable: true });
  await input.trigger("change");
  await flushPromises();
}

describe("TeaForm label scan", () => {
  const photo = () => new File(["x"], "label.jpg", { type: "image/jpeg" });

  it("fills the empty fields from the scan in one patch and says what it filled", async () => {
    uploadMock.mockResolvedValue(SUGGESTION);
    const wrapper = form();

    await pickPhoto(wrapper, photo());

    expect(uploadMock).toHaveBeenCalledWith("/tea/scan-label", expect.any(File));
    const emitted = wrapper.emitted("update:modelValue") ?? [];
    expect(emitted).toHaveLength(1);
    const last = emitted[0][0] as TeaWrite;
    expect(last.name).toBe("Da Hong Pao");
    expect(last.catalogue_node_id).toBe("oolong.wuyi");
    expect(last.vendor).toBe("Wuyi Origin");
    expect(last.year).toBe(2023);
    expect(last.grams_purchased).toBe(100);
    expect(last.grams_remaining).toBe(100);
    expect(wrapper.get('[data-testid="scan-message"]').text()).toBe(
      "Filled name, category, origin, vendor, year, grams",
    );
  });

  it("keeps what the person already typed", async () => {
    uploadMock.mockResolvedValue(SUGGESTION);
    const wrapper = form({ ...blank(), name: "My Rock Tea", vendor: "Local shop" });

    await pickPhoto(wrapper, photo());

    const last = wrapper.emitted("update:modelValue")?.at(-1)?.[0] as TeaWrite;
    expect(last.name).toBe("My Rock Tea");
    expect(last.vendor).toBe("Local shop");
  });

  it("shows a thumbnail and emits the photo with 'use as tea photo' off, then on", async () => {
    uploadMock.mockResolvedValue(SUGGESTION);
    const wrapper = form();
    const file = photo();

    await pickPhoto(wrapper, file);

    expect(wrapper.get('[data-testid="scan-thumb"]').attributes("src")).toBe("blob:thumb");
    expect(wrapper.emitted("update:scan")?.at(-1)?.[0]).toEqual({ file, usePhoto: false });

    await wrapper.get('[data-testid="scan-use-photo"]').setValue(true);
    expect(wrapper.emitted("update:scan")?.at(-1)?.[0]).toEqual({ file, usePhoto: true });
  });

  it("says so when the photo had nothing new to fill", async () => {
    uploadMock.mockResolvedValue({
      name: "",
      catalogue_node_id: null,
      origin: "",
      vendor: "",
      year: null,
      cultivar: "",
      grams: null,
    });
    const wrapper = form();

    await pickPhoto(wrapper, photo());

    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
    expect(wrapper.get('[data-testid="scan-message"]').text()).toBe(
      "Couldn't read anything new from this photo",
    );
  });

  it("shows the server's error when the scan fails", async () => {
    uploadMock.mockRejectedValue(
      Object.assign(new Error("down"), { detail: "Label scan is not configured on this server" }),
    );
    const wrapper = form();

    await pickPhoto(wrapper, photo());

    expect(wrapper.get('[data-testid="scan-message"]').text()).toContain("not configured");
    expect(wrapper.emitted("update:modelValue")).toBeUndefined();
  });

  it("tells the person when the photo can't be opened, without calling the server", async () => {
    downscaleMock.mockRejectedValue(new Error("unsupported"));
    const wrapper = form();

    await pickPhoto(wrapper, photo());

    expect(uploadMock).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="scan-message"]').text()).toBe("Couldn't open this photo");
    expect(wrapper.find('[data-testid="scan-thumb"]').exists()).toBe(false);
  });
});

describe("TeaForm label scan input", () => {
  it("lets the person pick an existing photo, not only take a new one", () => {
    // `capture` makes phones open the camera directly and hide the library.
    const input = form().get('[data-testid="scan-input"]');
    expect(input.attributes("capture")).toBeUndefined();
    expect(input.attributes("accept")).toBe("image/*");
  });
});
