<template>
  <div class="archer-chip row items-center no-wrap">
    <span class="archer-chip__name text-body1 q-mr-xs">{{ name }}</span>
    <q-btn
      v-if="removable"
      flat
      round
      dense
      size="sm"
      icon="close"
      class="archer-chip__remove"
      :aria-label="`Remove ${name}`"
      @click="emit('remove')"
    />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string;
  removable?: boolean;
}>();

const emit = defineEmits<{
  remove: [];
}>();
</script>

<style scoped lang="sass">
.archer-chip
  background: var(--color-surface-card, #242424)
  border-radius: 8px
  height: 44px
  padding: 0 12px
  gap: 4px

.archer-chip__name
  color: var(--color-ink-primary, #F0F0F0)
  flex: 1
  text-transform: capitalize

.archer-chip__remove
  color: var(--color-ink-secondary, #9E9E9E)
  min-width: 44px
  min-height: 44px
</style>
