<template>
  <div class="lib-actions">
    <button
      class="lib-actions__btn"
      aria-label="Library actions"
      aria-haspopup="menu"
      :aria-expanded="open"
      data-testid="library-actions"
      @click="open = !open"
    >
      <q-icon name="more_vert" size="20px" />
    </button>

    <template v-if="open">
      <div class="lib-actions__backdrop" @click="open = false" />
      <div class="lib-actions__menu column" role="menu">
        <!-- Entry point: turn on multi-select. -->
        <button
          v-if="!selectMode"
          class="lib-actions__item"
          role="menuitem"
          data-testid="action-select"
          @click="choose('select')"
        >
          <q-icon name="checklist" size="16px" />
          Select words
        </button>

        <!-- In select mode: the bulk actions for the current selection. -->
        <template v-else>
          <div class="lib-actions__count">{{ count }} selected</div>
          <button
            class="lib-actions__item"
            role="menuitem"
            :disabled="count === 0"
            data-testid="bulk-add-topic"
            @click="choose('add-topic')"
          >
            <q-icon name="sell" size="16px" />
            Add to topic
          </button>
          <button
            v-if="inTopic"
            class="lib-actions__item"
            role="menuitem"
            :disabled="count === 0"
            data-testid="bulk-remove-topic"
            @click="choose('remove-topic')"
          >
            <q-icon name="backspace" size="16px" />
            Remove from topic
          </button>
          <button
            v-if="editable"
            class="lib-actions__item"
            role="menuitem"
            :disabled="count === 0"
            data-testid="bulk-change-lesson"
            @click="choose('change-lesson')"
          >
            <q-icon name="edit" size="16px" />
            Change lesson
          </button>
          <button
            v-if="editable"
            class="lib-actions__item lib-actions__item--danger"
            role="menuitem"
            :disabled="count === 0"
            data-testid="bulk-delete"
            @click="choose('delete')"
          >
            <q-icon name="delete" size="16px" />
            Delete
          </button>
          <button
            class="lib-actions__item"
            role="menuitem"
            data-testid="bulk-done"
            @click="choose('cancel')"
          >
            <q-icon name="close" size="16px" />
            Cancel
          </button>
        </template>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

defineProps<{
  selectMode: boolean;
  count: number;
  editable: boolean;
  inTopic: boolean;
}>();

const emit = defineEmits<{
  select: [];
  "add-topic": [];
  "remove-topic": [];
  "change-lesson": [];
  delete: [];
  cancel: [];
}>();

const open = ref(false);

type Action =
  | "select"
  | "add-topic"
  | "remove-topic"
  | "change-lesson"
  | "delete"
  | "cancel";

// Close the menu, then fire the chosen action.
function choose(action: Action): void {
  open.value = false;
  if (action === "select") emit("select");
  else if (action === "add-topic") emit("add-topic");
  else if (action === "remove-topic") emit("remove-topic");
  else if (action === "change-lesson") emit("change-lesson");
  else if (action === "delete") emit("delete");
  else emit("cancel");
}
</script>

<style scoped lang="sass">
.lib-actions
  flex: none
  position: relative

.lib-actions__btn
  display: inline-flex
  align-items: center
  justify-content: center
  width: 32px
  height: 32px
  border-radius: 9999px
  border: 1px solid rgba(56, 240, 230, 0.35)
  background: rgba(56, 240, 230, 0.10)
  color: var(--hotaru-cream)
  cursor: pointer

.lib-actions__backdrop
  position: fixed
  inset: 0
  z-index: 10

.lib-actions__menu
  position: absolute
  right: 0
  top: calc(100% + 4px)
  z-index: 11
  min-width: 190px
  padding: 6px
  border-radius: 12px
  background: rgba(20, 18, 52, 0.97)
  backdrop-filter: blur(16px)
  border: 1px solid rgba(155, 107, 255, 0.28)
  box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5)

.lib-actions__count
  font-size: 12px
  color: var(--hotaru-cream-soft)
  padding: 4px 10px 6px
  border-bottom: 1px solid rgba(155, 107, 255, 0.18)
  margin-bottom: 4px

.lib-actions__item
  display: flex
  align-items: center
  gap: 10px
  width: 100%
  padding: 8px 10px
  border: none
  border-radius: 8px
  background: transparent
  color: var(--hotaru-cream-soft)
  font-size: 13px
  text-align: left
  cursor: pointer

.lib-actions__item:hover
  background: rgba(155, 107, 255, 0.14)
  color: var(--hotaru-cream)

.lib-actions__item:disabled
  opacity: 0.4
  cursor: not-allowed

.lib-actions__item--danger
  color: var(--hotaru-fam-5)

.lib-actions__item--danger:hover
  background: rgba(255, 92, 200, 0.14)
  color: var(--hotaru-fam-5)
</style>
