<template>
  <div ref="root" class="kc-tags">
    <span class="kc-label">Tags</span>
    <ul class="kc-chips">
      <li v-for="tag in modelValue" :key="tag" data-testid="tag-chip">
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
      <!--
        Adding is at the end of the list it adds to, and costs no space until
        it is wanted: a recipe with three tags shows three tags and a +.
      -->
      <li>
        <button
          ref="opener"
          type="button"
          class="kc-chip kc-chip--control kc-tags__open"
          :class="{ 'kc-chip--on': adding }"
          aria-label="Add a tag"
          :aria-expanded="adding"
          data-testid="tags-open"
          @click="adding ? close() : open()"
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
            <path d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </li>
    </ul>

    <div v-if="adding" class="kc-tags__pop" data-testid="tags-pop">
      <TypeaheadInput
        ref="typeahead"
        label="New tag"
        input-id="tags"
        :suggestions="suggestions"
        :exclude="modelValue"
        persistent
        hide-label
        @commit="add"
        @dismiss="close(true)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import TypeaheadInput from "@/apps/kitchencraft/components/TypeaheadInput.vue";

/**
 * The free-tag input — the cook's own words for how they think about a recipe.
 *
 * The chips are the field; a + at their end opens a pop-over with the input on
 * top and the cook's own tags beneath it. It stays open across picks so a run
 * of tags is one visit, and closes on Escape, a second tap of the +, or a tap
 * anywhere outside it. A tag that matches nothing commits straight off Enter:
 * a free tag needs no ceremony.
 */
const props = defineProps<{
  modelValue: string[];
  suggestions: string[];
}>();

const emit = defineEmits<{ "update:modelValue": [tags: string[]] }>();

const adding = ref(false);
const root = ref<HTMLElement | null>(null);
const opener = ref<HTMLButtonElement | null>(null);
const typeahead = ref<InstanceType<typeof TypeaheadInput> | null>(null);

function onOutside(event: PointerEvent): void {
  if (!root.value?.contains(event.target as Node)) close();
}

async function open(): Promise<void> {
  adding.value = true;
  document.addEventListener("pointerdown", onOutside);
  await nextTick();
  typeahead.value?.focus();
}

/** `refocus` hands the keyboard back to the + after an Escape. */
function close(refocus = false): void {
  adding.value = false;
  document.removeEventListener("pointerdown", onOutside);
  if (refocus) opener.value?.focus();
}

onBeforeUnmount(() => document.removeEventListener("pointerdown", onOutside));

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
