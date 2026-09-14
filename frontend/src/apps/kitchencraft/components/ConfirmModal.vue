<template>
  <!--
    A confirmation, not a modal: escape and the backdrop close a modal but
    NEVER a confirmation, which requires an explicit choice (UX-DR14). There is
    no click-outside handler and no escape listener here on purpose.
  -->
  <div class="kc-backdrop kitchencraft-panel" data-testid="confirm-backdrop">
    <div
      class="kc-modal"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`${testid}-title`"
    >
      <h2 :id="`${testid}-title`" class="kc-title">{{ title }}</h2>
      <p v-if="detail" class="kc-state__lede" data-testid="confirm-detail">
        {{ detail }}
      </p>
      <div class="kc-modal__actions">
        <button
          type="button"
          class="kc-btn kc-btn--danger"
          :data-testid="`${testid}-confirm`"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
        <button
          type="button"
          class="kc-btn kc-btn--quiet"
          :data-testid="`${testid}-cancel`"
          @click="emit('cancel')"
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    title: string;
    detail?: string | null;
    confirmLabel: string;
    testid?: string;
  }>(),
  { detail: null, testid: "confirm" },
);

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();
</script>
