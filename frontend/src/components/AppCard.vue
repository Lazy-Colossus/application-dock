<template>
  <router-link
    :to="descriptor.route"
    class="app-card"
    :aria-label="`Open ${descriptor.label}`"
  >
    <q-icon :name="descriptor.icon" color="primary" size="32px" class="app-card__icon" />
    <div class="app-card__label">{{ descriptor.label }}</div>
  </router-link>
</template>

<script setup lang="ts">
import type { AppDescriptor } from '@/apps/registry';

defineProps<{ descriptor: AppDescriptor }>();
</script>

<style lang="sass" scoped>
.app-card
  display: flex
  flex-direction: column
  align-items: center
  justify-content: center
  gap: 10px
  height: 150px
  width: 100%
  padding: 16px 8px
  background-color: #242424
  border-radius: 12px
  color: inherit
  text-decoration: none
  cursor: pointer
  transition: background-color 120ms ease

  &:hover, &:focus-visible
    background-color: #2A2A2A
    outline: none

  &:focus-visible
    outline: 2px solid #C8960A
    outline-offset: 2px

.app-card__label
  color: #F0F0F0
  font-size: 14px
  font-weight: 500
  text-align: center
  line-height: 1.3
</style>
