<template>
  <div class="sheet" data-testid="finish-sheet">
    <p class="sheet__title">How was it?</p>
    <div class="finish__stars">
      <button
        v-for="n in 5"
        :key="n"
        :class="['finish__star', { 'finish__star--on': rating !== null && n <= rating }]"
        :data-testid="`finish-star-${n}`"
        :aria-label="`${n} star${n === 1 ? '' : 's'}`"
        @click="rating = rating === n ? null : n"
      >
        ★
      </button>
    </div>

    <label class="finish__label">
      Leaf used (g)
      <input
        class="sheet__field"
        data-testid="finish-grams"
        inputmode="decimal"
        :value="grams ?? ''"
        @input="onGrams"
      />
    </label>
    <p class="finish__preview" data-testid="finish-preview">{{ preview }}</p>

    <p v-if="error" class="sheet__error" data-testid="finish-error">{{ error }}</p>

    <button
      class="sheet__save"
      data-testid="finish-save"
      :disabled="saving"
      @click="emit('save', { rating, leafGrams: grams })"
    >
      {{ error ? "Try again" : "Save session" }}
    </button>
    <button class="sheet__cancel" data-testid="finish-cancel" @click="emit('cancel')">
      Keep brewing
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";

const props = defineProps<{
  teaName: string;
  gramsRemaining: number;
  leafGrams: number | null;
  saving: boolean;
  error: string | null;
}>();
const emit = defineEmits<{
  save: [payload: { rating: number | null; leafGrams: number | null }];
  cancel: [];
}>();

const rating = ref<number | null>(null);
const grams = ref<number | null>(props.leafGrams);

function onGrams(event: Event): void {
  const raw = (event.target as HTMLInputElement).value.trim();
  const parsed = Number(raw);
  grams.value = raw !== "" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const preview = computed(() => {
  if (grams.value === null) return "No leaf recorded — grams stay as they are";
  const after = Math.max(0, props.gramsRemaining - grams.value);
  return `−${grams.value} g from ${props.teaName} (${props.gramsRemaining} g → ${after} g)`;
});
</script>

<style scoped lang="scss">
@import "./timer-sheet.scss";

.finish__stars {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-bottom: 16px;
}
.finish__star {
  background: transparent;
  border: 0;
  font-size: 34px;
  color: #3b3026;
  cursor: pointer;
  padding: 4px;
}
.finish__star--on {
  color: #d9a45b;
}
.finish__label {
  display: block;
  color: #8b7a63;
  font-size: 12px;
}
.finish__preview {
  color: #8b7a63;
  font-size: 13px;
  margin: 0 0 14px;
}
</style>
