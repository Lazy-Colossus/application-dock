<template>
  <q-page class="cabinet">
    <div ref="scrollEl" class="cabinet__scroll">
      <header class="cabinet__header">
        <span class="cabinet__title">Cabinet</span>
        <div class="cabinet__header-right">
          <button
            class="cabinet__almanac"
            data-testid="cabinet-brew"
            aria-label="Open the brewing timer"
            @click="router.push({ name: 'tea-timer' })"
          >
            Brew
          </button>
          <button
            :class="[
              'cabinet__almanac',
              { 'cabinet__filters--on': filters.activeCount > 0 },
            ]"
            data-testid="cabinet-filters"
            @click="filtering = true"
          >
            {{
              filters.activeCount > 0
                ? `Filters · ${filters.activeCount}`
                : "Filters"
            }}
          </button>
          <button
            class="cabinet__almanac"
            data-testid="cabinet-almanac-link"
            aria-label="Open the Almanac"
            @click="openAlmanac"
          >
            Almanac
          </button>
          <span class="cabinet__count" data-testid="cabinet-count">{{
            countLabel
          }}</span>
        </div>
      </header>

      <div
        v-if="cabinet.error"
        class="cabinet__error"
        data-testid="cabinet-error"
      >
        {{ cabinet.error }}
      </div>

      <p
        v-else-if="!cabinet.loading && cabinet.teas.length === 0"
        class="cabinet__empty"
        data-testid="cabinet-empty"
      >
        Nothing on the shelf yet. Add the first tea.
      </p>

      <p
        v-else-if="sections.length === 0"
        class="cabinet__empty"
        data-testid="cabinet-no-match"
      >
        No teas match these filters.
        <button
          class="cabinet__clear"
          data-testid="cabinet-clear-filters"
          @click="filters.clear()"
        >
          Clear filters
        </button>
      </p>

      <div
        v-for="(section, index) in sections"
        :key="section.classId"
        :ref="(el) => setSectionEl(el as HTMLElement | null, index)"
      >
        <ShelfSection
          :section="section"
          :index="index"
          :active="index === activeIndex"
          :name-zh-for="nameZhFor"
          @open="openTea"
        />
      </div>
    </div>

    <CabinetFilters
      v-if="filtering"
      :teas="cabinet.teas"
      :nodes="catalogue.nodes"
      :country-for="countryFor"
      :match-count="visibleTeas.length"
      @close="filtering = false"
    />

    <button
      class="cabinet__add"
      data-testid="cabinet-add"
      aria-label="Add a tea"
      @click="addTea"
    >
      +
    </button>
  </q-page>
</template>

<script setup lang="ts">
import { computed, onBeforeUpdate, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import ShelfSection from "../components/ShelfSection.vue";
import { useTeaCabinetStore } from "../stores/useTeaCabinetStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { useTeaAlmanacStore } from "../stores/useTeaAlmanacStore";
import { useTeaCabinetFiltersStore } from "../stores/useTeaCabinetFiltersStore";
import CabinetFilters from "../components/CabinetFilters.vue";
import { matchesFilters } from "../filters";
import { useSectionInView } from "../composables/useSectionInView";
import { groupByClass } from "../shelf";
import { nearestAlmanacEntry, pathOf } from "../catalogue";
import { GROUND } from "../tokens";
import type { Tea } from "../types";

const router = useRouter();
const cabinet = useTeaCabinetStore();
const catalogue = useTeaCatalogueStore();
const almanac = useTeaAlmanacStore();
const filters = useTeaCabinetFiltersStore();
const filtering = ref(false);

const scrollEl = ref<HTMLElement | null>(null);
const sectionEls = ref<HTMLElement[]>([]);
const { activeIndex } = useSectionInView(scrollEl, sectionEls);

function countryFor(tea: Tea): string | null {
  return (
    nearestAlmanacEntry(catalogue.nodes, almanac.entries, tea.catalogue_node_id)
      ?.country ?? null
  );
}

const visibleTeas = computed(() =>
  cabinet.teas.filter((tea) =>
    matchesFilters(
      tea,
      filters.state,
      pathOf(catalogue.nodes, tea.catalogue_node_id).map((node) => node.id),
      countryFor(tea),
    ),
  ),
);
const sections = computed(() => groupByClass(visibleTeas.value));
const countLabel = computed(() => {
  const total = cabinet.teas.length;
  const noun = total === 1 ? "tea" : "teas";
  return visibleTeas.value.length === total
    ? `${total} ${noun}`
    : `${visibleTeas.value.length} of ${total} ${noun}`;
});

// Sections are keyed by class, so a deleted tea can remove a whole section
// and shift every later index. Clearing before each re-collection stops a
// stale entry from surviving under the wrong index (see useSectionInView).
onBeforeUpdate(() => {
  sectionEls.value = [];
});

function setSectionEl(el: HTMLElement | null, index: number): void {
  if (el) sectionEls.value[index] = el;
}

function nameZhFor(tea: Tea): string {
  const chain = pathOf(catalogue.nodes, tea.catalogue_node_id);
  return chain.length ? chain[chain.length - 1].name_zh : "";
}

function openTea(teaId: string): void {
  void router.push({ name: "tea-detail", params: { teaId } });
}

function addTea(): void {
  void router.push({ name: "tea-new" });
}

function openAlmanac(): void {
  void router.push({ name: "tea-almanac" });
}

onMounted(() => {
  void cabinet.fetchTeas();
  void catalogue.fetchNodes();
  void almanac.fetchEntries();
});
</script>

<style scoped lang="scss">
.cabinet {
  background: #17120e;
  position: relative;
  min-height: 100%;
}
.cabinet__scroll {
  height: 100%;
  overflow-y: auto;
  // Room to scroll the last shelf clear of the floating + button.
  padding-bottom: 80px;
}
.cabinet__header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: linear-gradient(#17120e 76%, rgba(23, 18, 14, 0));
  padding: 20px 18px 16px;
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.cabinet__title {
  color: #efe7da;
  font-size: 19px;
  font-weight: 500;
}
.cabinet__count {
  color: #6b5f52;
  font-size: 13px;
}
.cabinet__header-right {
  display: flex;
  align-items: baseline;
  gap: 14px;
}
.cabinet__almanac {
  background: transparent;
  border: 0;
  color: v-bind("GROUND.inkMuted");
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  padding: 0;
}
.cabinet__filters--on {
  color: v-bind("GROUND.inkHi");
}
.cabinet__clear {
  display: block;
  background: transparent;
  border: 0;
  color: v-bind("GROUND.inkHi");
  font-family: inherit;
  font-size: 14px;
  padding: 10px 0 0;
  cursor: pointer;
}
.cabinet__empty,
.cabinet__error {
  color: v-bind("GROUND.inkMuted");
  font-size: 14.5px;
  padding: 0 18px;
}
.cabinet__error {
  background: #1e1712;
  border-left: 2px solid #e4d9c6;
  color: #efe7da;
  margin: 0 18px;
  padding: 12px 14px;
}
.cabinet__add {
  position: fixed;
  // Above the shelf strips (z-index 2) and the sticky header, below the
  // filter sheet's scrim.
  z-index: 6;
  right: 18px;
  bottom: 18px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 0;
  // Bone, never a hue: colour in this app means a tea's liquor (DESIGN.md).
  background: #e4d9c6;
  color: #17120e;
  font-size: 28px;
  cursor: pointer;
}
</style>
