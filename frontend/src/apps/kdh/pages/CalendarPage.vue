<template>
  <q-page class="kdh-app kdh-calendar column no-wrap q-pa-md">
    <div class="kdh-inner column no-wrap">
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
        <div class="col row items-center no-wrap q-gutter-sm">
          <span class="kdh-title ellipsis" data-testid="calendar-name">
            {{ store.currentCalendar?.name ?? "" }}
          </span>
          <span
            v-if="store.currentCalendar"
            class="kdh-headcount"
            data-testid="headcount"
          >
            <q-icon name="person" size="1em" />{{ activeInvitees.length }}
          </span>
        </div>

        <!-- Who you are sits with the other controls, on the right, rather than
             under the title — it is a control, not part of the calendar's name. -->
        <button
          v-if="store.currentCalendar"
          class="kdh-whoami"
          :class="{ unclaimed: !claim.hasClaim.value }"
          data-testid="whoami-btn"
          @click="nameMenuOpen = true"
        >
          <q-icon
            v-if="!claim.hasClaim.value"
            name="error_outline"
            size="18px"
          />
          <span class="ellipsis">{{
            claim.claimed.value?.name ?? "Who are you?"
          }}</span>
          <q-icon name="expand_more" size="18px" />
        </button>

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

      <MonthGrid
        v-if="store.currentCalendar && serverToday"
        :votes="store.currentCalendar.votes"
        :chosen-dates="store.currentCalendar.chosen_dates"
        :active-total="activeInvitees.length"
        :invitees="store.currentCalendar.invitees"
        :server-today="serverToday"
        @pick="onPickDay"
      />
    </div>

    <q-dialog v-model="daySheetOpen">
      <DaySheet
        v-if="openDate && store.currentCalendar"
        :date="openDate"
        :invitees="store.currentCalendar.invitees"
        :votes="store.currentCalendar.votes[openDate] ?? {}"
        :claimed-id="claim.claimed.value?.id ?? null"
        :past="openDate < serverToday"
        :chosen="store.currentCalendar.chosen_dates.includes(openDate)"
        :is-admin="isAdmin"
        @close="daySheetOpen = false"
        @set="onSetStatus"
        @chosen="onSetChosen"
        @claim="nameMenuOpen = true"
      />
    </q-dialog>

    <q-dialog v-model="nameMenuOpen">
      <q-card class="kdh-panel kdh-dialog-card q-pa-sm">
        <div class="text-subtitle2 q-px-sm q-pt-sm q-pb-xs">Who are you?</div>
        <q-list>
          <q-item
            v-for="invitee in activeInvitees"
            :key="invitee.id"
            v-ripple
            clickable
            class="kdh-name-row"
            :data-testid="`claim-${invitee.id}`"
            @click="claimName(invitee.id)"
          >
            <q-item-section>
              <span>
                {{ invitee.name }}
                <span
                  v-if="claim.claimedId.value === invitee.id"
                  data-testid="claim-tick"
                  >✓</span
                >
              </span>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card>
    </q-dialog>

    <!-- Guarded as a group: a guest must not merely be unable to open these,
         their markup must not exist in the page at all (FR-3). -->
    <template v-if="isAdmin">
      <q-dialog v-model="menuOpen">
        <q-card class="kdh-panel kdh-menu-card">
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
              data-testid="invitees-action"
              @click="openInvitees"
            >
              <q-item-section>Manage invitees</q-item-section>
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
        <q-card class="kdh-panel kdh-dialog-card q-pa-md">
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

      <q-dialog v-model="managingInvitees">
        <q-card class="kdh-panel kdh-dialog-card q-pa-md">
          <div class="text-h6 q-mb-md">Who is invited?</div>

          <div class="row q-gutter-xs q-mb-md" data-testid="roster">
            <span
              v-for="invitee in activeInvitees"
              :key="invitee.id"
              class="kdh-chip"
              :data-testid="`roster-${invitee.id}`"
            >
              {{ invitee.name }}
              <q-btn
                flat
                dense
                round
                size="xs"
                icon="close"
                :aria-label="`Remove ${invitee.name}`"
                :data-testid="`remove-${invitee.id}`"
                @click="confirmRemove(invitee)"
              />
            </span>
          </div>

          <q-input
            v-model="newInviteeName"
            dense
            outlined
            label="Add someone"
            data-testid="invitee-name-input"
            @keyup.enter="submitInvitee"
          />
          <div
            v-if="duplicateInvitee"
            class="text-negative q-mt-xs"
            data-testid="invitee-duplicate"
          >
            {{ newInviteeName.trim() }} is already invited.
          </div>

          <div class="row justify-end q-gutter-sm q-mt-md">
            <q-btn
              flat
              no-caps
              label="Done"
              @click="managingInvitees = false"
            />
            <q-btn
              unelevated
              no-caps
              color="primary"
              label="Add"
              :disable="!canAddInvitee"
              data-testid="invitee-add"
              @click="submitInvitee"
            />
          </div>
        </q-card>
      </q-dialog>

      <q-dialog v-model="removeDialogOpen">
        <q-card class="kdh-panel kdh-dialog-card q-pa-md">
          <div class="text-h6 q-mb-sm">Remove {{ removingInvitee?.name }}?</div>
          <!-- Says plainly what is kept and what goes: the asymmetry is the whole
               point of the feature and a surprise here is unrecoverable. -->
          <div class="q-mb-md" data-testid="remove-warning">
            Their availability from today onwards will be cleared. Days already
            past keep their answers, so the record of sessions you have played
            stays intact.
          </div>
          <div class="row justify-end q-gutter-sm">
            <q-btn
              flat
              no-caps
              label="Keep them"
              @click="removingInvitee = null"
            />
            <q-btn
              unelevated
              no-caps
              color="negative"
              label="Remove"
              data-testid="remove-confirm"
              @click="submitRemove"
            />
          </div>
        </q-card>
      </q-dialog>

      <q-dialog v-model="deleting">
        <q-card class="kdh-panel kdh-dialog-card q-pa-md">
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
import { useClaimedName } from "@/apps/kdh/composables/useClaimedName";
import MonthGrid from "@/apps/kdh/components/MonthGrid.vue";
import DaySheet from "@/apps/kdh/components/DaySheet.vue";
import type { Invitee, VoteStatus } from "@/apps/kdh/types";

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
const nameMenuOpen = ref(false);
const daySheetOpen = ref(false);
const openDate = ref<string | null>(null);
const managingInvitees = ref(false);
const newInviteeName = ref("");
const removingInvitee = ref<Invitee | null>(null);
// `v-model` needs an assignable target; the dialog's open state is derived from
// which invitee is pending removal, and dismissing it clears that.
const removeDialogOpen = computed({
  get: () => removingInvitee.value !== null,
  set: (open: boolean) => {
    if (!open) removingInvitee.value = null;
  },
});
const renaming = ref(false);
const deleting = ref(false);
const draftName = ref("");
// Copy feedback is its own channel: it is not an error, and it must not clobber
// a real one sitting in the store.
const copyNotice = ref<string | null>(null);

