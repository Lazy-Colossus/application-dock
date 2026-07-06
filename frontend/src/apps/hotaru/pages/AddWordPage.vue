<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <div class="addword-title q-mb-md">
      {{ isEdit ? "Edit word" : "Add a word" }}
    </div>

    <form class="column q-gutter-sm" @submit.prevent="onSubmit">
      <label class="addword-field">
        <span class="addword-label">Katakana/Hiragana *</span>
        <input
          v-model="reading"
          class="addword-input"
          data-testid="field-reading"
        />
      </label>
      <label class="addword-field">
        <span class="addword-label">Meaning *</span>
        <input
          v-model="meaning"
          class="addword-input"
          data-testid="field-meaning"
        />
      </label>
      <label class="addword-field">
        <span class="addword-label">Kanji</span>
        <input
          v-model="kanji"
          class="addword-input"
          data-testid="field-kanji"
        />
      </label>
      <label class="addword-field">
        <span class="addword-label">Romaji</span>
        <input
          v-model="romaji"
          class="addword-input"
          data-testid="field-romaji"
        />
      </label>
      <label class="addword-field">
        <span class="addword-label">Part of speech</span>
        <input v-model="pos" class="addword-input" data-testid="field-pos" />
      </label>

      <div class="row items-center q-gutter-sm q-mt-xs">
        <span class="addword-label">Visibility</span>
        <button
          type="button"
          class="addword-vis addword-vis--shared"
          :class="{ 'addword-vis--shared-on': visibility === 'shared' }"
          data-testid="vis-shared"
          @click="visibility = 'shared'"
        >
          <q-icon name="group" size="18px" />
          <span>Shared</span>
        </button>
        <button
          type="button"
          class="addword-vis addword-vis--private"
          :class="{ 'addword-vis--private-on': visibility === 'private' }"
          data-testid="vis-private"
          @click="visibility = 'private'"
        >
          <q-icon name="lock" size="18px" />
          <span>Private</span>
        </button>
      </div>

      <div class="addword-lesson-box q-mt-sm">
        <label class="addword-lesson-head row items-center">
          <input
            v-model="addToLesson"
            type="checkbox"
            class="addword-lesson-check"
            data-testid="add-to-lesson"
          />
          <span class="addword-lesson-label">Add to a lesson</span>
        </label>

        <div v-if="addToLesson" class="column q-gutter-sm q-mt-sm">
          <label class="addword-field">
            <span class="addword-label">Source</span>
            <select
              v-model="source"
              class="addword-input"
              :disabled="isEdit"
              data-testid="field-source"
            >
              <option v-for="s in sourceOptions" :key="s" :value="s">
                {{ s }}
              </option>
            </select>
          </label>
          <label class="addword-field">
            <span class="addword-label">Lesson</span>
            <select
              v-model="lesson"
              class="addword-input"
              data-testid="field-lesson"
            >
              <option v-for="l in lessonOptions" :key="l" :value="l">
                {{ l }}
              </option>
            </select>
          </label>
        </div>
      </div>

      <div v-if="store.error" class="addword-error" data-testid="addword-error">
        {{ store.error }}
      </div>

      <q-btn
        type="submit"
        class="addword-submit q-mt-sm"
        :label="isEdit ? 'Save changes' : 'Add word'"
        unelevated
        no-caps
        :disable="store.loading || !reading.trim() || !meaning.trim()"
        data-testid="submit-btn"
      />
    </form>
  </q-page>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { useRoute, useRouter, onBeforeRouteLeave } from "vue-router";
import { useHotaruLibraryStore } from "@/apps/hotaru/stores/useHotaruLibraryStore";
import { useHotaruUserStore } from "@/apps/hotaru/stores/useHotaruUserStore";
import type { Visibility } from "@/apps/hotaru/types";
import "./../css/hotaru.sass";

const store = useHotaruLibraryStore();
const userStore = useHotaruUserStore();
const router = useRouter();
const route = useRoute();

const wordId = computed(() =>
  typeof route.params.id === "string" ? route.params.id : null,
);
const isEdit = computed(() => wordId.value !== null);

const reading = ref("");
const meaning = ref("");
const kanji = ref("");
const romaji = ref("");
const pos = ref("");
const visibility = ref<Visibility>("shared");
const addToLesson = ref(false);
const source = ref("");
const lesson = ref("");
const submitted = ref(false);

// Snapshot of the form at load; unsaved-changes prompt compares against it so a
// prefilled edit form isn't treated as dirty until the user actually changes it.
const baseline = ref("");
function snapshot(): string {
  return JSON.stringify([
    reading.value.trim(),
    meaning.value.trim(),
    kanji.value.trim(),
    romaji.value.trim(),
    pos.value.trim(),
    visibility.value,
    addToLesson.value,
    source.value,
    lesson.value,
  ]);
}

