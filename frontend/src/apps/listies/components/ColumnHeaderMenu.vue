<template>
  <q-menu>
    <q-list dense style="min-width: 14rem">
      <!-- Rename -->
      <template v-if="mode === 'rename'">
        <q-item>
          <q-item-section>
            <q-input
              v-model="draftName"
              dense
              outlined
              autofocus
              data-testid="rename-column-input"
            />
          </q-item-section>
        </q-item>
        <q-item>
          <q-item-section>
            <div class="row justify-end q-gutter-xs">
              <q-btn
                dense
                flat
                no-caps
                label="Cancel"
                data-testid="rename-column-cancel"
                @click="reset"
              />
              <q-btn
                dense
                flat
                no-caps
                color="primary"
                label="Save"
                :disable="!draftName.trim()"
                data-testid="rename-column-save"
                @click="saveRename"
              />
            </div>
          </q-item-section>
        </q-item>
      </template>

      <!-- Retype -->
      <template v-else-if="mode === 'retype'">
        <q-item>
          <q-item-section>
            <q-select
              v-model="draftType"
              dense
              outlined
              emit-value
              map-options
              :options="TYPE_OPTIONS"
              data-testid="retype-select"
            />
          </q-item-section>
        </q-item>
        <q-item v-if="blankedCount > 0">
          <q-item-section>
            <div
              class="text-negative text-caption"
              data-testid="retype-warning"
            >
              This empties {{ blankedCount }}
              {{ blankedCount === 1 ? "value" : "values" }} that cannot be read
              as {{ draftType }}.
            </div>
          </q-item-section>
        </q-item>
        <q-item>
          <q-item-section>
            <div class="row justify-end q-gutter-xs">
              <q-btn
                dense
                flat
                no-caps
                label="Cancel"
                data-testid="retype-cancel"
                @click="reset"
              />
              <q-btn
                dense
                flat
                no-caps
                :color="blankedCount > 0 ? 'negative' : 'primary'"
                :label="blankedCount > 0 ? 'Change anyway' : 'Change'"
                data-testid="retype-apply"
                @click="applyRetype"
              />
            </div>
          </q-item-section>
        </q-item>
      </template>

      <!-- Delete confirmation -->
      <template v-else-if="mode === 'delete'">
        <q-item>
          <q-item-section>
            <div class="text-caption">
              Delete “{{ column.name }}” and its {{ filledCount }}
              {{ filledCount === 1 ? "value" : "values" }}?
            </div>
          </q-item-section>
        </q-item>
        <q-item>
          <q-item-section>
            <div class="row justify-end q-gutter-xs">
              <q-btn
                dense
                flat
                no-caps
                label="Keep"
                data-testid="delete-column-cancel"
                @click="reset"
              />
              <q-btn
                dense
                flat
                no-caps
                color="negative"
                label="Delete"
                data-testid="delete-column-confirm"
                @click="confirmDelete"
              />
            </div>
          </q-item-section>
        </q-item>
      </template>

      <!-- The menu itself -->
      <template v-else>
        <q-item clickable data-testid="menu-rename" @click="startRename">
          <q-item-section>Rename…</q-item-section>
        </q-item>
        <q-item clickable data-testid="menu-retype" @click="startRetype">
          <q-item-section>Change type…</q-item-section>
        </q-item>
        <q-item
          clickable
          :disable="!canMoveLeft"
          data-testid="menu-move-left"
          @click="canMoveLeft && emit('move', -1)"
        >
          <q-item-section>Move left</q-item-section>
        </q-item>
        <q-item
          clickable
          :disable="!canMoveRight"
          data-testid="menu-move-right"
          @click="canMoveRight && emit('move', 1)"
        >
          <q-item-section>Move right</q-item-section>
        </q-item>
        <q-item
          v-if="canDelete"
          clickable
          data-testid="menu-delete"
          @click="mode = 'delete'"
        >
          <q-item-section class="text-negative">Delete column…</q-item-section>
        </q-item>
      </template>
    </q-list>
  </q-menu>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { countBlankedByRetype } from "@/apps/listies/coerce";
import type { Column, ColumnType, Row } from "@/apps/listies/types";

const props = defineProps<{
  column: Column;
  rows: Row[];
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canDelete: boolean;
}>();

const emit = defineEmits<{
  rename: [name: string];
  retype: [type: ColumnType];
  move: [delta: number];
  delete: [];
}>();

const TYPE_OPTIONS: { label: string; value: ColumnType }[] = [
  { label: "Text", value: "text" },
  { label: "Number", value: "number" },
  { label: "Date", value: "date" },
];

type Mode = "menu" | "rename" | "retype" | "delete";
const mode = ref<Mode>("menu");
const draftName = ref("");
const draftType = ref<ColumnType>("text");

// How much a retype would cost, recomputed as the target type changes, so the
// user sees the price before paying it rather than after.
const blankedCount = computed(() =>
  countBlankedByRetype(props.rows, props.column.id, draftType.value),
);

const filledCount = computed(
  () =>
    props.rows.filter(
      (row) =>
        row.cells[props.column.id] !== undefined &&
        row.cells[props.column.id] !== null,
    ).length,
);

function reset(): void {
  mode.value = "menu";
}

function startRename(): void {
  draftName.value = props.column.name;
  mode.value = "rename";
}

function startRetype(): void {
  draftType.value = props.column.type;
  mode.value = "retype";
}

function saveRename(): void {
  const name = draftName.value.trim();
  if (!name) return;
  emit("rename", name);
  reset();
}

function applyRetype(): void {
  emit("retype", draftType.value);
  reset();
}

function confirmDelete(): void {
  emit("delete");
  reset();
}
</script>
