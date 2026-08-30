<template>
  <div class="sheet-grid">
    <div class="sheet-grid__scroll">
      <table class="sheet-grid__table">
        <thead>
          <tr>
            <th
              v-for="column in orderedColumns"
              :key="column.id"
              class="sheet-grid__header"
              :class="{
                'sheet-grid__header--number': column.type === 'number',
              }"
              :data-testid="`header-${column.id}`"
            >
              <span class="sheet-grid__glyph">{{
                typeGlyph(column.type)
              }}</span>
              <span
                class="sheet-grid__header-name"
                :data-testid="`header-name-${column.id}`"
                >{{ column.name }}</span
              >
            </th>
          </tr>
        </thead>

        <tbody>
          <tr
            v-for="(row, index) in orderedRows"
            :key="row.id"
            class="sheet-grid__row"
            :class="{ 'sheet-grid__row--striped': index % 2 === 1 }"
            :data-testid="`row-${row.id}`"
          >
            <GridCell
              v-for="column in orderedColumns"
              :key="column.id"
              :value="row.cells[column.id] ?? null"
              :column="column"
            />
          </tr>
        </tbody>
      </table>
    </div>

    <div
      v-if="orderedRows.length === 0"
      class="sheet-grid__empty"
      data-testid="grid-empty"
    >
      Nothing here yet — add your first row.
    </div>

    <div class="sheet-grid__actions">
      <q-btn
        dense
        flat
        no-caps
        icon="add"
        label="Add row"
        data-testid="add-row"
        @click="emit('add-row')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import GridCell from "./GridCell.vue";
import { typeGlyph } from "@/apps/listies/coerce";
import type { Tab } from "@/apps/listies/types";

const props = defineProps<{ tab: Tab }>();
const emit = defineEmits<{ "add-row": [] }>();

// `order` is authoritative on both axes; array position is an implementation
// detail of however the document was last written.
const orderedColumns = computed(() =>
  [...props.tab.columns].sort((a, b) => a.order - b.order),
);
const orderedRows = computed(() =>
  [...props.tab.rows].sort((a, b) => a.order - b.order),
);
</script>

<style scoped>
.sheet-grid {
  --listies-gridline: rgba(255, 255, 255, 0.08);
  --listies-muted: rgba(255, 255, 255, 0.35);
}

/* Wide-first: a dense grid scrolls sideways rather than reflowing (NFR-1). */
.sheet-grid__scroll {
  overflow: auto;
  max-height: 70vh;
  border: 1px solid var(--listies-gridline);
  border-radius: 6px;
}

.sheet-grid__table {
  border-collapse: separate;
  border-spacing: 0;
  width: 100%;
  font-size: 0.875rem;
}

.sheet-grid__header {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  padding: 0.45rem 0.6rem;
  background: var(--q-dark-page, #1d1d1d);
  border-bottom: 1px solid var(--listies-gridline);
  border-right: 1px solid var(--listies-gridline);
  font-weight: 600;
  white-space: nowrap;
}

.sheet-grid__header--number {
  text-align: right;
}

.sheet-grid__glyph {
  opacity: 0.45;
  margin-right: 0.35rem;
  font-size: 0.75em;
}

.sheet-grid__row--striped {
  background: rgba(255, 255, 255, 0.025);
}

.sheet-grid__empty {
  padding: 1rem 0.25rem;
  opacity: 0.6;
}

.sheet-grid__actions {
  margin-top: 0.25rem;
}
</style>
