import { describe, it, expect, vi, beforeEach } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";

import type { Place, Tab } from "@/apps/listies/types";

// A stand-in for the Google SDK. No test loads anything from Google.
const { loadMapsSdk, mapState } = vi.hoisted(() => {
  const state = {
    created: 0,
    markers: [] as {
      position: { lat: number; lng: number };
      title: string;
      onClick?: () => void;
      attached: boolean;
      options: Record<string, unknown>;
    }[],
    fits: 0,
    panned: [] as { lat: number; lng: number }[],
    centred: [] as { lat: number; lng: number }[],
  };

  class FakeBounds {
    points: { lat: number; lng: number }[] = [];
    extend(p: { lat: number; lng: number }) {
      this.points.push(p);
    }
  }

  class FakeMap {
    constructor() {
      state.created += 1;
    }
    fitBounds() {
      state.fits += 1;
    }
    panTo(p: { lat: number; lng: number }) {
      state.panned.push(p);
    }
    setCenter(p: { lat: number; lng: number }) {
      state.centred.push(p);
    }
    setZoom() {}
  }

  class FakeMarker {
    entry: (typeof state.markers)[number];
    constructor(options: Record<string, unknown>) {
      this.entry = {
        position: options.position as { lat: number; lng: number },
        title: options.title as string,
        attached: true,
        options,
      };
      state.markers.push(this.entry);
    }
    setMap(map: unknown) {
      this.entry.attached = map !== null;
    }
    addListener(event: string, handler: () => void) {
      if (event === "click") this.entry.onClick = handler;
    }
  }

  return {
    loadMapsSdk: vi.fn(() =>
      Promise.resolve({
        Map: FakeMap,
        Marker: FakeMarker,
        LatLngBounds: FakeBounds,
      }),
    ),
    mapState: state,
  };
});

vi.mock("@/apps/listies/maps", () => ({ loadMapsSdk }));

import MapPane from "./MapPane.vue";

const place = (name: string, lat: number, lng: number): Place => ({
  place_id: `ChIJ_${name}`,
  name,
  address: `${name} street`,
  lat,
  lng,
});

function tabWith(
  rows: { id: string; cafe?: string; where?: Place; other?: Place }[],
  extraPlaceColumn = false,
): Tab {
  return {
    id: "tb-1",
    name: "Cafés",
    order: 0,
    columns: [
      { id: "c-text", name: "Cafe", type: "text", order: 0 },
      { id: "c-where", name: "Where", type: "place", order: 1 },
      ...(extraPlaceColumn
        ? [{ id: "c-other", name: "Also", type: "place" as const, order: 2 }]
        : []),
    ],
    rows: rows.map((r, i) => ({
      id: r.id,
      order: i,
      cells: {
        ...(r.cafe ? { "c-text": r.cafe } : {}),
        ...(r.where ? { "c-where": r.where } : {}),
        ...(r.other ? { "c-other": r.other } : {}),
      },
      created_at: "t",
      updated_at: "t",
    })),
  };
}

// A tab with a place column and a group column, plus two defined groups
// (Story 4.6). `group` is a row's group id, `other` a second place cell.
function tabWithGroups(
  rows: { id: string; where?: Place; other?: Place; group?: string }[],
  opts: { extraPlaceColumn?: boolean } = {},
): Tab {
  return {
    id: "tb-1",
    name: "Cafés",
    order: 0,
    place_groups: [
      { id: "g-1", name: "Must see", color: "#e5484d" },
      { id: "g-2", name: "Maybe", color: "#3e63dd" },
    ],
    columns: [
      { id: "c-where", name: "Where", type: "place", order: 0 },
      { id: "c-group", name: "Bucket", type: "place_group", order: 1 },
      ...(opts.extraPlaceColumn
        ? [{ id: "c-other", name: "Also", type: "place" as const, order: 2 }]
        : []),
    ],
    rows: rows.map((r, i) => ({
      id: r.id,
      order: i,
      cells: {
        ...(r.where ? { "c-where": r.where } : {}),
        ...(r.other ? { "c-other": r.other } : {}),
        ...(r.group ? { "c-group": r.group } : {}),
      },
      created_at: "t",
      updated_at: "t",
    })),
  };
}

