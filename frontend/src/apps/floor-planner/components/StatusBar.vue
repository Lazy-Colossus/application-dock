<template>
  <div class="status-bar" data-testid="status-bar">
    <slot />
    <span>
      Cursor
      <span class="fp-mono status-bar__value" data-testid="status-cursor">{{
        cursor
      }}</span>
    </span>
    <span
      v-if="readout"
      class="fp-mono status-bar__value"
      data-testid="status-readout"
    >
      {{ readout }}
    </span>
    <span class="status-bar__spacer" />
    <span
      v-if="saveState"
      class="status-bar__save"
      role="status"
      data-testid="save-state"
    >
      {{ SAVE_TEXT[saveState] }}
    </span>
    <button
      v-if="saveState === 'unsaved'"
      type="button"
      class="fp-button fp-button--primary"
      data-testid="save"
      @click="emit('save')"
    >
      Save now
    </button>
    <span class="status-bar__zoom">
      <button
        type="button"
        class="status-bar__step"
        aria-label="Zoom out"
        :disabled="index === 0"
        data-testid="zoom-out"
        @click="emit('update:zoom', ZOOM_LEVELS[index - 1])"
      >
        −
      </button>
      <span class="fp-mono status-bar__value" data-testid="zoom"
        >{{ zoom * 100 }}%</span
      >
      <button
        type="button"
        class="status-bar__step"
        aria-label="Zoom in"
        :disabled="index === ZOOM_LEVELS.length - 1"
        data-testid="zoom-in"
        @click="emit('update:zoom', ZOOM_LEVELS[index + 1])"
      >
        +
      </button>
    </span>
    <span class="fp-mono">1 square = 20 cm</span>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { CELL_CM, ZOOM_LEVELS, type Cell } from "../grid";
import type { SaveState } from "../types";

const props = defineProps<{
  hover: Cell | null;
  readout: string | null;
  saveState: SaveState | null;
  zoom: number;
}>();

const emit = defineEmits<{
  save: [];
  "update:zoom": [zoom: number];
}>();

const SAVE_TEXT: Record<SaveState, string> = {
  saving: "Saving…",
  unsaved: "Unsaved",
  saved: "Saved",
};

const index = computed(() => ZOOM_LEVELS.indexOf(props.zoom));
const cursor = computed(() =>
  props.hover
    ? `${((props.hover.col * CELL_CM) / 100).toFixed(2)} m, ${((props.hover.row * CELL_CM) / 100).toFixed(2)} m`
    : "—",
);
</script>

<style scoped lang="scss">
.status-bar__save {
  color: var(--fp-muted);
}
.status-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  min-height: 44px;
  padding: 4px 16px;
  box-sizing: border-box;
  background: var(--fp-chrome);
  border-top: 1px solid var(--fp-line);
  font-size: 12px;
  color: #4a4843;
}
.status-bar__value {
  color: var(--fp-ink);
}
.status-bar__spacer {
  flex: 1;
}
.status-bar__zoom {
  display: flex;
  align-items: center;
  gap: 4px;
}
.status-bar__step {
  width: 32px;
  height: 32px;
  border: 1px solid var(--fp-control-line);
  border-radius: 6px;
  background: var(--fp-chrome);
  color: var(--fp-ink);
  font: 600 16px/1 var(--fp-sans);
  cursor: pointer;
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }
}
</style>
