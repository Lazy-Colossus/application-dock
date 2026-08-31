import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { setActivePinia, createPinia } from "pinia";

const { getMock, postMock, putMock, delMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  putMock: vi.fn(),
  delMock: vi.fn(),
}));
vi.mock("@/composables/useApi", () => ({
  ApiError: class extends Error {},
  api: { get: getMock, post: postMock, put: putMock, del: delMock },
}));

import PlaceCell from "./PlaceCell.vue";
import type { Place } from "@/apps/listies/types";

const BLUE_BOTTLE: Place = {
  place_id: "ChIJ_blue",
  name: "Blue Bottle",
  address: "Rua Nova 12, Lisboa",
  lat: 38.71,
  lng: -9.13,
};

const FABRICA: Place = {
  place_id: "ChIJ_fabrica",
  name: "Fabrica Coffee",
  address: "Rua das Flores 1",
  lat: 38.72,
  lng: -9.14,
};

const STUBS = {
  "q-spinner": { template: '<div data-testid="searching" />' },
};

// The result list is teleported out of the grid cell (it would be clipped by
// the cell's `overflow: hidden`), so it is not inside the wrapper.
const inBody = (selector: string) => document.body.querySelector(selector);
const allInBody = (selector: string) => [
  ...document.body.querySelectorAll(selector),
];
const bodyText = () => document.body.textContent ?? "";

let mounted: { unmount: () => void } | null = null;

function mountCell(
  props: Partial<{
    value: Place | null;
    enabled: boolean;
    near: string | null;
  }> = {},
) {
  return mount(PlaceCell, {
    props: { value: null, enabled: true, near: null, ...props },
    global: { stubs: STUBS },
  });
}

const typeQuery = async (
  wrapper: ReturnType<typeof mountCell>,
  text: string,
) => {
  await wrapper.find("input").setValue(text);
  await vi.advanceTimersByTimeAsync(400);
  await flushPromises();
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.useFakeTimers();
  getMock.mockReset().mockResolvedValue([BLUE_BOTTLE, FABRICA]);
});

afterEach(() => {
  mounted?.unmount();
  mounted = null;
  // Vue Test Utils does not clean up teleported content on unmount, so
  // without this every body query sees the previous tests' results too.
  document.body
    .querySelectorAll(".place-cell__results")
    .forEach((node) => node.remove());
  vi.useRealTimers();
});

describe("PlaceCell — searching", () => {
  it("starts with the current place's name in the field", () => {
    const wrapper = mountCell({ value: BLUE_BOTTLE });
    expect((wrapper.find("input").element as HTMLInputElement).value).toBe(
      "Blue Bottle",
    );
  });

  it("searches once the query is worth searching for", async () => {
    const wrapper = mountCell();

    await typeQuery(wrapper, "coffee");

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls[0]![0]).toContain("q=coffee");
  });

  it("does not search a single character", async () => {
    const wrapper = mountCell();

    await typeQuery(wrapper, "c");

    expect(getMock).not.toHaveBeenCalled();
  });

  it("waits for typing to settle rather than searching per keystroke", async () => {
    const wrapper = mountCell();

    await wrapper.find("input").setValue("co");
    await wrapper.find("input").setValue("cof");
    await wrapper.find("input").setValue("coffee");
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(getMock.mock.calls[0]![0]).toContain("q=coffee");
  });

  it("biases the search to the places already in the column", async () => {
    const wrapper = mountCell({ near: "38.7,-9.1" });

    await typeQuery(wrapper, "cafe");

    expect(getMock.mock.calls[0]![0]).toContain("near=");
  });

  it("lists what it found, name and address", async () => {
    const wrapper = mountCell();

    await typeQuery(wrapper, "coffee");

    const results = allInBody('[data-testid^="place-result-"]');
    expect(results).toHaveLength(2);
    expect(results[0]!.textContent).toContain("Blue Bottle");
    expect(results[0]!.textContent).toContain("Rua Nova 12, Lisboa");
  });

  it("shows it is working while the search is in flight", async () => {
    getMock.mockImplementation(() => new Promise(() => {}));
    const wrapper = mountCell();

    await wrapper.find("input").setValue("coffee");
    await vi.advanceTimersByTimeAsync(400);
    await flushPromises();

    expect(wrapper.find('[data-testid="searching"]').exists()).toBe(true);
  });

  it("says so when nothing was found, rather than showing an empty list", async () => {
    getMock.mockResolvedValue([]);
    const wrapper = mountCell();

    await typeQuery(wrapper, "zzzzzz");

    expect(inBody('[data-testid="place-empty"]')).not.toBeNull();
  });

  it("shows the failure beside the cell", async () => {
    getMock.mockRejectedValue(new Error("502: Place search is unavailable"));
    const wrapper = mountCell();

    await typeQuery(wrapper, "coffee");

    expect(inBody('[data-testid="place-error"]')?.textContent).toContain(
      "unavailable",
    );
  });

  it("ignores a slow response that has been overtaken", async () => {
    const slow = [{ ...BLUE_BOTTLE, name: "Stale result" }];
    getMock
      .mockImplementationOnce(
        () => new Promise((resolve) => setTimeout(() => resolve(slow), 500)),
      )
      .mockResolvedValueOnce([FABRICA]);
    const wrapper = mountCell();

    await wrapper.find("input").setValue("first");
    await vi.advanceTimersByTimeAsync(400);
    await wrapper.find("input").setValue("second");
    await vi.advanceTimersByTimeAsync(1000);
    await flushPromises();

    expect(bodyText()).not.toContain("Stale result");
    expect(bodyText()).toContain("Fabrica Coffee");
  });
});

