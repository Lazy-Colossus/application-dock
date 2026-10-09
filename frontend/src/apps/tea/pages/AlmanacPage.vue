<template>
  <q-page class="almanac" :style-fn="fillViewport">
    <div ref="scrollEl" class="almanac__scroll">
      <div class="almanac__controls">
        <div class="almanac__views" role="group" aria-label="Browse by">
          <button
            v-for="option in VIEWS"
            :key="option.view"
            :class="[
              'almanac__view',
              { 'almanac__view--on': almanac.view === option.view },
            ]"
            :aria-pressed="almanac.view === option.view ? 'true' : 'false'"
            :data-testid="`almanac-view-${option.view}`"
            @click="setView(option.view)"
          >
            {{ option.label }}
          </button>
        </div>
        <span class="almanac__count" data-testid="almanac-count">{{
          countLabel
        }}</span>
        <button
          class="almanac__random"
          data-testid="almanac-random"
          :disabled="almanac.entries.length === 0"
          @click="openRandom"
        >
          ⁂ At random
        </button>
      </div>

      <div class="almanac__search-row">
        <input
          class="almanac__search"
          data-testid="almanac-search"
          type="search"
          placeholder="Search teas"
          aria-label="Search teas"
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
        No teas match. Try a different search.
      </p>

      <template v-else>
        <div ref="railWrapEl" class="almanac__rail">
          <AlmanacRail
            :chapters="chapters"
            :active="activeIndex"
            @jump="jumpTo"
          />
        </div>

        <section
          v-for="(chapter, index) in chapters"
          :key="`${almanac.view}:${chapter.key}`"
          :ref="(el) => setChapterEl(el as HTMLElement | null, index)"
          class="almanac__chapter"
          data-testid="almanac-chapter"
        >
          <header class="almanac__chapter-head">
            <span
              class="almanac__chapter-name"
              :style="{ color: headColor(chapter.classId) }"
              data-testid="almanac-chapter-name"
              >{{ chapter.label }}</span
            >
            <span
              v-if="chapter.labelZh && chapter.classId"
              class="almanac__chapter-zh"
              :style="{ color: CLASS_TOKENS[chapter.classId].zh }"
              lang="zh"
              >{{ chapter.labelZh }}</span
            >
            <span class="almanac__chapter-count">{{ chapter.count }}</span>
          </header>

          <div v-for="group in chapter.groups" :key="group.key">
            <h3 class="almanac__group">
              <span
                v-if="group.classId"
                class="almanac__dot"
                :style="{ background: CLASS_TOKENS[group.classId].liquor }"
              />
              <span
                :style="
                  group.classId
                    ? { color: CLASS_TOKENS[group.classId].head }
                    : undefined
                "
                data-testid="almanac-group-name"
                >{{ group.label }}</span
              >
            </h3>
            <ul class="almanac__list">
              <li
                v-for="entry in group.entries"
                :key="entry.catalogue_node_id"
                class="almanac__row"
                data-testid="almanac-row"
                @click="open(entry.catalogue_node_id)"
              >
                <span class="almanac__row-name">
                  {{ entry.name }}
                  <span
                    v-if="entry.name_zh"
                    class="almanac__row-zh"
                    lang="zh"
                    >{{ entry.name_zh }}</span
                  >
                </span>
                <p class="almanac__row-summary">{{ entry.summary }}</p>
              </li>
            </ul>
          </div>
        </section>
      </template>
    </div>
  </q-page>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUpdate, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AlmanacRail from "../components/AlmanacRail.vue";
import { useTeaAlmanacStore } from "../stores/useTeaAlmanacStore";
import { useTeaCatalogueStore } from "../stores/useTeaCatalogueStore";
import { useSectionInView } from "../composables/useSectionInView";
import {
  chapterAt,
  groupAlmanac,
  pickRandom,
  type AlmanacView,
} from "../almanac";
import { CLASS_TOKENS, GROUND } from "../tokens";
import type { TeaClass } from "../types";

const VIEWS: { view: AlmanacView; label: string }[] = [
  { view: "class", label: "Class" },
  { view: "place", label: "Place" },
];

const router = useRouter();
const almanac = useTeaAlmanacStore();
const catalogue = useTeaCatalogueStore();

const q = ref("");
const scrollEl = ref<HTMLElement | null>(null);
const railWrapEl = ref<HTMLElement | null>(null);
const chapterEls = ref<HTMLElement[]>([]);
const { activeIndex, measure } = useSectionInView(
  scrollEl,
  chapterEls,
  (container, els) =>
    chapterAt(
      els.map((el) =>
        el && el.isConnected ? el.offsetTop : Number.POSITIVE_INFINITY,
      ),
      // +1 so the chapter a jump just parked under the rail counts as reached.
      container.scrollTop + (railWrapEl.value?.offsetHeight ?? 0) + 1,
    ),
);

