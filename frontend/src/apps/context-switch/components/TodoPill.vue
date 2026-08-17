<template>
  <div
    class="cs-pill"
    role="button"
    tabindex="0"
    :style="{ background: todo.color, color: textColor }"
    :data-testid="`pill-${todo.id}`"
    @click="emit('open')"
    @keyup.enter="emit('open')"
  >
    <!-- Every control here stops the click: the pill itself is the open-target,
         and a bubbled confirm would archive the todo *and* open its dialog. -->
    <div class="cs-pill-actions">
      <template v-if="confirming">
        <button
          type="button"
          class="cs-pill-action cs-pill-action--wide"
          aria-label="Confirm done"
          :data-testid="`pill-complete-confirm-${todo.id}`"
          @click.stop="complete"
        >
          Done?
        </button>
        <button
          type="button"
          class="cs-pill-action"
          aria-label="Cancel"
          :data-testid="`pill-complete-cancel-${todo.id}`"
          @click.stop="confirming = false"
        >
          ✕
        </button>
      </template>
      <button
        v-else
        type="button"
        class="cs-pill-action"
        :aria-label="`Complete ${todo.header}`"
        :data-testid="`pill-complete-${todo.id}`"
        @click.stop="confirming = true"
      >
        ✓
      </button>
    </div>

    <div class="cs-pill-header" data-testid="pill-header">
      {{ todo.header }}
    </div>
    <div
      v-if="latestUpdate"
      class="cs-pill-update"
      data-testid="pill-update-latest"
    >
      {{ latestUpdate.text }}
    </div>
    <div
      v-if="previousUpdate"
      class="cs-pill-update cs-pill-update--faded"
      data-testid="pill-update-previous"
    >
      {{ previousUpdate.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { readableTextColor } from "@/apps/context-switch/colors";
import type { Todo } from "@/apps/context-switch/types";

const props = defineProps<{ todo: Todo }>();

const emit = defineEmits<{ open: []; complete: [] }>();

// Quick complete confirms in place, mirroring the archive drawer's delete
// (Story 3.3). A recycled pill must never render mid-confirm.
const confirming = ref(false);
watch(
  () => props.todo.id,
  () => {
    confirming.value = false;
  },
);

function complete(): void {
  confirming.value = false;
  emit("complete");
}

const textColor = computed(() => readableTextColor(props.todo.color));

// Updates are stored oldest→newest, so the pill surfaces the last two, newest
// on top (Story 2.8). `previousUpdate` is null unless there are at least two.
const latestUpdate = computed(() => props.todo.updates.at(-1) ?? null);
const previousUpdate = computed(() =>
  props.todo.updates.length >= 2 ? (props.todo.updates.at(-2) ?? null) : null,
);
</script>

<style scoped lang="sass">
.cs-pill
  position: relative
  display: flex
  flex-direction: column
  gap: 6px
  height: 100%
  min-height: 120px
  padding: 16px 18px
  border-radius: 22px
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2)
  overflow: hidden
  cursor: pointer

// Sits in the pill's top-right without pushing the header around. `currentColor`
// keeps it readable on both light and dark pill colors.
.cs-pill-actions
  position: absolute
  top: 10px
  right: 12px
  display: flex
  gap: 4px

.cs-pill-action
  min-width: 26px
  height: 26px
  padding: 0 6px
  border: 1px solid currentColor
  border-radius: 13px
  background: transparent
  color: inherit
  font-size: 13px
  line-height: 1
  opacity: 0.55
  cursor: pointer

  &:hover,
  &:focus-visible
    opacity: 1

.cs-pill-action--wide
  padding: 0 10px

.cs-pill-header
  // Keeps the header clear of the overlaid complete control.
  padding-right: 34px
  font-size: 18px
  font-weight: 600
  line-height: 1.25

.cs-pill-update
  font-size: 14px
  line-height: 1.35
  overflow: hidden
  overflow-wrap: anywhere
  display: -webkit-box
  -webkit-line-clamp: 2
  -webkit-box-orient: vertical

.cs-pill-update--faded
  opacity: 0.5
  -webkit-line-clamp: 1
</style>
