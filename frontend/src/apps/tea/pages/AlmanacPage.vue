<template>
  <q-page class="almanac">
    <div class="almanac__scroll">
      <header class="almanac__header">
        <span class="almanac__title">Almanac</span>
        <span class="almanac__count" data-testid="almanac-count">{{
          countLabel
        }}</span>
      </header>

      <div class="almanac__filters">
        <select
          class="almanac__country"
          data-testid="almanac-country"
          aria-label="Filter by country"
          v-model="country"
        >
          <option value="">All countries</option>
          <option v-for="c in availableCountries" :key="c" :value="c">
            {{ c }}
          </option>
        </select>
        <input
          class="almanac__search"
          data-testid="almanac-search"
          type="search"
          placeholder="Search teas"
          v-model="q"
        />
      </div>

      <div
        v-if="almanac.error"
        class="almanac__error"
        data-testid="almanac-error"
      >
        {{ almanac.error }}
      </div>

      <p
        v-else-if="!almanac.loading && almanac.entries.length === 0"
        class="almanac__empty"
        data-testid="almanac-empty"
      >
        No teas match. Try a different search or country.
      </p>

      <ul v-else class="almanac__list">
        <li
          v-for="entry in almanac.entries"
          :key="entry.catalogue_node_id"
          class="almanac__row"
          data-testid="almanac-row"
          @click="open(entry.catalogue_node_id)"
        >
          <span class="almanac__row-name">
            {{ entry.name }}
            <span v-if="entry.name_zh" class="almanac__row-zh" lang="zh">{{
              entry.name_zh
            }}</span>
          </span>
          <span class="almanac__row-country">{{ entry.country }}</span>
          <p class="almanac__row-summary">{{ entry.summary }}</p>
        </li>
      </ul>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useTeaAlmanacStore } from "../stores/useTeaAlmanacStore";

const router = useRouter();
const almanac = useTeaAlmanacStore();

const country = ref("");
const q = ref("");
const availableCountries = ref<string[]>([]);

const countLabel = computed(() =>
  almanac.entries.length === 1 ? "1 tea" : `${almanac.entries.length} teas`,
);

function open(catalogueNodeId: string): void {
  void router.push({ name: "tea-almanac-entry", params: { catalogueNodeId } });
}

watch([country, q], ([c, query]) => {
  void almanac.fetchEntries(c, query);
});

onMounted(async () => {
  await almanac.fetchEntries();
  availableCountries.value = Array.from(
    new Set(almanac.entries.map((e) => e.country)),
  ).sort();
});
</script>

<style scoped lang="scss">
.almanac {
  background: #17120e;
  position: relative;
  min-height: 100%;
}
.almanac__scroll {
  height: 100%;
  overflow-y: auto;
}
.almanac__header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: linear-gradient(#17120e 76%, rgba(23, 18, 14, 0));
  padding: 20px 18px 12px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.almanac__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
}
.almanac__count {
  color: #6b5f52;
  font-size: 13px;
}
.almanac__filters {
  display: flex;
  gap: 10px;
  padding: 0 18px 16px;
}
.almanac__country,
.almanac__search {
  background: #1e1712;
  border: 1px solid #241e19;
  color: #efe7da;
  font-size: 13.5px;
  font-family: inherit;
  padding: 8px 10px;
  border-radius: 3px;
}
.almanac__country {
  flex: none;
}
.almanac__search {
  flex: 1;
  min-width: 0;
}
.almanac__empty,
.almanac__error {
  color: #8b7a63;
  font-size: 14.5px;
  padding: 0 18px;
}
.almanac__error {
  background: #1e1712;
  border-left: 2px solid #e4d9c6;
  color: #efe7da;
  margin: 0 18px;
  padding: 12px 14px;
}
.almanac__list {
  list-style: none;
  margin: 0;
  padding: 0 18px 24px;
}
.almanac__row {
  padding: 14px 0;
  border-bottom: 1px solid #241e19;
  cursor: pointer;
}
.almanac__row-name {
  color: #efe7da;
  font-size: 15px;
  font-weight: 500;
}
.almanac__row-zh {
  color: #a99781;
  font-weight: 300;
  margin-left: 8px;
}
.almanac__row-country {
  display: block;
  color: #7a6244;
  font-size: 12px;
  margin-top: 2px;
}
.almanac__row-summary {
  color: #a99781;
  font-size: 13px;
  line-height: 1.4;
  margin: 6px 0 0;
}
</style>
