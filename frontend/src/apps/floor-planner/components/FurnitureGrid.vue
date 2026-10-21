<template>
  <div ref="root" class="furniture-grid" data-testid="furniture-grid">
    <p v-if="pieces.length === 0" class="furniture-grid__empty">
      No furniture yet. Add a piece to get started.
    </p>
    <div
      v-else
      class="furniture-grid__cells"
      :style="{ gridTemplateColumns: `repeat(${cols}, 1fr)` }"
    >
      <button
        v-for="p in shown"
        :key="p.id"
        type="button"
        class="furniture-grid__card"
        :data-testid="`grid-piece-${p.id}`"
        @click="emit('select', p.id)"
      >
        <span class="furniture-grid__thumb">
          <FurnitureShape :piece="p" :scale="1" :max-px="thumbPx" />
        </span>
        <span class="furniture-grid__name">{{ p.name }}</span>
        <span class="fp-mono furniture-grid__size">{{ sizeLabel(p) }}</span>
      </button>
    </div>
    <div
      v-if="pages > 1"
      class="furniture-grid__pager"
      data-testid="grid-pager"
    >
      <button
        type="button"
        class="fp-button"
        :disabled="page === 0"
        data-testid="grid-prev"
        @click="page--"
      >
        ‹
      </button>
      <span class="fp-mono">{{ page + 1 }} / {{ pages }}</span>
      <button
        type="button"
        class="fp-button"
        :disabled="page >= pages - 1"
        data-testid="grid-next"
        @click="page++"
      >
        ›
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import FurnitureShape from "./FurnitureShape.vue";
import { sizeLabel } from "../furniture";
import type { Furniture } from "../types";

const props = defineProps<{ pieces: Furniture[] }>();
const emit = defineEmits<{ select: [id: string] }>();

/** Smallest card, in px, and the gap between cards. */
const CARD = 150;
const GAP = 12;
const PAGER_PX = 48;

const root = ref<HTMLElement | null>(null);
const size = ref({ w: 0, h: 0 });
const page = ref(0);

let observer: ResizeObserver | undefined;
onMounted(() => {
  const el = root.value;
  if (!el || typeof ResizeObserver === "undefined") return;
  observer = new ResizeObserver(([entry]) => {
    size.value = {
      w: entry.contentRect.width,
      h: entry.contentRect.height,
    };
  });
  observer.observe(el);
});
onBeforeUnmount(() => observer?.disconnect());

const fit = (px: number): number =>
  Math.max(1, Math.floor((px + GAP) / (CARD + GAP)));

/** As many columns as fit the width, but no more than the pieces need. */
const cols = computed(() =>
  size.value.w > 0
    ? Math.min(fit(size.value.w), Math.max(1, props.pieces.length))
    : Math.ceil(Math.sqrt(props.pieces.length)) || 1,
);
/** Unmeasured (no layout yet), everything shows on one page. */
const perPage = computed(() =>
  size.value.h > 0
    ? cols.value * fit(size.value.h - PAGER_PX)
    : Math.max(props.pieces.length, 1),
);
const pages = computed(() => Math.ceil(props.pieces.length / perPage.value));
const shown = computed(() =>
  props.pieces.slice(
    page.value * perPage.value,
    (page.value + 1) * perPage.value,
  ),
);
const thumbPx = computed(() => (size.value.w > 0 ? CARD - 50 : 96));

watch(pages, (n) => {
  if (page.value >= n) page.value = Math.max(0, n - 1);
});
</script>

<style scoped lang="scss">
.furniture-grid {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: 100%;
  gap: 12px;
  padding: 16px;
}
.furniture-grid__cells {
  display: grid;
  flex: 1;
  grid-auto-rows: 1fr;
  gap: 12px;
  min-height: 0;
}
.furniture-grid__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.furniture-grid__empty {
  margin: 0;
  color: var(--fp-muted);
}
.furniture-grid__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 0;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  cursor: pointer;
}
.furniture-grid__card:hover {
  border-color: var(--fp-accent);
}
.furniture-grid__thumb {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100px;
}
.furniture-grid__name {
  max-width: 100%;
  overflow: hidden;
  font: 600 14px/1.2 var(--fp-sans);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.furniture-grid__size {
  font-size: 12px;
  color: #4a4843;
}
</style>
