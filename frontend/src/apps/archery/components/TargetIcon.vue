<template>
  <button
    class="target-icon"
    :class="{ 'target-icon--confirmed': confirmed }"
    :aria-label="`Target ${number}, ${confirmed ? 'confirmed' : 'not confirmed'}`"
    type="button"
    @click="emit('tap', number)"
  >
    <span class="target-icon__number">{{ number }}</span>
  </button>
</template>

<script setup lang="ts">
defineProps<{
  number: number;
  confirmed: boolean;
}>();

const emit = defineEmits<{
  tap: [n: number];
}>();
</script>

<style scoped lang="sass">
.target-icon
  display: flex
  align-items: center
  justify-content: center
  width: 56px
  height: 56px
  border-radius: 8px
  border: 1px solid #2A2A2A
  background: #242424
  cursor: pointer
  padding: 0

  &:focus-visible
    outline: 2px solid #C8960A
    outline-offset: 2px

  &--confirmed
    background: #2E7D32
    border: none

.target-icon__number
  font-family: 'Roboto Mono', monospace
  font-weight: 700
  font-size: 18px
  color: #8A8A8A
  line-height: 1

  .target-icon--confirmed &
    color: #A5D6A7
</style>
