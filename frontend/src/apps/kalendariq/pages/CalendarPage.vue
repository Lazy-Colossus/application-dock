<template>
  <q-page class="kalendariq-app kalendariq-calendar column no-wrap q-pa-md">
    <div class="kalendariq-inner column no-wrap">
      <div class="row items-center no-wrap q-gutter-sm q-mb-md">
        <!-- An invitee has no list to go back to: the link names one calendar
             and the list needs a login they do not have. -->
        <q-btn
          v-if="!isShared"
          flat
          dense
          round
          icon="arrow_back"
          aria-label="Back to calendars"
          data-testid="back-btn"
          @click="goToList"
        />
        <div class="col row items-center no-wrap q-gutter-sm">
          <span class="kalendariq-title ellipsis" data-testid="calendar-name">
            {{ store.currentCalendar?.name ?? "" }}
          </span>
          <span
            v-if="store.currentCalendar"
            class="kalendariq-headcount"
            data-testid="headcount"
          >
            <q-icon name="person" size="1em" />{{ activeInvitees.length }}
          </span>
        </div>

        <!-- Who you are sits with the other controls, on the right, rather than
             under the title — it is a control, not part of the calendar's name. -->
        <button
          v-if="store.currentCalendar"
          class="kalendariq-whoami"
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

        <!-- The menu now holds one thing anybody with a claim can do, so it is
             no longer admin-only. The ADMIN ITEMS inside it are still absent —
             not disabled — for guests (EXPERIENCE.md, Component Patterns);
             a guest simply opens a shorter menu. -->
        <q-btn
          v-if="(isAdmin || claim.hasClaim.value) && store.currentCalendar"
          flat
          dense
          round
          icon="more_vert"
          :aria-label="isAdmin ? 'Calendar actions' : 'Your votes'"
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
        <template v-if="isShared">
          <!-- A dead link and a deleted calendar look the same from here, on
               purpose: telling them apart would let anyone with a guess probe
               for which tokens are real. -->
          This link no longer works. Ask whoever shared it for a new one.
        </template>
        <template v-else>
          That calendar no longer exists.
          <a href="#" data-testid="not-found-back" @click.prevent="goToList">
            Back to your calendars
          </a>
        </template>
      </div>

      <div v-if="selectMode" class="kalendariq-selbar" data-testid="select-bar">
        <div class="sel-head">
          <span class="col"
            >{{ selected.size }}
            {{ selected.size === 1 ? "day" : "days" }} selected</span
          >
          <button
            class="sel-btn"
            data-testid="select-cancel"
            @click="toggleSelectMode"
          >
            Cancel
          </button>
        </div>

        <!-- The same three answers, glyphs and words as the day sheet: this is
             the sheet's question asked of many days at once, so it must not
             look like a different question. On their own row because three
             answers plus Cancel do not fit across a phone. -->
        <div class="sel-answers">
          <button
            v-for="option in BULK_OPTIONS"
            :key="option.value"
            class="sel-btn go"
            :disabled="selected.size === 0"
            :data-testid="`select-apply-${option.value}`"
            @click="applyToSelected(option.value)"
          >
            <span class="g" :class="option.glyph" />{{ option.label }}
          </button>
        </div>
      </div>

      <MonthGrid
        v-if="store.currentCalendar && serverToday"
        ref="monthGrid"
        :votes="store.currentCalendar.votes"
        :chosen-dates="store.currentCalendar.chosen_dates"
        :active-total="activeInvitees.length"
        :invitees="store.currentCalendar.invitees"
        :server-today="serverToday"
        :selectable="claim.hasClaim.value"
        :claimed-id="claim.claimed.value?.id ?? null"
        :selected="selected"
        :select-mode="selectMode"
        @pick="onPickDay"
        @toggle-select-mode="toggleSelectMode"
      />

      <!-- Under the month it summarises, and moving with it: this answers "who
           still has not said anything", which is the question the grid itself
           cannot show at a glance.

           Not on the invitee link: it is a view of how the group is doing,
           which is the organiser's question, and it names every person's
           silence to anyone holding the link. -->
      <MonthTally
        v-if="!isShared && store.currentCalendar && serverToday && monthGrid"
        :invitees="store.currentCalendar.invitees"
        :votes="store.currentCalendar.votes"
        :dates="monthGrid.dates"
        :month-label="visibleMonthLabel"
        :server-today="serverToday"
        :claimed-id="claim.claimed.value?.id ?? null"
      />
    </div>

    <q-dialog v-model="daySheetOpen">
      <DaySheet
        v-if="openDate && store.currentCalendar"
        :date="openDate"
        :invitees="store.currentCalendar.invitees"
        :votes="store.currentCalendar.votes[openDate] ?? {}"
        :notes="store.currentCalendar.notes[openDate] ?? {}"
        :claimed-id="claim.claimed.value?.id ?? null"
        :past="openDate < serverToday"
        :chosen="store.currentCalendar.chosen_dates.includes(openDate)"
        :is-admin="isAdmin"
        @close="daySheetOpen = false"
        @set="onSetStatus"
        @chosen="onSetChosen"
        @claim="nameMenuOpen = true"
        @note="onSetNote"
      />
    </q-dialog>

    <q-dialog v-model="nameMenuOpen">
      <q-card class="kalendariq-panel kalendariq-dialog-card q-pa-sm">
        <div class="text-subtitle2 q-px-sm q-pt-sm q-pb-xs">Who are you?</div>
        <q-list>
          <q-item
            v-for="invitee in activeInvitees"
            :key="invitee.id"
            v-ripple
            clickable
            class="kalendariq-name-row"
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

    <!-- Not admin-only: the menu holds one action for anybody with a claim,
         and the clear dialog belongs to that action. The ADMIN ITEMS inside
         the menu carry their own v-if, so a guest still never receives their
         markup (FR-3) — the guard moved from the group to each item. -->
    <q-dialog v-model="menuOpen">
      <q-card class="kalendariq-panel kalendariq-menu-card">
        <q-list>
          <!-- Yours, not the calendar's — so it comes first for a guest, who
               has nothing else in here. -->
          <q-item
            v-if="claim.hasClaim.value"
            v-ripple
            clickable
            :disable="clearableDates.length === 0"
            data-testid="clear-month-action"
            @click="openClearMonth"
          >
            <q-item-section
              >Clear my votes for {{ visibleMonthLabel }}</q-item-section
            >
          </q-item>
          <q-item
            v-if="isAdmin"
            v-ripple
            clickable
            data-testid="rename-action"
            @click="openRename"
          >
            <q-item-section>Rename</q-item-section>
          </q-item>
          <q-item
            v-if="isAdmin"
            v-ripple
            clickable
            data-testid="invitees-action"
            @click="openInvitees"
          >
            <q-item-section>Manage invitees</q-item-section>
          </q-item>
          <q-item
            v-if="isAdmin"
            v-ripple
            clickable
            data-testid="share-action"
            @click="copyLink"
          >
            <q-item-section>Copy invitee link</q-item-section>
          </q-item>
          <q-item
            v-if="isAdmin"
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

    <q-dialog v-model="clearingMonth">
      <q-card class="kalendariq-panel kalendariq-dialog-card q-pa-md">
        <div class="text-h6 q-mb-sm">Clear your votes?</div>
        <!-- Says the month, the number of days, that notes go too, and that
               past days are safe. One tap from a menu can undo a month of
               voting, which is far less deliberate than collecting days by
               hand, so it asks first. What goes and what stays are separate
               sentences on separate lines: the reassurance is easy to miss when
               it trails the warning on the same line. -->
        <div class="q-mb-md" data-testid="clear-month-warning">
          <div>
            Your votes on
            <b
              >{{ clearableDates.length }}
              {{ clearableDates.length === 1 ? "day" : "days" }}</b
            >
            in <b>{{ visibleMonthLabel }}</b> will be cleared, along with any
            notes you left on them.
          </div>
          <div class="clear-reassure q-mt-sm">
            Days already past are left alone, and nobody else's votes change.
          </div>
        </div>
        <div class="row justify-end q-gutter-sm">
          <q-btn
            flat
            no-caps
            label="Keep them"
            @click="clearingMonth = false"
          />
          <q-btn
            unelevated
            no-caps
            color="negative"
            label="Clear"
            data-testid="clear-month-confirm"
            @click="submitClearMonth"
          />
        </div>
      </q-card>
    </q-dialog>

    <!-- Guarded as a group: a guest must not merely be unable to open these,
         their markup must not exist in the page at all (FR-3). -->
    <template v-if="isAdmin">
      <q-dialog v-model="renaming">
        <q-card class="kalendariq-panel kalendariq-dialog-card q-pa-md">
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
        <q-card class="kalendariq-panel kalendariq-dialog-card q-pa-md">
          <div class="text-h6 q-mb-md">Who is invited?</div>

          <div class="row q-gutter-xs q-mb-md" data-testid="roster">
            <span
              v-for="invitee in activeInvitees"
              :key="invitee.id"
              class="kalendariq-chip"
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
        <q-card class="kalendariq-panel kalendariq-dialog-card q-pa-md">
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
        <q-card class="kalendariq-panel kalendariq-dialog-card q-pa-md">
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
import { useKalendariqStore } from "@/apps/kalendariq/stores/useKalendariqStore";
import { useClaimedName } from "@/apps/kalendariq/composables/useClaimedName";
import MonthGrid from "@/apps/kalendariq/components/MonthGrid.vue";
import MonthTally from "@/apps/kalendariq/components/MonthTally.vue";
import DaySheet from "@/apps/kalendariq/components/DaySheet.vue";
import type { Invitee, VoteStatus } from "@/apps/kalendariq/types";

