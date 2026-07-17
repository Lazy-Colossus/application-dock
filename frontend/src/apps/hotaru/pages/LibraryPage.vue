<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <FireflyLayer />
    <!-- Level 1: sections (each textbook source + Custom words) + actions menu -->
    <div class="library-sections row items-center no-wrap q-mb-sm">
      <div class="library-tabs row items-center q-gutter-xs">
        <button
          v-for="s in sections"
          :key="s.key"
          class="library-tab"
          :class="{ 'library-tab--active': s.key === section }"
          :data-testid="`section-${s.key}`"
          @click="selectSection(s.key)"
        >
          {{ s.label }}
        </button>
      </div>
      <LibraryActionsMenu
        :select-mode="selectMode"
        :count="selectedIds.size"
        :editable="editable"
        :in-topic="section === TOPICS"
        @select="startSelect"
        @add-topic="bulkTopicOpen = true"
        @remove-topic="onBulkRemoveTopic"
        @change-lesson="onBulkChangeLesson"
        @delete="onBulkDelete"
        @cancel="exitSelect"
      />
    </div>

    <!-- Level 2: subsections (lessons, or Shared/Private) -->
    <div class="library-tabs row items-center q-gutter-xs q-mb-md">
      <button
        v-for="sub in subsections"
        :key="sub.key"
        class="library-tab library-tab--sub"
        :class="{ 'library-tab--active': sub.key === subsection }"
        :data-testid="`sub-${sub.key}`"
        @click="subsection = sub.key"
      >
        {{ sub.label }}
      </button>
    </div>

    <!-- Transient result of the last bulk action. -->
    <div
      v-if="bulkResult"
      class="library-bulk-result q-mb-sm"
      data-testid="bulk-result"
    >
      {{ bulkResult }}
    </div>

    <div
      v-if="store.loading"
      class="library-state"
      data-testid="library-loading"
    >
      Loading…
    </div>
    <div
      v-else-if="store.error"
      class="library-state"
      data-testid="library-error"
    >
      {{ store.error }}
    </div>
    <div
      v-else-if="section === TOPICS && store.topics.length === 0"
      class="library-state"
      data-testid="library-empty"
    >
      No topics yet — add words to a topic from any row.
    </div>
    <div
      v-else-if="visibleWords.length === 0"
      class="library-state"
      data-testid="library-empty"
    >
      No words here yet.
    </div>
    <div
      v-else
      class="library-list hotaru-panel column"
      data-testid="library-list"
    >
      <template v-for="word in visibleWords" :key="word.id">
        <WordRow
          :word="word"
          :editable="editable"
          :tier="store.familiarityTier(word.id)"
          :selectable="selectMode"
          :selected="selectedIds.has(word.id)"
          :expanded="expandedId === word.id"
          :has-note="notesStore.hasNote(word.id)"
          @edit="onEdit"
          @delete="onDelete"
          @topics="onManageTopics"
          @notes="onManageNotes"
          @toggle-select="onToggleSelect"
          @toggle-expand="onToggleExpand"
        />
        <WordRowDetails
          v-if="expandedId === word.id && !selectMode"
          :word="word"
          :topics="store.topics"
          :notes="notesStore.notesFor(word.id)"
          :users="userStore.users"
          :active-user="userStore.activeUserId ?? undefined"
          @manage-topics="onManageTopics"
          @manage-notes="onManageNotes"
        />
      </template>
    </div>

    <q-btn
      v-if="!selectMode"
      class="library-add"
      round
      unelevated
      icon="add"
      aria-label="Add word"
      data-testid="add-word-fab"
      @click="onAdd"
    />

    <BulkTopicDialog
      v-model="bulkTopicOpen"
      :topics="store.topics"
      :count="selectedIds.size"
      @pick="onBulkPickTopic"
      @create="onBulkCreateTopic"
    />

    <WordTopicsDialog
      v-if="topicsWord"
      v-model="topicsDialogOpen"
      :word="topicsWord"
      :topics="store.topics"
      @assign="onAssign"
      @unassign="onUnassign"
      @create="onCreateTopic"
    />

    <WordNotesDialog
      v-if="notesWord"
      v-model="notesDialogOpen"
      :word="notesWord"
      :notes="notesStore.notesFor(notesWord.id)"
      :users="userStore.users"
      :active-user="userStore.activeUserId ?? undefined"
      @add="onAddNote"
      @flip="onFlipNote"
      @edit="onEditNote"
      @delete="onDeleteNote"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import FireflyLayer from "@/apps/hotaru/components/FireflyLayer.vue";