const chapters = computed(() =>
  groupAlmanac(almanac.entries, catalogue.nodes, almanac.view),
);

const countLabel = computed(() =>
  almanac.entries.length === 1 ? "1 tea" : `${almanac.entries.length} teas`,
);

function headColor(classId: TeaClass | null): string {
  return classId ? CLASS_TOKENS[classId].head : GROUND.inkHi;
}

// Chapters are re-keyed on every view switch and search, so a stale element
// must not survive under an index it no longer owns (see useSectionInView).
onBeforeUpdate(() => {
  chapterEls.value = [];
});

function setChapterEl(el: HTMLElement | null, index: number): void {
  if (el) chapterEls.value[index] = el;
}

// A definite height, as on the Cabinet: only then does the page scroll
// inside .almanac__scroll, which is what the rail listens to.
function fillViewport(offset: number): Record<string, string> {
  return { height: offset ? `calc(100vh - ${offset}px)` : "100vh" };
}

function jumpTo(index: number): void {
  const target = chapterEls.value[index];
  if (!target) return;
  const railHeight = railWrapEl.value?.offsetHeight ?? 0;
  scrollEl.value?.scrollTo?.({
    top: target.offsetTop - railHeight,
    behavior: "smooth",
  });
}

async function setView(view: AlmanacView): Promise<void> {
  if (almanac.view === view) return;
  almanac.view = view;
  await nextTick();
  measure();
}

function open(catalogueNodeId: string): void {
  void router.push({ name: "tea-almanac-entry", params: { catalogueNodeId } });
}

function openRandom(): void {
  const picked = pickRandom(almanac.entries);
  if (picked) open(picked.catalogue_node_id);
}

watch(q, async (query) => {
  await almanac.fetchEntries("", query);
  await nextTick();
  measure();
});

onMounted(async () => {
  await Promise.all([almanac.fetchEntries(), catalogue.fetchNodes()]);
  await nextTick();
  measure();
});
</script>

<style scoped lang="scss">
.almanac {
  background: #17120e;
  position: relative;
}
.almanac__scroll {
  position: relative;
  height: 100%;
  overflow-y: auto;
}
.almanac__controls {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 18px 10px;
}
.almanac__count {
  margin-left: auto;
  color: #6b5f52;
  font-size: 13px;
}
.almanac__views {
  display: flex;
  background: #1e1712;
  border: 1px solid #241e19;
  border-radius: 3px;
  padding: 2px;
}
.almanac__view {
  background: none;
  border: 0;
  border-radius: 2px;
  color: #8b7a63;
  font-family: inherit;
  font-size: 13px;
  padding: 5px 14px;
  cursor: pointer;
}
.almanac__view--on {
  background: #2c241d;
  color: #efe7da;
}
.almanac__random {
  background: none;
  border: 0;
  color: #c7a271;
  font-family: inherit;
  font-size: 13px;
  padding: 6px 0;
  cursor: pointer;
}
.almanac__random:disabled {
  color: #574d43;
  cursor: default;
}
.almanac__search-row {
  padding: 0 18px 14px;
}
.almanac__search {
  width: 100%;
  background: #1e1712;
  border: 1px solid #241e19;
  color: #efe7da;
  font-size: 13.5px;
  font-family: inherit;
  padding: 8px 10px;
  border-radius: 3px;
}
.almanac__rail {
  position: sticky;
  top: 0;
  z-index: 5;
  padding-top: 8px;
  background: linear-gradient(#17120e 82%, rgba(23, 18, 14, 0));
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
.almanac__chapter {
  padding: 14px 18px 18px;
}
// Room for the last chapter to reach the rail (~51px), so a jump can land there.
.almanac__chapter:last-child {
  min-height: calc(100% - 48px);
}
.almanac__chapter-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-bottom: 8px;
  border-bottom: 1px solid #2c241d;
}
.almanac__chapter-name {
  font-size: 21px;
  font-weight: 500;
}
.almanac__chapter-zh {
  font-size: 15px;
  font-weight: 300;
}
.almanac__chapter-count {
  margin-left: auto;
  color: #6b5f52;
  font-size: 12.5px;
}
.almanac__group {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 18px 0 2px;
  color: #8b7a63;
  font-size: 11.5px;
  font-weight: 500;
  letter-spacing: 0.09em;
  line-height: 1.4;
  text-transform: uppercase;
}
.almanac__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.almanac__list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.almanac__row {
  padding: 12px 0;
  border-bottom: 1px solid #241e19;
  cursor: pointer;
}
.almanac__row:last-child {
  border-bottom: 0;
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
.almanac__row-summary {
  color: #a99781;
  font-size: 13px;
  line-height: 1.4;
  margin: 5px 0 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
}
</style>
