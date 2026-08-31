<template>
  <div class="place-cell">
    <div
      v-if="!enabled"
      class="place-cell__disabled"
      data-testid="place-disabled"
    >
      Maps are not configured on this server.
    </div>

    <template v-else>
      <div class="place-cell__field row items-center no-wrap">
        <input
          ref="inputEl"
          v-model="query"
          class="place-cell__input"
          type="text"
          placeholder="Search for a place…"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="choose(highlighted)"
          @keydown.esc.prevent="emit('cancel')"
        />
        <q-spinner v-if="searching" size="1rem" data-testid="searching" />
        <button
          v-if="value"
          type="button"
          class="place-cell__clear"
          title="Clear"
          data-testid="place-clear"
          @click="emit('clear')"
        >
          ×
        </button>
      </div>

      <!--
        Teleported to the body on purpose. A grid cell is `overflow: hidden`
        and about 24px tall, and the table scrolls inside its own box — a
        dropdown rendered in place is clipped to nothing. Fixed positioning
        against the input keeps it where it belongs on screen.
      -->
      <Teleport to="body">
        <div
          v-if="failure"
          class="place-cell__results place-cell__results--message"
          :style="dropdownStyle"
          data-testid="place-error"
        >
          {{ failure }}
        </div>

        <div
          v-else-if="searched && results.length === 0 && !searching"
          class="place-cell__results place-cell__results--message"
          :style="dropdownStyle"
          data-testid="place-empty"
        >
          No places found.
        </div>

        <ul
          v-else-if="results.length"
          class="place-cell__results"
          :style="dropdownStyle"
        >
          <li
            v-for="(place, index) in results"
            :key="place.place_id"
            class="place-cell__result"
            :class="{ 'place-cell__result--active': index === highlighted }"
            :data-testid="`place-result-${index}`"
            @mousedown.prevent="choose(index)"
          >
            <div class="place-cell__name">{{ place.name }}</div>
            <div class="place-cell__address">{{ place.address }}</div>
          </li>
        </ul>
      </Teleport>
    </template>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useListiesStore } from "@/apps/listies/stores/useListiesStore";
import type { Place } from "@/apps/listies/types";

/**
 * The editor for a place cell: type, pick from Google's results, done.
 *
 * It owns its own loading and error display rather than the store's, because a
 * keystroke in one cell should never put a spinner or a banner over the sheet.
 */
const props = defineProps<{
  value: Place | null;
  enabled: boolean;
  near: string | null;
}>();

const emit = defineEmits<{
  select: [place: Place];
  clear: [];
  cancel: [];
}>();

// Long enough that ordinary typing does not bill a request per keystroke,
// short enough not to feel laggy. Every search that gets through is a
// potential upstream call (Story 4.1 caches, but only on a repeat).
const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

const store = useListiesStore();

const query = ref(props.value?.name ?? "");
const results = ref<Place[]>([]);
const highlighted = ref(0);
const searching = ref(false);
const failure = ref<string | null>(null);
const searched = ref(false);
const inputEl = ref<HTMLInputElement | null>(null);

// Where the teleported dropdown sits: measured from the input, in viewport
// coordinates, and re-measured whenever anything scrolls or resizes.
const dropdownStyle = ref<Record<string, string>>({});

function positionDropdown(): void {
  const input = inputEl.value;
  if (!input) return;
  const rect = input.getBoundingClientRect();
  dropdownStyle.value = {
    position: "fixed",
    top: `${Math.round(rect.bottom + 2)}px`,
    left: `${Math.round(rect.left)}px`,
    minWidth: `${Math.round(rect.width)}px`,
  };
}

let timer: ReturnType<typeof setTimeout> | null = null;
// Only the newest search may write to `results`; a slow earlier one is dropped.
let latest = 0;

void nextTick(() => {
  inputEl.value?.select();
  positionDropdown();
});

// `true` so a scroll inside the grid's own scroller counts, not just the page.
onMounted(() => {
  window.addEventListener("scroll", positionDropdown, true);
  window.addEventListener("resize", positionDropdown);
});

onBeforeUnmount(() => {
  window.removeEventListener("scroll", positionDropdown, true);
  window.removeEventListener("resize", positionDropdown);
});

function reset(): void {
  results.value = [];
  highlighted.value = 0;
  failure.value = null;
  searched.value = false;
}

async function run(term: string): Promise<void> {
  const ticket = ++latest;
  searching.value = true;
  failure.value = null;
  try {
    const found = await store.searchPlaces(term, props.near);
    if (ticket !== latest) return;
    results.value = found;
    highlighted.value = 0;
    searched.value = true;
    positionDropdown();
  } catch (e) {
    if (ticket !== latest) return;
    failure.value = e instanceof Error ? e.message : String(e);
    results.value = [];
    positionDropdown();
  } finally {
    if (ticket === latest) searching.value = false;
  }
}

watch(query, (term) => {
  if (timer) clearTimeout(timer);
  const trimmed = term.trim();
  if (!props.enabled || trimmed.length < MIN_QUERY_LENGTH) {
    // Abandon anything in flight: its results are no longer being asked for.
    latest += 1;
    searching.value = false;
    reset();
    return;
  }
  timer = setTimeout(() => void run(trimmed), DEBOUNCE_MS);
});

onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
});

function move(delta: number): void {
  if (results.value.length === 0) return;
  const next = highlighted.value + delta;
  // Stop at the ends rather than wrapping: a list this short reads as a list,
  // not a carousel.
  highlighted.value = Math.min(Math.max(next, 0), results.value.length - 1);
}

function choose(index: number): void {
  const place = results.value[index];
  if (!place) return;
  emit("select", place);
}
</script>

<style scoped>
.place-cell {
  position: relative;
}

.place-cell__input {
  flex: 1 1 auto;
  min-width: 4rem;
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font: inherit;
}

.place-cell__clear {
  background: none;
  border: none;
  color: inherit;
  opacity: 0.6;
  cursor: pointer;
  font-size: 1rem;
  line-height: 1;
}

.place-cell__results {
  z-index: 7000;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 16rem;
  overflow-y: auto;
  min-width: 18rem;
  max-width: 26rem;
  color: #f0f0f0;
  background: #1d1d1d;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
}

.place-cell__results--message {
  padding: 0.4rem 0.6rem;
  font-size: 0.75rem;
}

.place-cell__result {
  padding: 0.35rem 0.6rem;
  cursor: pointer;
  white-space: normal;
}

.place-cell__result--active,
.place-cell__result:hover {
  background: rgba(255, 255, 255, 0.08);
}

.place-cell__name {
  font-weight: 600;
}

.place-cell__address,
.place-cell__empty,
.place-cell__disabled {
  font-size: 0.75rem;
  opacity: 0.6;
  white-space: normal;
}

.place-cell__error {
  font-size: 0.75rem;
  color: var(--q-negative, #c10015);
  white-space: normal;
}
</style>