const STUBS = {
  "q-spinner": { template: '<div data-testid="map-loading" />' },
  "q-space": { template: "<span />" },
  "q-btn": {
    template:
      "<button :data-testid=\"$attrs['data-testid']\" @click=\"$emit('click', $event)\">{{ label }}</button>",
    props: ["label", "icon", "dense", "flat", "noCaps", "size", "color"],
    emits: ["click"],
  },
};

function mountPane(tab: Tab, props: Record<string, unknown> = {}) {
  return mount(MapPane, {
    props: { tab, browserKey: "k", selectedRowId: null, ...props },
    global: { stubs: STUBS },
  });
}

const TWO_CAFES = () =>
  tabWith([
    { id: "r-1", cafe: "Blue Bottle", where: place("Blue", 38.7, -9.1) },
    { id: "r-2", cafe: "Fabrica", where: place("Fabrica", 38.8, -9.2) },
  ]);

beforeEach(() => {
  mapState.created = 0;
  mapState.markers.length = 0;
  mapState.fits = 0;
  mapState.panned.length = 0;
  mapState.centred.length = 0;
  loadMapsSdk.mockClear();
});

describe("MapPane — plotting", () => {
  it("loads the SDK with the browser key and builds a map", async () => {
    mountPane(TWO_CAFES());
    await flushPromises();

    expect(loadMapsSdk).toHaveBeenCalledWith("k");
    expect(mapState.created).toBe(1);
  });

  it("plots one marker per filled place cell", async () => {
    mountPane(TWO_CAFES());
    await flushPromises();

    expect(mapState.markers).toHaveLength(2);
    expect(mapState.markers.map((m) => m.position)).toEqual([
      { lat: 38.7, lng: -9.1 },
      { lat: 38.8, lng: -9.2 },
    ]);
  });

  it("ignores rows whose place cell is empty", async () => {
    mountPane(
      tabWith([
        { id: "r-1", cafe: "No place" },
        { id: "r-2", where: place("Blue", 1, 2) },
      ]),
    );
    await flushPromises();

    expect(mapState.markers).toHaveLength(1);
  });

  it("labels a marker with the row's first text value", async () => {
    mountPane(TWO_CAFES());
    await flushPromises();

    expect(mapState.markers[0]!.title).toBe("Blue Bottle");
  });

  it("falls back to the place's own name when the row has no text", async () => {
    mountPane(tabWith([{ id: "r-1", where: place("Blue", 1, 2) }]));
    await flushPromises();

    expect(mapState.markers[0]!.title).toBe("Blue");
  });

  it("fits the map to the markers when it opens", async () => {
    mountPane(TWO_CAFES());
    await flushPromises();

    expect(mapState.fits).toBe(1);
  });

  it("centres on a single place instead of fitting it to nothing", async () => {
    mountPane(tabWith([{ id: "r-1", where: place("Blue", 38.7, -9.1) }]));
    await flushPromises();

    expect(mapState.fits).toBe(0);
    expect(mapState.centred).toEqual([{ lat: 38.7, lng: -9.1 }]);
  });

  it("plots every place column, not just the first", async () => {
    const tab = tabWith(
      [{ id: "r-1", where: place("A", 1, 1), other: place("B", 2, 2) }],
      true,
    );
    mountPane(tab);
    await flushPromises();

    expect(mapState.markers).toHaveLength(2);
  });

  it("colours a pin by its row's group (Story 4.6)", async () => {
    mountPane(tabWithGroups([{ id: "r-1", where: place("A", 1, 1), group: "g-1" }]));
    await flushPromises();

    const icon = mapState.markers[0]!.options.icon as { fillColor: string };
    expect(icon.fillColor).toBe("#e5484d");
  });

  it("gives every place pin in a row the same group colour", async () => {
    const tab = tabWithGroups(
      [
        {
          id: "r-1",
          where: place("A", 1, 1),
          other: place("B", 2, 2),
          group: "g-2",
        },
      ],
      { extraPlaceColumn: true },
    );
    mountPane(tab);
    await flushPromises();

    expect(mapState.markers).toHaveLength(2);
    const colours = mapState.markers.map(
      (m) => (m.options.icon as { fillColor: string }).fillColor,
    );
    expect(colours).toEqual(["#3e63dd", "#3e63dd"]);
  });

  it("leaves an ungrouped row the plain default pin", async () => {
    mountPane(tabWithGroups([{ id: "r-1", where: place("A", 1, 1) }]));
    await flushPromises();

    expect(mapState.markers[0]!.options.icon).toBeUndefined();
  });

  it("treats a dangling group id as ungrouped (default pin)", async () => {
    mountPane(
      tabWithGroups([{ id: "r-1", where: place("A", 1, 1), group: "g-gone" }]),
    );
    await flushPromises();

    expect(mapState.markers[0]!.options.icon).toBeUndefined();
  });

  it("lists the groups in use in the legend", async () => {
    const wrapper = mountPane(
      tabWithGroups([
        { id: "r-1", where: place("A", 1, 1), group: "g-1" },
        { id: "r-2", where: place("B", 2, 2), group: "g-2" },
      ]),
    );
    await flushPromises();

    const legend = wrapper.find('[data-testid="map-legend"]');
    expect(legend.exists()).toBe(true);
    expect(legend.text()).toContain("Must see");
    expect(legend.text()).toContain("Maybe");
  });

  it("shows no legend when no group is in use", async () => {
    const wrapper = mountPane(
      tabWithGroups([{ id: "r-1", where: place("A", 1, 1) }]),
    );
    await flushPromises();

    expect(wrapper.find('[data-testid="map-legend"]').exists()).toBe(false);
  });

  it("repaints a pin when its group is recoloured", async () => {
    const tab = tabWithGroups([{ id: "r-1", where: place("A", 1, 1), group: "g-1" }]);
    const wrapper = mountPane(tab);
    await flushPromises();

    await wrapper.setProps({
      tab: {
        ...tab,
        place_groups: [
          { id: "g-1", name: "Must see", color: "#123456" },
          { id: "g-2", name: "Maybe", color: "#3e63dd" },
        ],
      },
    });
    await flushPromises();

    const attached = mapState.markers.filter((m) => m.attached);
    expect(attached).toHaveLength(1);
    expect((attached[0]!.options.icon as { fillColor: string }).fillColor).toBe(
      "#123456",
    );
  });

  it("no longer colours by column — the old scheme is gone (Story 4.6)", async () => {
    // Multiple place columns, no group column: every pin is the default now.
    const tab = tabWith(
      [{ id: "r-1", where: place("A", 1, 1), other: place("B", 2, 2) }],
      true,
    );
    const wrapper = mountPane(tab);
    await flushPromises();

    expect(mapState.markers.every((m) => m.options.icon === undefined)).toBe(
      true,
    );
    expect(wrapper.find('[data-testid="map-legend"]').exists()).toBe(false);
  });
});