const store = useKalendariqStore();
const route = useRoute();
const router = useRouter();

/**
 * Opened from an invitee link rather than from the calendar list.
 *
 * The visitor has no account, so the page shows them the calendar and the three
 * things they can do to it — vote, note, clear their own month — and nothing
 * that belongs to running it. The server enforces the same boundary; this is
 * the half of it that stops a control appearing at all.
 */
const shareToken = computed(() =>
  route.params.shareToken ? String(route.params.shareToken) : null,
);
const isShared = computed(() => shareToken.value !== null);

/** In share mode the id arrives with the calendar, not from the URL. */
const calendarId = computed(() =>
  isShared.value
    ? (store.currentCalendar?.id ?? "")
    : String(route.params.calendarId),
);
const isAdmin = computed(() => store.me?.is_admin === true);
const notFound = computed(
  () =>
    !store.loading && store.currentCalendar === null && store.error !== null,
);

const menuOpen = ref(false);
const clearingMonth = ref(false);
const monthGrid = ref<InstanceType<typeof MonthGrid> | null>(null);
const nameMenuOpen = ref(false);
const daySheetOpen = ref(false);
const openDate = ref<string | null>(null);
/** The day sheet's three answers, verbatim — one question, asked two ways. */
const BULK_OPTIONS = [
  { value: "yes" as const, label: "Free", glyph: "free" },
  { value: "if_needed" as const, label: "If needed", glyph: "maybe" },
  { value: "none" as const, label: "Can't", glyph: "no" },
];

