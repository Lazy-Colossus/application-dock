<template>
  <q-page class="tea-page journal">
    <div class="journal__controls">
      <button
        :class="['journal__toggle', { 'journal__toggle--on': chaXiOnly }]"
        :aria-pressed="chaXiOnly ? 'true' : 'false'"
        data-testid="journal-chaxi-only"
        @click="setChaXiOnly(!chaXiOnly)"
      >
        Cha xi only
      </button>
      <button
        class="journal__new"
        data-testid="journal-new"
        @click="router.push({ name: 'tea-journal-new' })"
      >
        + Entry
      </button>
    </div>

    <p v-if="journal.error" class="tea-page__error" data-testid="journal-error">
      {{ journal.error }}
      <button class="journal__retry" @click="journal.fetchJournal()">Try again</button>
    </p>

    <p
      v-if="!journal.loading && groups.length === 0"
      class="journal__empty"
      data-testid="journal-empty"
    >
      {{
        chaXiOnly
          ? "No sittings with cha xi yet."
          : "No sittings yet. Brew a tea, or add one you drank elsewhere."
      }}
    </p>

    <section v-for="group in groups" :key="group.key" class="journal__month">
      <h2 class="journal__month-name" data-testid="journal-month">{{ group.label }}</h2>
      <div class="journal__grid">
        <JournalCard
          v-for="entry in group.entries"
          :key="entry.id"
          :entry="entry"
          :mine="entry.brewed_by === auth.username"
          :show-brewer="entry.brewed_by !== auth.username"
        />
      </div>
    </section>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import JournalCard from "../components/JournalCard.vue";
import { useTeaJournalStore } from "../stores/useTeaJournalStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { groupByMonth, hasChaXi } from "../journal";

const CHAXI_ONLY_KEY = "tea-journal:chaxi-only";

function readChaXiOnly(): boolean {
  try {
    return sessionStorage.getItem(CHAXI_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

const router = useRouter();
const journal = useTeaJournalStore();
const auth = useAuthStore();
const chaXiOnly = ref(readChaXiOnly());

function setChaXiOnly(value: boolean): void {
  chaXiOnly.value = value;
  try {
    sessionStorage.setItem(CHAXI_ONLY_KEY, value ? "1" : "0");
  } catch {
    // Blocked storage: the toggle still works for this visit.
  }
}

const groups = computed(() =>
  groupByMonth(chaXiOnly.value ? journal.entries.filter(hasChaXi) : journal.entries),
);

onMounted(() => {
  void journal.fetchJournal();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.journal__controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px 4px;
}
.journal__toggle {
  background: transparent;
  border: 1px solid #2c241d;
  border-radius: 999px;
  color: #8b7a63;
  font-family: inherit;
  font-size: 14px;
  padding: 6px 12px;
  cursor: pointer;
}
.journal__toggle--on {
  background: #2c241d;
  color: #efe7da;
}
.journal__new,
.journal__retry {
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 15px;
  cursor: pointer;
}
.journal__empty {
  color: #8b7a63;
  padding: 24px 18px;
}
.journal__month {
  padding: 0 18px;
}
.journal__month-name {
  color: #a99781;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin: 22px 0 10px;
}
.journal__grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
}
@media (min-width: 768px) {
  .journal__grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
