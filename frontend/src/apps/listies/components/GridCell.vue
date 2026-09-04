<template>
  <td
    class="grid-cell"
    :class="{
      'grid-cell--number': column.type === 'number',
      'grid-cell--empty': isEmpty && !editing,
      'grid-cell--invalid': invalid !== null,
      'grid-cell--focused': focused,
    }"
    :tabindex="editable ? 0 : undefined"
    @click="requestEdit"
  >
    <!-- A place is chosen from search results, so it gets its own editor
         rather than a text box (Story 4.3). -->
    <PlaceCell
      v-if="isPlaceColumn && editing"
      :value="isPlace(value) ? value : null"
      :enabled="mapsEnabled"
      :near="near"
      :initial-query="placeSeed"
      @select="pickPlace"
      @clear="clearPlace"
      @cancel="emit('end-edit')"
    />

    <!-- A date is picked from a small popout calendar rather than typed, so it
         gets a q-date in a q-menu instead of a text box (Story 2.7). The menu
         floats in a portal, so it is not clipped by the cell's overflow. -->
    <template v-else-if="isDateColumn && editing">
      <span class="grid-cell__date-anchor">{{
        formatCell(value, column.type)
      }}</span>
      <q-menu
        :model-value="true"
        no-parent-event
        anchor="bottom left"
        self="top left"
        @update:model-value="onMenuToggle"
      >
        <q-date
          :model-value="dateModel"
          mask="YYYY-MM-DD"
          @update:model-value="onDatePicked"
        />
      </q-menu>
    </template>

    <!-- A group is chosen from a dropdown of the tab's groups (Story 4.6); like
         the date/place editors it has no free text, so it opens its own menu in
         a portal rather than a text box. -->
    <template v-else-if="isGroupColumn && editing">
      <span class="grid-cell__group-anchor">{{ groupLabel }}</span>
      <q-menu
        :model-value="true"
        no-parent-event
        anchor="bottom left"
        self="top left"
        data-testid="group-menu"
        @update:model-value="onMenuToggle"
      >
        <q-list dense style="min-width: 10rem">
          <q-item
            v-for="group in groups"
            :key="group.id"
            clickable
            :data-testid="`group-option-${group.id}`"
            @click="pickGroup(group.id)"
          >
            <q-item-section avatar>
              <span
                class="grid-cell__swatch"
                :style="{ background: group.color }"
              />
            </q-item-section>
            <q-item-section>{{ group.name }}</q-item-section>
          </q-item>
          <q-item
            clickable
            data-testid="group-option-none"
            @click="pickGroup(null)"
          >
            <q-item-section class="grid-cell__group-none">None</q-item-section>
          </q-item>
        </q-list>
      </q-menu>
    </template>

    <template v-else-if="editing">
      <input
        ref="inputEl"
        v-model="draft"
        class="grid-cell__input"
        type="text"
        :inputmode="inputMode"
        @blur="commit"
        @keydown.enter.prevent="commit"
        @keydown.esc.prevent="cancel"
      />
      <div v-if="invalid" class="grid-cell__error">{{ invalid }}</div>
    </template>
    <template v-else>
      <template v-if="isPlace(value)">
        <div class="grid-cell__place">{{ value.name }}</div>
        <div v-if="value.address" class="grid-cell__address">
          {{ value.address }}
        </div>
      </template>
      <template v-else-if="isGroupColumn && currentGroup">
        <span class="grid-cell__group">
          <span
            class="grid-cell__swatch"
            :style="{ background: currentGroup.color }"
          />
          {{ currentGroup.name }}
        </span>
      </template>
      <template v-else>{{ formatCell(value, column.type, groups) }}</template>
    </template>
  </td>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import PlaceCell from "./PlaceCell.vue";
import { findGroup, formatCell, parseCell } from "@/apps/listies/coerce";
import { isPlace } from "@/apps/listies/types";
import type {
  CellValue,
  Column,
  Place,
  PlaceGroup,
} from "@/apps/listies/types";

/**
 * One cell. Editing is **parent-controlled**: the grid owns which cell is being
 * edited, because the keyboard moves that selection across cells (Story 2.3).
 * This component asks (`begin-edit` / `end-edit`) and reports (`commit`).
 */
const props = withDefaults(
  defineProps<{
    value: CellValue;
    column: Column;
    editable?: boolean;
    editing?: boolean;
    focused?: boolean;
    mapsEnabled?: boolean;
    near?: string | null;
    /** The tab's place groups, for a `place_group` cell (Story 4.6). */
    groups?: PlaceGroup[];
  }>(),
  {
    editable: false,
    editing: false,
    focused: false,
    mapsEnabled: false,
    near: null,
    groups: () => [],
  },
);

const emit = defineEmits<{
  commit: [value: CellValue];
  "begin-edit": [];
  "end-edit": [];
}>();

const draft = ref<string | number>("");
const invalid = ref<string | null>(null);
const inputEl = ref<HTMLInputElement | null>(null);

// A character the grid handed us to open the editor with, instead of the
// stored value — set just before edit mode turns on (Story 2.8). Consumed and
// cleared by the `editing` watcher.
const pendingSeed = ref<string | null>(null);

// The same, but for a place cell: it opens its own search editor rather than a
// text box, so the seed is threaded through as PlaceCell's initial query
// instead of the draft. Cleared when the edit ends (Story 2.8).
const placeSeed = ref<string | null>(null);

// `null` is empty; 0 and "" are not — they are values the user entered.
const isPlaceColumn = computed(() => props.column.type === "place");
const isDateColumn = computed(() => props.column.type === "date");
const isGroupColumn = computed(() => props.column.type === "place_group");

