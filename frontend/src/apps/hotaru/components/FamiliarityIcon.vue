<template>
  <span
    class="fam row items-center"
    :class="`fam--${clampedTier}`"
    role="img"
    :aria-label="label"
    :title="label"
    data-testid="familiarity-icon"
  >
    <span class="fam__glyph" aria-hidden="true" />
    <span v-if="showLabel" class="fam__label">{{ label }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = withDefaults(
  defineProps<{ tier: number; showLabel?: boolean }>(),
  { showLabel: false },
);

// The single source of truth for the 5-tier familiarity ramp. New = never
// studied; a review always graduates a word to at least Learning (see srs).
const TIER_LABELS = ["New", "Learning", "Familiar", "Strong", "Mastered"];

const clampedTier = computed(() =>
  Math.min(TIER_LABELS.length - 1, Math.max(0, Math.round(props.tier))),
);
const label = computed(() => TIER_LABELS[clampedTier.value]);
</script>

<style scoped lang="sass">
.fam
  gap: 10px

// Familiarity ramp icon — a uniform CSS circle with a per-tier fill fraction
// (0/25/50/75/100%), coloured + glowing in the tier hue. CSS-drawn so all five
// are exactly the same size, unlike the mixed Unicode circle glyphs.
.fam__glyph
  flex: none
  width: 13px
  height: 13px
  border-radius: 50%
  border: 1.5px solid currentColor
  background: conic-gradient(currentColor var(--fill), transparent var(--fill))

.fam__label
  font-size: 14px
  color: var(--hotaru-cream-soft)

.fam--0
  color: var(--hotaru-fam-1)
  --fill: 0%

.fam--1
  color: var(--hotaru-fam-2)
  --fill: 25%

.fam--1 .fam__glyph
  filter: drop-shadow(0 0 5px var(--hotaru-fam-2))

.fam--2
  color: var(--hotaru-fam-3)
  --fill: 50%

.fam--2 .fam__glyph
  filter: drop-shadow(0 0 5px var(--hotaru-fam-3))

.fam--3
  color: var(--hotaru-fam-4)
  --fill: 75%

.fam--3 .fam__glyph
  filter: drop-shadow(0 0 5px var(--hotaru-fam-4))

.fam--4
  color: var(--hotaru-fam-5)
  --fill: 100%

.fam--4 .fam__glyph
  filter: drop-shadow(0 0 5px var(--hotaru-fam-5))
</style>
