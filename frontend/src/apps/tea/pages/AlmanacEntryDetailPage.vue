<template>
  <q-page class="tea-page">
    <header class="tea-page__bar">
      <button class="tea-page__back" @click="router.back()">← Almanac</button>
    </header>

    <p
      v-if="!entry && !almanac.loading"
      class="tea-page__missing"
      data-testid="almanac-entry-missing"
    >
      No almanac entry found for that tea.
    </p>

    <template v-if="entry">
      <p class="almanac-detail__country" data-testid="almanac-entry-country">
        {{ entry.country }}
      </p>
      <h1 class="tea-page__title" data-testid="almanac-entry-title">
        {{ entry.name }}
        <span v-if="entry.name_zh" class="tea-page__zh" lang="zh">{{
          entry.name_zh
        }}</span>
      </h1>
      <p
        v-if="entry.reading"
        class="almanac-detail__reading"
        data-testid="almanac-entry-reading"
      >
        {{ entry.reading }}
      </p>

      <p class="almanac-detail__summary" data-testid="almanac-entry-summary">
        {{ entry.summary }}
      </p>

      <section class="almanac-detail__brewing">
        <h2 class="almanac-detail__heading">Suggested brewing</h2>
        <dl class="almanac-detail__params">
          <dt>Leaf</dt>
          <dd data-testid="almanac-entry-grams">{{ gramsLabel }}</dd>
          <dt>Water</dt>
          <dd data-testid="almanac-entry-temp">{{ tempLabel }}</dd>
          <dt>Infusions</dt>
          <dd data-testid="almanac-entry-steeps">{{ steepsLabel }}</dd>
        </dl>
      </section>
    </template>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useTeaAlmanacStore } from "../stores/useTeaAlmanacStore";

const route = useRoute();
const router = useRouter();
const almanac = useTeaAlmanacStore();

const catalogueNodeId = computed(() => String(route.params.catalogueNodeId));
const entry = computed(
  () =>
    almanac.entries.find(
      (e) => e.catalogue_node_id === catalogueNodeId.value,
    ) ?? null,
);

const gramsLabel = computed(() => {
  const grams = entry.value?.brewing.leaf_grams ?? null;
  return grams !== null ? `${grams}g` : "Not recorded";
});
const tempLabel = computed(() => {
  const temp = entry.value?.brewing.water_temp_c ?? null;
  return temp !== null ? `${temp}°C` : "Not recorded";
});
const steepsLabel = computed(() => {
  const seconds = entry.value?.brewing.steep_seconds ?? [];
  return seconds.length === 0
    ? "Not recorded"
    : seconds.map((s) => `${s}s`).join(", ");
});

onMounted(() => {
  if (almanac.entries.length === 0) void almanac.fetchEntries();
});
</script>

<style scoped lang="scss">
@import "./tea-page.scss";

.almanac-detail__country {
  color: #7a6244;
  font-size: 12px;
  padding: 0 18px;
  margin: 16px 0 0;
}
.almanac-detail__reading {
  color: #a99781;
  font-size: 14px;
  padding: 0 18px;
  margin: 4px 0 0;
  font-style: italic;
}
.almanac-detail__summary {
  color: #e4d9c6;
  font-size: 14.5px;
  line-height: 1.5;
  padding: 16px 18px 0;
  margin: 0;
}
.almanac-detail__brewing {
  padding: 22px 18px 0;
}
.almanac-detail__heading {
  color: #efe7da;
  font-size: 14px;
  font-weight: 500;
  margin: 0 0 10px;
}
.almanac-detail__params {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 14px;
  margin: 0;
}
.almanac-detail__params dt {
  color: #8b7a63;
  font-size: 13px;
}
.almanac-detail__params dd {
  color: #efe7da;
  font-size: 13px;
  margin: 0;
}
</style>