import WordRow from "@/apps/hotaru/components/WordRow.vue";
import WordRowDetails from "@/apps/hotaru/components/WordRowDetails.vue";
import WordTopicsDialog from "@/apps/hotaru/components/WordTopicsDialog.vue";
import WordNotesDialog from "@/apps/hotaru/components/WordNotesDialog.vue";
import LibraryActionsMenu from "@/apps/hotaru/components/LibraryActionsMenu.vue";
import BulkTopicDialog from "@/apps/hotaru/components/BulkTopicDialog.vue";
import { useHotaruLibraryStore } from "@/apps/hotaru/stores/useHotaruLibraryStore";
import { useHotaruNotesStore } from "@/apps/hotaru/stores/useHotaruNotesStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import type { Visibility, Word } from "@/apps/hotaru/types";
import "./../css/hotaru.sass";

const store = useHotaruLibraryStore();
const notesStore = useHotaruNotesStore();
const userStore = useHotaruUserStore();
const router = useRouter();

// The last-viewed selection lives in the store so it survives navigating to the
// Add-word page and back.
const { activeSection, activeSubsection } = storeToRefs(store);

const CUSTOM = "__custom__";
const TOPICS = "__topics__";

function prettifySource(source: string): string {
  return source
    .split("_")
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1))
    .join(" ");
}

const userIds = computed(() => userStore.users.map((u) => u.id));

interface Tab {
  key: string;
  label: string;
}

const sections = computed<Tab[]>(() => {
  const textbook = store
    .textbookSources(userIds.value)
    .map((s) => ({ key: s, label: prettifySource(s) }));
  return [
    ...textbook,
    { key: CUSTOM, label: "Custom words" },
    { key: TOPICS, label: "Topics" },
  ];
});

const section = ref<string>(CUSTOM);
const subsection = ref<string>("shared");

const subsections = computed<Tab[]>(() => {
  if (section.value === CUSTOM) {
    return [
      { key: "all", label: "All" },
      { key: "shared", label: "Shared" },
      { key: "private", label: "Private" },
    ];
  }
  if (section.value === TOPICS) {
    return store.topics.map((t) => ({ key: t.id, label: t.name }));
  }
  return store
    .lessonsForSource(section.value)
    .map((l) => ({ key: l, label: l }));
});

const visibleWords = computed(() => {
  if (section.value === CUSTOM) {
    // "All" (the default) shows every custom word; Shared/Private filter it.
    if (subsection.value === "all") return store.allCustomWords(userIds.value);
    return store.customWords(userIds.value, subsection.value as Visibility);
  }
  if (section.value === TOPICS) {
    return store.wordsForTopic(subsection.value);
  }
  return store.wordsBySourceLesson(section.value, subsection.value);
});

// Only user-added Custom words are editable — textbook words are read-only seed.
const editable = computed(() => section.value === CUSTOM);

function subsectionKeys(key: string): string[] {
  if (key === CUSTOM) return ["all", "shared", "private"];
  if (key === TOPICS) return store.topics.map((t) => t.id);
  return store.lessonsForSource(key);
}

function selectSection(key: string): void {
  section.value = key;
  subsection.value = subsectionKeys(key)[0] ?? "shared";
}

// Fall back to a valid selection if the remembered one no longer exists (e.g.
// data changed since it was stored).
function ensureValidSelection(): void {
  const keys = sections.value.map((s) => s.key);
  if (!keys.includes(section.value)) {
    const firstTextbook = sections.value.find(
      (s) => s.key !== CUSTOM && s.key !== TOPICS,
    );
    selectSection(firstTextbook ? firstTextbook.key : CUSTOM);
    return;
  }
  const subKeys = subsections.value.map((s) => s.key);
  if (!subKeys.includes(subsection.value)) {
    subsection.value = subKeys[0] ?? "shared";
  }
}

// Persist every selection change so we can restore it after navigating away.
// Changing the view also drops any bulk selection (keeps eligibility simple).
watch([section, subsection], ([s, sub]) => {
  activeSection.value = s;
  activeSubsection.value = sub;
  selectedIds.value = new Set();
  expandedId.value = null; // collapse any open row when the view changes
});