const canRename = computed(() => draftName.value.trim() !== "");

const claim = useClaimedName(
  () => calendarId.value,
  () => store.currentCalendar?.invitees ?? [],
);

/** The past/future boundary, always the server's (NFR-5). */
const serverToday = computed(() => store.me?.today ?? "");

const activeInvitees = computed(() =>
  [...(store.currentCalendar?.invitees ?? [])]
    .filter((i) => i.removed_at === null)
    .sort((a, b) => a.order - b.order),
);

/** The server's rule, applied here so the dialog never submits a known reject. */
const duplicateInvitee = computed(() => {
  const candidate = newInviteeName.value.trim().toLocaleLowerCase();
  return (
    candidate !== "" &&
    activeInvitees.value.some((i) => i.name.toLocaleLowerCase() === candidate)
  );
});

const canAddInvitee = computed(
  () => newInviteeName.value.trim() !== "" && !duplicateInvitee.value,
);

function goToList(): void {
  void router.push("/kdh");
}

function openRename(): void {
  draftName.value = store.currentCalendar?.name ?? "";
  menuOpen.value = false;
  renaming.value = true;
}

function claimName(inviteeId: string): void {
  claim.claim(inviteeId);
  nameMenuOpen.value = false;
}

/**
 * The first tap teaches: with no name claimed, tapping a day opens the name
 * dropdown rather than refusing the tap.
 */