const userIds = computed(() => userStore.users.map((u) => u.id));
// In edit mode the word's own source may be a user id (a Custom word); include it
// so the locked select can display it even though it isn't a textbook source.
const sourceOptions = computed(() => {
  const opts = store.textbookSources(userIds.value);
  if (source.value && !opts.includes(source.value))
    return [source.value, ...opts];
  return opts;
});
const lessonOptions = computed(() =>
  source.value ? store.lessonsForSource(source.value) : [],
);

// Any change from the loaded baseline is unsaved work.
const dirty = computed(() => snapshot() !== baseline.value);

watch(sourceOptions, (opts) => {
  if (!source.value && opts.length > 0) source.value = opts[0];
});
watch([lessonOptions, source], () => {
  if (isEdit.value) return; // don't clobber the prefilled lesson on edit
  const opts = lessonOptions.value;
  if (opts.length > 0 && !opts.includes(lesson.value)) lesson.value = opts[0];
});

function prefill(): void {
  const word = wordId.value ? store.wordById(wordId.value) : undefined;
  if (!word) {
    // Word not found (bad id or not loaded) — nothing to edit.
    void router.replace("/hotaru/library");
    return;
  }
  reading.value = word.reading;
  meaning.value = word.meaning;
  kanji.value = word.kanji ?? "";
  romaji.value = word.romaji;
  pos.value = word.pos;
  visibility.value = word.visibility;
  source.value = word.source;
  lesson.value = word.lesson;
  addToLesson.value = word.lesson !== "";
  baseline.value = snapshot();
}

onMounted(async () => {
  if (userStore.users.length === 0) await userStore.loadUsers();
  if (userStore.activeUserId === null) {
    void router.replace("/hotaru/identity");
    return;
  }
  if (store.words.length === 0) await store.loadWords(userStore.activeUserId);
  if (isEdit.value) prefill();
  else baseline.value = snapshot();
});

// Warn before leaving with unsaved input (not after a successful save).
onBeforeRouteLeave(() => {
  if (submitted.value || !dirty.value) return true;
  return window.confirm(
    "You have unsaved changes. Leave without saving this word?",
  );
});

async function onSubmit(): Promise<void> {
  const user = userStore.activeUserId;
  if (user === null) {
    void router.replace("/hotaru/identity");
    return;
  }

  let ok = false;
  if (isEdit.value && wordId.value) {
    // source is server-preserved on update, so it is not sent.
    ok = !!(await store.updateWord(
      wordId.value,
      {
        reading: reading.value,
        meaning: meaning.value,
        kanji: kanji.value || null,
        romaji: romaji.value,
        pos: pos.value,
        visibility: visibility.value,
        lesson: addToLesson.value ? lesson.value : "",
      },
      user,
    ));
  } else {
    ok = !!(await store.createWord(
      {
        reading: reading.value,
        meaning: meaning.value,
        kanji: kanji.value || null,
        romaji: romaji.value,
        pos: pos.value,
        visibility: visibility.value,
        ...(addToLesson.value
          ? { source: source.value, lesson: lesson.value }
          : {}),
      },
      user,
    ));
  }

  if (ok) {
    submitted.value = true;
    void router.push("/hotaru/library");
  }
}
</script>

<style scoped lang="sass">
.addword-title
  font-size: 22px
  font-weight: 600
  color: var(--hotaru-cream)

.addword-field
  display: flex
  flex-direction: column
  gap: 4px

.addword-label
  font-size: 13px
  color: var(--hotaru-cream-soft)

.addword-input
  background: rgba(246, 239, 218, 0.06)
  border: 1px solid rgba(140, 175, 93, 0.34)
  border-radius: 10px
  padding: 10px
  color: var(--hotaru-cream)
  font-size: 15px

// Visibility buttons — icon + label, each with its own accent colour.
.addword-vis
  display: inline-flex
  align-items: center
  gap: 6px
  border-radius: 9999px
  padding: 6px 14px
  cursor: pointer
  font-size: 14px
  background: transparent

.addword-vis--shared
  border: 1px solid rgba(140, 175, 93, 0.45)
  color: var(--hotaru-bamboo-bright)

.addword-vis--shared-on
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)
  border-color: var(--hotaru-bamboo)

.addword-vis--private
  border: 1px solid rgba(224, 178, 122, 0.5)
  color: var(--hotaru-amber-private, #e0b27a)

.addword-vis--private-on
  background: var(--hotaru-amber-private, #e0b27a)
  color: #22260f
  border-color: var(--hotaru-amber-private, #e0b27a)

// "Add to a lesson" — a modest bordered block.
.addword-lesson-box
  border: 1px solid rgba(140, 175, 93, 0.28)
  border-radius: 10px
  padding: 10px

.addword-lesson-head
  gap: 8px
  cursor: pointer

.addword-lesson-check
  width: 16px
  height: 16px

.addword-lesson-label
  font-size: 14px
  color: var(--hotaru-cream)

.addword-error
  color: var(--hotaru-fam-1)
  font-size: 13px

.addword-submit
  height: 52px
  border-radius: 12px
  background: var(--hotaru-bamboo)
  color: var(--hotaru-bamboo-on)
</style>
