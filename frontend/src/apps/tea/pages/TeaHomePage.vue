<template>
  <q-page class="tea-home">
    <header class="tea-home__header">
      <button
        class="tea-home__household"
        data-testid="tea-home-household"
        aria-label="Who shares this cabinet"
        @click="householding = true"
      >
        {{ householdLabel }}
      </button>
    </header>

    <nav class="tea-home__grid" aria-label="Tea sections">
      <button
        v-for="section in SECTIONS"
        :key="section.route"
        class="tea-home__tile"
        data-testid="tea-home-section"
        @click="router.push({ name: section.route })"
      >
        <SectionIcon :name="section.icon" class="tea-home__icon" />
        <span class="tea-home__name">{{ section.name }}</span>
      </button>
    </nav>

    <HouseholdSheet v-if="householding" @close="householding = false" />
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import HouseholdSheet from "../components/HouseholdSheet.vue";
import SectionIcon, {
  type SectionIconName,
} from "../components/SectionIcon.vue";
import { useTeaHouseholdStore } from "../stores/useTeaHouseholdStore";

interface Section {
  name: string;
  icon: SectionIconName;
  route: string;
}

const SECTIONS: Section[] = [
  { name: "Cabinet", icon: "leaf", route: "tea-cabinet" },
  { name: "Teaware", icon: "pot", route: "tea-ware" },
  { name: "Brew", icon: "pour", route: "tea-timer" },
  { name: "Almanac", icon: "tome", route: "tea-almanac" },
];

const router = useRouter();
const household = useTeaHouseholdStore();
const householding = ref(false);

// Sharing spans the teas and the teaware alike, so it lives above both.
const householdLabel = computed(() => {
  if (!household.shared) return "Share";
  const others = household.others;
  return others.length === 1
    ? `Shared with ${others[0]}`
    : `Shared with ${others.length} others`;
});

onMounted(() => {
  void household.fetchCabinet();
});
</script>

<style scoped lang="scss">
.tea-home {
  background: #17120e;
  min-height: 100%;
}
.tea-home__header {
  display: flex;
  justify-content: flex-end;
  padding: 20px 18px 12px;
}
.tea-home__household {
  background: transparent;
  border: 0;
  padding: 0;
  color: #8b7a63;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
}
.tea-home__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  padding: 4px 18px 24px;
}
@media (min-width: 768px) {
  .tea-home__grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
.tea-home__tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  aspect-ratio: 1;
  background: #1e1712;
  border: 1px solid #241e19;
  border-radius: 12px;
  padding: 14px;
  font-family: inherit;
  cursor: pointer;
}
.tea-home__tile:hover,
.tea-home__tile:focus-visible {
  border-color: #7a6244;
  outline: none;
}
.tea-home__icon {
  width: 62%;
  height: auto;
}
.tea-home__name {
  color: #a99781;
  font-size: 13px;
}
</style>
