<template>
  <button
    class="shot-button"
    :class="[`shot-button--v${value}`]"
    :disabled="disabled"
    :aria-label="value === 11 ? 'Shot value 11, bullseye' : `Shot value ${value}`"
    type="button"
    @click="emit('tap', value)"
  >
    <span class="shot-button__label">{{ value }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  value: 0 | 5 | 8 | 10 | 11;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  tap: [value: number];
}>();
</script>

<style scoped lang="sass">
.shot-button
  display: flex
  align-items: center
  justify-content: center
  height: 64px
  width: 100%
  border-radius: 8px
  border: none
  cursor: pointer
  background: #242424

  &:disabled
    cursor: not-allowed
    opacity: 0.4

  &:focus-visible
    outline: 2px solid #C8960A
    outline-offset: 2px

  // 0, 5, 8 → surface-card (default above)
  &--v10
    background: #1E1E1E

  &--v11
    background: #C8960A

.shot-button__label
  font-family: 'Roboto Mono', monospace
  font-weight: 700
  font-size: 20px
  color: #F0F0F0

  .shot-button:disabled &
    color: #4A4A4A
</style>
