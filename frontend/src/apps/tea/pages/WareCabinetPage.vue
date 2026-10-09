<template>
  <q-page class="ware">
    <div class="ware__scroll">
      <header class="ware__header">
        <span class="ware__title">Teaware</span>
        <div class="ware__header-right">
          <button
            :class="['ware__link', { 'ware__link--on': filters.activeCount > 0 }]"
            data-testid="ware-filters"
            @click="filtering = true"
          >
            {{ filters.activeCount > 0 ? `Filters · ${filters.activeCount}` : "Filters" }}
          </button>
          <span class="ware__count" data-testid="ware-count">{{ countLabel }}</span>
        </div>
      </header>

      <div v-if="teaware.error" class="ware__error" data-testid="ware-error">
        {{ teaware.error }}
      </div>
      <p
        v-else-if="!teaware.loading && teaware.items.length === 0"
        class="ware__empty"
        data-testid="ware-empty"
      >
        No teaware yet. Add your first gaiwan or pot.
      </p>
      <p
        v-else-if="!teaware.loading && sections.length === 0"
        class="ware__empty"
        data-testid="ware-no-match"
      >
        Nothing matches these filters.
        <button class="ware__clear" data-testid="ware-clear-filters" @click="filters.clear()">
          Clear filters
        </button>
      </p>

      <WareSection
        v-for="section in sections"
        :key="section.type"
        :section="section"
        @open="openItem"
      />
    </div>

    <WareFilters
      v-if="filtering"
      :items="teaware.items"
      :match-count="visible.length"
      @close="filtering = false"
    />

    <button
      class="ware__add"
      data-testid="ware-add"
      aria-label="Add teaware"
      @click="router.push({ name: 'tea-ware-new' })"
    >
      +
    </button>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import WareSection from "../components/WareSection.vue";
import WareFilters from "../components/WareFilters.vue";
import { useTeawareStore } from "../stores/useTeawareStore";
import { useTeawareFiltersStore } from "../stores/useTeawareFiltersStore";
import { groupByType, matchesWareFilters } from "../ware";

const router = useRouter();
const teaware = useTeawareStore();
const filters = useTeawareFiltersStore();
const filtering = ref(false);

const visible = computed(() =>
  teaware.items.filter((item) => matchesWareFilters(item, filters.state)),
);
const sections = computed(() => groupByType(visible.value));
// Counted against what the shelf would show unfiltered, so hidden retired pieces
// don't read as "3 of 4" by default.
const countLabel = computed(() => {
  const base = filters.showRetired
    ? teaware.items.length
    : teaware.items.filter((item) => item.retired_at === null).length;
  const noun = base === 1 ? "piece" : "pieces";
  return visible.value.length === base
    ? `${base} ${noun}`
    : `${visible.value.length} of ${base} ${noun}`;
});

function openItem(wareId: string): void {
  void router.push({ name: "tea-ware-detail", params: { wareId } });
}

onMounted(() => {
  void teaware.fetchItems();
});
</script>

<style scoped lang="scss">
.ware {
  background: #17120e;
  position: relative;
  min-height: 100%;
}
.ware__scroll {
  padding-bottom: 80px;
}
.ware__header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: linear-gradient(#17120e 76%, rgba(23, 18, 14, 0));
  padding: 20px 18px 16px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.ware__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
}
.ware__header-right {
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.ware__link {
  background: transparent;
  border: 0;
  color: #8b7a63;
  font-family: inherit;
  font-size: 13px;
  padding: 0;
  cursor: pointer;
}
.ware__link--on {
  color: #efe7da;
}
.ware__count {
  color: #6b5f52;
  font-size: 13px;
}
.ware__empty {
  color: #8b7a63;
  font-size: 14.5px;
  padding: 0 18px;
}
.ware__error {
  background: #1e1712;
  border-left: 2px solid #e4d9c6;
  color: #efe7da;
  margin: 0 18px;
  padding: 12px 14px;
}
.ware__clear {
  display: block;
  background: transparent;
  border: 0;
  color: #efe7da;
  font-family: inherit;
  font-size: 14px;
  padding: 10px 0 0;
  cursor: pointer;
}
.ware__add {
  position: fixed;
  z-index: 6;
  right: 18px;
  bottom: 18px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 0;
  background: #e4d9c6;
  color: #17120e;
  font-size: 28px;
  cursor: pointer;
}
</style>
