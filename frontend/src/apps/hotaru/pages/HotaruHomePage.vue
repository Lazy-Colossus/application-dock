<template>
  <q-page class="hotaru-app column no-wrap q-pa-md">
    <div class="hotaru-brand text-center q-mt-lg q-mb-xl">
      <div class="hotaru-glyph">蛍</div>
      <div class="hotaru-title">Hotaru</div>
      <div class="hotaru-tagline">Japanese vocabulary</div>
    </div>

    <q-btn
      class="hotaru-action full-width q-mb-md"
      label="Practice"
      unelevated
      no-caps
      data-testid="practice-btn"
      @click="onPractice"
    />
    <q-btn
      class="hotaru-action full-width"
      label="Library"
      outline
      no-caps
      data-testid="library-btn"
      @click="onLibrary"
    />
  </q-page>
</template>

<script setup lang="ts">
import "./../css/hotaru.sass";

// Placeholder actions — Practice (Epic 2) and Library (Story 1.4+) pages do not
// exist yet. Wired to real routes in later stories.
function onPractice(): void {
  // TODO(Story 2.2): navigate to the practice picker.
}

function onLibrary(): void {
  // TODO(Story 1.4): navigate to the vocabulary library.
}
</script>

<style scoped lang="sass">
.hotaru-glyph
  font-size: 56px
  line-height: 1
  color: var(--hotaru-lamp-yellow)
  text-shadow: 0 0 22px rgba(255, 206, 74, 0.6)

.hotaru-title
  font-size: 28px
  font-weight: 600
  margin-top: 8px
  color: var(--hotaru-cream)

.hotaru-tagline
  font-size: 14px
  color: var(--hotaru-cream-soft)

.hotaru-action
  height: 56px
  border-radius: 12px
</style>
