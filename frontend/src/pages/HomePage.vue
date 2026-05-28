<template>
  <q-page padding>
    <div class="section-label">YOUR APPS</div>
    <div class="app-grid">
      <AppCard v-for="app in apps" :key="app.id" :descriptor="app" />
    </div>
  </q-page>
</template>

<script setup lang="ts">
import AppCard from '@/components/AppCard.vue';
import { apps } from '@/apps/registry';
</script>

<style lang="sass" scoped>
.section-label
  color: #8A8A8A
  font-size: 12px
  font-weight: 400
  letter-spacing: 1px
  text-transform: uppercase
  margin-bottom: 12px

.app-grid
  display: grid
  grid-template-columns: 1fr 1fr
  gap: 12px

@media (min-width: 768px)
  .app-grid
    grid-template-columns: repeat(4, 1fr)
</style>