/**
 * Tapping a day always opens its sheet.
 *
 * The sheet is useful to everyone: a past day shows who came, and an admin can
 * mark any day chosen without having claimed a name — quite likely, since an
 * admin need not be an invitee. The "say who you are" prompt therefore lives
 * *inside* the sheet rather than intercepting the tap, so the teaching moment
 * survives without the sheet being unreachable.
 */
function onPickDay(date: string): void {
  openDate.value = date;
  daySheetOpen.value = true;
}

async function onSetChosen(chosen: boolean): Promise<void> {
  if (!openDate.value) return;
  await store.setChosen(calendarId.value, openDate.value, chosen);
}

async function onSetStatus(status: VoteStatus | "none"): Promise<void> {
  const mine = claim.claimed.value;
  if (!mine || !openDate.value) return;
  await store.setVote(calendarId.value, mine.id, openDate.value, status);
}

function openInvitees(): void {
  newInviteeName.value = "";
  menuOpen.value = false;
  managingInvitees.value = true;
}

async function submitInvitee(): Promise<void> {
  if (!canAddInvitee.value) return;
  try {
    await store.addInvitee(calendarId.value, newInviteeName.value.trim());
    newInviteeName.value = "";
  } catch {
    // Message is in the store; keep the typed name so it can be corrected.
  }
}

function confirmRemove(invitee: Invitee): void {
  removingInvitee.value = invitee;
}

async function submitRemove(): Promise<void> {
  const invitee = removingInvitee.value;
  if (!invitee) return;
  try {
    await store.removeInvitee(calendarId.value, invitee.id);
  } catch {
    // Message is in the store.
  } finally {
    removingInvitee.value = null;
  }
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
  // After the roster is known, so a stale claim can be resolved immediately.
  claim.restore();
});

import "./../css/kdh.sass";
</script>

<style scoped>
/* Two layouts, and only two: a phone, and a browser window. Below the
   breakpoint the column is the full width of the screen; above it the calendar
   is a centred band, because a month stretched across a 27" monitor is a row of
   billboards, not something you read. The cap keeps it sane on very wide
   screens — 80% of 2560px would be absurd. */
.kdh-inner {
  width: 100%;
}
@media (min-width: 700px) {
  .kdh-inner {
    /* `min-width` is the important one: below about 790px the square cells stop
       being tall enough to hold two lines of names, so a narrow window gets a
       wider band rather than losing the names. */
    width: 66%;
    /* `min()` so the floor can never exceed the window — below ~820px the band
       is simply the full column. */
    min-width: min(790px, 100%);
    max-width: 1080px;
    margin: 0 auto;
  }
  .kdh-title {
    font-size: clamp(24px, 2.6vw, 34px);
  }
  .kdh-headcount {
    font-size: clamp(19px, 2vw, 26px);
  }
  .kdh-whoami {
    font-size: 16px;
    max-width: none;
  }
}

.kdh-title {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.15;
  min-width: 0;
}
.kdh-whoami {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  max-width: 45vw;
  padding: 7px 13px;
  border: 1px solid var(--kdh-field-line);
  border-radius: 999px;
  background: var(--kdh-field-raise);
  font: inherit;
  font-size: 15px;
  color: inherit;
  cursor: pointer;
}
/* Unanswered, and the app cannot be used until it is answered — so it reads
   like a required field left blank rather than a quiet secondary control. */
.kdh-whoami.unclaimed {
  border-color: var(--kdh-danger);
  background: rgba(207, 102, 121, 0.12);
  color: var(--kdh-danger);
  font-weight: 600;
}
.kdh-headcount {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  font-size: 19px;
  opacity: 0.7;
}
.kdh-name-row {
  min-height: 44px;
}
.kdh-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 13px;
}
.kdh-dialog-card {
  min-width: 320px;
}
.kdh-menu-card {
  min-width: 220px;
}
</style>
