<template>
  <div class="stars" role="group" :aria-label="label">
    <button
      v-for="n in 5"
      :key="n"
      type="button"
      :class="['stars__star', { 'stars__star--on': modelValue !== null && n <= modelValue }]"
      :aria-label="`${n} of 5`"
      :aria-pressed="modelValue === n ? 'true' : 'false'"
      :data-testid="`${testid}-${n}`"
      @click="emit('update:modelValue', modelValue === n ? null : n)"
    >
      ★
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ modelValue: number | null; label: string; testid: string }>();
const emit = defineEmits<{ "update:modelValue": [value: number | null] }>();
</script>

<style scoped lang="scss">
.stars {
  display: flex;
  gap: 2px;
}
.stars__star {
  background: transparent;
  border: 0;
  color: #574d43;
  font-size: 24px;
  line-height: 1;
  padding: 4px;
  cursor: pointer;
}
.stars__star--on {
  color: #e4d9c6;
}
</style>
