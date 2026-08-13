<template>
  <q-page class="context-switch-app column no-wrap q-pa-md">
    <div class="row items-center justify-between">
      <q-btn
        flat
        no-caps
        icon="arrow_back"
        label="Lists"
        data-testid="back-btn"
        @click="goBack"
      />
      <div class="text-h6" data-testid="list-name">
        {{ store.currentList?.name ?? "" }}
      </div>
      <div class="row items-center q-gutter-md">
        <GridControl :model-value="grid" @update:model-value="onGrid" />
        <q-btn
          round
          unelevated
          color="primary"
          icon="add"
          data-testid="add-todo-btn"
          @click="addOpen = true"
        />
      </div>
    </div>

    <div v-if="store.error" class="text-negative q-mt-md" data-testid="error">
      {{ store.error }}
    </div>

    <div
      v-if="!store.loading && store.activeTodos.length === 0"
      class="text-grey-6 q-mt-lg"
      data-testid="empty-state"
    >
      No todos yet — add your first one with the + button.
    </div>

    <template v-else>
      <div
        class="cs-board q-mt-md"
        :style="{ '--cs-cols': grid.columns }"
        data-testid="board"
      >
        <TodoPill v-for="todo in pageTodos" :key="todo.id" :todo="todo" />
      </div>

      <div
        v-if="totalPages > 1"
        class="row items-center justify-center q-gutter-sm q-mt-md"
        data-testid="pager"
      >
        <q-btn
          flat
          dense
          no-caps
          label="Prev"
          :disable="page === 1"
          data-testid="page-prev"
          @click="page = page - 1"
        />
        <span class="text-caption" data-testid="page-indicator">
          {{ page }} / {{ totalPages }}
        </span>
        <q-btn
          flat
          dense
          no-caps
          label="Next"
          :disable="page === totalPages"
          data-testid="page-next"
          @click="page = page + 1"
        />
      </div>
    </template>

    <AddTodoDialog v-model="addOpen" @create="onCreate" />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useContextSwitchStore } from "@/apps/context-switch/stores/useContextSwitchStore";
import AddTodoDialog from "@/apps/context-switch/components/AddTodoDialog.vue";
import GridControl from "@/apps/context-switch/components/GridControl.vue";
import TodoPill from "@/apps/context-switch/components/TodoPill.vue";
import { DEFAULT_GRID, pageCount, pageSlice } from "@/apps/context-switch/grid";
import type { Grid, NewTodo } from "@/apps/context-switch/types";

const route = useRoute();
const router = useRouter();
const store = useContextSwitchStore();

const listId = computed(() => String(route.params.listId ?? ""));
const addOpen = ref(false);
const page = ref(1);

const grid = computed<Grid>(() => store.currentList?.grid ?? DEFAULT_GRID);
const totalPages = computed(() =>
  pageCount(store.activeTodos.length, grid.value),
);
const pageTodos = computed(() =>
  pageSlice(store.activeTodos, grid.value, page.value),
);

// A shrinking grid (or a shrinking board) can strand the viewer past the last
// page — pull them back to the final one instead of showing nothing.
watch(totalPages, (pages) => {
  if (page.value > pages) page.value = pages;
});

onMounted(() => {
  void store.fetchList(listId.value);
});

function goBack(): void {
  void router.push("/context-switch");
}

async function onCreate(todo: NewTodo): Promise<void> {
  try {
    await store.addTodo(listId.value, todo);
  } catch {
    // Surfaced via store.error.
  }
}

async function onGrid(next: Grid): Promise<void> {
  try {
    await store.setGrid(listId.value, next);
  } catch {
    // Surfaced via store.error.
  }
}
</script>

<style scoped lang="sass">
// minmax(0, 1fr) lets columns shrink rather than overflow the page (NFR-1);
// the media queries drop the column count outright once pills would be unusable.
.cs-board
  display: grid
  grid-template-columns: repeat(var(--cs-cols), minmax(0, 1fr))
  gap: 16px

@media (max-width: 900px)
  .cs-board
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr))

@media (max-width: 480px)
  .cs-board
    grid-template-columns: 1fr
</style>
