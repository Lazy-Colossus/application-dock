<template>
  <div class="kc-typeahead">
    <label class="kc-label" :for="inputId">{{ label }}</label>
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
        @blur="close()"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.enter.prevent="commitHighlighted()"
        @keydown.esc="close()"
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
      role="listbox"
    >
      <li
        v-for="(row, index) in rows"
        :key="`${row.kind}-${row.value}`"
        role="presentation"
      >
        <button
          type="button"
          role="option"
          :aria-selected="index === highlight"
          class="kc-typeahead__row"
          :class="{
            'kc-typeahead__row--highlight': index === highlight,
            'kc-new-category': row.kind === 'coin',
          }"
          :data-testid="
            row.kind === 'coin' ? `${inputId}-coin` : `${inputId}-option`
          "
          @mousedown.prevent="commit(row)"
        >
          <!--
            The new-category row is distinct by position (last), rule (a hairline
            no other row has), icon (a leading functional add glyph) and wording
            (the typed value quoted back) — never by colour alone, so coining a
            category still reads as a distinct act at any contrast setting
            (UX-DR7).
          -->
          <svg
            v-if="row.kind === 'coin'"
            class="kc-new-category__icon"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span v-if="row.kind === 'coin'"
            >Add &quot;{{ row.value }}&quot; — new category</span
          >
          <span v-else>{{ row.value }}</span>
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
 * The shared typeahead behind both the Tags and the Ingredients inputs.
 *
 * It suggests from **its own namespace only** — whatever `suggestions` it is
 * given — so a tag can never appear under Ingredients or vice versa (FR-8).
 * The two fields pass two different lists and share nothing else.
 *
 * `allowCoin` is what separates them behaviourally: Ingredients offers the
 * new-category row, Tags does not, because a free tag needs no ceremony and
 * commits straight off Enter.
 */
interface Row {
  kind: "existing" | "coin";
  value: string;
}

const props = withDefaults(
  defineProps<{
    label: string;
    inputId: string;
    suggestions: string[];
    /** Offer the new-category row for a value that matches nothing. */
    allowCoin?: boolean;
    /** Values already chosen, so the list stops offering them. */
    exclude?: string[];
  }>(),
  { allowCoin: false, exclude: () => [] },
);

const emit = defineEmits<{
  /** `isNew` is true only for a value coined via the new-category row. */
  commit: [value: string, isNew: boolean];
}>();

const query = ref("");
const open = ref(false);
const highlight = ref(-1);
const input = ref<HTMLInputElement | null>(null);

const excluded = computed(
  () => new Set(props.exclude.map((v) => v.toLowerCase())),
);

/**
 * How many values an untouched field offers.
 *
 * Opening straight onto the whole shipped vocabulary is a wall, not a
 * suggestion — the panel is `orderByUsage`-ordered, so the first few are the
 * ones this cook actually reaches for. One typed character lifts the cap and
 * searches everything.
 */
const PREVIEW_COUNT = 6;

// Case-insensitive match on ANY part of the value: `chi` offers both `chicken`
// and `chickpeas`.
const matches = computed(() => {
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

// Nothing to coin when the typed value already names a category, so the row is
// not offered in that case.
const canCoin = computed(() => {
  const typed = query.value.trim();
  if (!props.allowCoin || !typed) return false;
  return !props.suggestions.some(
    (value) => value.toLowerCase() === typed.toLowerCase(),
  );
});

// Existing values always rank above the new-category row.
const rows = computed<Row[]>(() => {
  const out: Row[] = matches.value.map((value) => ({
    kind: "existing",
    value,
  }));
  if (canCoin.value) out.push({ kind: "coin", value: query.value.trim() });
  return out;
});

// A shrinking list must not leave the highlight pointing past the end.
watch(rows, (next) => {
  if (highlight.value >= next.length) highlight.value = next.length - 1;
});

function move(delta: number): void {
  open.value = true;
  if (rows.value.length === 0) return;
  // From nothing highlighted, down takes the first row and up takes the last —
  // which is how one press of Up reaches the new-category row at the foot.
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

function commit(row: Row): void {
  emit("commit", row.value, row.kind === "coin");
  query.value = "";
  close();
  // Keep focus so a run of tags or ingredients can be typed without re-tapping.
  input.value?.focus();
}

function commitHighlighted(): void {
  if (highlight.value >= 0 && rows.value[highlight.value]) {
    commit(rows.value[highlight.value]);
    return;
  }

  const typed = query.value.trim();
  if (!typed) return;

  // An exact existing value wins, so Enter on a fully-typed name never coins a
  // duplicate under a different casing.
  const exact = props.suggestions.find(
    (v) => v.toLowerCase() === typed.toLowerCase(),
  );
  if (exact) {
    commit({ kind: "existing", value: exact });
    return;
  }
  // Ingredients: coining is explicit, so Enter with no highlight takes the coin
  // row when there is one and does nothing when there is not. Tags: a genuinely
  // new value commits as typed.
  if (props.allowCoin) {
    if (canCoin.value) commit({ kind: "coin", value: typed });
    return;
  }
  commit({ kind: "existing", value: typed });
}

defineExpose({ focus: () => input.value?.focus() });
</script>
