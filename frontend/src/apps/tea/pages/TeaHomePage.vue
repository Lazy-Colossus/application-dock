<template>
  <q-page class="tea-home">
    <header class="tea-home__header">
      <span class="tea-home__title">Tea</span>
    </header>

    <nav class="tea-home__sections" aria-label="Tea sections">
      <button
        v-for="section in SECTIONS"
        :key="section.route"
        class="tea-home__section"
        data-testid="tea-home-section"
        @click="router.push({ name: section.route })"
      >
        <span class="tea-home__label">
          <span class="tea-home__name">{{ section.name }}</span>
          <span class="tea-home__zh" lang="zh">{{ section.nameZh }}</span>
        </span>
        <span class="tea-home__blurb">{{ section.blurb }}</span>
      </button>
    </nav>
  </q-page>
</template>

<script setup lang="ts">
import { useRouter } from "vue-router";

interface Section {
  name: string;
  nameZh: string;
  blurb: string;
  route: string;
}

const SECTIONS: Section[] = [
  {
    name: "Cabinet",
    nameZh: "茶櫃",
    blurb: "The teas you have, and how much of each is left.",
    route: "tea-cabinet",
  },
  {
    name: "Teaware",
    nameZh: "茶具",
    blurb: "Your gaiwans, pots and cups, and what's been brewed in each.",
    route: "tea-ware",
  },
  {
    name: "Brew",
    nameZh: "泡茶",
    blurb: "Time a session, infusion by infusion.",
    route: "tea-timer",
  },
  {
    name: "Almanac",
    nameZh: "茶經",
    blurb: "Tea families, origins and how to brew them.",
    route: "tea-almanac",
  },
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
.tea-home__sections {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 18px 24px;
}
.tea-home__section {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
  background: #1e1712;
  border: 1px solid #241e19;
  border-radius: 3px;
  padding: 18px 16px;
  font-family: inherit;
  cursor: pointer;
}
.tea-home__section:hover,
.tea-home__section:focus-visible {
  border-color: #7a6244;
}
.tea-home__name {
  color: #efe7da;
  font-size: 17px;
  font-weight: 500;
}
.tea-home__zh {
  color: #a99781;
  font-weight: 300;
  margin-left: 8px;
}
.tea-home__blurb {
  color: #a99781;
  font-size: 13px;
  line-height: 1.4;
}
</style>
