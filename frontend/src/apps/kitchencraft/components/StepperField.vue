<template>
  <!--
    The field stays typeable: the buttons are the quick way to 4, not the only
    one, and an empty field is a recipe that simply doesn't say.
  -->
  <div class="kc-stepper">
    <button
      type="button"
      class="kc-icon-btn kc-stepper__btn"
      :aria-label="`Fewer ${noun}`"
      :disabled="current === null || current <= min"
      :data-testid="`${testid}-down`"
      @click="step(-1)"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M5 12h14" />
      </svg>
    </button>
    <input
      :id="id"
      :value="modelValue"
      type="text"
      inputmode="numeric"
      class="kc-field kc-stepper__field"
      :class="{ 'kc-field--error': invalid }"
      autocomplete="off"
      :aria-invalid="invalid"
      :aria-describedby="describedby"
      :data-testid="testid"
      @input="
        emit('update:modelValue', ($event.target as HTMLInputElement).value)
      "
    />
    <button
      type="button"
      class="kc-icon-btn kc-stepper__btn"
      :aria-label="`More ${noun}`"
      :data-testid="`${testid}-up`"
      @click="step(1)"
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M5 12h14M12 5v14" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * A whole-number field with − and + either side, held as text so a typed value
 * that isn't a number yet is shown as typed rather than rewritten.
 */
const props = withDefaults(
  defineProps<{
    modelValue: string;
    id: string;
    testid: string;
    /** Plural, for the buttons' names: "Fewer servings". */
    noun: string;
    min?: number;
    invalid?: boolean;
    describedby?: string;
  }>(),
  { min: 1, invalid: false, describedby: undefined },
);

const emit = defineEmits<{ "update:modelValue": [value: string] }>();

const current = computed(() => {
  const trimmed = props.modelValue.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : null;
});

// From empty or unreadable, + starts at the floor rather than guessing.
function step(by: number): void {
  const next = current.value === null ? props.min : current.value + by;
  emit("update:modelValue", String(Math.max(props.min, next)));
}
</script>