const visibleMonthLabel = computed(() => monthGrid.value?.monthLabel ?? "");

/**
 * Every day in the month on screen that carries something of mine — a vote, a
 * note, or both — from today onward.
 *
 * Past days are excluded because a past day is a record: the server refuses to
 * rewrite one (`_parse_future_day`), and "clear this month" has never meant
 * "erase history". Days holding nothing of mine are excluded so the number in
 * the confirmation is the number of days that will actually change.
 *
 * Notes count, not just votes: a day where I left only a note is still my mark
 * on the month, and leaving it behind would make "clear" a lie.
 */
const clearableDates = computed(() => {
  const mine = claim.claimed.value;
  const calendar = store.currentCalendar;
  if (!mine || !calendar || !serverToday.value) return [];
  return (monthGrid.value?.dates ?? []).filter(
    (date: string) =>
      date >= serverToday.value! &&
      (calendar.votes[date]?.[mine.id] !== undefined ||
        calendar.notes[date]?.[mine.id] !== undefined),
  );
});

const selectMode = ref(false);
const selected = ref<Set<string>>(new Set());
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
  void router.push("/kalendariq");
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
  // In select mode a tap collects days instead of opening one. Past days are
  // never collectable: they cannot be voted on, so selecting them would only
  // build a request the server is going to refuse.
  if (selectMode.value) {
    if (date < serverToday.value) return;
    const next = new Set(selected.value);
    if (!next.delete(date)) next.add(date);
    selected.value = next;
    return;
  }
  openDate.value = date;
  daySheetOpen.value = true;
}

