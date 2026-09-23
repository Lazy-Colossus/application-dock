<template>
  <div class="kc-typeahead">
    <label
      class="kc-label"
      :class="{ 'kc-sr-only': hideLabel }"
      :for="inputId"
      >{{ label }}</label
    >
    <!--
      Enter still commits, but it is not the only way in: the add button next to
      the field does the same thing for anyone who does not expect a bare field
      to act on Enter.
    -->
    <div class="kc-typeahead__control">
      <input
        :id="inputId"
        ref="input"
        v-model="query"
        type="text"
        class="kc-field"
        autocomplete="off"
        role="combobox"
        aria-autocomplete="list"
        :aria-expanded="open"
        :aria-controls="`${inputId}-list`"
        :data-testid="`${inputId}-input`"
        @focus="open = true"
        @blur="persistent || close()"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="commitHighlighted()"
        @keydown.esc="escape()"
      />
      <button
        type="button"
        class="kc-btn kc-typeahead__add"
        :disabled="query.trim() === ''"
        :aria-label="`Add ${label.toLowerCase()}`"
        :data-testid="`${inputId}-add`"
        @mousedown.prevent
        @click="commitHighlighted()"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>

    <ul
      v-if="open && rows.length > 0"
      :id="`${inputId}-list`"
      class="kc-typeahead__panel"
      :class="{ 'kc-typeahead__panel--inline': persistent }"
      role="listbox"
    >
      <li v-for="(row, index) in rows" :key="row" role="presentation">
        <button
          type="button"
          role="option"
          :aria-selected="index === highlight"
          class="kc-typeahead__row"
          :class="{ 'kc-typeahead__row--highlight': index === highlight }"
          :data-testid="`${inputId}-option`"
          @mousedown.prevent="commit(row)"
        >
          {{ row }}
        </button>
      </li>
      <!--
        Says the preview is a preview, so the cap never reads as "this is all
        there is". Presentational: it is not an option and must not be one.
      -->
      <li
        v-if="hiddenCount > 0"
        class="kc-typeahead__hint"
        role="presentation"
        :data-testid="`${inputId}-hint`"
      >
        Type to search {{ hiddenCount }} more
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";

/**
 * The typeahead behind the Tags input.
 *
 * It suggests from **its own namespace only** — whatever `suggestions` it is
 * given — so a tag can never appear under Ingredients or vice versa (FR-8).
 *
 * Schema v2 removed the shared ingredient vocabulary, and the new-category
 * ceremony went with it, so Tags is now this component's only caller: a free
 * tag needs no ceremony and commits straight off Enter. Ingredients uses a
 * native datalist instead, which is exactly "offer a list, accept anything".
 *
 * `persistent` is for a host that owns the open state, as the tags pop-over
 * does: the list is always showing and sits in flow beneath the field, a pick
 * leaves it open for the next one, and Escape asks the host to close.
 */
const props = withDefaults(
  defineProps<{
    label: string;
    inputId: string;
    suggestions: string[];
    /** Values already chosen, so the list stops offering them. */
    exclude?: string[];
    persistent?: boolean;
    /** Kept for screen readers when the host's own heading names the field. */
    hideLabel?: boolean;
  }>(),
  { exclude: () => [], persistent: false, hideLabel: false },
);

const emit = defineEmits<{ commit: [value: string]; dismiss: [] }>();

const query = ref("");
const open = ref(props.persistent);
const highlight = ref(-1);
const input = ref<HTMLInputElement | null>(null);

const excluded = computed(
  () => new Set(props.exclude.map((v) => v.toLowerCase())),
);

/**
 * How many values an untouched field offers.
 *
 * Opening straight onto the whole vocabulary is a wall, not a suggestion — the
 * panel is `orderByUsage`-ordered, so the first few are the ones this cook
 * actually reaches for. One typed character lifts the cap and searches
 * everything.
 */
const PREVIEW_COUNT = 6;

// Case-insensitive match on ANY part of the value: `chi` offers both `chicken`
// and `chickpeas`.
const rows = computed(() => {
  const needle = query.value.trim().toLowerCase();
  const available = props.suggestions.filter(
    (value) =>
      !excluded.value.has(value.toLowerCase()) &&
      (needle === "" || value.toLowerCase().includes(needle)),
  );
  return needle === "" ? available.slice(0, PREVIEW_COUNT) : available;
});

/** How many values the preview is holding back, for the panel's hint. */
const hiddenCount = computed(() => {
  if (query.value.trim() !== "") return 0;
  const available = props.suggestions.filter(
    (value) => !excluded.value.has(value.toLowerCase()),
  );
  return Math.max(0, available.length - PREVIEW_COUNT);
});

// A shrinking list must not leave the highlight pointing past the end.
watch(rows, (next) => {
  if (highlight.value >= next.length) highlight.value = next.length - 1;
});

function move(delta: number): void {
  open.value = true;
  if (rows.value.length === 0) return;
  // From nothing highlighted, down takes the first row and up takes the last.
  if (highlight.value < 0) {
    highlight.value = delta > 0 ? 0 : rows.value.length - 1;
    return;
  }
  highlight.value =
    (highlight.value + delta + rows.value.length) % rows.value.length;
}

function close(): void {
  open.value = false;
  highlight.value = -1;
}

function escape(): void {
  if (props.persistent) emit("dismiss");
  else close();
}

function commit(value: string): void {
  emit("commit", value);
  query.value = "";
  if (props.persistent) highlight.value = -1;
  else close();
  // Keep focus so a run of tags can be typed without re-tapping.
  input.value?.focus();
}

function commitHighlighted(): void {
  if (highlight.value >= 0 && rows.value[highlight.value]) {
    commit(rows.value[highlight.value]);
    return;
  }

  const typed = query.value.trim();
  if (!typed) return;

  // An exact existing value wins, so Enter on a fully-typed name commits the
  // casing already in use rather than a near-duplicate.
  const exact = props.suggestions.find(
    (v) => v.toLowerCase() === typed.toLowerCase(),
  );
  commit(exact ?? typed);
}

defineExpose({ focus: () => input.value?.focus() });
</script>
