<template>
  <nav ref="railEl" class="rail" aria-label="Chapters">
    <button
      v-for="(chapter, index) in chapters"
      :key="chapter.key"
      :class="[
        'rail__chip',
        {
          'rail__chip--zh': chapter.classId,
          'rail__chip--on': index === active,
        },
      ]"
      :style="chipStyle(chapter, index === active)"
      :aria-label="chapter.label"
      :aria-current="index === active ? 'true' : undefined"
      :lang="chapter.classId ? 'zh' : undefined"
      data-testid="almanac-chip"
      @click="emit('jump', index)"
    >
      {{ chapter.classId ? chapter.labelZh.charAt(0) : chapter.label }}
    </button>
  </nav>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from "vue";
import { CLASS_TOKENS, GROUND } from "../tokens";
import type { AlmanacChapter } from "../almanac";

const props = defineProps<{ chapters: AlmanacChapter[]; active: number }>();
const emit = defineEmits<{ jump: [index: number] }>();

const railEl = ref<HTMLElement | null>(null);

function chipStyle(
  chapter: AlmanacChapter,
  on: boolean,
): Record<string, string> {
  const tokens = chapter.classId ? CLASS_TOKENS[chapter.classId] : null;
  if (on) {
    return {
      background: tokens?.liquor ?? GROUND.ink,
      color: GROUND.inkOnFill,
    };
  }
  return { color: tokens?.head ?? GROUND.inkMuted };
}

// Seventeen countries overflow a phone's width; keep the current one in sight.
// The rail scrolls itself — scrollIntoView would also scroll the page and cut
// short the jump that moved the active chapter in the first place.
watch(
  () => props.active,
  async (index) => {
    await nextTick();
    const rail = railEl.value;
    const chip = rail?.children[index] as HTMLElement | undefined;
    if (!rail || !chip) return;
    rail.scrollTo?.({
      left: chip.offsetLeft - (rail.clientWidth - chip.offsetWidth) / 2,
      behavior: "smooth",
    });
  },
);
</script>

<style scoped lang="scss">
.rail {
  position: relative;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 0 18px 12px;
}
.rail::-webkit-scrollbar {
  display: none;
}
.rail__chip {
  flex: none;
  background: #1e1712;
  border: 1px solid #241e19;
  border-radius: 14px;
  font-family: inherit;
  font-size: 12.5px;
  padding: 5px 11px;
  cursor: pointer;
  white-space: nowrap;
}
.rail__chip--zh {
  font-size: 14px;
  padding: 4px 10px;
}
.rail__chip--on {
  border-color: transparent;
  font-weight: 500;
}
</style>
