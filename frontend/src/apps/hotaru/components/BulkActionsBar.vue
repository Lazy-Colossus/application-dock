<template>
  <div class="bulk-bar row items-center no-wrap" data-testid="bulk-bar">
    <span class="bulk-bar__count">{{ count }} selected</span>
    <div class="bulk-bar__actions row items-center no-wrap q-gutter-xs">
      <button
        class="bulk-btn"
        :disabled="count === 0"
        data-testid="bulk-add-topic"
        @click="emit('add-topic')"
      >
        Add to topic
      </button>
      <button
        v-if="inTopic"
        class="bulk-btn"
        :disabled="count === 0"
        data-testid="bulk-remove-topic"
        @click="emit('remove-topic')"
      >
        Remove from topic
      </button>
      <button
        v-if="editable"
        class="bulk-btn"
        :disabled="count === 0"
        data-testid="bulk-change-lesson"
        @click="emit('change-lesson')"
      >
        Change lesson
      </button>
      <button
        v-if="editable"
        class="bulk-btn bulk-btn--danger"
        :disabled="count === 0"
        data-testid="bulk-delete"
        @click="emit('delete')"
      >
        Delete
      </button>
      <button
        class="bulk-btn bulk-btn--ghost"
        data-testid="bulk-done"
        @click="emit('done')"
      >
        Done
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ count: number; editable: boolean; inTopic: boolean }>();

const emit = defineEmits<{
  "add-topic": [];
  "remove-topic": [];
  "change-lesson": [];
  delete: [];
  done: [];
}>();
</script>

<style scoped lang="sass">
// Sticky action bar for bulk-select mode. Wraps on narrow screens (mobile).
.bulk-bar
  position: sticky
  bottom: 0
  flex-wrap: wrap
  gap: 8px
  margin-top: 10px
  padding: 10px 12px
  border-radius: 14px
  background: rgba(20, 18, 52, 0.97)
  backdrop-filter: blur(16px)
  border: 1px solid rgba(56, 240, 230, 0.30)
  box-shadow: 0 -6px 24px rgba(0, 0, 0, 0.45)

.bulk-bar__count
  font-size: 13px
  font-weight: 600
  color: var(--hotaru-cream)
  margin-right: auto

.bulk-bar__actions
  flex-wrap: wrap
  gap: 6px

.bulk-btn
  border: 1px solid rgba(56, 240, 230, 0.4)
  background: rgba(56, 240, 230, 0.10)
  color: var(--hotaru-cream)
  border-radius: 9999px
  padding: 5px 12px
  font-size: 13px
  cursor: pointer

.bulk-btn:disabled
  opacity: 0.4
  cursor: not-allowed

.bulk-btn--danger
  border-color: rgba(255, 92, 200, 0.5)
  background: rgba(255, 92, 200, 0.12)
  color: var(--hotaru-fam-5)

.bulk-btn--ghost
  border-color: rgba(155, 107, 255, 0.3)
  background: transparent
  color: var(--hotaru-cream-soft)
</style>
