<template>
  <div
    class="object-menu"
    role="dialog"
    :aria-label="title"
    data-testid="object-menu"
    @pointerdown.stop
  >
    <div class="object-menu__head">
      <span>{{ title }}</span>
      <button
        type="button"
        class="object-menu__close"
        aria-label="Close"
        data-testid="object-menu-close"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>
    <p v-if="detail" class="object-menu__detail">{{ detail }}</p>
    <div class="object-menu__actions">
      <button
        v-if="editLabel"
        type="button"
        class="fp-button"
        data-testid="object-menu-edit"
        @click="emit('edit')"
      >
        {{ editLabel }}
      </button>
      <button
        type="button"
        class="fp-button object-menu__delete"
        data-testid="object-menu-delete"
        @click="emit('remove')"
      >
        Delete
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string;
  /** The note's or label's text, so it's clear which one was picked. */
  detail?: string;
  /** The edit button's name, or none for something with nothing to edit. */
  editLabel?: string;
}>();

const emit = defineEmits<{
  edit: [];
  remove: [];
  close: [];
}>();
</script>

<style scoped lang="scss">
.object-menu {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-sizing: border-box;
  width: 200px;
  padding: 10px 12px 12px;
  border: 1px solid var(--fp-line);
  border-radius: 8px;
  background: var(--fp-chrome);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.14);
  font-size: 12px;
}
.object-menu__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--fp-muted);
}
.object-menu__close {
  padding: 2px 4px;
  border: 0;
  background: none;
  color: var(--fp-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
}
.object-menu__detail {
  margin: 0;
  overflow: hidden;
  color: var(--fp-ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.object-menu__actions {
  display: flex;
  gap: 6px;
}
.object-menu__actions .fp-button {
  flex: 1;
  height: 30px;
  padding: 0 8px;
}
.object-menu__delete {
  color: var(--fp-warn-ink);
}
</style>
