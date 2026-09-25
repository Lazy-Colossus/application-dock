<template>
  <q-page class="cabinet">
    <div ref="scrollEl" class="cabinet__scroll">
      <header class="cabinet__header">
        <span class="cabinet__title">Cabinet</span>
        <span class="cabinet__count" data-testid="cabinet-count">{{ countLabel }}</span>
      </header>

      <div v-if="cabinet.error" class="cabinet__error" data-testid="cabinet-error">
        {{ cabinet.error }}
      </div>

      <p
        v-else-if="!cabinet.loading && sections.length === 0"
        class="cabinet__empty"
        data-testid="cabinet-empty"
      >
        Nothing on the shelf yet. Add the first tea.
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
          :path-for="pathFor"
          :name-zh-for="nameZhFor"
          @open="openTea"
          @edit-grams="editGrams"
        />
      </div>
    </div>

    <button class="cabinet__add" data-testid="cabinet-add" aria-label="Add a tea" @click="addTea">
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
import { useSectionInView } from "../composables/useSectionInView";
import { groupByClass } from "../shelf";
import { pathOf } from "../catalogue";
import { GROUND } from "../tokens";
import type { Tea } from "../types";

const router = useRouter();
const cabinet = useTeaCabinetStore();
const catalogue = useTeaCatalogueStore();

const scrollEl = ref<HTMLElement | null>(null);
const sectionEls = ref<HTMLElement[]>([]);
const { activeIndex } = useSectionInView(scrollEl, sectionEls);

const sections = computed(() => groupByClass(cabinet.teas));
const countLabel = computed(() =>
  cabinet.teas.length === 1 ? "1 tea" : `${cabinet.teas.length} teas`,
);

// Sections are keyed by class, so a deleted tea can remove a whole section
// and shift every later index. Clearing before each re-collection stops a
// stale entry from surviving under the wrong index (see useSectionInView).
onBeforeUpdate(() => {
  sectionEls.value = [];
});

function setSectionEl(el: HTMLElement | null, index: number): void {
  if (el) sectionEls.value[index] = el;
}

/** The deepest-but-one label: "Wuyi yancha" under the name "Da Hong Pao". */
function pathFor(tea: Tea): string {
  const chain = pathOf(catalogue.nodes, tea.catalogue_node_id);
  if (chain.length <= 1) return tea.origin;
  return chain[chain.length - 2].name;
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

const editingTeaId = ref<string | null>(null);
function editGrams(teaId: string): void {
  editingTeaId.value = teaId;
}
defineExpose({ editingTeaId });

onMounted(() => {
  void cabinet.fetchTeas();
  void catalogue.fetchNodes();
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
