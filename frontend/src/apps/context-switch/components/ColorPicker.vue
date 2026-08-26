<template>
  <div class="cs-color-picker" data-testid="color-picker">
    <div class="cs-swatches">
      <button
        v-for="preset in PRESET_COLORS"
        :key="preset"
        type="button"
        class="cs-swatch"
        :class="{ 'cs-swatch--on': isSelected(preset) }"
        :style="{ background: preset }"
        :aria-label="`Color ${preset}`"
        :aria-pressed="isSelected(preset)"
        :data-testid="`swatch-${preset.slice(1)}`"
        @click="emit('update:modelValue', preset)"
      />
    </div>

    <label class="cs-custom">
      <span class="cs-custom-label">Custom</span>
      <input
        type="color"
        class="cs-custom-input"
        :value="modelValue"
        data-testid="custom-color"
        @input="onCustom"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { PRESET_COLORS } from "@/apps/context-switch/colors";

const props = defineProps<{ modelValue: string }>();

const emit = defineEmits<{ "update:modelValue": [hex: string] }>();

function isSelected(preset: string): boolean {
  return props.modelValue.toLowerCase() === preset.toLowerCase();
}

function onCustom(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<style scoped lang="sass">
.cs-color-picker
  display: flex
  flex-direction: column
  gap: 10px

.cs-swatches
  display: flex
  flex-wrap: wrap
  gap: 8px

.cs-swatch
  width: 28px
  height: 28px
  border-radius: 50%
  border: 2px solid transparent
  outline: 1px solid rgba(255, 255, 255, 0.18)
  cursor: pointer
  padding: 0

.cs-swatch--on
  border-color: #C8960A
  transform: scale(1.12)

.cs-custom
  display: flex
  align-items: center
  gap: 8px

.cs-custom-label
  font-size: 13px
  color: #8A8A8A

.cs-custom-input
  width: 42px
  height: 28px
  padding: 0
  border: 1px solid rgba(255, 255, 255, 0.2)
  border-radius: 6px
  background: none
  cursor: pointer
</style>
