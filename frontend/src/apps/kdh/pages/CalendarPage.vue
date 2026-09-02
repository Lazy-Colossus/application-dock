<template>
  <q-page class="kdh-calendar column no-wrap q-pa-md">
    <!-- Header only. The month lands in Epic 3. -->
    <div class="row items-center no-wrap q-gutter-sm q-mb-md">
      <q-btn
        flat
        dense
        round
        icon="arrow_back"
        aria-label="Back to calendars"
        data-testid="back-btn"
        @click="goToList"
      />
      <div class="col text-h6 ellipsis" data-testid="calendar-name">
        {{ store.currentCalendar?.name ?? "" }}
      </div>

      <!-- Admin actions are a header menu, and are absent — not disabled — for
           guests (EXPERIENCE.md, Component Patterns). -->
      <q-btn
        v-if="isAdmin && store.currentCalendar"
        flat
        dense
        round
        icon="more_vert"
        aria-label="Calendar actions"
        data-testid="admin-menu-btn"
        @click="menuOpen = true"
      />
    </div>

    <div
      v-if="store.error && !notFound"
      class="text-negative q-mb-md"
      data-testid="error"
    >
      {{ store.error }}
    </div>

    <div
      v-if="copyNotice"
      class="text-grey-6 q-mb-md"
      data-testid="copy-notice"
    >
      {{ copyNotice }}
    </div>

    <div v-if="notFound" class="text-grey-6" data-testid="not-found">
      That calendar no longer exists.
      <a href="#" data-testid="not-found-back" @click.prevent="goToList">
        Back to your calendars
      </a>
    </div>

    <!-- Guarded as a group: a guest must not merely be unable to open these,
         their markup must not exist in the page at all (FR-3). -->
    <template v-if="isAdmin">
      <q-dialog v-model="menuOpen">
        <q-card class="kdh-menu-card">
          <q-list>
            <q-item
              v-ripple
              clickable
              data-testid="rename-action"
              @click="openRename"
            >
              <q-item-section>Rename</q-item-section>
            </q-item>
            <q-item
              v-ripple
              clickable
              data-testid="share-action"
              @click="copyLink"
            >
              <q-item-section>Copy link</q-item-section>
            </q-item>
            <q-item
              v-ripple
              clickable
              data-testid="delete-action"
              @click="openDelete"
            >
              <q-item-section class="text-negative">Delete</q-item-section>
            </q-item>
          </q-list>
        </q-card>
      </q-dialog>

      <q-dialog v-model="renaming">
        <q-card class="kdh-dialog-card q-pa-md">
          <div class="text-h6 q-mb-md">Rename calendar</div>
          <q-input
            v-model="draftName"
            dense
            outlined
            autofocus
            label="Name"
            data-testid="rename-input"
          />
          <div class="row justify-end q-gutter-sm q-mt-md">
            <q-btn flat no-caps label="Cancel" @click="renaming = false" />
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="Save"
              :disable="!canRename"
              data-testid="rename-save"
              @click="submitRename"
            />
          </div>
        </q-card>
      </q-dialog>

      <q-dialog v-model="deleting">
        <q-card class="kdh-dialog-card q-pa-md">
          <div class="text-h6 q-mb-sm">Delete this calendar?</div>
          <!-- Names the calendar and says what else goes: there is no undo, and a
               mis-tap on a phone must not quietly destroy a campaign's history. -->
          <div class="q-mb-md" data-testid="delete-warning">
            <b>{{ store.currentCalendar?.name }}</b> and everyone's availability
            on it will be deleted. This cannot be undone.
          </div>
          <div class="row justify-end q-gutter-sm">
            <q-btn flat no-caps label="Keep it" @click="deleting = false" />
            <q-btn
              unelevated
              no-caps
              color="negative"
              label="Delete"
              data-testid="delete-confirm"
              @click="submitDelete"
            />
          </div>
        </q-card>
      </q-dialog>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useKdhStore } from "@/apps/kdh/stores/useKdhStore";

const store = useKdhStore();
const route = useRoute();
const router = useRouter();

const calendarId = computed(() => String(route.params.calendarId));
const isAdmin = computed(() => store.me?.is_admin === true);
const notFound = computed(
  () =>
    !store.loading && store.currentCalendar === null && store.error !== null,
);

const menuOpen = ref(false);
const renaming = ref(false);
const deleting = ref(false);
const draftName = ref("");
// Copy feedback is its own channel: it is not an error, and it must not clobber
// a real one sitting in the store.
const copyNotice = ref<string | null>(null);

const canRename = computed(() => draftName.value.trim() !== "");

function goToList(): void {
  void router.push("/kdh");
}

function openRename(): void {
  draftName.value = store.currentCalendar?.name ?? "";
  menuOpen.value = false;
  renaming.value = true;
}

function openDelete(): void {
  menuOpen.value = false;
  deleting.value = true;
}

async function submitRename(): Promise<void> {
  try {
    await store.renameCalendar(calendarId.value, draftName.value.trim());
    renaming.value = false;
  } catch {
    // The store surfaced the message; keep the dialog so the input survives.
  }
}

async function submitDelete(): Promise<void> {
  try {
    await store.deleteCalendar(calendarId.value);
    deleting.value = false;
    goToList();
  } catch {
    deleting.value = false;
  }
}

async function copyLink(): Promise<void> {
  // An absolute URL: a bare path is useless pasted into a group chat.
  const url = `${window.location.origin}${route.path}`;
  menuOpen.value = false;
  try {
    // `navigator.clipboard` is undefined on plain HTTP over a LAN — it needs a
    // secure context — so show the link to copy by hand rather than failing.
    await navigator.clipboard.writeText(url);
    copyNotice.value = "Link copied.";
  } catch {
    copyNotice.value = url;
  }
}

onMounted(async () => {
  await Promise.all([store.fetchMe(), store.fetchCalendar(calendarId.value)]);
});
</script>

<style scoped>
.kdh-dialog-card {
  min-width: 320px;
}
.kdh-menu-card {
  min-width: 220px;
}
</style>
