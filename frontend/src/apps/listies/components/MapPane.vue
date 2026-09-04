<template>
  <div class="map-pane">
    <div v-if="failure" class="map-pane__message" data-testid="map-error">
      {{ failure }}
    </div>

    <div
      v-else-if="pins.length === 0"
      class="map-pane__message"
      data-testid="map-empty"
    >
      Nothing to map yet — fill in a place and its pin appears here.
    </div>

    <template v-else>
      <div class="map-pane__header row items-center no-wrap">
        <span class="map-pane__counter" data-testid="map-counter">
          {{ shownPins.length }} of {{ pins.length }} shown
        </span>
        <q-space />
        <q-btn
          dense
          flat
          no-caps
          size="sm"
          label="All"
          data-testid="map-show-all"
          @click="emit('show-all')"
        />
        <q-btn
          dense
          flat
          no-caps
          size="sm"
          label="None"
          data-testid="map-show-none"
          @click="emit('show-none')"
        />
        <q-btn
          dense
          flat
          no-caps
          size="sm"
          icon="center_focus_strong"
          label="Fit"
          data-testid="map-fit"
          @click="fitToPins"
        />
      </div>

      <div v-if="loading" class="map-pane__loading">
        <q-spinner size="2rem" />
      </div>
      <div ref="canvas" class="map-pane__canvas" data-testid="map-canvas" />

      <div
        v-if="groupsInUse.length > 0"
        class="map-pane__legend"
        data-testid="map-legend"
      >
        <span
          v-for="group in groupsInUse"
          :key="group.id"
          class="map-pane__legend-item"
        >
          <span class="map-pane__swatch" :style="{ background: group.color }" />
          {{ group.name }}
        </span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { loadMapsSdk } from "@/apps/listies/maps";
import type { GoogleMap, GoogleMarker, MapsApi } from "@/apps/listies/maps";
import { isPlace } from "@/apps/listies/types";
import type { Place, PlaceGroup, Tab } from "@/apps/listies/types";

const props = withDefaults(
  defineProps<{
    tab: Tab;
    browserKey: string | null;
    selectedRowId: string | null;
    /** Rows to plot; `null` means all of them. */
    shownRowIds?: string[] | null;
  }>(),
  { shownRowIds: null },
);

const emit = defineEmits<{
  "select-row": [rowId: string];
  "show-all": [];
  "show-none": [];
}>();

const DEFAULT_ZOOM = 14;

interface Pin {
  key: string;
  rowId: string;
  label: string;
  place: Place;
}

const canvas = ref<HTMLElement | null>(null);
const loading = ref(false);
const failure = ref<string | null>(null);

let map: GoogleMap | null = null;
let api: MapsApi | null = null;
const markers = new Map<string, GoogleMarker>();

const placeColumns = computed(() =>
  [...props.tab.columns]
    .sort((a, b) => a.order - b.order)
    .filter((column) => column.type === "place"),
);

const placeGroups = computed<PlaceGroup[]>(() => props.tab.place_groups ?? []);

// A row's group colour comes from one group column — the first by order if a
// tab somehow has several (Story 4.6). No group column means no colouring.
const groupColumn = computed(() =>
  [...props.tab.columns]
    .sort((a, b) => a.order - b.order)
    .find((column) => column.type === "place_group"),
);

/** The group a row belongs to, or undefined when ungrouped / id is dangling. */
function groupForRow(rowId: string): PlaceGroup | undefined {
  const column = groupColumn.value;
  if (!column) return undefined;
  const id = props.tab.rows.find((r) => r.id === rowId)?.cells[column.id];
  if (typeof id !== "string") return undefined;
  return placeGroups.value.find((group) => group.id === id);
}

/** The row's first text value names the pin; the place names itself otherwise. */
function labelFor(rowId: string, place: Place): string {
  const row = props.tab.rows.find((r) => r.id === rowId);
  const textColumn = [...props.tab.columns]
    .sort((a, b) => a.order - b.order)
    .find((column) => column.type === "text");
  const value = textColumn ? row?.cells[textColumn.id] : null;
  return typeof value === "string" && value.trim() ? value : place.name;
}

const pins = computed<Pin[]>(() => {
  const found: Pin[] = [];
  for (const row of [...props.tab.rows].sort((a, b) => a.order - b.order)) {
    for (const column of placeColumns.value) {
      const value = row.cells[column.id];
      if (!isPlace(value)) continue;
      found.push({
        key: `${row.id}:${column.id}`,
        rowId: row.id,
        label: labelFor(row.id, value),
        place: value,
      });
    }
  }
  return found;
});

/** What is actually on the map right now: the ticked subset of `pins`. */
const shownPins = computed(() => {
  const shown = props.shownRowIds;
  if (shown === null) return pins.value;
  const allowed = new Set(shown);
  return pins.value.filter((pin) => allowed.has(pin.rowId));
});

// The groups actually plotted right now, in tab order — the legend's contents.
// A group with no shown pin does not appear; no groups in use, no legend.
const groupsInUse = computed<PlaceGroup[]>(() => {
  const usedIds = new Set<string>();
  for (const pin of shownPins.value) {
    const group = groupForRow(pin.rowId);
    if (group) usedIds.add(group.id);
  }
  return placeGroups.value.filter((group) => usedIds.has(group.id));
});