// The group the cell's stored id resolves to, or undefined when empty or the id
// is dangling (its group was deleted) — which reads as ungrouped.
const currentGroup = computed(() => findGroup(props.value, props.groups));
const groupLabel = computed(() => currentGroup.value?.name ?? "—");

const isEmpty = computed(
  () => props.value === null || props.value === undefined,
);

// A date is picked from the popout calendar, which emits a canonical ISO string
// (mask="YYYY-MM-DD"), so it never uses this text input. A number edits as text
// rather than a native number input, which silently discards what it cannot
// parse — a typo would clear the cell instead of being explained.
const inputMode = computed(() =>
  props.column.type === "number" ? "decimal" : undefined,
);

// The picker's model is the stored ISO string, or null for an empty cell — from
// which q-date defaults its navigation to the current month.
const dateModel = computed(() =>
  typeof props.value === "string" ? props.value : null,
);

watch(
  () => props.editing,
  (editing) => {
    if (editing) {
      const seed = pendingSeed.value;
      if (seed !== null) {
        // Type-to-edit: the draft *becomes* the typed character (overwriting
        // any stored value, spreadsheet-style), caret after it rather than a
        // select-all so the next keystroke extends it (Story 2.8).
        draft.value = seed;
        invalid.value = null;
        void nextTick(() => {
          const el = inputEl.value;
          if (!el) return;
          // Focus explicitly: unlike `.select()` below, `setSelectionRange`
          // does not focus, so without this the next keystroke never reaches
          // the input and only the seed character lands (Story 2.8).
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        });
      } else {
        draft.value = props.value === null ? "" : String(props.value);
        invalid.value = null;
        void nextTick(() => inputEl.value?.select());
      }
    } else {
      invalid.value = null;
      // Only clear the place seed once editing ends: it must survive until the
      // freshly-mounted PlaceCell has read it as its initial query.
      placeSeed.value = null;
    }
    pendingSeed.value = null;
  },
  { immediate: true },
);

function requestEdit(): void {
  if (!props.editable || props.editing) return;
  emit("begin-edit");
}

/**
 * Open the editor seeded with a single typed character rather than the stored
 * value — the grid calls this just before it turns edit mode on (Story 2.8). A
 * place cell keeps the character as its search query; the date/group editors
 * have no free text, so they ignore it and open on their own value.
 */
function seedDraft(char: string): void {
  // A date picker and a group dropdown have no free-text entry, so a seed is
  // meaningless to them and is dropped. A place editor searches by text, so it
  // keeps the character as its opening query rather than losing it (Story 2.8).
  if (isDateColumn.value || isGroupColumn.value) return;
  if (isPlaceColumn.value) {
    placeSeed.value = char;
    return;
  }
  pendingSeed.value = char;
}

function pickPlace(place: Place): void {
  emit("commit", place);
  emit("end-edit");
}

/** A group was chosen (its id) or cleared (`null`), through the ordinary commit. */
function pickGroup(groupId: string | null): void {
  const current = props.value ?? null;
  if (groupId !== current) emit("commit", groupId);
  emit("end-edit");
}

function clearPlace(): void {
  emit("commit", null);
  emit("end-edit");
}

/**
 * A day was picked (ISO string) or the selection was toggled off (`null` — the
 * clear path, AC 5). Either way it goes through the ordinary `commit`, then the
 * edit ends so the picker closes.
 */
function onDatePicked(value: string | null): void {
  emit("commit", value ?? null);
  emit("end-edit");
}

// Esc or an outside click closes the menu without a pick: just end the edit,
// nothing is sent, and the cell keeps its previous value (AC 6).
function onMenuToggle(open: boolean): void {
  if (!open) emit("end-edit");
}

function commit(): void {
  if (!props.editing) return;

  // The grid commits the focused cell before moving (Story 2.3). A place cell
  // (Story 4.3), a date cell (Story 2.7) and a group cell (Story 4.6) have no
  // typed text to save, so this must simply let go — treating the picker as an
  // invalid entry would trap the cursor in the cell.
  if (isPlaceColumn.value || isDateColumn.value || isGroupColumn.value) {
    emit("end-edit");
    return;
  }

  const result = parseCell(String(draft.value ?? ""), props.column.type);
  if (!result.ok) {
    // Stay in the editor so the entry can be corrected rather than lost.
    invalid.value = result.error;
    return;
  }

  invalid.value = null;
  const current = props.value ?? null;
  if (result.value !== current) emit("commit", result.value);
  emit("end-edit");
}

function cancel(): void {
  invalid.value = null;
  emit("end-edit");
}

defineExpose({ commit, seedDraft });
</script>

<style scoped>
.grid-cell {
  padding: 0.35rem 0.6rem;
  border-right: 1px solid var(--listies-gridline, rgba(255, 255, 255, 0.08));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 20rem;
  outline: none;
}

.grid-cell--number {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.grid-cell--empty {
  color: var(--listies-muted, rgba(255, 255, 255, 0.35));
}

.grid-cell--focused {
  box-shadow: inset 0 0 0 2px var(--q-primary, #1976d2);
}

.grid-cell--invalid {
  box-shadow: inset 0 0 0 2px var(--q-negative, #c10015);
}

.grid-cell__input {
  width: 100%;
  min-width: 4rem;
  background: transparent;
  border: none;
  outline: none;
  color: inherit;
  font: inherit;
  text-align: inherit;
}

.grid-cell__place {
  font-weight: 500;
}

.grid-cell__group {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.grid-cell__swatch {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  display: inline-block;
  flex: 0 0 auto;
}

.grid-cell__group-none {
  opacity: 0.6;
}

.grid-cell__address {
  font-size: 0.7rem;
  opacity: 0.55;
  overflow: hidden;
  text-overflow: ellipsis;
}

.grid-cell__error {
  font-size: 0.7rem;
  color: var(--q-negative, #c10015);
}
</style>
