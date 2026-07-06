<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <!-- Level 1: sections (each textbook source + Custom words) -->
    <div class="library-tabs row items-center q-gutter-xs q-mb-sm">
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
      v-else-if="visibleWords.length === 0"
      class="library-state"
      data-testid="library-empty"
    >
      No words here yet.
    </div>
    <div v-else class="library-list column" data-testid="library-list">
      <WordRow
        v-for="word in visibleWords"
        :key="word.id"
        :word="word"
        :editable="editable"
        @edit="onEdit"
        @delete="onDelete"
      />
    </div>

    <q-btn
      class="library-add"
      round
      unelevated
      icon="add"
      aria-label="Add word"
      data-testid="add-word-fab"
      @click="onAdd"
    />
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useRouter } from "vue-router";
import WordRow from "@/apps/hotaru/components/WordRow.vue";
import { useHotaruLibraryStore } from "@/apps/hotaru/stores/useHotaruLibraryStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import type { Visibility, Word } from "@/apps/hotaru/types";
import "./../css/hotaru.sass";

const store = useHotaruLibraryStore();
const userStore = useHotaruUserStore();
const router = useRouter();

const CUSTOM = "__custom__";

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
  return [...textbook, { key: CUSTOM, label: "Custom words" }];
});

const section = ref<string>(CUSTOM);
const subsection = ref<string>("shared");

const subsections = computed<Tab[]>(() => {
  if (section.value === CUSTOM) {
    return [
      { key: "shared", label: "Shared" },
      { key: "private", label: "Private" },
    ];
  }
  return store
    .lessonsForSource(section.value)
    .map((l) => ({ key: l, label: l }));
});

const visibleWords = computed(() => {
  if (section.value === CUSTOM) {
    return store.customWords(userIds.value, subsection.value as Visibility);
  }
  return store.wordsBySourceLesson(section.value, subsection.value);
});

// Only user-added Custom words are editable — textbook words are read-only seed.
const editable = computed(() => section.value === CUSTOM);

function selectSection(key: string): void {
  section.value = key;
  const subs = key === CUSTOM ? ["shared"] : store.lessonsForSource(key);
  subsection.value = subs[0] ?? "shared";
}

onMounted(async () => {
  if (userStore.users.length === 0) await userStore.loadUsers();
  if (userStore.activeUserId === null) {
    void router.replace("/hotaru/identity");
    return;
  }
  await store.loadWords(userStore.activeUserId);
  const firstTextbook = sections.value.find((s) => s.key !== CUSTOM);
  if (firstTextbook) selectSection(firstTextbook.key);
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
</script>

<style scoped lang="sass">
.library-tabs
  overflow-x: auto

.library-tab
  border: 1px solid rgba(140, 175, 93, 0.34)
  background: rgba(140, 175, 93, 0.12)
  color: var(--hotaru-cream-soft)
  border-radius: 9999px
  padding: 4px 12px
  font-size: 13px
  cursor: pointer

.library-tab--sub
  font-size: 12px
  padding: 3px 10px

.library-tab--active
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)
  border-color: var(--hotaru-bamboo)

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
</style>