function toggleSelectMode(): void {
  selectMode.value = !selectMode.value;
  selected.value = new Set();
}

/**
 * Answering many days at once REPLACES whatever was on each of them — a day you
 * had already marked "if needed" becomes whatever you just picked, and "Can't"
 * clears the answer outright. Bulk is the same act as answering in the sheet,
 * so it settles the day rather than filling in only the blanks.
 */
async function applyToSelected(status: VoteStatus | "none"): Promise<void> {
  const mine = claim.claimed.value;
  if (!mine || selected.value.size === 0) return;
  try {
    await store.setVotesBulk(
      calendarId.value,
      mine.id,
      [...selected.value].sort(),
      status,
    );
    selectMode.value = false;
    selected.value = new Set();
  } catch {
    // The store surfaced it; the selection survives so it can be retried.
  }
}

function openClearMonth(): void {
  if (clearableDates.value.length === 0) return;
  menuOpen.value = false;
  clearingMonth.value = true;
}

async function submitClearMonth(): Promise<void> {
  const mine = claim.claimed.value;
  const dates = clearableDates.value;
  if (!mine || dates.length === 0) return;
  try {
    await store.setVotesBulk(calendarId.value, mine.id, dates, "none", true);
    clearingMonth.value = false;
  } catch {
    // The store surfaced it; the dialog stays open so it can be retried.
  }
}

async function onSetNote(text: string): Promise<void> {
  const mine = claim.claimed.value;
  if (!mine || !openDate.value) return;
  await store.setNote(calendarId.value, mine.id, openDate.value, text);
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

/**
 * Copies the INVITEE link, not the address bar.
 *
 * The address bar holds the admin route, which needs a login the people being
 * invited do not have — pasting it into the group chat sends everyone to a
 * login screen. What gets shared is the token link.
 */
async function copyLink(): Promise<void> {
  const token = store.currentCalendar?.share_token;
  if (!token) return;
  // An absolute URL: a bare path is useless pasted into a group chat.
  const url = `${window.location.origin}/kalendariq/s/${token}`;
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
  // One unauthenticated request on the share path: it carries the calendar and
  // the server's date together, because there is no `/kalendariq/me` to ask.
  if (shareToken.value) await store.fetchSharedCalendar(shareToken.value);
  else
    await Promise.all([store.fetchMe(), store.fetchCalendar(calendarId.value)]);
  // After the roster is known, so a stale claim can be resolved immediately.
  claim.restore();
});

import "./../css/kalendariq.sass";
</script>

