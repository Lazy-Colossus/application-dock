<template>
  <div class="sheet" data-testid="grams-sheet">
    <div class="sheet__grab"></div>
    <p class="sheet__title">How much is left?</p>

    <div class="sheet__stepper">
      <button
        class="sheet__step"
        data-testid="grams-minus"
        aria-label="One gram less"
        @click="step(-1)"
      >
        &minus;
      </button>
      <span class="sheet__value" data-testid="grams-value">{{ grams }}<i>g</i></span>
      <button
        class="sheet__step"
        data-testid="grams-plus"
        aria-label="One gram more"
        @click="step(1)"
      >
        +
      </button>
    </div>

    <p class="sheet__hint" data-testid="grams-hint">was {{ tea.grams_remaining }}g</p>

    <button class="sheet__save" data-testid="grams-save" @click="emit('save', grams)">
      Save
    </button>
    <button class="sheet__cancel" data-testid="grams-cancel" @click="emit('cancel')">
      Cancel
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { GROUND } from "../tokens";
import type { Tea } from "../types";

const props = defineProps<{ tea: Tea }>();
const emit = defineEmits<{ save: [grams: number]; cancel: [] }>();

const grams = ref(props.tea.grams_remaining);

/** Clamped here as well as on the server, so the ceiling is felt, not explained. */
function step(by: number): void {
  const next = grams.value + by;
  const ceiling = props.tea.grams_purchased;
  if (next < 0) return;
  if (ceiling !== null && ceiling > 0 && next > ceiling) return;
  grams.value = next;
}
</script>

<style scoped lang="scss">
.sheet {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 8;
  background: v-bind("GROUND.raised");
  border-top: 1px solid #33291f;
  border-radius: 14px 14px 0 0;
  padding: 16px 18px 24px;
  box-shadow: 0 -20px 40px rgba(0, 0, 0, 0.5);
}
.sheet__grab {
  width: 34px;
  height: 3px;
  background: #3b3026;
  border-radius: 2px;
  margin: 0 auto 16px;
}
.sheet__title {
  color: v-bind("GROUND.inkMuted");
  font-size: 13px;
  margin: 0 0 14px;
}
.sheet__stepper {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
}
// Steppers and Save/Cancel are interactive controls, so — unlike a tea's
// liquor colour — they stay bone/ink, never a hue (DESIGN.md: "colour
// anything that isn't a tea's liquor").
.sheet__step {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  border: 1px solid #3b3026;
  background: transparent;
  color: v-bind("GROUND.inkHi");
  font-size: 22px;
  cursor: pointer;
}
.sheet__value {
  color: v-bind("GROUND.inkHi");
  font-size: 40px;
  font-weight: 500;
  min-width: 96px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.sheet__value i {
  color: #7a6d5e;
  font-size: 16px;
  font-style: normal;
}
.sheet__hint {
  text-align: center;
  color: v-bind("GROUND.inkLo");
  font-size: 12.5px;
  margin: 8px 0 0;
}
.sheet__save {
  display: block;
  width: 100%;
  margin-top: 18px;
  background: v-bind("GROUND.ink");
  color: v-bind("GROUND.inkOnFill");
  border: 0;
  font-size: 15px;
  font-weight: 600;
  padding: 12px;
  border-radius: 3px;
  cursor: pointer;
}
.sheet__cancel {
  display: block;
  width: 100%;
  margin-top: 10px;
  background: transparent;
  border: 0;
  color: v-bind("GROUND.inkLo");
  font-size: 13.5px;
  cursor: pointer;
}
</style>
