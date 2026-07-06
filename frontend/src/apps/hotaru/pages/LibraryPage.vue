<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <div class="library-tabs row items-center q-gutter-xs q-mb-md">
      <button
        v-for="lesson in store.lessons"
        :key="lesson"
        class="library-tab"
        :class="{ 'library-tab--active': lesson === selected }"
        :data-testid="`lesson-${lesson}`"
        @click="selected = lesson"
      >
        {{ lesson }}
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
      <WordRow v-for="word in visibleWords" :key="word.id" :word="word" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import WordRow from "@/apps/hotaru/components/WordRow.vue";
import { useHotaruLibraryStore } from "@/apps/hotaru/stores/useHotaruLibraryStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import "./../css/hotaru.sass";

const store = useHotaruLibraryStore();
const userStore = useHotaruUserStore();

const selected = ref<string | null>(null);

const visibleWords = computed(() =>
  selected.value ? store.wordsByLesson(selected.value) : [],
);

// Default the selected lesson to the first available once words load.
watch(
  () => store.lessons,
  (lessons) => {
    if (selected.value === null && lessons.length > 0) {
      selected.value = lessons[0];
    }
  },
  { immediate: true },
);

onMounted(() => {
  void store.loadWords(userStore.activeUserId);
});
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

.library-tab--active
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)
  border-color: var(--hotaru-bamboo)

.library-state
  color: var(--hotaru-cream-soft)
  text-align: center
  padding: 32px 0
</style>
