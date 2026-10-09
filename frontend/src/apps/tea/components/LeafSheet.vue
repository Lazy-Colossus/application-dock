<template>
  <div class="sheet" data-testid="leaf-sheet">
    <p class="sheet__title">How much leaf in this brew?</p>
    <label class="leaf__label">
      Leaf (g)
      <input
        v-model="raw"
        class="sheet__field"
        data-testid="leaf-grams"
        inputmode="decimal"
        placeholder="not recorded"
      />
    </label>
    <button
      class="sheet__save"
      data-testid="leaf-save"
      @click="emit('save', parsed)"
    >
      Save
    </button>
    <button
      class="sheet__cancel"
      data-testid="leaf-cancel"
      @click="emit('cancel')"
    >
      Cancel
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{ leafGrams: number | null }>();
const emit = defineEmits<{ save: [grams: number | null]; cancel: [] }>();

const raw = ref(props.leafGrams === null ? "" : String(props.leafGrams));

// Commas too: phone keyboards in many locales only offer "," for decimals.
const parsed = computed(() => {
  const value = Number(raw.value.trim().replace(",", "."));
  return raw.value.trim() !== "" && Number.isFinite(value) && value > 0
    ? value
    : null;
});
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.leaf__label {
  display: block;
  color: #8b7a63;
  font-size: 12px;
}
</style>
