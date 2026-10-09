<template>
  <div class="stepper" data-testid="stock-stepper">
    <p class="stepper__title">{{ cellName(resource, tier) }}</p>
    <div class="stepper__row">
      <button
        type="button"
        class="stepper__btn"
        data-testid="stepper-minus"
        :disabled="busy || count === 0"
        @click="emit('step', -1)"
      >
        −
      </button>
      <span class="stepper__count" data-testid="stepper-count">{{
        count
      }}</span>
      <button
        type="button"
        class="stepper__btn"
        data-testid="stepper-plus"
        :disabled="busy"
        @click="emit('step', 1)"
      >
        +
      </button>
    </div>
    <button
      type="button"
      class="stepper__close"
      data-testid="stepper-close"
      @click="emit('close')"
    >
      Done
    </button>
  </div>
</template>

<script setup lang="ts">
import { cellName } from "../resources";
import type { ResourceId, TierId } from "../types";

defineProps<{
  resource: ResourceId;
  tier: TierId;
  count: number;
  busy: boolean;
}>();
const emit = defineEmits<{ step: [delta: 1 | -1]; close: [] }>();
</script>

<style scoped lang="scss">
.stepper {
  padding: 16px;
  text-align: center;
}
.stepper__title {
  margin: 0 0 12px;
  font-size: 15px;
}
.stepper__row {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 24px;
}
.stepper__btn {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 0;
  font-size: 32px;
  cursor: pointer;
}
.stepper__btn:disabled {
  opacity: 0.35;
  cursor: default;
}
.stepper__count {
  min-width: 64px;
  font-size: 40px;
  font-variant-numeric: tabular-nums;
}
.stepper__close {
  margin-top: 16px;
  background: transparent;
  border: 0;
  font-size: 14px;
  cursor: pointer;
  color: inherit;
}
</style>
