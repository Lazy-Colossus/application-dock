<template>
  <!--
    A radiogroup rather than five toggles: the five stars are one value, and
    only one of them can be the answer. The clear-by-re-tap is the escape hatch
    (AC 1), announced on the star that currently holds the value.
  -->
  <span
    class="kc-rating"
    role="radiogroup"
    :aria-label="ariaLabel"
    :data-testid="testid"
  >
    <button
      v-for="star in 5"
      :key="star"
      type="button"
      class="kc-icon-btn kc-rating__star"
      role="radio"
      :aria-checked="star === modelValue"
      :aria-label="star === modelValue ? `Clear rating` : `Rate ${star} of 5`"
      :data-testid="`${testid}-${star}`"
      @click.stop="choose(star)"
    >
      <!--
        Ink and a SHAPE change — filled versus outlined — never moss and never a
        colour of its own, which is what every status mark in this app is bound
        by (UX-DR17).
      -->
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        :fill="star <= (modelValue ?? 0) ? 'currentColor' : 'none'"
        stroke="currentColor"
        :stroke-width="star <= (modelValue ?? 0) ? 0 : 1.5"
        aria-hidden="true"
      >
        <path
          d="M12 3.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L3.3 9.8l6.1-.7L12 3.5Z"
        />
      </svg>
    </button>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

/**
 * The 1-5 star rating (Story 2.7).
 *
 * Separate from the favourite, which wears the heart: a 5-star recipe need not
 * be a favourite and a favourite need not be rated. Neither is derived from the
 * other, so this component knows nothing about the flag.
 *
 * An unrated recipe renders five outlined stars and no count — the absence rule
 * (NFR-8), which forbids a placeholder implying the recipe is unfinished.
 */
const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    testid?: string;
  }>(),
  { testid: "rating" },
);

const emit = defineEmits<{ "update:modelValue": [rating: number | null] }>();

const ariaLabel = computed(() =>
  props.modelValue === null ? "Not rated" : `Rated ${props.modelValue} of 5`,
);

// Re-tapping the star that holds the value clears it, which is the only way
// back to unrated once a rating is set.
function choose(star: number): void {
  emit("update:modelValue", star === props.modelValue ? null : star);
}
</script>
