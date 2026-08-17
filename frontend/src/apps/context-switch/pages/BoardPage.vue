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
      <div class="row items-center no-wrap cs-list-nav">
        <q-btn
          v-if="prevList"
          flat
          round
          dense
          icon="chevron_left"
          :aria-label="`Go to ${prevList.name}`"
          data-testid="prev-list-btn"
          @click="goToList(prevList.id)"
        />
        <div
          class="text-h6 cs-list-name"
          :class="{ 'cs-list-name--armed': movePopupOpen }"
          data-testid="list-name"
          @dragover.prevent="onNameDragOver"
          @dragleave="cancelDwell"
          @drop.prevent="closeMovePopup"
        >
          {{ store.currentList?.name ?? "" }}
        </div>
        <q-btn
          v-if="nextList"
          flat
          round
          dense
          icon="chevron_right"
          :aria-label="`Go to ${nextList.name}`"
          data-testid="next-list-btn"
          @click="goToList(nextList.id)"
        />

        <div
          v-if="movePopupOpen"
          class="cs-move-popup"
          data-testid="move-popup"
          @dragover.prevent
        >
          <div class="text-caption text-grey-7 q-px-sm q-pb-xs">
            Move to another list
          </div>
          <div
            v-for="target in moveTargets"
            :key="target.id"
            class="cs-move-target"
            :data-testid="`move-target-${target.id}`"
            @dragover.prevent
            @drop.prevent="onMoveDrop(target.id)"
          >
            {{ target.name }}
          </div>
        </div>
      </div>
      <div class="row items-center q-gutter-md">
        <GridControl :model-value="grid" @update:model-value="onGrid" />
        <q-btn
          flat
          round
          icon="inventory_2"
          data-testid="archive-btn"
          @click="openArchive"
        />
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

    <!-- Gate the empty-state and board on a loaded list: a failed load leaves
         currentList null, so only the error banner above shows — never a
         misleading "empty list". A mutation error keeps the board visible. -->
    <template v-if="store.currentList">
      <div
        v-if="!store.loading && store.activeTodos.length === 0"
        class="text-grey-6 q-mt-lg"
        data-testid="empty-state"
      >
        No todos yet — add your first one with the + button.
      </div>

      <template v-else>
        <!-- Dragging back over the board means the pill is no longer headed for
             another list — drop the move popup. -->
        <div
          class="cs-board q-mt-md"
          :style="{ '--cs-cols': grid.columns }"
          data-testid="board"
          @dragover="closeMovePopup"
        >
          <div
            v-for="todo in pageTodos"
            :key="todo.id"
            class="cs-slot"
            :class="{ 'cs-slot--dragging': draggingId === todo.id }"
            draggable="true"
            :data-testid="`slot-${todo.id}`"
            @dragstart="onDragStart(todo.id, $event)"
            @dragover.prevent
            @drop.prevent="onDrop(todo.id)"
            @dragend="onDragEnd"
          >
            <TodoPill :todo="todo" @open="openTodo(todo.id)" />
          </div>
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
    </template>

    <AddTodoDialog v-model="addOpen" @create="onCreate" />
    <TodoDetailDialog
      v-if="openTodoItem"
      v-model="detailOpen"
      :todo="openTodoItem"
      @save="onSave"
      @add-update="onAddUpdate"
      @close-as-done="onCloseAsDone"
    />
    <ArchiveDrawer
      v-model="archiveOpen"
      :archived="store.archived"
      @delete="onDeleteArchived"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onBeforeUnmount } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useContextSwitchStore } from "@/apps/context-switch/stores/useContextSwitchStore";
import AddTodoDialog from "@/apps/context-switch/components/AddTodoDialog.vue";
import ArchiveDrawer from "@/apps/context-switch/components/ArchiveDrawer.vue";
import GridControl from "@/apps/context-switch/components/GridControl.vue";
import TodoDetailDialog from "@/apps/context-switch/components/TodoDetailDialog.vue";
import TodoPill from "@/apps/context-switch/components/TodoPill.vue";
import { DEFAULT_GRID, pageCount, pageSlice } from "@/apps/context-switch/grid";
import { moveId } from "@/apps/context-switch/reorder";
import type {
  Grid,
  ListSummary,
  NewTodo,
  TodoPatch,
} from "@/apps/context-switch/types";

const route = useRoute();
const router = useRouter();
const store = useContextSwitchStore();

const listId = computed(() => String(route.params.listId ?? ""));
const addOpen = ref(false);
const page = ref(1);
const draggingId = ref<string | null>(null);
const detailOpen = ref(false);
const openTodoId = ref<string | null>(null);
const archiveOpen = ref(false);
const movePopupOpen = ref(false);
let dwellTimer: number | null = null;

// Track the open todo by id, not by value, so an edit re-renders the dialog
// from the store's copy rather than a stale snapshot.
const openTodoItem = computed(
  () => store.activeTodos.find((t) => t.id === openTodoId.value) ?? null,
);

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

