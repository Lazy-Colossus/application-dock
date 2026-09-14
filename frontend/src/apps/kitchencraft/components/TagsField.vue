<template>
  <div>
    <ul v-if="modelValue.length > 0" class="kc-chips" data-testid="tag-chips">
      <li v-for="tag in modelValue" :key="tag">
        <span class="kc-chip">
          {{ tag }}
          <button
            type="button"
            class="kc-icon-btn"
            :aria-label="`Remove tag ${tag}`"
            :data-testid="`remove-tag-${tag}`"
            @click="remove(tag)"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </span>
      </li>
    </ul>

    <div class="kc-group">
      <TypeaheadInput
        label="Tags"
        input-id="tags"
        :suggestions="suggestions"
        :exclude="modelValue"
        @commit="add"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import TypeaheadInput from "@/apps/kitchencraft/components/TypeaheadInput.vue";

/**
 * The free-tag input — the cook's own words for how they think about a recipe.
 *
 * It offers only tags (`suggestions` is the tag namespace) and never the
 * new-category row: a tag that matches nothing commits straight off Enter,
 * because a free tag needs no ceremony. Coining is a ceremony reserved for
 * ingredient categories, which are shared vocabulary the pantry filter depends
 * on.
 */
const props = defineProps<{
  modelValue: string[];
  suggestions: string[];
}>();

const emit = defineEmits<{ "update:modelValue": [tags: string[]] }>();

function add(value: string): void {
  // The server folds casing onto the existing vocabulary on save; this only has
  // to stop the same chip landing twice in one sitting.
  if (props.modelValue.some((tag) => tag.toLowerCase() === value.toLowerCase()))
    return;
  emit("update:modelValue", [...props.modelValue, value]);
}

function remove(tag: string): void {
  emit(
    "update:modelValue",
    props.modelValue.filter((t) => t !== tag),
  );
}
</script>