describe("PlaceCell — choosing", () => {
  it("picks a result with the mouse", async () => {
    const wrapper = mountCell();
    await typeQuery(wrapper, "coffee");

    // mousedown, not click: it fires before the input blurs, so the pick is
    // not lost to the editor closing underneath it.
    inBody('[data-testid="place-result-0"]')!.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true }),
    );
    await flushPromises();

    expect(wrapper.emitted("select")).toEqual([[BLUE_BOTTLE]]);
  });

  it("walks the results with the arrow keys and picks with Enter", async () => {
    const wrapper = mountCell();
    await typeQuery(wrapper, "coffee");

    await wrapper.find("input").trigger("keydown", { key: "ArrowDown" });
    await wrapper.find("input").trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("select")).toEqual([[FABRICA]]);
  });

  it("marks which result is highlighted", async () => {
    const wrapper = mountCell();
    await typeQuery(wrapper, "coffee");

    await wrapper.find("input").trigger("keydown", { key: "ArrowDown" });

    expect(
      inBody('[data-testid="place-result-1"]')!.classList.contains(
        "place-cell__result--active",
      ),
    ).toBe(true);
  });

  it("stops at the ends of the list", async () => {
    const wrapper = mountCell();
    await typeQuery(wrapper, "coffee");

    await wrapper.find("input").trigger("keydown", { key: "ArrowUp" });
    await wrapper.find("input").trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("select")).toEqual([[BLUE_BOTTLE]]);
  });

  it("does nothing on Enter with no results", async () => {
    getMock.mockResolvedValue([]);
    const wrapper = mountCell();
    await typeQuery(wrapper, "zzz");

    await wrapper.find("input").trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("select")).toBeUndefined();
  });
});

describe("PlaceCell — leaving", () => {
  it("clears the cell", async () => {
    const wrapper = mountCell({ value: BLUE_BOTTLE });

    await wrapper.find('[data-testid="place-clear"]').trigger("click");

    expect(wrapper.emitted("clear")).toHaveLength(1);
  });

  it("does not offer to clear an already empty cell", () => {
    expect(mountCell().find('[data-testid="place-clear"]').exists()).toBe(
      false,
    );
  });

  it("closes on Escape without changing anything", async () => {
    const wrapper = mountCell({ value: BLUE_BOTTLE });
    await typeQuery(wrapper, "coffee");

    await wrapper.find("input").trigger("keydown", { key: "Escape" });

    expect(wrapper.emitted("select")).toBeUndefined();
    expect(wrapper.emitted("cancel")).toHaveLength(1);
  });
});

describe("PlaceCell — when maps are not configured", () => {
  it("explains itself instead of offering a search that cannot work", () => {
    const wrapper = mountCell({ enabled: false });

    expect(wrapper.find("input").exists()).toBe(false);
    expect(wrapper.find('[data-testid="place-disabled"]').exists()).toBe(true);
  });

  it("searches nothing", async () => {
    mountCell({ enabled: false });
    await vi.advanceTimersByTimeAsync(400);

    expect(getMock).not.toHaveBeenCalled();
  });
});

describe("PlaceCell — the results must escape the cell", () => {
  it("renders the list outside the component, so the cell cannot clip it", async () => {
    // A grid cell is `overflow: hidden` and only ~24px tall: a dropdown
    // rendered inside it is invisible. This is the bug the user hit.
    const wrapper = mountCell();

    await typeQuery(wrapper, "coffee");

    const list = inBody(".place-cell__results");
    expect(list).not.toBeNull();
    expect(wrapper.element.contains(list)).toBe(false);
  });

  it("positions the list against the input rather than the page", async () => {
    const wrapper = mountCell();

    await typeQuery(wrapper, "coffee");

    const style = (inBody(".place-cell__results") as HTMLElement).style;
    expect(style.position).toBe("fixed");
    expect(style.top).not.toBe("");
  });
});
