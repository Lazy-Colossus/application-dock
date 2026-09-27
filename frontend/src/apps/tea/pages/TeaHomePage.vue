<template>
  <q-page class="tea-home">
    <header class="tea-home__header">
      <span class="tea-home__title">Tea</span>
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
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";
import SectionIcon, {
  type SectionIconName,
} from "../components/SectionIcon.vue";

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
</script>

<style scoped lang="scss">
.tea-home {
  background: #17120e;
  min-height: 100%;
}
.tea-home__header {
  padding: 20px 18px 12px;
}
.tea-home__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
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