describe("MapPane — selection", () => {
  it("reports the row when its marker is clicked", async () => {
    const wrapper = mountPane(TWO_CAFES());
    await flushPromises();

    mapState.markers[1]!.onClick?.();

    expect(wrapper.emitted("select-row")).toEqual([["r-2"]]);
  });

  it("pans to a row selected in the grid", async () => {
    const wrapper = mountPane(TWO_CAFES());
    await flushPromises();

    await wrapper.setProps({ selectedRowId: "r-2" });

    expect(mapState.panned).toEqual([{ lat: 38.8, lng: -9.2 }]);
  });

  it("does not pan for a row that has no place", async () => {
    const wrapper = mountPane(
      tabWith([
        { id: "r-1", cafe: "No place" },
        { id: "r-2", where: place("B", 1, 2) },
      ]),
    );
    await flushPromises();

    await wrapper.setProps({ selectedRowId: "r-1" });

    expect(mapState.panned).toEqual([]);
  });

  it("does not re-fit the bounds when panning", async () => {
    const wrapper = mountPane(TWO_CAFES());
    await flushPromises();
    const fitsAfterOpen = mapState.fits;

    await wrapper.setProps({ selectedRowId: "r-2" });

    expect(mapState.fits).toBe(fitsAfterOpen);
  });
});