// The arrows walk the picker's own order, wrapping at both ends (Story 3.1).
// Nothing to walk with a single list, or before the sequence has loaded.
const listIndex = computed(() =>
  store.lists.findIndex((l) => l.id === listId.value),
);
const prevList = computed(() => neighbour(-1));
const nextList = computed(() => neighbour(1));

const moveTargets = computed(() =>
  store.lists.filter((l) => l.id !== listId.value),
);

function neighbour(step: number): ListSummary | null {
  const count = store.lists.length;
  const index = listIndex.value;
  if (count < 2 || index === -1) return null;
  return store.lists[(index + step + count) % count];
}

// A board reached by URL (deep link, refresh, or an arrow) never passes through
// the picker, so it fetches the sequence itself.
if (store.lists.length === 0) void store.fetchLists();

// Switching lists changes only the route param, which reuses this component —
// onMounted would not fire again, leaving the old list's pills on screen.
watch(
  listId,
  (id) => {
    page.value = 1;
    addOpen.value = false;
    detailOpen.value = false;
    openTodoId.value = null;
    archiveOpen.value = false;
    void store.fetchList(id);
  },
  { immediate: true },
);

function goBack(): void {
  void router.push("/context-switch");
}

function goToList(id: string): void {
  void router.push(`/context-switch/lists/${id}`);
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

function openTodo(id: string): void {
  openTodoId.value = id;
  detailOpen.value = true;
}

async function onSave(patch: TodoPatch): Promise<void> {
  if (openTodoId.value === null) return;
  try {
    await store.updateTodo(listId.value, openTodoId.value, patch);
  } catch {
    // Surfaced via store.error.
  }
}

async function onAddUpdate(text: string): Promise<void> {
  if (openTodoId.value === null) return;
  try {
    await store.addUpdate(listId.value, openTodoId.value, text);
  } catch {
    // Surfaced via store.error.
  }
}

async function onCloseAsDone(): Promise<void> {
  if (openTodoId.value === null) return;
  try {
    // Archiving drops the todo from activeTodos, so its pill leaves the board.
    await store.updateTodo(listId.value, openTodoId.value, {
      status: "archived",
    });
  } catch {
    // Surfaced via store.error.
  }
}

async function openArchive(): Promise<void> {
  archiveOpen.value = true;
  try {
    await store.fetchArchived(listId.value);
  } catch {
    // Surfaced via store.error.
  }
}

async function onDeleteArchived(todoId: string): Promise<void> {
  try {
    await store.deleteTodo(listId.value, todoId);
  } catch {
    // Surfaced via store.error.
  }
}

// Holding a dragged pill over the list name offers the other lists as drop
// targets (Story 3.2). The dwell keeps an ordinary reorder drag that merely
// passes over the header from opening the popup.
const MOVE_DWELL_MS = 600;

function onNameDragOver(): void {
  if (
    draggingId.value === null ||
    movePopupOpen.value ||
    dwellTimer !== null ||
    moveTargets.value.length === 0
  ) {
    return;
  }
  dwellTimer = window.setTimeout(() => {
    dwellTimer = null;
    movePopupOpen.value = true;
  }, MOVE_DWELL_MS);
}

function cancelDwell(): void {
  if (dwellTimer !== null) {
    clearTimeout(dwellTimer);
    dwellTimer = null;
  }
}

function closeMovePopup(): void {
  cancelDwell();
  movePopupOpen.value = false;
}

function onDragEnd(): void {
  draggingId.value = null;
  closeMovePopup();
}

async function onMoveDrop(targetListId: string): Promise<void> {
  const moved = draggingId.value;
  onDragEnd();
  if (moved === null) return;

  try {
    await store.moveTodo(listId.value, moved, targetListId);
  } catch {
    // Surfaced via store.error; the pill stays on the board.
  }
}

onBeforeUnmount(cancelDwell);

function onDragStart(id: string, event: DragEvent): void {
  draggingId.value = id;
  // Firefox only starts a drag once some data is set.
  event.dataTransfer?.setData("text/plain", id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

async function onDrop(targetId: string): Promise<void> {
  const moved = draggingId.value;
  draggingId.value = null;
  if (moved === null) return;

  // Reorder over the whole active sequence, not just the visible page, so the
  // result stays coherent across pages (AC 4).
  const ids = store.activeTodos.map((t) => t.id);
  const next = moveId(ids, moved, targetId);
  if (next === ids) return;

  try {
    await store.reorderTodos(listId.value, next);
  } catch {
    // Optimistic order already rolled back; surfaced via store.error.
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

.cs-slot
  cursor: grab

.cs-slot--dragging
  opacity: 0.45

.cs-list-nav
  position: relative

.cs-list-name
  padding: 0 8px
  border-radius: 8px
  border: 2px dashed transparent

.cs-list-name--armed
  border-color: var(--q-primary)

.cs-move-popup
  position: absolute
  top: 100%
  left: 50%
  transform: translateX(-50%)
  z-index: 10
  min-width: 200px
  max-height: 260px
  overflow-y: auto
  padding: 8px 0
  border-radius: 8px
  background: white
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.24)

.cs-move-target
  padding: 8px 16px
  cursor: pointer
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

  &:hover
    background: rgba(0, 0, 0, 0.06)
</style>