/** A coloured pin for a row in a group; the default pin when ungrouped. */
function iconFor(rowId: string): Record<string, unknown> | undefined {
  const group = groupForRow(rowId);
  if (!group) return undefined;
  return {
    path: "M 0,0 m -8,0 a 8,8 0 1,0 16,0 a 8,8 0 1,0 -16,0",
    fillColor: group.color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 1,
  };
}

// The marker's identity folds in its group colour, so recolouring a group makes
// the old-coloured marker stale and a fresh one take its place — the SDK marker
// has no `setIcon`, and this reuses the same add/remove diff (AC 7).
function markerKey(pin: Pin): string {
  return `${pin.key}#${groupForRow(pin.rowId)?.color ?? ""}`;
}

function syncMarkers(): void {
  if (!map || !api) return;

  const wanted = new Set(shownPins.value.map(markerKey));

  for (const [key, marker] of markers) {
    if (!wanted.has(key)) {
      marker.setMap(null);
      markers.delete(key);
    }
  }

  for (const pin of shownPins.value) {
    const key = markerKey(pin);
    if (markers.has(key)) continue;
    const marker = new api.Marker({
      map,
      position: { lat: pin.place.lat, lng: pin.place.lng },
      title: pin.label,
      icon: iconFor(pin.rowId),
    });
    marker.addListener("click", () => emit("select-row", pin.rowId));
    markers.set(key, marker);
  }
}

/**
 * Frame what is shown. Called when the map opens and from the Fit control —
 * never automatically on a data or tick change, which would make the map
 * lurch while someone is working.
 */
function fitToPins(): void {
  if (!map || !api) return;
  const current = shownPins.value;
  if (current.length === 0) return;

  if (current.length === 1) {
    // Fitting bounds to a single point zooms to the maximum, which is useless.
    map.setCenter({ lat: current[0]!.place.lat, lng: current[0]!.place.lng });
    map.setZoom(DEFAULT_ZOOM);
    return;
  }

  const bounds = new api.LatLngBounds();
  for (const pin of current) {
    bounds.extend({ lat: pin.place.lat, lng: pin.place.lng });
  }
  map.fitBounds(bounds, 48);
}

async function build(): Promise<void> {
  if (map || pins.value.length === 0) return;

  loading.value = true;
  failure.value = null;
  try {
    api = await loadMapsSdk(props.browserKey ?? "");
  } catch (e) {
    failure.value = e instanceof Error ? e.message : String(e);
    return;
  } finally {
    loading.value = false;
  }

  // The canvas only exists once loading and error states are out of the way.
  await nextTickCanvas();
  if (!canvas.value || !api) return;

  try {
    map = new api.Map(canvas.value, {
      zoom: DEFAULT_ZOOM,
      center: { lat: pins.value[0]!.place.lat, lng: pins.value[0]!.place.lng },
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
    });

    syncMarkers();
    fitToPins();
  } catch (e) {
    // Better a visible explanation than an unhandled rejection and a blank box.
    map = null;
    failure.value = e instanceof Error ? e.message : String(e);
  }
}

async function nextTickCanvas(): Promise<void> {
  const { nextTick } = await import("vue");
  await nextTick();
}

void build();

// Data changes move pins, never the viewport: re-framing while someone is
// typing would make the map lurch under them (Story 4.5 adds an explicit
// "fit to shown" control instead).
// `placeGroups` is watched too: recolouring a group changes no pin's position
// but must repaint it (via the colour-folded marker key above).
watch([pins, shownPins, placeGroups], () => {
  if (map) syncMarkers();
  else void build();
});

watch(
  () => props.selectedRowId,
  (rowId) => {
    if (!map || !rowId) return;
    const pin = pins.value.find((p) => p.rowId === rowId);
    if (pin) map.panTo({ lat: pin.place.lat, lng: pin.place.lng });
  },
);

onBeforeUnmount(() => {
  for (const marker of markers.values()) marker.setMap(null);
  markers.clear();
  map = null;
});
</script>

<style scoped>
.map-pane {
  position: relative;
  height: 100%;
  min-height: 12rem;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  overflow: hidden;
}

.map-pane__header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  gap: 0.25rem;
  padding: 0.2rem 0.4rem;
  background: rgba(0, 0, 0, 0.65);
  font-size: 0.75rem;
}

.map-pane__counter {
  opacity: 0.8;
}

.map-pane__canvas {
  height: 100%;
  width: 100%;
}

.map-pane__message {
  padding: 1rem;
  opacity: 0.6;
  font-size: 0.875rem;
}

.map-pane__loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.map-pane__legend {
  position: absolute;
  left: 0.5rem;
  bottom: 0.5rem;
  display: flex;
  gap: 0.75rem;
  padding: 0.3rem 0.5rem;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.65);
  font-size: 0.75rem;
}

.map-pane__legend-item {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
}

.map-pane__swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  display: inline-block;
}
</style>