describe("MapPane — keeping up with the data", () => {
  it("adds a marker when a place is filled in", async () => {
    const wrapper = mountPane(
      tabWith([{ id: "r-1", where: place("A", 1, 1) }]),
    );
    await flushPromises();

    await wrapper.setProps({
      tab: tabWith([
        { id: "r-1", where: place("A", 1, 1) },
        { id: "r-2", where: place("B", 2, 2) },
      ]),
    });
    await flushPromises();

    expect(mapState.markers.filter((m) => m.attached)).toHaveLength(2);
  });

  it("detaches the marker of a place that was cleared", async () => {
    const wrapper = mountPane(TWO_CAFES());
    await flushPromises();

    await wrapper.setProps({
      tab: tabWith([{ id: "r-1", where: place("Blue", 38.7, -9.1) }]),
    });
    await flushPromises();

    expect(mapState.markers.filter((m) => m.attached)).toHaveLength(1);
  });

  it("does not re-fit when the data changes — that would lurch mid-edit", async () => {
    const wrapper = mountPane(TWO_CAFES());
    await flushPromises();
    const fitsAfterOpen = mapState.fits;

    await wrapper.setProps({
      tab: tabWith([
        { id: "r-1", cafe: "Renamed", where: place("Blue", 38.7, -9.1) },
        { id: "r-2", cafe: "Fabrica", where: place("Fabrica", 38.8, -9.2) },
      ]),
    });
    await flushPromises();

    expect(mapState.fits).toBe(fitsAfterOpen);
  });
});

describe("MapPane — nothing to show, or nothing working", () => {
  it("invites you to fill a place in rather than showing a blank world", async () => {
    const wrapper = mountPane(tabWith([{ id: "r-1", cafe: "No place" }]));
    await flushPromises();

    expect(wrapper.find('[data-testid="map-empty"]').exists()).toBe(true);
    expect(mapState.created).toBe(0);
  });

  it("says so when the SDK will not load, and does not pretend to have a map", async () => {
    loadMapsSdk.mockRejectedValueOnce(
      new Error("Google Maps could not be loaded"),
    );
    const wrapper = mountPane(TWO_CAFES());
    await flushPromises();

    expect(wrapper.find('[data-testid="map-error"]').text()).toContain(
      "could not be loaded",
    );
    expect(mapState.created).toBe(0);
  });

  it("shows it is loading before the SDK arrives", async () => {
    let resolveLoad: (v: never) => void = () => {};
    loadMapsSdk.mockReturnValueOnce(
      new Promise((r) => {
        resolveLoad = r as (v: never) => void;
      }),
    );
    const wrapper = mountPane(TWO_CAFES());
    await flushPromises();

    expect(wrapper.find('[data-testid="map-loading"]').exists()).toBe(true);
    resolveLoad({
      Map: class {},
      Marker: class {},
      LatLngBounds: class {},
    } as never);
  });
});