<style scoped>
.kalendariq-selbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
  padding: 8px 10px;
  border-radius: 10px;
  background: var(--kalendariq-field-raise);
  border: 1px solid var(--kalendariq-field-line);
  font-size: 13px;
}
.sel-btn {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--kalendariq-field-line);
  background: transparent;
  color: var(--kalendariq-ink-hi);
  font: inherit;
  font-size: 12.5px;
  cursor: pointer;
}
.sel-btn.go {
  background: var(--kalendariq-wash-3);
  border-color: transparent;
  font-weight: 600;
}
.sel-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
/* Equal thirds, so no answer looks like the default one. */
.sel-answers {
  display: flex;
  gap: 8px;
}
.sel-answers .sel-btn {
  flex: 1 1 0;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}
/* The day sheet's glyphs, to the pixel — see DaySheet.vue. Free and if-needed
   carry their own colour because green and yellow mean "your own answer"
   everywhere in Kalendariq; a "can't" is a hollow ring, which is what an absent answer
   looks like on the roster. */
.g {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  flex: none;
}
.g.free {
  background: var(--kalendariq-yes);
}
.g.maybe {
  background: linear-gradient(90deg, var(--kalendariq-maybe) 50%, transparent 50%);
  box-shadow: inset 0 0 0 1.5px var(--kalendariq-maybe);
}
.g.no {
  box-shadow: inset 0 0 0 1.5px var(--kalendariq-ink-lo);
  opacity: 0.55;
}
.sel-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* Two layouts, and only two: a phone, and a browser window. Below the
   breakpoint the column is the full width of the screen; above it the calendar
   is a centred band, because a month stretched across a 27" monitor is a row of
   billboards, not something you read. The cap keeps it sane on very wide
   screens — 80% of 2560px would be absurd. */
.kalendariq-inner {
  width: 100%;
}
@media (min-width: 700px) {
  .kalendariq-inner {
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
  .kalendariq-title {
    font-size: clamp(24px, 2.6vw, 34px);
  }
  .kalendariq-headcount {
    font-size: clamp(19px, 2vw, 26px);
  }
  .kalendariq-whoami {
    font-size: 16px;
    max-width: none;
  }
}

.kalendariq-title {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.15;
  min-width: 0;
}
/* The half of the confirmation that says what is SAFE, quieter than the half
   that says what goes. Not `.kalendariq-muted` — that lives in DaySheet's scoped
   styles and would do nothing here. */
.clear-reassure {
  color: var(--kalendariq-ink-mid);
  font-size: 13px;
}
.kalendariq-whoami {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  flex: none;
  max-width: 45vw;
  padding: 7px 13px;
  /* Purple, but a step below the "Select Multiple" button at wash-4: this is a
     standing statement of who you are, not a call to act, and the spine asks a
     claimed pill to settle rather than compete. Two steps apart reads as two
     ranks of the same family rather than two unrelated controls. */
  border: 1px solid var(--kalendariq-wash-4);
  border-radius: 999px;
  background: var(--kalendariq-wash-3);
  font: inherit;
  font-size: 15px;
  color: var(--kalendariq-ink-hi);
  cursor: pointer;
}
.kalendariq-whoami:hover {
  background: var(--kalendariq-wash-4);
}
/* Unanswered, and the app cannot be used until it is answered — so it reads
   like a required field left blank rather than a quiet secondary control. */
.kalendariq-whoami.unclaimed {
  border-color: var(--kalendariq-danger);
  background: rgba(207, 102, 121, 0.12);
  color: var(--kalendariq-danger);
  font-weight: 600;
}
.kalendariq-headcount {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  flex: none;
  font-size: 19px;
  opacity: 0.7;
}
.kalendariq-name-row {
  min-height: 44px;
}
.kalendariq-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border: 1px solid;
  border-radius: 999px;
  font-size: 13px;
}
.kalendariq-dialog-card {
  min-width: 320px;
}
.kalendariq-menu-card {
  min-width: 220px;
}
</style>