onMounted(async () => {
  if (userStore.users.length === 0) await userStore.loadUsers();
  if (userStore.activeUserId === null) {
    void router.replace("/hotaru/identity");
    return;
  }
  await Promise.all([
    store.loadWords(userStore.activeUserId),
    store.loadTopics(),
    store.loadFamiliarity(userStore.activeUserId),
    notesStore.loadPresence(userStore.activeUserId),
  ]);
  if (activeSection.value !== null) {
    // Returning to the library — restore where the user was.
    section.value = activeSection.value;
    subsection.value = activeSubsection.value ?? "shared";
    ensureValidSelection();
  } else {
    // First visit — default to the first textbook section.
    const firstTextbook = sections.value.find(
      (s) => s.key !== CUSTOM && s.key !== TOPICS,
    );
    selectSection(firstTextbook ? firstTextbook.key : CUSTOM);
  }
});

function onAdd(): void {
  void router.push("/hotaru/add-word");
}

function onEdit(word: Word): void {
  void router.push(`/hotaru/words/${word.id}/edit`);
}

async function onDelete(word: Word): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null) return;
  if (!window.confirm(`Delete "${word.meaning}"? This can't be undone.`))
    return;
  await store.deleteWord(word.id, user);
}

// --- Bulk actions (Story 1.9) -----------------------------------------------

const selectMode = ref(false);
const selectedIds = ref<Set<string>>(new Set());
const bulkResult = ref<string | null>(null);
const bulkTopicOpen = ref(false);

function startSelect(): void {
  selectMode.value = true;
  selectedIds.value = new Set();
  bulkResult.value = null;
  expandedId.value = null; // no inline panel left open under the select UI
}

function onToggleSelect(word: Word): void {
  const next = new Set(selectedIds.value);
  if (next.has(word.id)) next.delete(word.id);
  else next.add(word.id);
  selectedIds.value = next;
}

function exitSelect(): void {
  selectMode.value = false;
  selectedIds.value = new Set();
}

function summarize(verb: string, ok: number, failed: number): void {
  bulkResult.value =
    failed > 0 ? `${verb} ${ok} · skipped ${failed}` : `${verb} ${ok}`;
}

async function onBulkDelete(): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null) return;
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  if (!window.confirm(`Delete ${ids.length} word(s)? This can't be undone.`))
    return;
  summarize("Deleted", ...resultTuple(await store.bulkDelete(ids, user)));
  exitSelect();
}

async function onBulkChangeLesson(): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null) return;
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  const lesson = window.prompt("Lesson code (e.g. L5):");
  if (lesson === null) return; // cancelled
  summarize(
    "Updated",
    ...resultTuple(await store.bulkChangeLesson(lesson.trim(), ids, user)),
  );
  exitSelect();
}

async function onBulkPickTopic(topicId: string): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null) return;
  const ids = [...selectedIds.value];
  bulkTopicOpen.value = false;
  if (ids.length === 0) return;
  summarize(
    "Added",
    ...resultTuple(await store.bulkAssignTopic(topicId, ids, user)),
  );
  exitSelect();
}

async function onBulkCreateTopic(name: string): Promise<void> {
  const created = await store.createTopic(name);
  if (created) await onBulkPickTopic(created.id);
}

async function onBulkRemoveTopic(): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null) return;
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;
  // In the Topics view the current subsection IS the topic id.
  summarize(
    "Removed",
    ...resultTuple(await store.bulkUnassignTopic(subsection.value, ids, user)),
  );
  exitSelect();
}

function resultTuple(r: { ok: number; failed: number }): [number, number] {
  return [r.ok, r.failed];
}

// --- Topic assignment dialog ------------------------------------------------

const topicsWord = ref<Word | null>(null);
const topicsDialogOpen = ref(false);

function onManageTopics(word: Word): void {
  topicsWord.value = word;
  topicsDialogOpen.value = true;
}

// --- Notes dialog (Story 3.1) -----------------------------------------------

const notesWord = ref<Word | null>(null);
const notesDialogOpen = ref(false);

function onManageNotes(word: Word): void {
  const user = userStore.activeUserId;
  if (user === null) return;
  notesWord.value = word;
  notesDialogOpen.value = true;
  void notesStore.loadNotes(word.id, user);
}