describe("MapPane — when the map itself will not build", () => {
  it("shows an error rather than failing silently", async () => {
    loadMapsSdk.mockResolvedValueOnce({
      Map: class {
        constructor() {
          throw new Error("Map is not ready");
        }
      },
      Marker: class {},
      LatLngBounds: class {},
    } as never);

    const wrapper = mountPane(TWO_CAFES());
    await flushPromises();

    expect(wrapper.find('[data-testid="map-error"]').exists()).toBe(true);
  });
});

describe("MapPane — choosing what is shown (Story 4.5)", () => {
  const THREE = () =>
    tabWith([
      { id: "r-1", cafe: "Blue", where: place("Blue", 38.7, -9.1) },
      { id: "r-2", cafe: "Fabrica", where: place("Fabrica", 38.8, -9.2) },
      { id: "r-3", cafe: "No place" },
    ]);

  it("plots everything when nothing has been unticked", async () => {
    mountPane(THREE(), { shownRowIds: null });
    await flushPromises();

    expect(mapState.markers.filter((m) => m.attached)).toHaveLength(2);
  });

  it("plots only the rows that are ticked", async () => {
    mountPane(THREE(), { shownRowIds: ["r-1"] });
    await flushPromises();

    expect(mapState.markers.filter((m) => m.attached)).toHaveLength(1);
    expect(mapState.markers[0]!.position).toEqual({ lat: 38.7, lng: -9.1 });
  });

  it("removes a pin the moment its row is unticked", async () => {
    const wrapper = mountPane(THREE(), { shownRowIds: ["r-1", "r-2"] });
    await flushPromises();

    await wrapper.setProps({ shownRowIds: ["r-1"] });
    await flushPromises();

    expect(mapState.markers.filter((m) => m.attached)).toHaveLength(1);
  });

  it("puts the pin back when it is ticked again", async () => {
    const wrapper = mountPane(THREE(), { shownRowIds: ["r-1"] });
    await flushPromises();

    await wrapper.setProps({ shownRowIds: ["r-1", "r-2"] });
    await flushPromises();

    expect(mapState.markers.filter((m) => m.attached)).toHaveLength(2);
  });

  it("counts what is shown against what there is", async () => {
    const wrapper = mountPane(THREE(), { shownRowIds: ["r-1"] });
    await flushPromises();

    // Only the two rows that hold a place count; the third has nothing to show.
    expect(wrapper.find('[data-testid="map-counter"]').text()).toContain(
      "1 of 2",
    );
  });

  it("offers all and none", async () => {
    const wrapper = mountPane(THREE(), { shownRowIds: ["r-1"] });
    await flushPromises();

    await wrapper.find('[data-testid="map-show-all"]').trigger("click");
    await wrapper.find('[data-testid="map-show-none"]').trigger("click");

    expect(wrapper.emitted("show-all")).toHaveLength(1);
    expect(wrapper.emitted("show-none")).toHaveLength(1);
  });

  it("does not re-frame when a tick changes — the map must not jump", async () => {
    const wrapper = mountPane(THREE(), { shownRowIds: ["r-1", "r-2"] });
    await flushPromises();
    const fitsAfterOpen = mapState.fits;

    await wrapper.setProps({ shownRowIds: ["r-1"] });
    await flushPromises();

    expect(mapState.fits).toBe(fitsAfterOpen);
  });

  it("re-frames on demand, to what is currently shown", async () => {
    const wrapper = mountPane(THREE(), { shownRowIds: ["r-1", "r-2"] });
    await flushPromises();
    const fitsAfterOpen = mapState.fits;

    await wrapper.find('[data-testid="map-fit"]').trigger("click");

    expect(mapState.fits).toBe(fitsAfterOpen + 1);
  });

  it("says there is nothing to show when everything is unticked", async () => {
    const wrapper = mountPane(THREE(), { shownRowIds: [] });
    await flushPromises();

    expect(wrapper.find('[data-testid="map-counter"]').text()).toContain(
      "0 of 2",
    );
  });
});
