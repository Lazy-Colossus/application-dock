<template>
  <q-page class="kdh-app column no-wrap q-pa-md">
    <div class="row items-center justify-between q-mb-lg">
      <div class="text-h5">KDH</div>
      <q-btn
        v-if="isAdmin"
        label="New calendar"
        color="primary"
        unelevated
        no-caps
        data-testid="new-calendar-btn"
        @click="openCreate"
      />
    </div>

    <div v-if="store.error" class="text-negative q-mb-md" data-testid="error">
      {{ store.error }}
    </div>

    <!-- The two empty states differ by role: a guest is never shown a control
         they cannot use, disabled or otherwise (FR-3, FR-5). -->
    <div
      v-if="!store.loading && store.calendars.length === 0"
      class="text-grey-6"
      data-testid="empty-state"
    >
      <template v-if="isAdmin">
        No calendars yet — create one for your next occasion.
      </template>
      <template v-else>
        No calendars yet — ask an admin to create one.
      </template>
    </div>

    <q-list v-else separator>
      <q-item
        v-for="calendar in store.calendars"
        :key="calendar.id"
        v-ripple
        clickable
        :data-testid="`calendar-${calendar.id}`"
        @click="open(calendar.id)"
      >
        <q-item-section>
          <q-item-label class="row items-center no-wrap q-gutter-xs">
            <span class="kdh-calendar-name ellipsis">{{ calendar.name }}</span>
            <span
              class="kdh-headcount"
              :data-testid="`headcount-${calendar.id}`"
            >
              <q-icon name="person" size="14px" />{{ calendar.invitee_count }}
            </span>
          </q-item-label>
          <!-- Who is invited, not how many — the count is already beside the
               name. Six names is about what fits on a phone row. -->
          <q-item-label
            caption
            class="ellipsis"
            :data-testid="`roster-${calendar.id}`"
          >
            {{ rosterLine(calendar.invitee_names) }}
          </q-item-label>
        </q-item-section>
      </q-item>
    </q-list>

    <q-dialog v-model="creating">
      <q-card class="kdh-create-card q-pa-md">
        <div class="text-h6 q-mb-md">New calendar</div>

        <q-input
          v-model="newName"
          dense
          outlined
          autofocus
          label="What is the occasion?"
          data-testid="calendar-name-input"
        />

        <div class="text-subtitle2 q-mt-md q-mb-xs">Who is invited?</div>
        <div
          v-for="(_, index) in inviteeNames"
          :key="index"
          class="row items-center q-gutter-sm q-mb-xs"
        >
          <q-input
            v-model="inviteeNames[index]"
            dense
            outlined
            class="col"
            :label="`Person ${index + 1}`"
            :data-testid="`invitee-input-${index}`"
            @keyup.enter="addInviteeRow"
          />
          <q-btn
            v-if="inviteeNames.length > 1"
            flat
            dense
            round
            icon="close"
            :data-testid="`remove-invitee-${index}`"
            @click="removeInviteeRow(index)"
          />
        </div>
        <q-btn
          flat
          dense
          no-caps
          label="Add another"
          data-testid="add-invitee-btn"
          @click="addInviteeRow"
        />

        <div
          v-if="duplicateName"
          class="text-negative q-mt-sm"
          data-testid="duplicate-warning"
        >
          {{ duplicateName }} is listed twice.
        </div>

        <div class="row justify-end q-gutter-sm q-mt-md">
          <q-btn flat no-caps label="Cancel" @click="creating = false" />
          <q-btn
            unelevated
            no-caps
            color="primary"
            label="Create"
            :disable="!canCreate"
            data-testid="create-calendar-btn"
            @click="submit"
          />
        </div>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import { useKdhStore } from "@/apps/kdh/stores/useKdhStore";

const store = useKdhStore();
const router = useRouter();

const creating = ref(false);
const newName = ref("");
const inviteeNames = ref<string[]>([""]);

const isAdmin = computed(() => store.me?.is_admin === true);

const filledInvitees = computed(() =>
  inviteeNames.value.map((n) => n.trim()).filter((n) => n !== ""),
);

/** The first name listed twice, ignoring case and padding — the same rule the
 *  server applies, so the dialog never submits something it will reject. */
const duplicateName = computed<string | null>(() => {
  const seen = new Set<string>();
  for (const name of filledInvitees.value) {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) return name;
    seen.add(key);
  }
  return null;
});

const canCreate = computed(
  () =>
    newName.value.trim() !== "" &&
    filledInvitees.value.length > 0 &&
    duplicateName.value === null,
);

function openCreate(): void {
  newName.value = "";
  inviteeNames.value = [""];
  creating.value = true;
}

function addInviteeRow(): void {
  inviteeNames.value.push("");
}

function removeInviteeRow(index: number): void {
  inviteeNames.value.splice(index, 1);
}

const ROSTER_SHOWN = 6;

/** Names, comma-separated, trailing off past the sixth. */
function rosterLine(names: string[]): string {
  if (names.length === 0) return "Nobody invited yet";
  const shown = names.slice(0, ROSTER_SHOWN).join(", ");
  return names.length > ROSTER_SHOWN ? `${shown}…` : shown;
}

function open(calendarId: string): void {
  void router.push(`/kdh/c/${calendarId}`);
}

async function submit(): Promise<void> {
  try {
    const created = await store.createCalendar(
      newName.value.trim(),
      filledInvitees.value,
    );
    creating.value = false;
    open(created.id);
  } catch {
    // The store surfaced the message; stay on the dialog so the input survives.
  }
}

onMounted(async () => {
  await Promise.all([store.fetchMe(), store.fetchCalendars()]);
});

import "./../css/kdh.sass";
</script>

<style scoped>
.kdh-create-card {
  min-width: 380px;
}
.kdh-calendar-name {
  /* Three larger than the list's own size, whatever that turns out to be. */
  font-size: calc(1em + 3px);
}
.kdh-headcount {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex: none;
  font-size: 12px;
  opacity: 0.7;
}
</style>