async function onAddNote(text: string, visibility: Visibility): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null || notesWord.value === null) return;
  await notesStore.addNote(notesWord.value.id, { text, visibility }, user);
}

async function onFlipNote(
  noteId: string,
  visibility: Visibility,
): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null || notesWord.value === null) return;
  await notesStore.setVisibility(notesWord.value.id, noteId, visibility, user);
}

async function onEditNote(noteId: string, text: string): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null || notesWord.value === null) return;
  await notesStore.editNote(notesWord.value.id, noteId, text, user);
}

async function onDeleteNote(noteId: string): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null || notesWord.value === null) return;
  await notesStore.deleteNote(notesWord.value.id, noteId, user);
}

async function onAssign(topicId: string, wordId: string): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null) return;
  await store.assignWord(topicId, wordId, user);
}

async function onUnassign(topicId: string, wordId: string): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null) return;
  await store.unassignWord(topicId, wordId, user);
}

// Create a topic, then immediately add the current word to it.
async function onCreateTopic(name: string): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null || topicsWord.value === null) return;
  const created = await store.createTopic(name);
  if (created) await store.assignWord(created.id, topicsWord.value.id, user);
}

// --- Inline expandable row (Story 3.5) --------------------------------------
// Single-open: expanding one row collapses the others. On expand, lazy-load the
// word's notes so the panel can show them (topics are already loaded).
const expandedId = ref<string | null>(null);

// A user switch re-scopes everything (NFR-2, the hard rule): collapse any open
// row so a cached private note can't render to the new user, and reload the
// list/familiarity for the new user. Notes reload on the next expand.
watch(
  () => userStore.activeUserId,
  (u) => {
    if (u === null) return;
    expandedId.value = null;
    void store.loadWords(u);
    void store.loadFamiliarity(u);
    void notesStore.loadPresence(u);
  },
);

function onToggleExpand(word: Word): void {
  if (expandedId.value === word.id) {
    expandedId.value = null;
    return;
  }
  expandedId.value = word.id;
  const user = userStore.activeUserId;
  if (user !== null) void notesStore.loadNotes(word.id, user);
}

// The inline panel is a read view — its ＋Topic / ＋Note buttons open the
// existing dialogs (onManageTopics / onManageNotes) for all editing. The
// dialogs mutate the stores, so the panel reflects the change reactively.
</script>

<style scoped lang="sass">
// Section row: the scrollable tabs take the space, the ⋮ actions menu pins right.
.library-sections
  gap: 8px

// Only the section-row tabs grow to fill the row width. (Scoping `flex: 1` to
// this row matters: the level-2 subsection tabs are a direct child of the
// column page, where `flex: 1` would stretch them vertically — the gap bug.)
.library-sections .library-tabs
  flex: 1
  min-width: 0

.library-tabs
  overflow-x: auto

.library-tab
  border: 1px solid rgba(155, 107, 255, 0.30)
  background: rgba(155, 107, 255, 0.12)
  color: var(--hotaru-cream-soft)
  border-radius: 9999px
  padding: 4px 12px
  font-size: 13px
  cursor: pointer

// Level-2 subsections are smaller and read violet when active — a calm step
// down from the primary-cyan level-1 sections (tertiary accent = subordinate).
.library-tab--sub
  font-size: 12px
  padding: 3px 10px

.library-tab--active
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)
  border-color: var(--hotaru-bamboo)
  box-shadow: 0 0 14px rgba(56, 240, 230, 0.35)

.library-tab--sub.library-tab--active
  background: var(--hotaru-fam-2)
  color: #140a2e
  border-color: var(--hotaru-fam-2)
  box-shadow: 0 0 14px rgba(155, 107, 255, 0.45)

.library-list
  padding: 2px 14px

// Rows already divide with a hairline; drop the last one inside the panel.
.library-list :deep(.word-row:last-child)
  border-bottom: none

.library-bulk-result
  font-size: 13px
  color: var(--hotaru-bamboo)

.library-state
  color: var(--hotaru-cream-soft)
  text-align: center
  padding: 32px 0

.library-add
  position: fixed
  right: 20px
  bottom: 20px
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)
  box-shadow: 0 8px 22px rgba(16, 168, 159, 0.45), 0 0 20px rgba(56, 240, 230, 0.30)
</style>
